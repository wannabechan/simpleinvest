# Cron Job 설정 가이드 (무료 방법)

## 개요
주식시장 개장일마다 **9:30, 9:35, 9:40, 9:45, 9:50, 9:55, 10:00, 10:05, 10:10, 10:15, 10:20, 10:25, 10:30 KST** (5분 간격 13회)에 자동으로 주식 가격을 조회하여 로그를 저장합니다.

---

## 🆓 무료 설정 방법

### 방법 1: cron-job.org (권장 — 시각 정확)

GitHub Actions schedule은 지연이 있어 9:30~10:30 정각 호출이 어렵습니다. **cron-job.org**는 호출 시각이 더 정확해 권장합니다.

**한눈에 보기**
1. https://console.cron-job.org 가입·로그인  
2. **Cronjob** 13개 생성 (9:30, 9:35, … 10:30 KST 각 1개)  
3. **URL**: `https://본인프로젝트.vercel.app/api/cron/log-prices`  
4. **스케줄**: 아래 표의 cron 표현식(UTC) 또는 KST 시각 사용, **월~금**만  
5. **Execution history**에서 호출 여부 확인 → 웹 로그창에서 가격 확인  

---

#### 1단계: 가입 및 로그인

1. **https://console.cron-job.org/signup** 접속
2. 이메일·비밀번호로 **무료 가입**
3. **https://console.cron-job.org/login** 에서 로그인

#### 2단계: Vercel URL 확인

- Vercel 대시보드에서 프로젝트 배포 URL 확인 (예: `https://simpleinvest-xxx.vercel.app`)
- API 주소: `https://본인프로젝트.vercel.app/api/cron/log-prices`

#### 3단계: Cron Job 13개 생성 (각 시간대별 1개)

**공통 설정 (모든 job 동일)**

- **Title**: 구분만 되면 됨 (예: `가격로그 0930` … `가격로그 1030`)
- **URL**: `https://본인프로젝트.vercel.app/api/cron/log-prices`
- **Request method**: `GET`
- **요일**: **월~금요일만** (주말 미실행)
- **옵션 인증 사용 시**: Request headers에 아래 추가 (아래 "옵션 인증" 섹션 참고)

**스케줄 (타임존에 따라 둘 중 하나 사용)**

cron-job.org에서 **타임존**을 선택할 수 있으면:

- **Timezone**: `Asia/Seoul` (또는 Korea)
- **실행 시각**: 아래 표의 "KST" 열 그대로 사용 (예: 9:30, 9:35, …)

타임존이 **UTC 고정**이면:

- **실행 시각**: 아래 표의 "UTC" 열 사용 (예: 0:30, 0:35, …)

| # | KST (한국) | UTC | cron 표현식 (UTC, 분 시 일 월 요일) |
|---|------------|-----|--------------------------------------|
| 1 | 9:30 | 0:30 | `30 0 * * 1-5` |
| 2 | 9:35 | 0:35 | `35 0 * * 1-5` |
| 3 | 9:40 | 0:40 | `40 0 * * 1-5` |
| 4 | 9:45 | 0:45 | `45 0 * * 1-5` |
| 5 | 9:50 | 0:50 | `50 0 * * 1-5` |
| 6 | 9:55 | 0:55 | `55 0 * * 1-5` |
| 7 | 10:00 | 1:00 | `0 1 * * 1-5` |
| 8 | 10:05 | 1:05 | `5 1 * * 1-5` |
| 9 | 10:10 | 1:10 | `10 1 * * 1-5` |
| 10 | 10:15 | 1:15 | `15 1 * * 1-5` |
| 11 | 10:20 | 1:20 | `20 1 * * 1-5` |
| 12 | 10:25 | 1:25 | `25 1 * * 1-5` |
| 13 | 10:30 | 1:30 | `30 1 * * 1-5` |

#### 4단계: 각 Job 생성 절차 (반복)

