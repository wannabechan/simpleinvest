// Vercel Cron Job: 주식 가격 로그 기록
// 경로: /api/cron/log-prices
// 스케줄: 주식시장 개장일 9:30~10:30 (5분 간격)

import axios from 'axios';
import { getAccessToken, getTodayString, getCurrentPrice, getRedisClient, APP_KEY, APP_SECRET } from '../_shared/kis-api.js';

// 환경변수에서 API 키 가져오기
const KIS_APP_KEY = process.env.KIS_APP_KEY || APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET || APP_SECRET;

// 등록된 종목 코드 목록
const STOCK_CODES = ['005930', '000660', '005380', '207940', '006400'];

// Redis 키
const REDIS_LOG_KEY_PREFIX = 'stock-log-';
const MAX_LOG_DAYS = 60; // 최근 60일만 관리

// 주식시장이 개장한 날인지 확인 (주말 제외)
function isTradingDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6; // 일요일(0)과 토요일(6)이 아닌 경우
}

// 날짜를 yyyy-mm-dd 형식으로 변환
function formatDateForLog(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 현재 시간을 HHMM 형식으로 변환
function getCurrentTimeHHMM() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}${minutes}`;
}


// 로그 데이터에서 오래된 항목 삭제 (최근 60일만 유지)
function cleanupOldLogs(logData) {
  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - MAX_LOG_DAYS);
  
  return logData.filter(entry => {
    const entryDate = new Date(entry.date);
    return entryDate >= cutoffDate;
  });
}

export default async function handler(req, res) {
  // CORS 헤더 설정 (GitHub Actions, cron-job.org에서 호출 가능하도록)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cron-Secret');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CRON_SECRET 옵션 인증: 설정된 경우에만 검사
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = (req.headers.authorization || '').trim();
    const xCronSecret = (req.headers['x-cron-secret'] || '').trim();
    const validBearer = authHeader === `Bearer ${cronSecret}`;
    const validHeader = xCronSecret === cronSecret;
    if (!validBearer && !validHeader) {
      console.warn('❌ Cron 인증 실패: CRON_SECRET 불일치 또는 누락');
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing cron secret' });
    }
  }

  try {
    console.log('📊 Cron job 시작');
    
    // API 키 확인
    if (!KIS_APP_KEY || !KIS_APP_SECRET) {
      console.error('❌ API 키가 설정되지 않았습니다.');
      return res.status(500).json({ 
        error: 'API 키가 설정되지 않았습니다.',
        hint: 'Vercel 환경변수에 KIS_APP_KEY와 KIS_APP_SECRET을 설정해주세요.'
      });
    }
    
    // 한국 시간 기준으로 날짜 계산
    const utcNow = new Date();
    const kstTime = new Date(utcNow.getTime() + 9 * 60 * 60 * 1000);
    const today = new Date(kstTime.getUTCFullYear(), kstTime.getUTCMonth(), kstTime.getUTCDate());
    
    // 주식시장이 개장한 날인지 확인
    if (!isTradingDay(today)) {
      console.log('오늘은 주식시장 휴장일입니다.');
      return res.status(200).json({ message: 'Market is closed today' });
    }

    const dateStr = formatDateForLog(today);
    
    // 9:30~10:30 KST (5분 간격) 시간대만 처리
    const allowedTimes = ['0930', '0935', '0940', '0945', '0950', '0955', '1000', '1005', '1010', '1015', '1020', '1025', '1030'];
    
    // UTC 시간을 KST로 변환 (UTC + 9시간)
    const kstHours = String(kstTime.getUTCHours()).padStart(2, '0');
    const kstMinutes = String(kstTime.getUTCMinutes()).padStart(2, '0');
    const kstTimeStr = `${kstHours}${kstMinutes}`;
    
    if (!allowedTimes.includes(kstTimeStr)) {
      console.log(`현재 시간(KST ${kstTimeStr})은 로그 기록 시간대가 아닙니다.`);
      return res.status(200).json({ message: `Current time KST ${kstTimeStr} is not a logging time` });
    }
    
    // KST 시간을 사용하여 로그 저장
    const logTime = kstTimeStr;

    console.log(`📊 가격 로그 기록 시작: ${dateStr} ${logTime} (KST)`);

    // 토큰 발급
    let accessToken;
    try {
      accessToken = await getAccessToken();
      console.log('✅ 토큰 발급 완료');
    } catch (error) {
      console.error('❌ 토큰 발급 실패:', error.message);
      return res.status(500).json({ 
        error: '토큰 발급 실패',
        message: error.message 
      });
    }
    
    // Redis 클라이언트 확인
    const client = getRedisClient();
    if (!client) {
      console.error('❌ Redis 클라이언트를 사용할 수 없습니다.');
      return res.status(500).json({ 
        error: 'Redis 연결을 사용할 수 없습니다.',
        hint: 'Vercel 환경변수에 REDIS_URL, KV_URL, 또는 UPSTASH_REDIS_URL을 설정해주세요.'
      });
    }

    try {
      if (client.status === 'end' || client.status === 'close') {
        await client.connect();
        console.log('✅ Redis 연결 완료');
      }
    } catch (error) {
      console.error('❌ Redis 연결 실패:', error.message);
      return res.status(500).json({ 
        error: 'Redis 연결 실패',
        message: error.message 
      });
    }

    const results = {};

    // 각 종목별로 가격 조회 및 로그 저장
    for (const stockCode of STOCK_CODES) {
      try {
        // 현재가 조회
        const currentPrice = await getCurrentPrice(stockCode, accessToken, KIS_APP_KEY, KIS_APP_SECRET);
        
        if (currentPrice === null) {
          console.log(`⚠️ ${stockCode} 현재가 조회 실패`);
          continue;
        }

        // Redis에서 기존 로그 가져오기
        const redisKey = `${REDIS_LOG_KEY_PREFIX}${stockCode}`;
        const logDataStr = await client.get(redisKey);
        let logData = [];
        
        if (logDataStr) {
          logData = JSON.parse(logDataStr);
        }

        // 오늘 날짜의 로그 찾기 또는 생성
        let todayLog = logData.find(entry => entry.date === dateStr);
        
        if (!todayLog) {
          todayLog = {
            date: dateStr,
            prices: {}
          };
          logData.push(todayLog);
        }

        // 현재 시간대의 가격 저장 (KST 시간 사용)
        todayLog.prices[logTime] = currentPrice;
        
        console.log(`✅ ${stockCode} ${logTime} 가격 기록: ${currentPrice}`);

        // 오래된 로그 삭제 (최근 60일만 유지)
        logData = cleanupOldLogs(logData);

        // 날짜순으로 정렬 (최신 날짜가 앞에 오도록)
        logData.sort((a, b) => {
          return new Date(b.date) - new Date(a.date);
        });

        // Redis에 저장
        await client.set(redisKey, JSON.stringify(logData));

        results[stockCode] = {
          time: logTime,
          price: currentPrice
        };
      } catch (error) {
        console.error(`❌ ${stockCode} 처리 실패:`, error.message);
        results[stockCode] = {
          error: error.message
        };
      }
    }

    console.log(`✅ 가격 로그 기록 완료: ${dateStr} ${logTime} (KST)`);
    
    return res.status(200).json({
      success: true,
      date: dateStr,
      time: logTime,
      results: results
    });
  } catch (error) {
    console.error('❌ Cron job 실행 실패:', error);
    console.error('에러 스택:', error.stack);
    return res.status(500).json({
      error: 'Cron job execution failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
