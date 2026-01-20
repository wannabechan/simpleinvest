// 한국투자증권 API 공통 로직

import axios from 'axios';
import Redis from 'ioredis';

// 한국투자증권 API 키 (환경변수에서 가져오기)
// 주의: API 키는 환경변수에서만 가져옵니다. 보안을 위해 기본값은 제거했습니다.
export const APP_KEY = process.env.KIS_APP_KEY;
export const APP_SECRET = process.env.KIS_APP_SECRET;

// Redis 키
const REDIS_TOKEN_KEY = 'kis-token';
const REDIS_TOKEN_ISSUED_AT_KEY = 'kis-token-issued-at';
const TWELVE_HOURS = 12 * 60 * 60 * 1000; // 12시간 (밀리초)

// Redis 클라이언트 (싱글톤)
let redisClient = null;

// Redis 클라이언트 초기화
function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }
  
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_URL;
  if (!redisUrl) {
    console.warn('⚠️ Redis 환경변수가 없습니다. REDIS_URL, KV_URL, UPSTASH_REDIS_URL 중 하나가 필요합니다.');
    return null;
  }
  
  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableReadyCheck: false,
      lazyConnect: true
    });
    
    redisClient.on('error', (err) => {
      console.error('❌ Redis 연결 오류:', err.message);
    });
    
    console.log('✅ Redis 클라이언트 초기화 완료');
    return redisClient;
  } catch (error) {
    console.error('❌ Redis 클라이언트 생성 실패:', error.message);
    return null;
  }
}

// 메모리 캐시 (Redis 읽기 성능 최적화용)
let memoryCache = {
  token: null,
  tokenIssuedAt: null,
  lastRedisCheck: null
};

// Redis에서 토큰 정보 읽기
async function readTokenFromRedis() {
  const client = getRedisClient();
  if (!client) {
    return null;
  }
  
  try {
    // Redis 연결 확인 및 연결
    if (client.status === 'end' || client.status === 'close') {
      await client.connect();
    }
    
    const [token, tokenIssuedAt] = await Promise.all([
      client.get(REDIS_TOKEN_KEY),
      client.get(REDIS_TOKEN_ISSUED_AT_KEY)
    ]);
    
    if (token && tokenIssuedAt) {
      const cacheData = {
        token: token,
        tokenIssuedAt: parseInt(tokenIssuedAt)
      };
      
      // 메모리 캐시 업데이트
      memoryCache.token = cacheData.token;
      memoryCache.tokenIssuedAt = cacheData.tokenIssuedAt;
      memoryCache.lastRedisCheck = Date.now();
      
      console.log(`✅ Redis에서 토큰 읽기 성공`);
      return cacheData;
    } else {
      console.log('Redis에 저장된 토큰이 없습니다.');
    }
  } catch (error) {
    console.error(`❌ 토큰 Redis 읽기 실패: ${error.message}`);
    console.error(`에러 스택:`, error.stack);
    // 환경변수 확인 로그
    console.log(`환경변수 확인: REDIS_URL=${!!process.env.REDIS_URL}, KV_URL=${!!process.env.KV_URL}, UPSTASH_REDIS_URL=${!!process.env.UPSTASH_REDIS_URL}`);
  }
  return null;
}