1. **Create cronjob** (또는 **Cronjob 추가**) 클릭
2. **Address (URL)**에 `https://본인프로젝트.vercel.app/api/cron/log-prices` 입력
3. **Schedule**에서:
   - **Custom** / **Advanced** 등 “직접 설정” 옵션 선택
   - 위 표에서 해당 시간대의 **cron 표현식** 입력 (UTC 사용 시)
   - 또는 **“Run at specific time”** 형식이면 **9:30**, **9:35**, … **10:30** 각각 설정 (KST 사용 시)
4. **Timezone**이 있으면 `Asia/Seoul` 선택
5. **Monday–Friday**만 실행되도록 설정 (주말 제외)
6. **CRON_SECRET**을 쓰는 경우: **Request headers** (또는 **Custom headers**)에 다음 추가  
   - Name: `Authorization` · Value: `Bearer 본인이_설정한_비밀문자열`  
   - 또는 Name: `X-Cron-Secret` · Value: `본인이_설정한_비밀문자열`  
   (문자열은 Vercel `CRON_SECRET`과 동일하게)
7. **Save** / **Create**로 저장
8. **나머지 12개**도 같은 방식으로 한 번에 하나씩 추가

#### 5단계: 동작 확인

- 각 job의 **Execution history**에서 **예약 시각(KST)**에 실행됐는지 확인
- 웹사이트 로그창에서 당일 9:30, 9:35, … 10:30 가격이 들어오는지 확인  
  → 10:30 이후라면 로그창 **reload 버튼**으로 최신 로그 다시 불러오기

**참고**: "Run now"로 테스트하면 9:30~10:30 KST 밖이라 API가 기록하지 않고 `"not a logging time"` 응답을 줄 수 있습니다. 정상 동작은 **거래일 9:30~10:30 스케줄 실행** 또는 **11시 이후 웹 reload**로 확인하세요.

#### 참고

- **무료**이며 job 개수 제한은 없음 (fair use 기준)
- **25회 연속 실패** 시 해당 job 비활성화될 수 있음 (URL·Vercel 상태 확인)
- **30초** 내 응답 필요 (현재 API는 짧게 응답하므로 문제 없음)

---

### 방법 2: GitHub Actions (수동 실행만 — 백업/테스트용)

**주기 실행은 cron-job.org**에서 하고, GitHub Actions에는 **스케줄을 두지 않음**. Actions 탭에서 **Run workflow**로 필요할 때만 수동 호출(백업·테스트)용으로 사용합니다.

#### 설정 단계

1. **워크플로우 파일**: `.github/workflows/cron-log-prices.yml` (스케줄 제거됨, workflow_dispatch만)
2. **GitHub Secrets**:  
   저장소 → **Settings** → **Secrets and variables** → **Actions**  
   - `VERCEL_URL` = `https://본인프로젝트.vercel.app`  
   - (CRON_SECRET 사용 시) `CRON_SECRET` = Vercel과 동일한 값
3. **수동 실행**: Actions 탭 → **주식 가격 로그 기록** → **Run workflow**

---

## Vercel Cron Jobs (Pro 플랜 이상)

**주의**: Vercel Cron Jobs는 Pro 플랜($20/월) 이상에서만 사용 가능합니다. 무료 Hobby 플랜에서는 사용할 수 없습니다.

---

## 옵션 인증 (CRON_SECRET)

`/api/cron/log-prices`는 기본적으로 인증 없이 호출 가능합니다. **CRON_SECRET**을 설정하면, 이 값을 보낸 요청만 처리하고 나머지는 401로 거절합니다. (URL만 아는 제3자의 호출 방지)

**흐름**: 비밀값 생성(웹) → Vercel 웹에서 저장 → cron-job.org / GitHub 웹에서 각각 같은 값 입력.

### 1. 비밀값 생성 (웹에서)

웹사이트에서 랜덤 문자열을 만들고 **복사**해 두세요. 아래 중 아무거나 사용해도 됩니다.

- **1Password / Bitwarden 등 비밀번호 관리자**  
  - 비밀번호 생성 기능으로 **32자 이상**, 영문+숫자 조합 생성 후 복사
- **랜덤 문자열 생성 사이트**  
  - 예: https://www.random.org/strings/  
    - Length(길이): 32, Characters: Alphanumeric → **Get Permutation** 클릭 후 나온 문자열 복사  
  - 또는: https://passwordsgenerator.net/  
    - 길이 32, 필요한 문자 유형 체크 후 **Generate** → 생성된 문자열 복사  

