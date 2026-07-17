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
3. 아래 마이그레이션을 순서대로 실행합니다.

```text
1. supabase/migrations/20260615000000_initial_market_class_schema.sql
2. supabase/migrations/20260616120000_savings_forex_triggers.sql
3. supabase/migrations/20260717002707_teacher_auth_and_room_ownership.sql
```

4. Authentication에서 Email과 Anonymous Sign-Ins를 활성화합니다.
5. Authentication의 Site URL과 Redirect URLs에 로컬·Vercel 주소를 등록합니다.
6. Project URL과 Publishable key를 Vercel 환경변수에 등록합니다.
7. Vercel에서 다시 Deploy 합니다.

기존 앱을 회원가입 버전으로 전환할 때는 `회원가입_배포_전환_가이드.md`를 먼저 읽으세요.

## 5. Supabase 연동 범위

환경변수를 넣으면 아래 항목은 Supabase에 저장되고 Realtime으로 갱신됩니다.

- 방 생성과 24시간 만료 정보
- 현재 라운드, 장 진행 상태, 일시정지, 게임 종료
- 방별 랜덤 초기 자산 가격과 장 마감 후 자산 가격
- 교사가 등록한 라운드별 이슈와 장 마감 판정 결과
- 학생 닉네임, 현금, 예금, 총자산, 수익률 기반 참여 목록

학생별 상세 거래 로그, 포트폴리오 수량, 메모와 최종 회고는 `student_states`에 저장되어 재접속과 교사 대시보드에서 복원됩니다.

## 6. 보안 메모

교사는 Supabase Auth 이메일 계정으로 로그인합니다. 방 소유권과 학생 익명 사용자 ID를 기준으로 RLS가 적용되며, 학생 비밀번호 해시와 세션 토큰은 일반 조회에서 제외됩니다.

학생 실명이나 민감정보는 저장하지 말고, 여러 학교 규모로 확장할 때는 커스텀 SMTP·관리자 권한·감사 로그·계정 삭제 절차를 추가하세요.
