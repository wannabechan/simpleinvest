const stockSelect = document.getElementById('stockSelect');
const stocksContainer = document.getElementById('stocksContainer');
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const errorMessage = document.getElementById('errorMessage');
const refreshButton = document.getElementById('refreshButton');
const progressBar = document.getElementById('progressBar');
const progressPercent = document.getElementById('progressPercent');

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

// 프로그레스 바 업데이트 함수
function updateProgress(percent) {
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }
    const progressPercentElement = document.getElementById('progressPercent');
    if (progressPercentElement) {
        progressPercentElement.textContent = `${percent}%`;
    }
}

// 현재 시간을 포맷팅하는 함수
function formatCurrentTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 모든 종목 데이터를 가져오는 함수 (배치 API 사용 - 동일 토큰 보장)
async function fetchAllStocks() {
    const stockList = getStockList();
    
    if (stockList.length === 0) {
        showError('등록된 종목이 없습니다.');
        return;
    }
    
    // 콤보박스 첫 번째 옵션을 리프레시 시간으로 업데이트
    if (stockSelect.options.length > 0) {
        stockSelect.options[0].textContent = `최근 조회: ${formatCurrentTime()}`;
    }
    
    // 로딩 표시
    stocksContainer.innerHTML = '';
    error.classList.add('hidden');
    loading.classList.remove('hidden');
    
    // 프로그레스 바 초기화
    updateProgress(0);
    
    try {
        // 종목 코드 목록 생성
        const stockCodes = stockList.map(stock => stock.code).join(',');
        
        // 프로그레스: API 요청 시작
        updateProgress(10);
        
        // 배치 API 호출 (모든 종목을 한 번에 요청 - 동일 토큰 사용)
        const apiUrl = `${API_BASE_URL}/api/stocks?codes=${stockCodes}`;
        
        // 프로그레스: API 응답 대기 중 (점진적으로 증가)
        const progressInterval = setInterval(() => {
            const currentProgress = parseInt(progressBar.style.width) || 10;
            if (currentProgress < 80) {
                updateProgress(Math.min(currentProgress + 5, 80));
            }
        }, 200);
        
        const response = await fetch(apiUrl);
        
        clearInterval(progressInterval);
        updateProgress(85);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `서버 오류: ${response.status}`);
        }
        
        const data = await response.json();
        updateProgress(90);
        
        // 결과 확인
        if (data.success === 0) {
            updateProgress(100);
            setTimeout(() => {
                loading.classList.add('hidden');
            }, 300);
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
                // 로그 표시 (기존 저장된 로그, 비동기)
                displayLog(stock.code).catch(err => {
                    console.error(`로그 표시 실패 (${stock.code}):`, err);
                });
            }
        });
        
        updateProgress(100);
        
        // 로딩 숨기기 (약간의 딜레이 후)
        setTimeout(() => {
            loading.classList.add('hidden');
        }, 300);
        
        console.log(`✅ 배치 조회 완료: 성공 ${data.success}개, 실패 ${data.failed}개`);
        
    } catch (err) {
        console.error('배치 API 호출 실패:', err);
        updateProgress(100);
        setTimeout(() => {
            loading.classList.add('hidden');
        }, 300);
        
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

// 주식 데이터 카드 생성 및 표시 (좌우 2분할)
function displayStockCard(data, stockCode) {
    // 최근 개장일 바로 이전의 개장일 정보 처리
    let prevDate = data.prevDate || new Date();
    if (typeof prevDate === 'string') {
        prevDate = new Date(prevDate);
    }
    if (!(prevDate instanceof Date) || isNaN(prevDate.getTime())) {
        prevDate = new Date();
    }
    const prevFormattedDate = formatDate(prevDate);
    
    // 최근 개장일 정보 처리
    let latestDate = data.latestDate || new Date();
    if (typeof latestDate === 'string') {
        latestDate = new Date(latestDate);
    }
    if (!(latestDate instanceof Date) || isNaN(latestDate.getTime())) {
        latestDate = new Date();
    }
    const latestFormattedDate = formatDate(latestDate);
    
    // 좌측: 최근 개장일 바로 이전의 개장일 정보 계산
    const prevChange = data.prevClose - data.prevOpen;
    const prevChangePercent = data.prevOpen > 0 ? (prevChange / data.prevOpen) * 100 : 0;
    const prevChangePercentInRange = prevChangePercent >= -2 && prevChangePercent <= -0.5;
    const prevChangeClass = prevChangePercentInRange ? 'change-highlight' : '';
    
    const prevMiddle = (data.prevHigh + data.prevLow) / 2;
    const prevMiddleChangePercent = data.prevClose > 0 ? ((prevMiddle - data.prevClose) / data.prevClose) * 100 : null;
    const prevMiddleInRange = prevMiddleChangePercent !== null && prevMiddleChangePercent >= 0.3 && prevMiddleChangePercent <= 1.2;
    let prevMiddleDisplayText = formatPrice(Math.round(prevMiddle));
    if (prevMiddleChangePercent !== null) {
        const sign = prevMiddleChangePercent >= 0 ? '+' : '';
        const percentText = `${sign}${prevMiddleChangePercent.toFixed(2)}%`;
        const percentSpan = prevMiddleInRange 
            ? `<span class="middle-change-percent-highlight">${percentText}</span>`
            : percentText;
        prevMiddleDisplayText += ` <span class="middle-change">(종가 ${percentSpan})</span>`;
    }
    
    // 우측: 최근 개장일 정보 계산
    const latestChange = data.latestClose - data.latestOpen;
    const latestChangePercent = data.latestOpen > 0 ? (latestChange / data.latestOpen) * 100 : 0;
    const latestMiddle = (data.latestHigh + data.latestLow) / 2;
    const latestMiddleChangePercent = data.latestClose > 0 ? ((latestMiddle - data.latestClose) / data.latestClose) * 100 : null;
    const latestMiddleClass = (latestMiddleChangePercent >= 0.3 && latestMiddleChangePercent <= 1.2) ? 'middle-highlight' : '';
    let latestMiddleDisplayText = formatPrice(Math.round(latestMiddle));
    if (latestMiddleChangePercent !== null) {
        const sign = latestMiddleChangePercent >= 0 ? '+' : '';
        latestMiddleDisplayText += ` <span class="middle-change ${latestMiddleClass}">(종가 대비 ${sign}${latestMiddleChangePercent.toFixed(2)}%)</span>`;
    }
    
    // 현재가 표시 텍스트 생성
    // 현재가가 직전 개장일 중간값을 +0.15% ~ +0.6% 범위 내로 초과하는지 확인
    const currentPriceExceedsMiddlePercent = data.currentPrice !== null && 
                                              data.currentPrice !== undefined && 
                                              prevMiddle > 0
                                              ? ((data.currentPrice - prevMiddle) / prevMiddle) * 100
                                              : null;
    const currentPriceExceedsMiddle = currentPriceExceedsMiddlePercent !== null &&
                                       currentPriceExceedsMiddlePercent >= 0.15 &&
                                       currentPriceExceedsMiddlePercent <= 0.6;
    const currentPriceClass = currentPriceExceedsMiddle ? 'current-price-highlight' : '';
    
    // 직전 개장일 종가 대비 등락폭 계산
    let currentPriceChangeText = '';
    if (data.currentPrice !== null && data.currentPrice !== undefined && data.prevClose > 0) {
        const changeFromPrevClose = ((data.currentPrice - data.prevClose) / data.prevClose) * 100;
        const sign = changeFromPrevClose >= 0 ? '+' : '';
        currentPriceChangeText = ` <span class="current-price-change">(${sign}${changeFromPrevClose.toFixed(2)}%)</span>`;
    }
    
    const currentPriceText = data.currentPrice !== null && data.currentPrice !== undefined
        ? ` <span class="current-price ${currentPriceClass}">${formatPrice(data.currentPrice)}</span>${currentPriceChangeText}`
        : '';
    
    // 카드 HTML 생성
    const card = document.createElement('div');
    card.className = 'stock-info';
    card.id = `stock-${stockCode}`;
    card.innerHTML = `
        <div class="info-header">
            <h2 class="stock-name">${data.name}${currentPriceText}</h2>
        </div>
        <div class="info-split-container">
            <!-- 좌측: 최근 개장일 바로 이전의 개장일 정보 -->
            <div class="info-column">
                <div class="column-header">
                    <p class="stock-date">${prevFormattedDate}</p>
                </div>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">시작가</span>
                        <span class="info-value">${formatPrice(data.prevOpen)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">종가</span>
                        <span class="info-value">${formatPrice(data.prevClose)}</span>
                    </div>
                    <div class="info-item info-item-full">
                        <span class="info-label">등락</span>
                        <span class="info-change ${prevChange > 0 ? 'up' : prevChange < 0 ? 'down' : 'equal'}">${formatChange(prevChange, prevChangePercent, '', prevChangePercentInRange)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">최고가</span>
                        <span class="info-value">${formatPrice(data.prevHigh)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">최저가</span>
                        <span class="info-value">${formatPrice(data.prevLow)}</span>
                    </div>
                    <div class="info-item info-item-full">
                        <span class="info-label">중간값</span>
                        <span class="info-middle">${prevMiddleDisplayText}</span>
                    </div>
                </div>
            </div>
            
            <!-- 우측: 최근 개장일 정보 -->
            <div class="info-column">
                <div class="column-header">
                    <p class="stock-date">${latestFormattedDate}</p>
                </div>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">시작가</span>
                        <span class="info-value">${formatPrice(data.latestOpen)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">종가</span>
                        <span class="info-value">${formatPrice(data.latestClose)}</span>
                    </div>
                    <div class="info-item info-item-full">
                        <span class="info-label">등락</span>
                        <span class="info-change"></span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">최고가</span>
                        <span class="info-value">${formatPrice(data.latestHigh)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">최저가</span>
                        <span class="info-value">${formatPrice(data.latestLow)}</span>
                    </div>
                    <div class="info-item info-item-full">
                        <span class="info-label">중간값</span>
                        <span class="info-middle"></span>
                    </div>
                </div>
            </div>
        </div>
        <div class="log-container">
            <div class="log-content" id="log-${stockCode}"></div>
        </div>
    `;
    
    stocksContainer.appendChild(card);
}

// 로그창에 로그 표시
async function displayLog(stockCode) {
    const logElement = document.getElementById(`log-${stockCode}`);
    if (!logElement) {
        return;
    }
    
    try {
        const apiUrl = `${API_BASE_URL}/api/logs/${stockCode}`;
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            console.error(`로그 조회 실패: ${response.status}`);
            logElement.innerHTML = '<div style="color: #9aa0a6; font-size: 12px;">로그를 불러올 수 없습니다.</div>';
            return;
        }
        
        const data = await response.json();
        const logData = data.logs || [];
        
        if (logData.length === 0) {
            logElement.innerHTML = '<div style="color: #9aa0a6; font-size: 12px;">기록된 로그가 없습니다.</div>';
            return;
        }
        
        // 로그 항목들을 HTML로 생성 (9:30, 9:40, 9:50, 10:00 시간별 표시)
        const logItems = logData.map((entry, index) => {
            const prices = entry.prices || {};
            const price0930 = prices['0930'] !== null && prices['0930'] !== undefined 
                ? formatPrice(prices['0930']) 
                : '-';
            const price0940 = prices['0940'] !== null && prices['0940'] !== undefined 
                ? formatPrice(prices['0940']) 
                : '-';
            const price0950 = prices['0950'] !== null && prices['0950'] !== undefined 
                ? formatPrice(prices['0950']) 
                : '-';
            const price1000 = prices['1000'] !== null && prices['1000'] !== undefined 
                ? formatPrice(prices['1000']) 
                : '-';
            
            const borderBottom = index < logData.length - 1 ? 'border-bottom: 1px solid #e8eaed;' : '';
            return `<div style="margin-bottom: 8px; padding: 4px 0; ${borderBottom}">
                <span style="color: #5f6368; font-size: 12px; margin-right: 12px; font-weight: 500;">${entry.date}</span>
                <span style="color: #5f6368; font-size: 12px; margin-right: 8px;">9:30: ${price0930}</span>
                <span style="color: #5f6368; font-size: 12px; margin-right: 8px;">9:40: ${price0940}</span>
                <span style="color: #5f6368; font-size: 12px; margin-right: 8px;">9:50: ${price0950}</span>
                <span style="color: #5f6368; font-size: 12px;">10:00: ${price1000}</span>
            </div>`;
        }).join('');
        
        logElement.innerHTML = logItems;
    } catch (error) {
        console.error(`로그 표시 중 오류:`, error);
        logElement.innerHTML = '<div style="color: #9aa0a6; font-size: 12px;">로그를 불러올 수 없습니다.</div>';
    }
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
function formatChange(change, changePercent, suffix = '', highlightPercent = false) {
    const percentText = `${changePercent.toFixed(2)}%`;
    const percentSpan = highlightPercent 
        ? `<span class="change-percent-highlight">${percentText}</span>`
        : percentText;
    
    if (change > 0) {
        return `+${formatPrice(Math.abs(change))} (+${percentSpan})${suffix}`;
    } else if (change < 0) {
        return `${formatPrice(change)} (${percentSpan})${suffix}`;
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