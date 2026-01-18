// Vercel Serverless Function: 여러 종목 정보 일괄 조회
// 경로: /api/stocks?codes=005930,000660,005380

import axios from 'axios';
import { getAccessToken, getTodayString, getStockName, APP_KEY, APP_SECRET } from './_shared/kis-api.js';

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
        // 종목명 가져오기
        const stockName = await getStockName(stockCode, accessToken, KIS_APP_KEY, KIS_APP_SECRET);
        
        // 한국투자증권 일자별 시세 조회 API
        const response = await axios.get(
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
            }
          }
        );
        
        // 응답 데이터 확인
        if (!response.data.output || response.data.output.length === 0) {
          errors[stockCode] = '주식 정보를 찾을 수 없습니다.';
          continue;
        }
        
        // 최근 거래일 데이터 (첫 번째 항목이 가장 최근)
        const latestData = response.data.output[0];
        // 최근 개장일 바로 이전의 개장일 데이터 (두 번째 항목)
        const data = response.data.output[1];
        
        // 최근 개장일 바로 이전의 개장일이 없으면 에러
        if (!data) {
          errors[stockCode] = '최근 개장일 바로 이전의 개장일 데이터를 찾을 수 없습니다.';
          continue;
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
        
        results[stockCode] = {
          name: stockName,
          date: date, // 최근 개장일 바로 이전의 개장일
          open: parseInt(data.stck_oprc) || 0,
          close: parseInt(data.stck_clpr) || 0,
          high: parseInt(data.stck_hgpr) || 0,
          low: parseInt(data.stck_lwpr) || 0,
          prevClose: prevClose // 전일종가 추가
        };
        
        console.log(`✅ ${stockCode} 조회 완료: ${stockName}`);
      } catch (error) {
        console.error(`❌ ${stockCode} 조회 실패:`, error.message);
        errors[stockCode] = error.response?.data?.msg1 || error.message || '알 수 없는 오류';
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
