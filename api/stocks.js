// Vercel Serverless Function: 여러 종목 정보 일괄 조회
// 경로: /api/stocks?codes=005930,000660,005380

import axios from 'axios';
import { getAccessToken, getTodayString, getStockName, getCurrentPrice, getPrevDataFromCache, savePrevDataToCache, APP_KEY, APP_SECRET } from './_shared/kis-api.js';

// 환경변수에서 API 키 가져오기
const KIS_APP_KEY = process.env.KIS_APP_KEY || APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET || APP_SECRET;

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
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
    // 종목 코드 목록 파싱 (쉼표로 구분)
    const codesParam = req.query.codes || '';
    const stockCodes = codesParam.split(',').map(code => code.trim()).filter(code => code);
    
    if (stockCodes.length === 0) {
      return res.status(400).json({ 
        error: '종목 코드가 없습니다. codes 파라미터를 제공해주세요. (예: ?codes=005930,000660)' 
      });
    }
    
    // API 키 확인
    if (!KIS_APP_KEY || !KIS_APP_SECRET || 
        KIS_APP_KEY === 'YOUR_APP_KEY_HERE' || 
        KIS_APP_SECRET === 'YOUR_APP_SECRET_HERE') {
      console.error('API 키 미설정');
      return res.status(500).json({ 
        error: 'API 키가 설정되지 않았습니다. Vercel 환경변수에 KIS_APP_KEY와 KIS_APP_SECRET을 설정해주세요.',
        hint: 'Vercel 대시보드 → Settings → Environment Variables에서 확인하세요.'
      });
    }
    
    console.log(`배치 조회 시작: ${stockCodes.length}개 종목`);
    
    // 한 번의 토큰 발급으로 모든 종목 조회
    const accessToken = await getAccessToken();
    const today = getTodayString();
    
    console.log('토큰 발급 완료, 종목 정보 조회 시작...');
    
    // 모든 종목 정보를 순차적으로 조회 (같은 토큰 사용)
    const results = {};
    const errors = {};
    
    for (const stockCode of stockCodes) {
      try {
        // 종목명 가져오기 (최적화: 매핑이 있으면 API 호출 생략)
        const stockName = await getStockName(stockCode, accessToken, KIS_APP_KEY, KIS_APP_SECRET);
        
        // 현재가 가져오기
        const currentPrice = await getCurrentPrice(stockCode, accessToken, KIS_APP_KEY, KIS_APP_SECRET);
        
        // 직전 개장일 데이터 캐시 확인 (오늘이 바뀌기 전까지 캐시 사용)
        let cachedPrevData = await getPrevDataFromCache(stockCode, today);
        let prevData = null;
        let latestData = null;
        
        if (cachedPrevData) {
          // 캐시에서 직전 개장일 데이터만 사용 (최근 개장일은 실시간이므로 API로 조회)
          prevData = cachedPrevData.prevData;
          console.log(`✅ ${stockCode} 직전 개장일 데이터 캐시 사용 (API 호출 생략)`);
        }
        
        // 최근 개장일 데이터는 항상 최신 조회 (실시간 데이터)
        // 한국투자증권 일자별 시세 조회 API (타임아웃 및 재시도 포함)
        let response;
        const maxRetries = 2; // 최대 2번 재시도
        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            response = await axios.get(
              'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-price',
              {
                params: {
                  FID_COND_MRKT_DIV_CODE: 'J',
                  FID_INPUT_ISCD: stockCode,
                  FID_INPUT_DATE_1: today,
                  FID_INPUT_DATE_2: today,
                  FID_PERIOD_DIV_CODE: 'D',
                  FID_ORG_ADJ_PRC: '0'
                },
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'appkey': KIS_APP_KEY,
                  'appsecret': KIS_APP_SECRET,
                  'tr_id': 'FHKST01010400',
                  'Content-Type': 'application/json'
                },
                timeout: 30000 // 30초 타임아웃
              }
            );
            break; // 성공하면 루프 탈출
          } catch (error) {
            lastError = error;
            const isNetworkError = error.code === 'ECONNRESET' || 
                                  error.code === 'ETIMEDOUT' ||
                                  error.code === 'ENOTFOUND' ||
                                  error.message?.includes('socket hang up') ||
                                  error.message?.includes('timeout');
            
            if (isNetworkError && attempt < maxRetries) {
              const delay = (attempt + 1) * 2000; // 2초, 4초, 6초...
              console.log(`⚠️ ${stockCode} 네트워크 오류 발생 (${error.message}). ${delay/1000}초 후 재시도... (${attempt + 1}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              throw error; // 재시도 불가능하거나 최대 재시도 횟수 초과
            }
          }
        }
        
        // 응답 데이터 확인
        if (!response.data.output || response.data.output.length === 0) {
          errors[stockCode] = '주식 정보를 찾을 수 없습니다.';
          continue;
        }
        
        // 최근 거래일 데이터 (첫 번째 항목이 가장 최근)
        latestData = response.data.output[0];
        
        // 캐시에 직전 개장일 데이터가 없으면 API 응답에서 가져오기
        if (!prevData) {
          // 최근 개장일 바로 이전의 개장일 데이터 (두 번째 항목)
          prevData = response.data.output[1];
          
          // 최근 개장일 바로 이전의 개장일이 없으면 에러
          if (!prevData) {
            errors[stockCode] = '최근 개장일 바로 이전의 개장일 데이터를 찾을 수 없습니다.';
            continue;
          }
          
          // 직전 개장일 데이터를 캐시에 저장 (오늘 날짜 기준)
          await savePrevDataToCache(stockCode, today, {
            prevData: prevData
          });
        }
        
        // 날짜 파싱 (YYYYMMDD -> Date) - 최근 개장일 바로 이전의 개장일
        const dateStr = prevData.stck_bsop_date;
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        const date = new Date(year, month, day);
        
        // 최근 개장일 날짜 파싱
        const latestDateStr = latestData.stck_bsop_date;
        const latestYear = parseInt(latestDateStr.substring(0, 4));
        const latestMonth = parseInt(latestDateStr.substring(4, 6)) - 1;
        const latestDay = parseInt(latestDateStr.substring(6, 8));
        const latestDate = new Date(latestYear, latestMonth, latestDay);
        
        // 전일종가 계산 (최근 개장일 바로 이전의 개장일의 전일 종가 = 최근 거래일의 종가 또는 현재 데이터의 전일종가 필드 사용)
        const prevClose = latestData 
          ? parseInt(latestData.stck_clpr) || 0
          : (parseInt(prevData.stck_prdy_clpr) || 0);
        
        // 직전 개장일의 중간값 계산
        const prevMiddle = (parseInt(prevData.stck_hgpr) + parseInt(prevData.stck_lwpr)) / 2;
        
        results[stockCode] = {
          name: stockName,
          currentPrice: currentPrice, // 현재가 추가
          // 최근 개장일 바로 이전의 개장일 정보
          prevDate: date,
          prevOpen: parseInt(prevData.stck_oprc) || 0,
          prevClose: parseInt(prevData.stck_clpr) || 0,
          prevHigh: parseInt(prevData.stck_hgpr) || 0,
          prevLow: parseInt(prevData.stck_lwpr) || 0,
          prevPrevClose: prevClose, // 전일종가 추가
          // 최근 개장일 정보
          latestDate: latestDate,
          latestOpen: parseInt(latestData.stck_oprc) || 0,
          latestClose: parseInt(latestData.stck_clpr) || 0,
          latestHigh: parseInt(latestData.stck_hgpr) || 0,
          latestLow: parseInt(latestData.stck_lwpr) || 0
        };
        
        console.log(`✅ ${stockCode} 조회 완료: ${stockName}`);
      } catch (error) {
        console.error(`❌ ${stockCode} 조회 실패:`, error.message);
        const errorMessage = error.response?.data?.msg1 || error.message || '알 수 없는 오류';
        
        // socket hang up 등 네트워크 오류의 경우 더 명확한 메시지
        if (error.message?.includes('socket hang up') || 
            error.code === 'ECONNRESET' || 
            error.code === 'ETIMEDOUT') {
          errors[stockCode] = `네트워크 연결 오류: ${errorMessage} (한국투자증권 API 서버와의 연결이 끊어졌습니다. 잠시 후 다시 시도해주세요.)`;
        } else {
          errors[stockCode] = errorMessage;
        }
      }
    }
    
    console.log(`배치 조회 완료: 성공 ${Object.keys(results).length}개, 실패 ${Object.keys(errors).length}개`);
    
    // 결과 반환
    return res.status(200).json({
      success: Object.keys(results).length,
      failed: Object.keys(errors).length,
      results: results,
      errors: Object.keys(errors).length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('배치 조회 API 호출 실패:', error);
    console.error('에러 상세:', error.response?.data || error.message);
    console.error('스택 트레이스:', error.stack);
    
    // 에러 응답 형식화
    const errorMessage = error.message || '주식 정보를 가져오는 중 오류가 발생했습니다.';
    const errorDetails = {
      message: errorMessage,
      type: error.name || 'UnknownError',
      details: error.response?.data || null
    };
    
    return res.status(500).json({ 
      error: errorMessage,
      ...errorDetails
    });
  }
}
