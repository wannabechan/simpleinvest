# Cron Job 설정 가이드

## 개요
주식시장 개장일마다 9:30, 9:40, 9:50, 10:00에 자동으로 주식 가격을 조회하여 로그를 저장합니다.

## 설정 방법

### 1. Vercel Cron Jobs 설정

`vercel.json`에 cron 설정이 추가되어 있습니다:
- 9:30, 9:40, 9:50 (UTC 0:30, 0:40, 0:50 = KST 9:30, 9:40, 9:50)
- 10:00 (UTC 1:00 = KST 10:00)
- 월~금요일만 실행 (주말 제외)

### 2. Vercel 대시보드에서 확인

1. Vercel 대시보드 → 프로젝트 → Settings → Cron Jobs
2. Cron job이 활성화되어 있는지 확인
3. 실행 로그 확인 가능

### 3. 환경변수 확인

필요한 환경변수:
- `KIS_APP_KEY`: 한국투자증권 API 키
- `KIS_APP_SECRET`: 한국투자증권 API 시크릿
- `REDIS_URL`: Redis 연결 URL (또는 `KV_URL`, `UPSTASH_REDIS_URL`)

### 4. 로그 데이터 구조

Redis에 저장되는 로그 형식:
```json
[
  {
    "date": "2026-01-26",
    "prices": {
      "0930": 152000,
      "0940": 152100,
      "0950": 152200,
      "1000": 152300
    }
  }
]
```

### 5. 데이터 관리

- 최근 60일만 유지 (자동 삭제)
- 오래된 데이터는 자동으로 정리됨

## 수동 테스트

Cron job을 수동으로 테스트하려면:
```bash
curl -X GET https://your-domain.vercel.app/api/cron/log-prices
```

## 주의사항

1. **Vercel Cron Jobs는 Pro 플랜 이상에서만 사용 가능합니다**
   - 무료 플랜의 경우 외부 cron 서비스 사용 필요
   - 예: cron-job.org, EasyCron 등

2. **시간대**: Vercel은 UTC 시간을 사용하므로 한국 시간(KST)으로 변환 필요
   - KST = UTC + 9시간

3. **주말 처리**: 코드에서 자동으로 주말을 감지하여 실행하지 않음

## 외부 Cron 서비스 사용 (무료 플랜)

Vercel 무료 플랜을 사용하는 경우:

1. **cron-job.org** (무료)
   - URL: `https://your-domain.vercel.app/api/cron/log-prices`
   - 스케줄: 매일 9:30, 9:40, 9:50, 10:00 (KST)
   - 요일: 월~금

2. **EasyCron** (무료)
   - 동일한 설정

3. **GitHub Actions** (무료)
   - `.github/workflows/cron-log-prices.yml` 파일 생성
   - 스케줄 워크플로우 설정
