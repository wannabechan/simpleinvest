// API: 오늘 날짜의 가격 로그 조회 및 저장
// 경로: /api/logs/fetch-today-prices?code=005930
// 용도: 11am 이후 웹사이트 접속 시 당일 로그가 없거나 10:30 가격이 없을 때 호출

import axios from 'axios';
import { getAccessToken, getCurrentPrice, getRedisClient, getMinuteData, APP_KEY, APP_SECRET } from '../_shared/kis-api.js';

// 환경변수에서 API 키 가져오기
const KIS_APP_KEY = process.env.KIS_APP_KEY || APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET || APP_SECRET;

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

// 분봉 데이터에서 특정 시간대의 가격 추출
function extractPriceAtTime(minuteDataArray, targetTime) {
  if (!minuteDataArray || minuteDataArray.length === 0) {
    return null;
  }
  
  // targetTime을 HHMM 형식으로 변환 (예: "0930", "0935")
  const targetHour = targetTime.substring(0, 2);
  const targetMinute = targetTime.substring(2, 4);
  
  // 정확한 시간대 찾기 (예: 0930~1030, 5분 간격)
  const exactMatch = minuteDataArray.find(m => {
    const time = m.stck_std_time || m.time || '';
    return time === targetTime;
  });
  
  if (exactMatch) {
    const price = parseInt(exactMatch.stck_prpr || exactMatch.price || 0);
    if (price > 0) {
      return price;
    }
  }
  
  // 정확한 시간대를 찾지 못하면 가장 가까운 시간대 사용 (1분 이내)
  const closest = minuteDataArray.find(m => {
    const time = m.stck_std_time || m.time || '';
    if (!time || time.length < 4) return false;
    
    const dataHour = time.substring(0, 2);
    const dataMinute = time.substring(2, 4);
    
    // 같은 시간대이고 분 차이가 1분 이내
    if (dataHour === targetHour) {
      const minuteDiff = Math.abs(parseInt(dataMinute) - parseInt(targetMinute));
      return minuteDiff <= 1;
    }
    
    return false;
  });
  
  if (closest) {
    const price = parseInt(closest.stck_prpr || closest.price || 0);
    if (price > 0) {
      return price;
    }
  }
  
  return null;
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
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stockCode = req.query.code;
    
    if (!stockCode) {
      return res.status(400).json({ error: '종목 코드가 필요합니다.' });
    }

    // API 키 확인
    if (!KIS_APP_KEY || !KIS_APP_SECRET) {
      return res.status(500).json({ 
        error: 'API 키가 설정되지 않았습니다.' 
      });
    }

    // 한국 시간 기준으로 오늘 날짜 계산
    const utcNow = new Date();
    const kstTime = new Date(utcNow.getTime() + 9 * 60 * 60 * 1000);
    const today = new Date(kstTime.getUTCFullYear(), kstTime.getUTCMonth(), kstTime.getUTCDate());
    
    // 주식시장이 개장한 날인지 확인
    if (!isTradingDay(today)) {
      return res.status(200).json({ 
        message: '오늘은 주식시장 휴장일입니다.',
        success: false 
      });
    }

    const dateStr = formatDateForLog(today);
    const currentHour = kstTime.getUTCHours();
    
    // 11am 이후인지 확인
    if (currentHour < 11) {
      return res.status(200).json({ 
        message: '11am 이후에만 사용 가능합니다.',
        success: false 
      });
    }

    console.log(`📊 오늘 가격 로그 조회/저장 시작: ${stockCode} ${dateStr}`);

    // 토큰 발급
    const accessToken = await getAccessToken();
    
    // Redis 클라이언트 확인
    const client = getRedisClient();
    if (!client) {
      return res.status(500).json({ 
        error: 'Redis 연결을 사용할 수 없습니다.' 
      });
    }

    if (client.status === 'end' || client.status === 'close') {
      await client.connect();
    }

    // Redis에서 기존 로그 가져오기
    const redisKey = `${REDIS_LOG_KEY_PREFIX}${stockCode}`;
    const logDataStr = await client.get(redisKey);
    let logData = [];
    
    if (logDataStr) {
      logData = JSON.parse(logDataStr);
    }

    // 오늘 날짜의 로그 찾기
    let todayLog = logData.find(entry => entry.date === dateStr);
    
    // 10:30 가격이 있는지 확인 (마지막 시간대)
    const hasLastSlotPrice = todayLog && 
                             todayLog.prices && 
                             todayLog.prices['1030'] !== null && 
                             todayLog.prices['1030'] !== undefined;

    // 당일 로그가 없거나 10:30 가격이 없으면 조회 및 저장
    if (!todayLog || !hasLastSlotPrice) {
      console.log(`📊 ${stockCode} 오늘 가격 조회 시작 (로그 없음 또는 10:30 가격 없음)`);
      
      if (!todayLog) {
        todayLog = {
          date: dateStr,
          prices: {}
        };
        logData.push(todayLog);
      }

      // 9:30~10:30 구간의 분봉 데이터를 한 번에 조회
      console.log(`📊 ${stockCode} 분봉 데이터 조회 시작 (9:30~10:30)`);
      const minuteDataArray = await getMinuteData(
        stockCode, 
        dateStr, 
        accessToken, 
        KIS_APP_KEY, 
        KIS_APP_SECRET, 
        '0930', 
        '1030'
      );
      
      const targetTimes = ['0930', '0935', '0940', '0945', '0950', '0955', '1000', '1005', '1010', '1015', '1020', '1025', '1030'];
      const prices = {};
      
      if (minuteDataArray && minuteDataArray.length > 0) {
        console.log(`✅ ${stockCode} 분봉 데이터 조회 성공: ${minuteDataArray.length}개 데이터`);
        
        // 각 시간대별로 가격 추출 (실패한 경우 null로 저장)
        for (const targetTime of targetTimes) {
          const price = extractPriceAtTime(minuteDataArray, targetTime);
          if (price && price > 0) {
            prices[targetTime] = price;
            console.log(`✅ ${stockCode} ${targetTime} 가격 추출: ${price}`);
          } else {
            // 추출 실패한 경우 null로 저장 (프론트엔드에서 '-'로 표시)
            prices[targetTime] = null;
            console.log(`⚠️ ${stockCode} ${targetTime} 가격 추출 실패 → null 저장 (프론트엔드에서 '-'로 표시)`);
          }
        }
      } else {
        console.log(`⚠️ ${stockCode} 분봉 데이터 조회 실패 또는 데이터 없음 → 모든 시간대 null 저장`);
        // 분봉 데이터가 없으면 모든 시간대를 null로 저장 (프론트엔드에서 '-'로 표시)
        targetTimes.forEach(time => {
          prices[time] = null;
        });
      }
      
      console.log(`📊 ${stockCode} 조회된 가격:`, prices);

      // 모든 시간대의 가격을 로그에 저장 (null 포함)
      // 기존에 값이 있으면 유지하되, 조회한 값이 있으면 업데이트
      targetTimes.forEach(time => {
        // 조회한 값이 있으면 업데이트 (null도 포함)
        if (prices.hasOwnProperty(time)) {
          todayLog.prices[time] = prices[time];
        }
      });

      // 오래된 로그 삭제 (최근 60일만 유지)
      logData = cleanupOldLogs(logData);

      // 날짜순으로 정렬 (최신 날짜가 앞에 오도록)
      logData.sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
      });

      // Redis에 저장
      await client.set(redisKey, JSON.stringify(logData));
      
      console.log(`✅ ${stockCode} 오늘 가격 로그 저장 완료`);
    } else {
      console.log(`✅ ${stockCode} 오늘 로그가 이미 존재하고 10:30 가격도 있음`);
    }

    // 저장된 로그 반환
    const updatedLogDataStr = await client.get(redisKey);
    const updatedLogData = updatedLogDataStr ? JSON.parse(updatedLogDataStr) : [];
    const updatedTodayLog = updatedLogData.find(entry => entry.date === dateStr);

    return res.status(200).json({
      success: true,
      date: dateStr,
      log: updatedTodayLog || null,
      message: todayLog && has10amPrice ? '이미 로그가 존재합니다.' : '가격 로그를 조회하고 저장했습니다.'
    });
  } catch (error) {
    console.error('오늘 가격 로그 조회/저장 실패:', error);
    return res.status(500).json({
      error: '서버 오류가 발생했습니다.',
      message: error.message
    });
  }
}
