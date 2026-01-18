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
const debugLog = document.getElementById('debugLog');
const copyLogBtn = document.getElementById('copyLogBtn');
const clearLogBtn = document.getElementById('clearLogBtn');

// 백엔드 API 서버 주소 (환경에 따라 자동 선택)
// vercel dev를 사용하면 같은 도메인을 사용하므로 빈 문자열
// 기존 백엔드 서버를 사용하려면 http://localhost:3001로 변경
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''  // Vercel dev 사용 시 (같은 도메인) 또는 'http://localhost:3001' (기존 백엔드 서버 사용 시)
  : '';  // 프로덕션 환경 (Vercel은 같은 도메인 사용)

// 로그 함수
function addLog(message, type = 'info') {
    if (!debugLog) return;
    
    const timestamp = new Date().toLocaleTimeString('ko-KR');
    const logEntry = document.createElement('div');
    logEntry.className = `debug-log-entry ${type}`;
    
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'debug-log-timestamp';
    timestampSpan.textContent = `[${timestamp}]`;
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'debug-log-message';
    
    // 객체나 배열인 경우 JSON으로 변환
    if (typeof message === 'object') {
        messageSpan.textContent = JSON.stringify(message, null, 2);
    } else {
        messageSpan.textContent = message;
    }
    
    logEntry.appendChild(timestampSpan);
    logEntry.appendChild(messageSpan);
    
    debugLog.insertBefore(logEntry, debugLog.firstChild);
    
    // 로그가 너무 많아지면 오래된 로그 제거 (최대 50개)
    while (debugLog.children.length > 50) {
        debugLog.removeChild(debugLog.lastChild);
    }
}

// 로그 복사
copyLogBtn.addEventListener('click', async () => {
    try {
        // 모든 로그 엔트리 수집
        const logEntries = Array.from(debugLog.children);
        const logText = logEntries.map(entry => {
            const timestamp = entry.querySelector('.debug-log-timestamp')?.textContent || '';
            const message = entry.querySelector('.debug-log-message')?.textContent || '';
            return `${timestamp} ${message}`;
        }).join('\n');
        
        // 클립보드에 복사
        await navigator.clipboard.writeText(logText);
        
        // 피드백 제공
        const originalText = copyLogBtn.textContent;
        copyLogBtn.textContent = '복사됨!';
        copyLogBtn.style.backgroundColor = '#34a853';
        copyLogBtn.style.color = '#ffffff';
        
        setTimeout(() => {
            copyLogBtn.textContent = originalText;
            copyLogBtn.style.backgroundColor = '';
            copyLogBtn.style.color = '';
        }, 2000);
        
        addLog('로그가 클립보드에 복사되었습니다.', 'success');
    } catch (err) {
        console.error('로그 복사 실패:', err);
        addLog('로그 복사 실패: ' + err.message, 'error');
        
        // 대체 방법 (클립보드 API 미지원 시)
        const textarea = document.createElement('textarea');
        textarea.value = Array.from(debugLog.children)
            .map(entry => entry.textContent)
            .join('\n');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            addLog('로그가 클립보드에 복사되었습니다.', 'success');
        } catch (err2) {
            addLog('로그 복사 실패. 수동으로 복사해주세요.', 'error');
        }
        document.body.removeChild(textarea);
    }
});

// 로그 지우기
clearLogBtn.addEventListener('click', () => {
    debugLog.innerHTML = '';
    addLog('로그가 지워졌습니다.', 'info');
});

// 주식 데이터를 가져오는 함수
async function fetchStockData(stockCode) {
    try {
        addLog(`주식 데이터 요청 시작: ${stockCode}`, 'info');
        
        // 로딩 표시
        stockInfo.classList.add('hidden');
        error.classList.add('hidden');
        loading.classList.remove('hidden');
        
        // 백엔드 API 호출
        const apiUrl = `${API_BASE_URL}/api/stock/${stockCode}`;
        addLog(`API 요청: ${apiUrl}`, 'info');
        
        const response = await fetch(apiUrl);
        
        addLog(`응답 상태: ${response.status} ${response.statusText}`, response.ok ? 'success' : 'warning');
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            addLog(`에러 응답 데이터: ${JSON.stringify(errorData)}`, 'error');
            throw new Error(errorData.error || `서버 오류: ${response.status}`);
        }
        
        const data = await response.json();
        addLog(`응답 데이터 수신: ${JSON.stringify(data)}`, 'success');
        
        // 데이터 표시
        displayStockData(data, stockCode);
        addLog('주식 데이터 표시 완료', 'success');
        
    } catch (err) {
        console.error('API 호출 실패:', err);
        addLog(`에러 발생: ${err.message}`, 'error');
        if (err.stack) {
            addLog(`스택 트레이스: ${err.stack}`, 'error');
        }
        
        // 에러 메시지 표시
        let errorMessage = '주식 정보를 불러오는 중 오류가 발생했습니다.';
        
        if (err.message.includes('Failed to fetch') || err.message.includes('CORS')) {
            errorMessage = '백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요. (http://localhost:3001)';
            addLog('CORS 또는 네트워크 오류 - 백엔드 서버 확인 필요', 'error');
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