// Redis에 토큰 정보 저장
async function saveTokenToRedis(token, tokenIssuedAt) {
  const client = getRedisClient();
  if (!client) {
    console.warn('⚠️ Redis 클라이언트가 없어 저장을 건너뜁니다.');
    return;
  }
  
  try {
    // Redis 연결 확인 및 연결
    if (client.status === 'end' || client.status === 'close') {
      await client.connect();
    }
    
    // 12시간 TTL 설정 (초 단위)
    const ttlSeconds = Math.floor(TWELVE_HOURS / 1000);
    
    await Promise.all([
      client.set(REDIS_TOKEN_KEY, token, 'EX', ttlSeconds),
      client.set(REDIS_TOKEN_ISSUED_AT_KEY, tokenIssuedAt.toString(), 'EX', ttlSeconds)
    ]);
    
    // 메모리 캐시 업데이트
    memoryCache.token = token;
    memoryCache.tokenIssuedAt = tokenIssuedAt;
    memoryCache.lastRedisCheck = Date.now();
    
    console.log(`✅ 토큰 Redis 저장 완료 (TTL: ${ttlSeconds}초)`);
  } catch (error) {
    console.error(`❌ 토큰 Redis 저장 실패: ${error.message}`);
    console.error(`에러 스택:`, error.stack);
    // 환경변수 확인 로그
    console.log(`환경변수 확인: REDIS_URL=${!!process.env.REDIS_URL}, KV_URL=${!!process.env.KV_URL}, UPSTASH_REDIS_URL=${!!process.env.UPSTASH_REDIS_URL}`);
  }
}