생성한 값은 **한 번만** 쓰입니다. 어디에도 저장·공유하지 말고, 아래 2~4단계에만 붙여 넣으세요.

### 2. Vercel 환경변수

- Vercel 프로젝트 → **Settings** → **Environment Variables**
- **Name**: `CRON_SECRET`  
- **Value**: 위에서 정한 비밀 문자열  
- **Environment**: Production (필요 시 Preview 등도 체크)  
- 저장 후 **재배포**

### 3. cron-job.org (방법 1 사용 시)

- 각 Cronjob **편집** → **Request headers** / **Custom headers**
- 다음 **둘 중 하나**만 넣으면 됨:
  - **Name**: `Authorization` · **Value**: `Bearer 비밀문자열`  
  - 또는 **Name**: `X-Cron-Secret` · **Value**: `비밀문자열`  
- 13개 job 모두 동일하게 설정

### 4. GitHub Actions (방법 2 사용 시)

- 저장소 → **Settings** → **Secrets and variables** → **Actions**
- **New repository secret**  
  - **Name**: `CRON_SECRET`  
  - **Value**: Vercel에 넣은 것과 **같은** 비밀 문자열  
- 워크플로는 `CRON_SECRET`이 있으면 `Authorization: Bearer` 로 자동 전달

### 5. 동작 방식

- **CRON_SECRET 미설정**: 기존처럼 인증 없이 호출 가능 (하위 호환)
- **CRON_SECRET 설정**:
  - Vercel에만 넣고 cron/GitHub에 안 넣으면 → 401
  - Vercel + cron-job.org(또는 GA) 둘 다 같은 값으로 넣으면 → 200 처리

---

## 환경변수 확인

**필수**
- `KIS_APP_KEY`: 한국투자증권 API 키
- `KIS_APP_SECRET`: 한국투자증권 API 시크릿
- `REDIS_URL`: Redis 연결 URL (또는 `KV_URL`, `UPSTASH_REDIS_URL`)

**선택 (옵션 인증)**
- `CRON_SECRET`: cron 전용 비밀값. 설정 시 `Authorization: Bearer …` 또는 `X-Cron-Secret` 헤더와 일치해야 API 호출 가능.

## 로그 데이터 구조

Redis에 저장되는 로그 형식 (시간대 13개):
```json
[
  {
    "date": "2026-01-28",
    "prices": {
      "0930": 152000,
      "0935": 152010,
      "0940": 152100,
      "0945": 152050,
      "0950": 152200,
      "0955": 152180,
      "1000": 152300,
      "1005": 152290,
      "1010": 152310,
      "1015": 152320,
      "1020": 152300,
      "1025": 152280,
      "1030": 152250
    }
  }
]
```

## 데이터 관리

- 최근 60일만 유지 (자동 삭제)
- 오래된 데이터는 자동으로 정리됨

## 수동 테스트

- **cron-job.org**: 각 job에서 "Run now" 등 즉시 실행 후 Execution history 확인
- **curl** (CRON_SECRET 미사용):
  ```bash
  curl -X GET "https://본인프로젝트.vercel.app/api/cron/log-prices"
  ```
- **curl** (CRON_SECRET 사용):
  ```bash
  curl -X GET "https://본인프로젝트.vercel.app/api/cron/log-prices" \
    -H "Authorization: Bearer 여기에_CRON_SECRET_값"
  ```
  (9:30~10:30 KST가 아닌 시각에는 "not a logging time" 응답이 나오며 Redis에는 기록되지 않음)
- **GitHub Actions**: Actions → 주식 가격 로그 기록 → **Run workflow**

## 시간대 참고

- **UTC**: Vercel·GitHub·cron-job.org(UTC 사용 시) 기준
- **KST**: UTC + 9시간. 9:30~10:30 KST = 0:30~1:30 UTC
- API는 요청 수신 시각을 KST로 변환해 9:30~10:30 구간인지 검사한 뒤, 해당 구간일 때만 Redis에 기록합니다.
