// Vercel Serverless Function: 주식 정보 조회
// 경로: /api/stock/[code]

import axios from 'axios';
import { getAccessToken, getTodayString, getStockName, APP_KEY, APP_SECRET } from '../_shared/kis-api.js';

// 환경변수에서 API 키 가져오기
// 주의: API 키는 반드시 환경변수에서 설정해야 합니다.
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
    const stockCode = req.query.code; // 예: 005930
    
    // API 키 확인 (환경변수 미설정 체크)
    if (!KIS_APP_KEY || !KIS_APP_SECRET || 
        KIS_APP_KEY === 'YOUR_APP_KEY_HERE' || 
        KIS_APP_SECRET === 'YOUR_APP_SECRET_HERE') {
      console.error('API 키 미설정:', { 
        hasKey: !!KIS_APP_KEY, 
        hasSecret: !!KIS_APP_SECRET 
      });
      return res.status(500).json({ 
        error: 'API 키가 설정되지 않았습니다. Vercel 환경변수에 KIS_APP_KEY와 KIS_APP_SECRET을 설정해주세요.',
        hint: 'Vercel 대시보드 → Settings → Environment Variables에서 확인하세요.'
      });
    }
    
    console.log('API 키 확인 완료, 토큰 발급 시작...');
    const accessToken = await getAccessToken();
    const today = getTodayString();
    
    // 종목명 가져오기
    const stockName = await getStockName(stockCode, accessToken, KIS_APP_KEY, KIS_APP_SECRET);
    
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
      return res.status(404).json({ 
        error: '주식 정보를 찾을 수 없습니다. 종목코드를 확인해주세요.' 
      });
    }
    
    // 최근 거래일 데이터 (첫 번째 항목이 가장 최근)
    const latestData = response.data.output[0];
    // 최근 개장일 바로 이전의 개장일 데이터 (두 번째 항목)
    const data = response.data.output[1];
    
    // 최근 개장일 바로 이전의 개장일이 없으면 에러
    if (!data) {
      return res.status(404).json({ 
        error: '최근 개장일 바로 이전의 개장일 데이터를 찾을 수 없습니다.' 
      });
    }
    
    // 날짜 파싱 (YYYYMMDD -> Date) - 최근 개장일 바로 이전의 개장일 사용
    const dateStr = data.stck_bsop_date;
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    const date = new Date(year, month, day);
    
    // 전일종가 계산 (현재 기준일의 전일 종가 = 최근 거래일의 종가 또는 현재 데이터의 전일종가 필드 사용)
    const prevClose = latestData 
      ? parseInt(latestData.stck_clpr) || 0
      : (parseInt(data.stck_prdy_clpr) || 0);
    
    const result = {
      name: stockName,
      date: date, // 최근 개장일 바로 이전의 개장일
      open: parseInt(data.stck_oprc) || 0,
      close: parseInt(data.stck_clpr) || 0,
      high: parseInt(data.stck_hgpr) || 0,
      low: parseInt(data.stck_lwpr) || 0,
      prevClose: prevClose // 전일종가 추가
    };
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('API 호출 실패:', error);
    console.error('에러 상세:', error.response?.data || error.message);
    console.error('스택 트레이스:', error.stack);
    
    // 에러 응답 형식화
    if (error.response?.data?.rt_cd === '-1') {
      return res.status(400).json({ 
        error: `API 오류: ${error.response.data.msg1 || '알 수 없는 오류'}`,
        details: error.response.data
      });
    }
    
    // 더 자세한 에러 정보 반환
    const errorMessage = error.message || '주식 정보를 가져오는 중 오류가 발생했습니다.';
    const errorDetails = {
      message: errorMessage,
      type: error.name || 'UnknownError',
      details: error.response?.data || null
    };
    
    console.error('반환할 에러 정보:', errorDetails);
    
    return res.status(500).json({ 
      error: errorMessage,
      ...errorDetails
    });
  }
}
