# 환경변수 로드 문제 해결 가이드

## 문제
`vercel dev` 실행 시 "API 키가 설정되지 않았습니다" 에러가 발생합니다.

## 원인 확인

### 1. `.env.local` 파일 확인

프로젝트 루트에 `.env.local` 파일이 있고, 실제 API 키가 입력되어 있는지 확인하세요.

**파일 위치**: `/Users/wannabechan/vibecoding/simpleinvest/.env.local`

**올바른 형식**:
```
KIS_APP_KEY=실제_APP_KEY_값
KIS_APP_SECRET=실제_APP_SECRET_값
```

**주의사항**:
- ❌ `KIS_APP_KEY=발급받은_APP_KEY를_여기에_입력` (플레이스홀더 값)
- ❌ `KIS_APP_KEY= "값"` (따옴표 사용)
- ❌ `KIS_APP_KEY = 값` (등호 앞뒤 공백)
- ✅ `KIS_APP_KEY=실제값` (실제 API 키)

### 2. `vercel dev` 재시작

환경변수 파일을 수정한 후에는 `vercel dev`를 재시작해야 합니다.

**현재 실행 중인 `vercel dev` 중지:**
- 터미널에서 `Ctrl + C` 눌러서 중지

**다시 시작:**
```bash
cd /Users/wannabechan/vibecoding/simpleinvest
vercel dev
```

## 해결 방법

### 방법 1: `.env.local` 파일 수정 (로컬 전용)

1. **VS Code에서 `.env.local` 파일 열기**
2. **실제 API 키로 값 변경**
3. **파일 저장** (Cmd+S)
4. **`vercel dev` 재시작**

### 방법 2: Vercel 대시보드 환경변수 동기화 (권장)

`vercel dev`는 Vercel 프로젝트에 설정된 환경변수를 자동으로 가져옵니다!

1. **Vercel 대시보드 접속**: https://vercel.com/dashboard
2. **프로젝트 선택**: `simpleinvest`
3. **Settings → Environment Variables** 이동
4. **환경변수 확인**:
   - `KIS_APP_KEY` 설정되어 있는지 확인
   - `KIS_APP_SECRET` 설정되어 있는지 확인

5. **환경변수가 설정되어 있다면**:
   ```bash
   # 프로젝트 재연결
   rm -rf .vercel
   vercel link
   ```
   
   연결 시:
   - **Set up and develop "simpleinvest"?**: Y
   - **Which scope?**: 본인 계정 선택
   - **Link to existing project?**: Y (기존 프로젝트)
   - **What's your project's name?**: simpleinvest

6. **`vercel dev` 실행**:
   ```bash
   vercel dev
   ```

이제 Vercel 대시보드의 환경변수가 자동으로 로드됩니다!

### 방법 3: 환경변수 직접 확인

터미널에서 확인:
```bash
cd /Users/wannabechan/vibecoding/simpleinvest

# .env.local 파일 내용 확인 (실제 키 값이 보이는지 확인)
cat .env.local
```

**주의**: 실제 API 키 값이 보여야 합니다. 플레이스홀더 텍스트가 보이면 수정이 필요합니다.

## 빠른 해결 체크리스트

- [ ] `.env.local` 파일이 프로젝트 루트에 있는가?
- [ ] `.env.local` 파일에 실제 API 키가 입력되어 있는가? (플레이스홀더 아님)
- [ ] 파일 형식이 올바른가? (`KIS_APP_KEY=값`, 공백/따옴표 없음)
- [ ] 파일을 수정한 후 `vercel dev`를 재시작했는가?
- [ ] Vercel 대시보드에 환경변수가 설정되어 있는가?

## 테스트

환경변수가 제대로 로드되었는지 확인:

1. **`vercel dev` 실행**
2. **브라우저에서 `http://localhost:3000` 접속**
3. **콤보박스에서 삼성전자 선택**
4. **주식 정보가 표시되는지 확인**

성공하면 주식 정보가 표시되고, 디버깅 로그에 에러가 없어야 합니다.

## 여전히 문제가 있나요?

1. **Vercel Dev 콘솔 확인**: 터미널에서 에러 메시지 확인
2. **브라우저 콘솔 확인**: F12 → Console 탭
3. **디버깅 로그 확인**: 페이지 하단의 디버깅 로그 영역

특정 에러 메시지를 공유해주시면 더 구체적인 해결책을 제시할 수 있습니다.
