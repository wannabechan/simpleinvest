const stockSelect = document.getElementById('stockSelect');
const stocksContainer = document.getElementById('stocksContainer');
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const errorMessage = document.getElementById('errorMessage');
const refreshButton = document.getElementById('refreshButton');

// 카운트다운 관련 변수
let countdownTimer = null;
let countdownStartTime = null;

// 콤보박스에서 등록된 종목 목록 가져오기
function getStockList() {
    const options = Array.from(stockSelect.options);
    return options
        .filter(option => option.value !== '') // 빈 값 제외
        .map(option => ({
            code: option.value,
            name: option.textContent
        }));
}

// 백엔드 API 서버 주소 (환경에 따라 자동 선택)
// vercel dev를 사용하면 같은 도메인을 사용하므로 빈 문자열
// 기존 백엔드 서버를 사용하려면 http://localhost:3001로 변경
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''  // Vercel dev 사용 시 (같은 도메인) 또는 'http://localhost:3001' (기존 백엔드 서버 사용 시)
  : '';  // 프로덕션 환경 (Vercel은 같은 도메인 사용)


// 주식 데이터를 가져오는 함수 (단일 종목, 에러 처리 포함)
async function fetchStockData(stockCode, retryCount = 0, progressCallback = null) {
    const MAX_RETRIES = 1; // 최대 1번 재시도 (70초 대기)
    const RETRY_DELAY = 70000; // 70초 대기 (1분 + 여유시간)
    
    try {
        // 백엔드 API 호출
        const apiUrl = `${API_BASE_URL}/api/stock/${stockCode}`;
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            // Rate limit 에러인지 확인
            const isRateLimit = errorData.error?.includes('1분당 1회') || 
                              errorData.error?.includes('Rate limit') ||
                              errorData.error?.includes('70초') ||
                              errorData.error?.includes('토큰 발급') ||
                              errorData.message?.includes('1분당 1회') ||
                              errorData.details?.error_code === 'EGW00133';
            
            // Rate limit 에러이고 재시도 횟수가 남아있으면 재시도
            if (isRateLimit && retryCount < MAX_RETRIES) {
                const waitSeconds = Math.ceil(RETRY_DELAY / 1000);
                
                // 진행 상황 콜백 호출 (로딩 메시지 업데이트)
                if (progressCallback) {
                    progressCallback(`토큰 발급 제한으로 인해 ${waitSeconds}초 후 재시도합니다...`);
                }
                
                // 대기 후 재시도
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                return fetchStockData(stockCode, retryCount + 1, progressCallback);
            }
            
            throw new Error(errorData.error || `서버 오류: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
        
    } catch (err) {
        console.error(`종목 ${stockCode} API 호출 실패:`, err);
        
        // Rate limit 에러인지 다시 확인 (에러 메시지에서)
        const isRateLimit = err.message.includes('1분당 1회') || 
                          err.message.includes('Rate limit') ||
                          err.message.includes('70초') ||
                          err.message.includes('토큰 발급');
        
        // Rate limit 에러이고 재시도 횟수가 남아있으면 재시도
        if (isRateLimit && retryCount < MAX_RETRIES) {
            const waitSeconds = Math.ceil(RETRY_DELAY / 1000);
            
            // 진행 상황 콜백 호출 (로딩 메시지 업데이트)
            if (progressCallback) {
                progressCallback(`토큰 발급 제한으로 인해 ${waitSeconds}초 후 재시도합니다...`);
            }
            
            // 대기 후 재시도
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return fetchStockData(stockCode, retryCount + 1, progressCallback);
        }
        
        // 에러 반환
        throw err;
    }
}

// 모든 종목 데이터를 가져오는 함수 (배치 API 사용 - 동일 토큰 보장)
async function fetchAllStocks() {
    const stockList = getStockList();
    
    if (stockList.length === 0) {
        showError('등록된 종목이 없습니다.');
        return;
    }
    
    // 로딩 표시
    stocksContainer.innerHTML = '';
    error.classList.add('hidden');
    loading.classList.remove('hidden');
    loading.textContent = `데이터를 불러오는 중... (${stockList.length}개 종목)`;
    
    try {
        // 종목 코드 목록 생성
        const stockCodes = stockList.map(stock => stock.code).join(',');
        
        // 배치 API 호출 (모든 종목을 한 번에 요청 - 동일 토큰 사용)
        const apiUrl = `${API_BASE_URL}/api/stocks?codes=${stockCodes}`;
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `서버 오류: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 로딩 숨기기
        loading.classList.add('hidden');
        
        // 결과 확인
        if (data.success === 0) {
            showError('모든 종목 정보를 불러오는데 실패했습니다.');
            return;
        }
        
        // 에러가 있는 경우 알림
        if (data.failed > 0 && data.errors) {
            const errorMessages = Object.entries(data.errors)
                .map(([code, msg]) => `${code}: ${msg}`)
                .join(', ');
            error.textContent = `${data.failed}개 종목 정보를 불러오는데 실패했습니다. (${errorMessages})`;
            error.classList.remove('hidden');
        }
        
        // 콤보박스 순서대로 종목 표시 (동일 순서 유지)
        stockList.forEach(stock => {
            if (data.results[stock.code]) {
                displayStockCard(data.results[stock.code], stock.code);
            }
        });
        
        console.log(`✅ 배치 조회 완료: 성공 ${data.success}개, 실패 ${data.failed}개`);
        
    } catch (err) {
        console.error('배치 API 호출 실패:', err);
        loading.classList.add('hidden');
        
        // 에러 메시지 표시
        let errorMsg = '주식 정보를 불러오는 중 오류가 발생했습니다.';
        let isRateLimit = false;
        let waitSeconds = 70;
        
        if (err.message.includes('Failed to fetch') || err.message.includes('CORS')) {
            errorMsg = '백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.';
        } else if (err.message) {
            errorMsg = err.message;
            // Rate limit 에러인지 확인
            isRateLimit = err.message.includes('1분당 1회') || 
                         err.message.includes('토큰 발급') ||
                         err.message.includes('재시도 하세요');
            
            // 에러 메시지에서 대기 시간 추출 (예: "약 70초 후")
            if (isRateLimit) {
                const timeMatch = err.message.match(/약\s*(\d+)\s*초/);
                if (timeMatch) {
                    waitSeconds = parseInt(timeMatch[1], 10);
                }
            }
        }
        
        showError(errorMsg, isRateLimit, waitSeconds);
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

// 주식 데이터 카드 생성 및 표시
function displayStockCard(data, stockCode) {
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
    
    // 시작가 대비 종가 변화 계산
    const change = data.close - data.open;
    const changePercent = (change / data.open) * 100;
    
    // 최고가와 최저가의 중간값 계산
    const middle = (data.high + data.low) / 2;
    
    // 종가 대비 중간값 변화율 계산: (중간값 - 종가) / 종가 * 100
    const close = data.close || 0;
    let middleChangePercent = null;
    let middleChangeClass = '';
    
    if (close > 0) {
      middleChangePercent = ((middle - close) / close) * 100;
      // 0.3% 이상 1.2% 이하일 경우 빨간색
      if (middleChangePercent >= 0.3 && middleChangePercent <= 1.2) {
        middleChangeClass = 'middle-highlight';
      }
    }
    
    // 중간값 표시 텍스트 생성
    let middleDisplayText = formatPrice(Math.round(middle));
    if (middleChangePercent !== null) {
      const sign = middleChangePercent >= 0 ? '+' : '';
      middleDisplayText += ` <span class="middle-change ${middleChangeClass}">(종가 대비 ${sign}${middleChangePercent.toFixed(2)}%)</span>`;
    }
    
    // 카드 HTML 생성
    const card = document.createElement('div');
    card.className = 'stock-info';
    card.id = `stock-${stockCode}`;
    card.innerHTML = `
        <div class="info-header">
            <h2 class="stock-name">${data.name} (${stockCode})</h2>
            <p class="stock-date">기준일: ${formattedDate}</p>
        </div>
        <div class="info-grid">
            <div class="info-item">
                <span class="info-label">시작가</span>
                <span class="info-value">${formatPrice(data.open)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">종가</span>
                <span class="info-value">${formatPrice(data.close)}</span>
            </div>
            <div class="info-item info-item-full">
                <span class="info-label">등락</span>
                <span class="info-change ${change > 0 ? 'up' : change < 0 ? 'down' : 'equal'}">${formatChange(change, changePercent, changePercent >= -2 && changePercent <= -0.5 ? ' ←' : '')}</span>
            </div>
            <div class="info-item">
                <span class="info-label">최고가</span>
                <span class="info-value">${formatPrice(data.high)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">최저가</span>
                <span class="info-value">${formatPrice(data.low)}</span>
            </div>
            <div class="info-item info-item-full">
                <span class="info-label">중간값</span>
                <span class="info-middle">${middleDisplayText}</span>
            </div>
        </div>
    `;
    
    stocksContainer.appendChild(card);
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

// 변화량 포맷팅 (상승/하락)
function formatChange(change, changePercent, suffix = '') {
    if (change > 0) {
        return `+${formatPrice(Math.abs(change))} (+${changePercent.toFixed(2)}%)${suffix}`;
    } else if (change < 0) {
        return `${formatPrice(change)} (${changePercent.toFixed(2)}%)${suffix}`;
    } else {
        return `0원 (0.00%)${suffix}`;
    }
}

// 에러 메시지 표시
function showError(message, showRefresh = false, waitSeconds = 70) {
    errorMessage.textContent = message;
    error.classList.remove('hidden');
    
    // 기존 카운트다운 정리
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    
    // Rate limit 에러인 경우 Refresh 버튼 표시 및 카운트다운 시작
    if (showRefresh) {
        refreshButton.classList.remove('hidden');
        startCountdown(waitSeconds);
    } else {
        refreshButton.classList.add('hidden');
        refreshButton.disabled = false;
        refreshButton.textContent = '재시도';
    }
}

// 카운트다운 시작
function startCountdown(seconds) {
    let remainingSeconds = seconds;
    countdownStartTime = Date.now();
    
    // 버튼 초기 상태 (비활성화)
    refreshButton.disabled = true;
    updateCountdownButton(remainingSeconds);
    
    // 카운트다운 시작
    countdownTimer = setInterval(() => {
        remainingSeconds--;
        updateCountdownButton(remainingSeconds);
        
        // 카운트다운 종료
        if (remainingSeconds <= 0) {
            clearInterval(countdownTimer);
            countdownTimer = null;
            refreshButton.disabled = false;
            refreshButton.textContent = '재시도';
        }
    }, 1000);
}

// 카운트다운 버튼 텍스트 업데이트
function updateCountdownButton(remainingSeconds) {
    refreshButton.textContent = `재시도 (${remainingSeconds}초)`;
}

// 콤보박스는 등록된 종목 목록 조회용으로만 사용 (선택 기능 비활성화)
stockSelect.addEventListener('change', function() {
    // 선택이 변경되면 즉시 원래 값(빈 값)으로 되돌림
    // 이렇게 하면 목록은 볼 수 있지만 선택은 되지 않음
    if (this.value !== '') {
        // 약간의 지연을 주어 사용자가 선택을 확인할 수 있게 함
        setTimeout(() => {
            this.value = '';
        }, 100);
    }
});

// Refresh 버튼 클릭 이벤트
refreshButton.addEventListener('click', function() {
    // 카운트다운이 진행 중이거나 버튼이 비활성화된 경우 클릭 무시
    if (refreshButton.disabled) {
        return;
    }
    
    // 기존 카운트다운 정리
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    
    // 에러 숨기기
    error.classList.add('hidden');
    refreshButton.classList.add('hidden');
    refreshButton.disabled = false;
    refreshButton.textContent = '재시도';
    
    // 데이터 다시 불러오기
    fetchAllStocks();
});

// 페이지 로드 시 모든 종목 데이터 불러오기
window.addEventListener('DOMContentLoaded', function() {
    fetchAllStocks();
});