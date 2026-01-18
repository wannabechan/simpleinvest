const stockSelect = document.getElementById('stockSelect');
const stockInfo = document.getElementById('stockInfo');
const stockName = document.getElementById('stockName');
const stockDate = document.getElementById('stockDate');
const openPrice = document.getElementById('openPrice');
const closePrice = document.getElementById('closePrice');
const highPrice = document.getElementById('highPrice');
const lowPrice = document.getElementById('lowPrice');
const priceChange = document.getElementById('priceChange');
const middleValue = document.getElementById('middleValue');
const loading = document.getElementById('loading');
const error = document.getElementById('error');

// 백엔드 API 서버 주소 (환경에 따라 자동 선택)
// vercel dev를 사용하면 같은 도메인을 사용하므로 빈 문자열
// 기존 백엔드 서버를 사용하려면 http://localhost:3001로 변경
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''  // Vercel dev 사용 시 (같은 도메인) 또는 'http://localhost:3001' (기존 백엔드 서버 사용 시)
  : '';  // 프로덕션 환경 (Vercel은 같은 도메인 사용)


// 주식 데이터를 가져오는 함수 (Rate limit 재시도 포함)
async function fetchStockData(stockCode, retryCount = 0) {
    const MAX_RETRIES = 2; // 최대 2번 재시도
    const RETRY_DELAY = 70000; // 70초 대기 (1분 + 여유시간)
    
    try {
        // 로딩 표시
        stockInfo.classList.add('hidden');
        error.classList.add('hidden');
        loading.classList.remove('hidden');
        
        // 백엔드 API 호출
        const apiUrl = `${API_BASE_URL}/api/stock/${stockCode}`;
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            // Rate limit 에러인지 확인
            const isRateLimit = errorData.error?.includes('1분당 1회') || 
                              errorData.error?.includes('Rate limit') ||
                              errorData.error?.includes('65초') ||
                              errorData.message?.includes('1분당 1회') ||
                              errorData.details?.error_code === 'EGW00133';
            
            // Rate limit 에러이고 재시도 횟수가 남아있으면 재시도
            if (isRateLimit && retryCount < MAX_RETRIES) {
                const waitSeconds = Math.ceil(RETRY_DELAY / 1000);
                
                // 대기 후 재시도
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                return fetchStockData(stockCode, retryCount + 1);
            }
            
            throw new Error(errorData.error || `서버 오류: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 데이터 표시
        displayStockData(data, stockCode);
        
    } catch (err) {
        console.error('API 호출 실패:', err);
        
        // Rate limit 에러인지 다시 확인 (에러 메시지에서)
        const isRateLimit = err.message.includes('1분당 1회') || 
                          err.message.includes('Rate limit') ||
                          err.message.includes('65초');
        
        // Rate limit 에러이고 재시도 횟수가 남아있으면 재시도
        if (isRateLimit && retryCount < MAX_RETRIES) {
            const waitSeconds = Math.ceil(RETRY_DELAY / 1000);
            
            // 대기 후 재시도
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return fetchStockData(stockCode, retryCount + 1);
        }
        
        // 에러 메시지 표시
        let errorMessage = '주식 정보를 불러오는 중 오류가 발생했습니다.';
        
        if (err.message.includes('Failed to fetch') || err.message.includes('CORS')) {
            errorMessage = '백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요. (http://localhost:3001)';
        } else if (err.message) {
            errorMessage = err.message;
        }
        
        showError(errorMessage);
    } finally {
        loading.classList.add('hidden');
    }
}

// 임시 모의 데이터 사용 (실제 API 연동 전까지)
function useMockData(stockCode) {
    const today = new Date();
    let lastTradingDay = new Date(today);
    
    // 오늘 이전의 최근 거래일 찾기 (토요일, 일요일 제외)
    while (lastTradingDay.getDay() === 0 || lastTradingDay.getDay() === 6) {
        lastTradingDay.setDate(lastTradingDay.getDate() - 1);
    }
    if (lastTradingDay.getTime() === today.getTime()) {
        lastTradingDay.setDate(lastTradingDay.getDate() - 1);
        while (lastTradingDay.getDay() === 0 || lastTradingDay.getDay() === 6) {
            lastTradingDay.setDate(lastTradingDay.getDate() - 1);
        }
    }
    
    // 삼성전자 모의 데이터 (실제 API로 대체 필요)
    const mockData = {
        '005930': {
            name: '삼성전자',
            date: lastTradingDay,
            open: 67800,
            close: 68200,
            high: 68500,
            low: 67600
        }
    };
    
    const data = mockData[stockCode];
    if (data) {
        displayStockData(data, stockCode);
    } else {
        showError('주식 데이터를 찾을 수 없습니다.');
    }
}

// 주식 데이터 표시
function displayStockData(data, stockCode) {
    // 날짜가 문자열로 오면 Date 객체로 변환
    let date = data.date || new Date();
    if (typeof date === 'string') {
        date = new Date(date);
    }
    // Date 객체가 아닌 경우에도 처리
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        date = new Date();
    }
    const formattedDate = formatDate(date);
    
    stockName.textContent = `${data.name} (${stockCode})`;
    stockDate.textContent = `기준일: ${formattedDate}`;
    
    // 가격 표시
    openPrice.textContent = formatPrice(data.open);
    closePrice.textContent = formatPrice(data.close);
    highPrice.textContent = formatPrice(data.high);
    lowPrice.textContent = formatPrice(data.low);
    
    // 시작가 대비 종가 변화 계산 및 표시 (독립 행)
    const change = data.close - data.open;
    const changePercent = (change / data.open) * 100;
    displayChange(priceChange, change, changePercent);
    
    // 최고가와 최저가의 중간값 계산 및 표시 (독립 행)
    const middle = (data.high + data.low) / 2;
    middleValue.textContent = formatPrice(Math.round(middle));
    
    stockInfo.classList.remove('hidden');
}

// 날짜 포맷팅
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}년 ${month}월 ${day}일`;
}

// 가격 포맷팅 (천 단위 구분)
function formatPrice(price) {
    return new Intl.NumberFormat('ko-KR').format(price) + '원';
}

// 변화량 표시 (상승/하락)
function displayChange(element, change, changePercent) {
    const isPositive = change > 0;
    const isNegative = change < 0;
    const isEqual = change === 0;
    
    // 클래스 초기화
    element.classList.remove('up', 'down', 'equal');
    
    if (isPositive) {
        element.classList.add('up');
        element.textContent = `+${formatPrice(Math.abs(change))} (+${changePercent.toFixed(2)}%)`;
    } else if (isNegative) {
        element.classList.add('down');
        element.textContent = `${formatPrice(change)} (${changePercent.toFixed(2)}%)`;
    } else {
        element.classList.add('equal');
        element.textContent = `0원 (0.00%)`;
    }
}

// 에러 메시지 표시
function showError(message) {
    error.textContent = message;
    error.classList.remove('hidden');
    stockInfo.classList.add('hidden');
}

// 콤보박스 변경 이벤트
stockSelect.addEventListener('change', function() {
    const selectedStockCode = this.value;
    if (selectedStockCode) {
        fetchStockData(selectedStockCode);
    } else {
        stockInfo.classList.add('hidden');
        error.classList.add('hidden');
    }
});

// 페이지 로드 시 기본 선택된 항목 데이터 불러오기
window.addEventListener('DOMContentLoaded', function() {
    const defaultStockCode = stockSelect.value;
    if (defaultStockCode) {
        fetchStockData(defaultStockCode);
    }
});