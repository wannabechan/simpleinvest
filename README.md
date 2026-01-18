# 주식 정보 검색 사이트

간단하고 미니멀한 디자인의 한국 주식 정보 검색 사이트입니다.

## 기능

- 주식 종목 선택 (콤보박스)
- 최근 거래일 날짜 표시
- 시작가, 종가, 최고가, 최저가 표시
- 등락 정보 (상승/하락폭 및 %)
- 최고가/최저가 중간값 표시

## 실행 방법

### 1. 백엔드 서버 실행

```bash
cd backend
npm install
# server.js 파일에 API 키 설정 후
npm start
```

백엔드 서버는 `http://localhost:3000`에서 실행됩니다.

### 2. 프론트엔드 실행

브라우저에서 `index.html` 파일을 열거나, 로컬 서버를 사용:

```bash
# Python 3
python -m http.server 8000

# Node.js (http-server)
npx http-server
```

브라우저에서 `http://localhost:8000` 접속

## 한국투자증권 API 설정

백엔드 서버에서 사용하는 한국투자증권 API 키 발급 방법은 `backend/README.md`를 참고하세요.

## 프로젝트 구조

```
simpleinvest/
├── index.html          # 메인 HTML 파일
├── styles.css          # 스타일시트
├── script.js           # 프론트엔드 JavaScript
├── backend/
│   ├── server.js       # Express 백엔드 서버
│   ├── package.json    # Node.js 의존성
│   └── README.md       # 백엔드 실행 가이드
└── README.md           # 프로젝트 설명
```

 
