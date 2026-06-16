-- 적금/외환/트리거 시스템 확장 마이그레이션
-- 적용: supabase db push 또는 Supabase 대시보드 SQL Editor에서 실행

-- 1. assets.type CHECK 확장: 'forex' 추가
alter table public.assets drop constraint if exists assets_type_check;
alter table public.assets
  add constraint assets_type_check
  check (type in ('stock', 'etf', 'property', 'futures', 'bond', 'forex'));

-- 2. 채권 액면가 컬럼 (face_value)
alter table public.assets
  add column if not exists face_value bigint;

-- 3. 룸 트리거 쿨다운 (라운드별 자동 발동 이슈 추적)
alter table public.rooms
  add column if not exists trigger_cooldowns jsonb not null default '{}'::jsonb;

-- 4. 정기예금 컬럼 (players)
alter table public.players
  add column if not exists time_deposit_balance bigint not null default 0,
  add column if not exists time_deposit_principal bigint not null default 0,
  add column if not exists time_deposit_deposited_at_round integer,
  add column if not exists time_deposit_locked_until_round integer,
  add column if not exists time_deposit_rate numeric(6,4);

-- 5. 정기예금 컬럼 (student_states)
alter table public.student_states
  add column if not exists time_deposit_balance bigint not null default 0,
  add column if not exists time_deposit_principal bigint not null default 0,
  add column if not exists time_deposit_deposited_at_round integer,
  add column if not exists time_deposit_locked_until_round integer,
  add column if not exists time_deposit_rate numeric(6,4);

-- 6. 정기예금 컬럼 (team_accounts)
alter table public.team_accounts
  add column if not exists time_deposit_balance bigint not null default 0,
  add column if not exists time_deposit_principal bigint not null default 0,
  add column if not exists time_deposit_deposited_at_round integer,
  add column if not exists time_deposit_locked_until_round integer,
  add column if not exists time_deposit_rate numeric(6,4);

-- 7. 정기예금 만기 도래 학생을 빠르게 찾는 인덱스
create index if not exists idx_students_time_deposit_maturity
  on public.student_states (time_deposit_locked_until_round)
  where time_deposit_balance > 0;

-- 참고:
-- - assets에 size(우량주/중소형주) 정보는 financials JSONB의 _size 필드로 저장합니다.
--   별도 컬럼이 필요한 경우: alter table public.assets add column size text;
-- - 정기적금(매 라운드 자동 납입) 은 학습용 비교 시뮬레이션만 구현되어 있습니다.
--   실제 정기적금 가입 기능을 추가하려면 recurring_* 컬럼이 별도로 필요합니다.
