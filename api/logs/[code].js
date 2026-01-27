// Vercel Serverless Function: 종목별 로그 저장/조회
// 경로: /api/logs/[code]

import { getRedisClient, getAccessToken, getDailyOhlcRange, getTodayString } from '../_shared/kis-api.js';

const REDIS_LOG_KEY_PREFIX = 'stock-log-';
const REDIS_OHLC_KEY_PREFIX = 'stock-ohlc-';
const OHLC_CACHE_DAYS = 60;
const OHLC_FETCH_CALENDAR_DAYS = 90; // 60거래일 확보용

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const stockCode = req.query.code;
    
    if (!stockCode) {
      return res.status(400).json({ error: '종목 코드가 필요합니다.' });
    }

    const client = getRedisClient();
    if (!client) {
      return res.status(500).json({ error: 'Redis 연결을 사용할 수 없습니다.' });
    }

    const redisKey = `${REDIS_LOG_KEY_PREFIX}${stockCode}`;

    // Redis 연결 확인 및 연결
    if (client.status === 'end' || client.status === 'close') {
      await client.connect();
    }

    if (req.method === 'GET') {
      // 로그 조회 (최근 60일만 반환) + OHLC 캐시(날짜별 시가/종가/최고/최저/중간값)
      try {
        const logDataStr = await client.get(redisKey);
        let filteredLogs = [];
        if (logDataStr) {
          const logData = JSON.parse(logDataStr);
          const now = new Date();
          const cutoffDate = new Date(now);
          cutoffDate.setDate(cutoffDate.getDate() - 60);
          filteredLogs = logData.filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate >= cutoffDate;
          });
        }

        // OHLC 캐시: Redis에 있으면 사용, 없으면 KIS에서 조회 후 저장
        const ohlcKey = `${REDIS_OHLC_KEY_PREFIX}${stockCode}`;
        let ohlc = [];
        const ohlcStr = await client.get(ohlcKey);
        if (ohlcStr) {
          try {
            ohlc = JSON.parse(ohlcStr);
          } catch (_) {
            ohlc = [];
          }
        }
        if (ohlc.length === 0 && process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET) {
          try {
            const today = getTodayString();
            const end = new Date();
            const start = new Date(end);
            start.setDate(start.getDate() - OHLC_FETCH_CALENDAR_DAYS);
            const startStr = `${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, '0')}${String(start.getDate()).padStart(2, '0')}`;
            const token = await getAccessToken();
            const rows = await getDailyOhlcRange(
              stockCode,
              startStr,
              today,
              token,
              process.env.KIS_APP_KEY,
              process.env.KIS_APP_SECRET
            );
            ohlc = rows.slice(0, OHLC_CACHE_DAYS);
            await client.set(ohlcKey, JSON.stringify(ohlc));
          } catch (err) {
            console.error(`❌ ${stockCode} OHLC 캐시 조회 실패:`, err.message);
          }
        }

        return res.status(200).json({ logs: filteredLogs, ohlc });
      } catch (error) {
        console.error(`❌ ${stockCode} 로그 조회 실패:`, error.message);
        return res.status(500).json({ error: '로그 조회 중 오류가 발생했습니다.' });
      }
    } else if (req.method === 'POST') {
      // 로그 저장
      const { date, condition1, condition2, condition3, priceAt10am, priceAt11am, closePrice } = req.body;

      if (!date) {
        return res.status(400).json({ error: '날짜가 필요합니다.' });
      }

      try {
        // 기존 로그 가져오기
        const logDataStr = await client.get(redisKey);
        let logData = [];
        
        if (logDataStr) {
          logData = JSON.parse(logDataStr);
        }

        // 같은 날짜의 로그가 있는지 확인
        const existingIndex = logData.findIndex(entry => entry.date === date);

        const newEntry = {
          date: date,
          condition1: condition1 || false,
          condition2: condition2 || false,
          condition3: condition3 || false,
          priceAt10am: priceAt10am !== null && priceAt10am !== undefined ? priceAt10am : null,
          priceAt11am: priceAt11am !== null && priceAt11am !== undefined ? priceAt11am : null,
          closePrice: closePrice || 0
        };

        if (existingIndex >= 0) {
          // 기존 항목 업데이트
          logData[existingIndex] = newEntry;
        } else {
          // 새 항목 추가
          logData.push(newEntry);
        }

        // 날짜순으로 정렬 (최신 날짜가 앞에 오도록)
        logData.sort((a, b) => {
          return new Date(b.date) - new Date(a.date);
        });

        // Redis에 저장 (TTL 없음 - 영구 저장)
        await client.set(redisKey, JSON.stringify(logData));

        console.log(`✅ ${stockCode} 로그 저장 완료: ${date}`);
        return res.status(200).json({ success: true, logs: logData });
      } catch (error) {
        console.error(`❌ ${stockCode} 로그 저장 실패:`, error.message);
        return res.status(500).json({ error: '로그 저장 중 오류가 발생했습니다.' });
      }
    } else if (req.method === 'DELETE') {
      // 특정 날짜의 로그 삭제
      const { date } = req.query; // 쿼리 파라미터로 날짜 받기
      
      if (!date) {
        return res.status(400).json({ error: '삭제할 날짜가 필요합니다. (예: ?date=2026-01-27)' });
      }

      try {
        // 기존 로그 가져오기
        const logDataStr = await client.get(redisKey);
        if (!logDataStr) {
          return res.status(404).json({ error: '로그 데이터가 없습니다.' });
        }

        let logData = JSON.parse(logDataStr);
        
        // 삭제할 날짜의 로그 찾기
        const beforeCount = logData.length;
        logData = logData.filter(entry => entry.date !== date);
        const afterCount = logData.length;

        if (beforeCount === afterCount) {
          return res.status(404).json({ 
            error: `날짜 ${date}의 로그를 찾을 수 없습니다.`,
            found: false
          });
        }

        // Redis에 저장
        await client.set(redisKey, JSON.stringify(logData));

        console.log(`✅ ${stockCode} 로그 삭제 완료: ${date} (${beforeCount} → ${afterCount}개)`);
        return res.status(200).json({ 
          success: true, 
          message: `날짜 ${date}의 로그가 삭제되었습니다.`,
          deletedDate: date,
          remainingLogs: logData.length
        });
      } catch (error) {
        console.error(`❌ ${stockCode} 로그 삭제 실패:`, error.message);
        return res.status(500).json({ error: '로그 삭제 중 오류가 발생했습니다.' });
      }
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('로그 API 오류:', error);
    return res.status(500).json({ 
      error: '서버 오류가 발생했습니다.',
      message: error.message 
    });
  }
}
