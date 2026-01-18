// 한국투자증권 API 공통 로직

import axios from 'axios';

// 한국투자증권 API 키 (환경변수에서 가져오기)
// 주의: API 키는 환경변수에서만 가져옵니다. 보안을 위해 기본값은 제거했습니다.
export const APP_KEY = process.env.KIS_APP_KEY;
export const APP_SECRET = process.env.KIS_APP_SECRET;

// 토큰 캐싱 (Vercel Serverless Functions에서는 전역 변수가 공유됨)
// 주의: Vercel Serverless Functions는 Cold Start 시 새 인스턴스가 생성될 수 있음
let tokenCache = {
  token: null,
  expiresAt: null,
  lastRequestTime: null // 마지막 토큰 요청 시간 (Rate limit 방지)
};

// 액세스 토큰 발급 (캐싱 포함 + Rate limit 방지)
export async function getAccessToken() {
  // API 키 확인
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('API 키가 설정되지 않았습니다. 환경변수 KIS_APP_KEY와 KIS_APP_SECRET을 확인하세요.');
  }
  
  const now = Date.now();
  
  // 캐시된 토큰이 있고 아직 유효하면 재사용
  if (tokenCache.token && tokenCache.expiresAt && now < tokenCache.expiresAt) {
    console.log('캐시된 토큰 재사용');
    return tokenCache.token;
  }
  
  // Rate limit 방지: 마지막 요청 후 1분(60초)이 지나지 않았고, 캐시된 토큰이 있으면 재사용
  if (tokenCache.lastRequestTime && tokenCache.token) {
    const timeSinceLastRequest = (now - tokenCache.lastRequestTime) / 1000; // 초 단위
    if (timeSinceLastRequest < 65) { // 65초 (여유 있게 5초 추가)
      console.log(`Rate limit 방지: 마지막 요청 후 ${Math.round(timeSinceLastRequest)}초 경과 - 캐시된 토큰 재사용`);
      // 만료 시간을 1분 연장 (임시 조치)
      tokenCache.expiresAt = Math.max(tokenCache.expiresAt || 0, now + 60000);
      return tokenCache.token;
    }
  }
  
  try {
    console.log('새 토큰 발급 요청');
    tokenCache.lastRequestTime = now; // 요청 시간 기록
    
    const response = await axios.post(
      'https://openapi.koreainvestment.com:9443/oauth2/tokenP',
      {
        grant_type: 'client_credentials',
        appkey: APP_KEY,
        appsecret: APP_SECRET
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    const accessToken = response.data.access_token;
    const expiresIn = response.data.expires_in || 86400; // 기본 24시간 (초)
    
    // 토큰 캐싱 (만료 5분 전에 새로 발급받도록 설정)
    tokenCache.token = accessToken;
    tokenCache.expiresAt = now + (expiresIn - 300) * 1000; // 만료 5분 전
    
    console.log(`토큰 발급 성공 (${new Date(tokenCache.expiresAt).toLocaleTimeString()}까지 유효)`);
    return accessToken;
  } catch (error) {
    const errorDetail = error.response?.data || error.message;
    console.error('토큰 발급 실패 상세:', JSON.stringify(errorDetail, null, 2));
    
    // Rate limit 오류인 경우 캐시된 토큰 재사용 시도
    if (error.response?.data?.error_code === 'EGW00133') {
      console.warn('Rate limit 오류 발생 (1분당 1회 제한) - 캐시된 토큰 재사용 시도');
      if (tokenCache.token) {
        // 만료 시간 연장 (임시 조치)
        tokenCache.expiresAt = Math.max(tokenCache.expiresAt || 0, now + 60000);
        return tokenCache.token;
      }
      // 캐시된 토큰이 없으면 에러 반환 (사용자에게 안내)
      throw new Error('토큰 발급 제한에 도달했습니다. 잠시 후 다시 시도해주세요. (1분당 1회 제한)');
    }
    
    throw error;
  }
}

// 오늘 날짜를 YYYYMMDD 형식으로 변환
export function getTodayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// 종목명 매핑
export const stockNameMap = {
  '005930': '삼성전자'
};

// 종목명이 유효한지 확인하는 함수
export function isValidStockName(name) {
  if (!name || name === '알 수 없음') return false;
  if (/^\d+$/.test(String(name).trim())) return false; // 숫자만 있으면 유효하지 않음
  return /[가-힣]/.test(name); // 한글이 포함되어 있어야 함
}

// 종목명 가져오기
export async function getStockName(stockCode, accessToken, appKey, appSecret) {
  // 매핑 우선 사용
  let stockName = stockNameMap[stockCode] || '알 수 없음';
  
  // API 키 확인
  if (!appKey || !appSecret) {
    console.warn('API 키가 없어 종목명 조회를 건너뜁니다. 매핑된 종목명 사용:', stockName);
    return stockName;
  }
  
  try {
    const stockInfoResponse = await axios.get(
      'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price',
      {
        params: {
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_INPUT_ISCD: stockCode
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'appkey': appKey,
          'appsecret': appSecret,
          'tr_id': 'FHKST01010100',
          'Content-Type': 'application/json'
        }
      }
    );
    
    const output = stockInfoResponse.data.output || stockInfoResponse.data.output1;
    if (output) {
      const apiStockName = output.hts_kor_isnm || 
                          output.isu_kor_nm || 
                          output.isu_nm ||
                          output.itms_nm || 
                          output.hts_avls;
      
      if (isValidStockName(apiStockName)) {
        stockName = apiStockName;
        console.log(`종목명 조회 성공: ${stockName}`);
      } else {
        console.log(`API 종목명이 유효하지 않음 (${apiStockName}), 매핑 사용: ${stockName}`);
      }
    }
  } catch (err) {
    console.log(`종목명 조회 실패, 매핑 사용: ${stockName}`);
  }
  
  // 최종적으로 매핑이 있으면 매핑 사용 (안전장치)
  if (stockNameMap[stockCode] && !isValidStockName(stockName)) {
    stockName = stockNameMap[stockCode];
    console.log(`최종 매핑 종목명 사용: ${stockName}`);
  }
  
  return stockName;
}