// 액세스 토큰 발급 (Redis 기반 캐싱)
// 목표: 12시간 동안 동일 토큰 재사용 (모든 인스턴스에서 공유)
export async function getAccessToken() {
  // API 키 확인
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('API 키가 설정되지 않았습니다. 환경변수 KIS_APP_KEY와 KIS_APP_SECRET을 확인하세요.');
  }
  
  const now = Date.now();
  
  // 1. 메모리 캐시에서 토큰 확인 (Redis 읽기 최소화)
  if (memoryCache.token && memoryCache.tokenIssuedAt) {
    const timeSinceTokenIssued = now - memoryCache.tokenIssuedAt;
    if (timeSinceTokenIssued < TWELVE_HOURS) {
      const hoursElapsed = Math.round(timeSinceTokenIssued / 3600000 * 10) / 10;
      console.log(`✅ 메모리 캐시에서 토큰 재사용 (발급 후 ${hoursElapsed}시간 경과)`);
      return memoryCache.token;
    }
  }
  
  // 2. Redis에서 토큰 정보 읽기
  const cacheData = await readTokenFromRedis();
  
  if (cacheData && cacheData.token && cacheData.tokenIssuedAt) {
    const timeSinceTokenIssued = now - cacheData.tokenIssuedAt;
    
    // 12시간이 지나지 않았으면 Redis의 토큰 사용
    if (timeSinceTokenIssued < TWELVE_HOURS) {
      const hoursElapsed = Math.round(timeSinceTokenIssued / 3600000 * 10) / 10;
      const remainingHours = Math.round((TWELVE_HOURS - timeSinceTokenIssued) / 3600000 * 10) / 10;
      console.log(`✅ Redis 캐시에서 토큰 재사용 (발급 후 ${hoursElapsed}시간 경과, ${remainingHours}시간 후 만료)`);
      
      // 메모리 캐시 업데이트
      memoryCache.token = cacheData.token;
      memoryCache.tokenIssuedAt = cacheData.tokenIssuedAt;
      memoryCache.lastRedisCheck = now;
      
      return cacheData.token;
    } else {
      const hoursElapsed = Math.round(timeSinceTokenIssued / 3600000 * 10) / 10;
      console.log(`⏰ 캐시된 토큰 만료 (발급 후 ${hoursElapsed}시간 경과, 12시간 초과) - 새 토큰 발급 필요`);
    }
  }
  
  // 3. Redis에 토큰이 없거나 12시간이 지났으면 새 토큰 발급
  try {
    console.log('🔄 새 토큰 발급 요청 시작');
    
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
        },
        timeout: 30000 // 30초 타임아웃
      }
    );
    
    const accessToken = response.data.access_token;
    const expiresIn = response.data.expires_in || 86400; // 기본 24시간 (초)
    
    // Redis에 토큰 저장 (12시간 동안 재사용 가능, 모든 인스턴스에서 공유)
    await saveTokenToRedis(accessToken, now);
    
    const tokenExpiryHours = Math.round(expiresIn / 3600);
    console.log(`✅ 토큰 발급 성공 (실제 토큰 만료: 약 ${tokenExpiryHours}시간 후)`);
    console.log(`📌 12시간 동안 동일 토큰 재사용 예정 (Redis 캐시)`);
    
    return accessToken;
  } catch (error) {
    const errorDetail = error.response?.data || error.message;
    console.error('❌ 토큰 발급 실패 상세:', JSON.stringify(errorDetail, null, 2));
    
    // Rate limit 오류인 경우 Redis 캐시에서 토큰 재사용 시도
    if (error.response?.data?.error_code === 'EGW00133') {
      console.warn('⚠️ Rate limit 오류 발생 (1분당 1회 제한) - Redis 캐시에서 토큰 재사용 시도');
      
      if (cacheData && cacheData.token && cacheData.tokenIssuedAt) {
        const timeSinceTokenIssued = now - cacheData.tokenIssuedAt;
        // Redis에 저장된 토큰이 있으면 재사용 (12시간 초과여도 최후의 수단)
        if (timeSinceTokenIssued < 24 * 60 * 60 * 1000) { // 24시간 이내
          const hoursElapsed = Math.round(timeSinceTokenIssued / 3600000 * 10) / 10;
          console.log(`✅ Redis 캐시에서 토큰 재사용 성공 (발급 후 ${hoursElapsed}시간 경과, Rate limit 우회)`);
          return cacheData.token;
        }
      }
      
      throw new Error(`한국투자증권 API 정책: 토큰 발급은 1분당 1회만 가능합니다. 약 70초 후 재시도 하세요. (토큰은 한 번 발급받으면 24시간 동안 유효합니다)`);
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
  '005930': '삼성전자',
  '000660': 'SK하이닉스',
  '005380': '현대차',
  '207940': '삼성바이오로직스',
  '329180': 'HD현대중공업',
  '012450': '한화에어로스페이스',
  '034020': '두산에너빌리티',
  '373220': 'LG에너지솔루션'
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
        },
        timeout: 30000 // 30초 타임아웃
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

// 현재가 가져오기 (재시도 로직 포함)
export async function getCurrentPrice(stockCode, accessToken, appKey, appSecret) {
  // API 키 확인
  if (!appKey || !appSecret) {
    console.warn('API 키가 없어 현재가 조회를 건너뜁니다.');
    return null;
  }
  
  const maxRetries = 2; // 최대 2번 재시도
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
          },
          timeout: 30000 // 30초 타임아웃
        }
      );
      
      const output = stockInfoResponse.data.output || stockInfoResponse.data.output1;
      if (output) {
        // 현재가: stck_prpr (현재가)
        const currentPrice = parseInt(output.stck_prpr) || null;
        if (currentPrice !== null && currentPrice > 0) {
          console.log(`✅ 현재가 조회 성공: ${stockCode} - ${currentPrice}`);
          return currentPrice;
        } else {
          console.warn(`⚠️ 현재가 조회 실패: ${stockCode} - 응답에 유효한 현재가 없음 (stck_prpr: ${output.stck_prpr})`);
        }
      } else {
        console.warn(`⚠️ 현재가 조회 실패: ${stockCode} - 응답에 output 데이터 없음`);
      }
      // 응답은 받았지만 데이터가 없으면 재시도하지 않음
      return null;
    } catch (error) {
      lastError = error;
      const isNetworkError = error.code === 'ECONNRESET' || 
                            error.code === 'ETIMEDOUT' ||
                            error.code === 'ENOTFOUND' ||
                            error.message?.includes('socket hang up') ||
                            error.message?.includes('timeout');
      
      if (isNetworkError && attempt < maxRetries) {
        const delay = (attempt + 1) * 2000; // 2초, 4초
        console.log(`⚠️ ${stockCode} 현재가 조회 네트워크 오류 (${error.message}). ${delay/1000}초 후 재시도... (${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      } else {
        console.error(`❌ ${stockCode} 현재가 조회 실패: ${error.message}`);
      }
    }
  }
  
  // 모든 재시도 실패
  console.error(`❌ ${stockCode} 현재가 조회 최종 실패 (${maxRetries + 1}번 시도)`);
  return null;
}
