# 배포 가이드

이 문서는 Market Class 앱을 무료 중심으로 배포하기 위한 1차 절차입니다.

## 1. 로컬 확인

```bash
npm install
npm run lint
npm run build
```

## 2. GitHub 저장소 준비

1. GitHub에서 새 저장소를 만듭니다.
2. 이 프로젝트 폴더를 저장소에 올립니다.
3. `node_modules`, `dist`, `.env`, `.env.local`, `.vercel`은 올리지 않습니다.

## 3. Vercel 배포

1. Vercel에서 `Add New...` -> `Project`를 선택합니다.
2. GitHub 저장소를 가져옵니다.
3. 설정값은 아래처럼 둡니다.

```txt
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

4. Supabase를 아직 연결하지 않았다면 환경변수 없이 먼저 배포해도 됩니다.
5. Supabase를 연결할 때는 Vercel 프로젝트의 Environment Variables에 아래 값을 추가합니다.

```txt
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

기존 Supabase 프로젝트가 anon key만 제공한다면 아래 이름도 지원됩니다.

```txt
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 4. Supabase 프로젝트 준비

1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor를 엽니다.
3. `supabase/migrations/20260615000000_initial_market_class_schema.sql` 내용을 붙여넣고 실행합니다.
4. Project URL과 Publishable key를 Vercel 환경변수에 등록합니다.
5. Vercel에서 다시 Deploy 합니다.

## 5. 현재 단계의 한계

현재 앱은 Supabase 테이블 설계와 연결 준비가 되어 있지만, 화면 상태의 대부분은 아직 브라우저 안에서 움직입니다.
다음 단계에서 `rooms`, `players`, `assets`, `portfolios`, `round_events`, `trade_logs`, `round_logs`, `reflections` 테이블에 실제 읽기/쓰기를 연결하면 여러 기기 실시간 수업 운영이 가능해집니다.

## 6. 보안 메모

현재 교사 로그인은 프론트엔드 잠금입니다.
수업용 간단 잠금으로는 충분하지만, 공개 배포 후 더 안전하게 운영하려면 Supabase Auth 또는 서버 검증으로 교사 권한을 분리해야 합니다.
