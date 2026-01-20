# Vercel KV 설정 가이드

## 1. Vercel KV 생성 (Marketplace를 통해)

Vercel KV는 이제 Marketplace를 통해 제공됩니다:

1. Vercel 대시보드 (https://vercel.com/dashboard) 접속
2. 프로젝트 선택
3. **Storage** 탭 클릭
4. **Create Database** 클릭
5. **Marketplace Database Providers** 섹션에서 **Redis** 선택
   - 또는 **Upstash** 선택 (Serverless Redis 제공)
6. 데이터베이스 이름 입력 (예: `kis-token-cache`)
7. **Create** 클릭

**참고**: 
- **Redis** (Marketplace): Vercel KV와 완전 호환, `@vercel/kv` 패키지 그대로 사용 가능
- **Upstash**: 동일하게 작동하지만, 코드 수정 없이 사용 가능

## 2. 환경변수 자동 설정

Vercel KV를 생성하면 자동으로 다음 환경변수가 설정됩니다:
- `KV_URL`: KV 데이터베이스 URL
- `KV_REST_API_URL`: KV REST API URL
- `KV_REST_API_TOKEN`: KV REST API 토큰
- `KV_REST_API_READ_ONLY_TOKEN`: KV 읽기 전용 토큰

**참고**: `@vercel/kv` 패키지는 이 환경변수를 자동으로 인식하므로 별도 설정이 필요 없습니다.

## 3. 로컬 개발 환경 설정

로컬에서 `vercel dev`를 사용하는 경우:

1. Vercel CLI로 프로젝트 연결:
   ```bash
   vercel link
   ```

2. 환경변수 가져오기:
   ```bash
   vercel env pull
   ```

   이 명령어는 `.env.local` 파일에 환경변수를 자동으로 생성합니다.

3. 개발 서버 실행:
   ```bash
   vercel dev
   ```

## 4. 패키지 설치

프로젝트 루트에서 다음 명령어 실행:

```bash
npm install
```

또는

```bash
npm install @vercel/kv
```

## 5. 확인 사항

- ✅ `package.json`에 `@vercel/kv` 의존성 추가됨
- ✅ Vercel 대시보드에서 KV 데이터베이스 생성됨
- ✅ 환경변수가 자동으로 설정됨 (Storage 탭에서 확인 가능)
- ✅ 로컬 개발 시 `.env.local` 파일에 환경변수 포함됨

## 6. 작동 방식

- 토큰은 Vercel KV에 저장되어 **모든 Serverless Function 인스턴스에서 공유**됩니다
- 12시간 동안 동일 토큰을 재사용합니다
- 인스턴스가 바뀌어도 (Cold Start, 부하 분산 등) 동일한 토큰을 사용할 수 있습니다

## 7. 무료 티어 제한

- **10,000 요청/일**
- **256MB 저장 공간**

토큰 캐싱 용도로는 충분합니다 (하루에 수십~수백 번의 읽기/쓰기만 발생).
