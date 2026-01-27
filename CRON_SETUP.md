# Cron Job 설정 가이드 (무료 방법)

## 개요
주식시장 개장일마다 9:30, 9:40, 9:50, 10:00에 자동으로 주식 가격을 조회하여 로그를 저장합니다.

## 🆓 무료 설정 방법 (권장)

### 방법 1: GitHub Actions (완전 무료, 권장)

GitHub Actions를 사용하면 완전 무료로 cron job을 실행할 수 있습니다.

#### 설정 단계:

1. **GitHub 저장소에 워크플로우 파일 추가**
   - 파일 경로: `.github/workflows/cron-log-prices.yml`
   - 이미 생성되어 있습니다.

2. **GitHub Secrets 설정**
   - GitHub 저장소 → Settings → Secrets and variables → Actions
   - `VERCEL_URL` 추가: `https://your-project.vercel.app` (실제 Vercel 배포 URL)

3. **자동 실행**
   - GitHub Actions가 자동으로 스케줄에 따라 실행됩니다
   - Actions 탭에서 실행 로그 확인 가능

#### 장점:
- ✅ 완전 무료
- ✅ GitHub와 통합되어 관리 용이
- ✅ 실행 로그 확인 가능
- ✅ 수동 실행도 가능 (workflow_dispatch)

---

### 방법 2: 외부 Cron 서비스 (무료 플랜)

#### cron-job.org (무료)

1. **회원가입**: https://cron-job.org (무료)
2. **새 Cron Job 생성**:
   - URL: `https://your-project.vercel.app/api/cron/log-prices`
   - 스케줄: 
     - 9:30 (KST): `30 0 * * 1-5` (UTC)
     - 9:40 (KST): `40 0 * * 1-5` (UTC)
     - 9:50 (KST): `50 0 * * 1-5` (UTC)
     - 10:00 (KST): `0 1 * * 1-5` (UTC)
   - 요일: 월~금 (1-5)

#### EasyCron (무료)

1. **회원가입**: https://www.easycron.com (무료 플랜)
2. **동일한 설정**

#### UptimeRobot (무료)

1. **회원가입**: https://uptimerobot.com (무료 플랜)
2. **HTTP(s) Monitor 생성**
   - URL: `https://your-project.vercel.app/api/cron/log-prices`
   - Monitoring Interval: 10분 (9:30, 9:40, 9:50, 10:00에 맞춰 조정)

---

## Vercel Cron Jobs (Pro 플랜 이상)

`vercel.json`에 cron 설정이 추가되어 있습니다:
- 9:30, 9:40, 9:50 (UTC 0:30, 0:40, 0:50 = KST 9:30, 9:40, 9:50)
- 10:00 (UTC 1:00 = KST 10:00)
- 월~금요일만 실행 (주말 제외)

**주의**: Vercel Cron Jobs는 Pro 플랜($20/월) 이상에서만 사용 가능합니다.

---

## 환경변수 확인

필요한 환경변수:
- `KIS_APP_KEY`: 한국투자증권 API 키
- `KIS_APP_SECRET`: 한국투자증권 API 시크릿
- `REDIS_URL`: Redis 연결 URL (또는 `KV_URL`, `UPSTASH_REDIS_URL`)

## 로그 데이터 구조

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

## 데이터 관리

- 최근 60일만 유지 (자동 삭제)
- 오래된 데이터는 자동으로 정리됨

## 수동 테스트

Cron job을 수동으로 테스트하려면:
```bash
curl -X GET https://your-domain.vercel.app/api/cron/log-prices
```

또는 GitHub Actions에서 "Run workflow" 버튼으로 수동 실행 가능

## 시간대 참고

- **UTC 시간**: Vercel, GitHub Actions는 UTC 시간 사용
- **한국 시간 (KST)**: UTC + 9시간
- 코드에서 자동으로 KST로 변환하여 처리
