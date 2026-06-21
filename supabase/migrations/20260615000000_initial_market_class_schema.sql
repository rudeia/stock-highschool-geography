create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  pin text not null unique check (pin ~ '^[0-9]{6}$'),
  host_id text not null default 'geography',
  current_round integer not null default 1 check (current_round between 1 and 12),
  total_rounds integer not null default 12 check (total_rounds in (4, 12)),
  phase text not null default 'setup' check (phase in ('setup', 'open', 'closed', 'ended', 'expired')),
  mode text not null default 'individual' check (mode in ('individual', 'team')),
  game_started boolean not null default false,
  final_reports_downloaded boolean not null default false,
  base_rate numeric(5, 2) not null default 3.5,
  property_index bigint not null default 250000,
  exchange_rate integer not null default 1350,
  unemployment_rate numeric(5, 2) not null default 3.5,
  price_index numeric(10, 6) not null default 1,
  demand_pull_cumulative numeric(10, 6) not null default 0,
  open_macro_context jsonb not null default '{}'::jsonb,
  trigger_cooldowns jsonb not null default '{}'::jsonb,
  pending_macro_alerts jsonb not null default '[]'::jsonb,
  active_macro_alerts jsonb not null default '[]'::jsonb,
  economic_seed jsonb not null default '{}'::jsonb,
  is_paused boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  updated_at timestamptz not null default now()
);

alter table public.rooms add column if not exists host_id text not null default 'geography';
alter table public.rooms add column if not exists total_rounds integer not null default 12 check (total_rounds in (4, 12));
alter table public.rooms add column if not exists exchange_rate integer not null default 1350;
alter table public.rooms add column if not exists unemployment_rate numeric(5, 2) not null default 3.5;
alter table public.rooms add column if not exists property_index bigint not null default 250000;
alter table public.rooms add column if not exists open_macro_context jsonb not null default '{}'::jsonb;
alter table public.rooms add column if not exists price_index numeric(10, 6) not null default 1;
alter table public.rooms add column if not exists demand_pull_cumulative numeric(10, 6) not null default 0;
alter table public.rooms add column if not exists trigger_cooldowns jsonb not null default '{}'::jsonb;
alter table public.rooms add column if not exists pending_macro_alerts jsonb not null default '[]'::jsonb;
alter table public.rooms add column if not exists active_macro_alerts jsonb not null default '[]'::jsonb;
alter table public.rooms add column if not exists economic_seed jsonb not null default '{}'::jsonb;
alter table public.rooms add column if not exists mode text not null default 'individual';
alter table public.rooms add column if not exists game_started boolean not null default false;
alter table public.rooms add column if not exists final_reports_downloaded boolean not null default false;

create index if not exists rooms_host_active_lookup_idx
  on public.rooms(host_id, expires_at desc, updated_at desc);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  student_number integer check (student_number between 1 and 40),
  nickname text not null,
  passcode_hash text not null default '',
  session_token text not null default '',
  last_seen_at timestamptz,
  team_key text not null default '',
  cash bigint not null default 100000000,
  deposit bigint not null default 0,
  total_asset bigint not null default 100000000,
  return_rate numeric(8, 2) not null default 0,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, nickname)
);

alter table public.players add column if not exists student_number integer check (student_number between 1 and 40);
alter table public.players add column if not exists passcode_hash text not null default '';
alter table public.players add column if not exists session_token text not null default '';
alter table public.players add column if not exists last_seen_at timestamptz;
alter table public.players add column if not exists team_key text not null default '';

do $$
begin
  alter table public.players drop constraint if exists players_room_id_nickname_key;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'players'
      and indexname = 'players_room_student_number_unique'
  ) then
    create unique index players_room_student_number_unique on public.players(room_id, student_number);
  end if;
end;
$$;

create table if not exists public.student_states (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  student_number integer not null check (student_number between 1 and 40),
  nickname text not null,
  passcode_hash text not null default '',
  team_key text not null default '',
  cash bigint not null default 0,
  deposit bigint not null default 0,
  deposit_principal bigint not null default 0,
  deposit_interest_earned bigint not null default 0,
  portfolio jsonb not null default '{}'::jsonb,
  last_dividend_round integer not null default 0,
  trade_logs jsonb not null default '[]'::jsonb,
  round_logs jsonb not null default '[]'::jsonb,
  round_notes jsonb not null default '{}'::jsonb,
  round_reflections jsonb not null default '{}'::jsonb,
  reflection jsonb not null default '{}'::jsonb,
  salary_paid_rounds integer[] not null default '{}',
  initial_capital_granted boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (room_id, student_number)
);

alter table public.student_states add column if not exists team_key text not null default '';
alter table public.student_states add column if not exists deposit_principal bigint not null default 0;
alter table public.student_states add column if not exists deposit_interest_earned bigint not null default 0;
alter table public.student_states add column if not exists portfolio jsonb not null default '{}'::jsonb;
alter table public.student_states add column if not exists last_dividend_round integer not null default 0;
alter table public.student_states add column if not exists trade_logs jsonb not null default '[]'::jsonb;
alter table public.student_states add column if not exists round_logs jsonb not null default '[]'::jsonb;
alter table public.student_states add column if not exists round_notes jsonb not null default '{}'::jsonb;
alter table public.student_states add column if not exists round_reflections jsonb not null default '{}'::jsonb;
alter table public.student_states add column if not exists reflection jsonb not null default '{}'::jsonb;
alter table public.student_states add column if not exists salary_paid_rounds integer[] not null default '{}';
alter table public.student_states add column if not exists initial_capital_granted boolean not null default false;

create table if not exists public.team_accounts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  team_key text not null,
  team_name text not null,
  cash bigint not null default 100000000,
  deposit bigint not null default 0,
  deposit_interest_earned bigint not null default 0,
  portfolio jsonb not null default '{}'::jsonb,
  last_dividend_round integer not null default 0,
  trade_holder text,
  trade_holder_expires_at timestamptz,
  negative_rounds integer not null default 0,
  bankrupt boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (room_id, team_key)
);

alter table public.team_accounts add column if not exists last_dividend_round integer not null default 0;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  asset_key text not null,
  type text not null check (type in ('stock', 'etf', 'property', 'futures', 'bond')),
  country text not null,
  name text not null,
  sector text not null,
  color text not null,
  price bigint not null check (price >= 0),
  history bigint[] not null default '{}',
  delisted boolean not null default false,
  delisted_round integer,
  financial_profile text,
  financials jsonb not null default '{}'::jsonb,
  negative_streak integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (room_id, asset_key)
);

alter table public.assets add column if not exists financial_profile text;
alter table public.assets add column if not exists financials jsonb not null default '{}'::jsonb;
alter table public.assets add column if not exists negative_streak integer not null default 0;

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  shares integer not null default 0 check (shares >= 0),
  updated_at timestamptz not null default now(),
  unique (player_id, asset_id)
);

create table if not exists public.round_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round integer not null check (round between 1 and 12),
  template_id text not null,
  title text not null,
  detail text not null,
  principle text not null,
  affected_assets text[] not null default '{}',
  discussion_prompt text not null default '',
  impact jsonb not null default '{}'::jsonb,
  probability numeric(4, 3) not null default 0.75,
  resolved boolean not null default false,
  did_apply boolean,
  outcome_type text check (outcome_type in ('event', 'expectation', 'failed')),
  resolved_impact jsonb not null default '{}'::jsonb,
  failure_title text,
  failure_detail text,
  expectation_title text,
  expectation_detail text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.round_events add column if not exists published boolean not null default false;

alter table public.round_events drop constraint if exists round_events_outcome_type_check;
alter table public.round_events
  add constraint round_events_outcome_type_check
  check (outcome_type in ('event', 'expectation', 'failed', 'reverse', 'macroAlert'));

create table if not exists public.room_round_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round integer not null check (round between 1 and 12),
  events jsonb not null default '[]'::jsonb,
  macro_alerts jsonb not null default '[]'::jsonb,
  macro_move jsonb not null default '{}'::jsonb,
  delisted_assets jsonb not null default '[]'::jsonb,
  price_index numeric(10, 6) not null default 1,
  aggregate_return numeric(12, 6) not null default 0,
  demand_pull_delta numeric(10, 6) not null default 0,
  demand_pull_cumulative numeric(10, 6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, round)
);

create table if not exists public.trade_logs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  round integer not null check (round between 1 and 12),
  type text not null check (type in ('buy', 'sell', 'deposit', 'withdraw')),
  asset_id uuid references public.assets(id) on delete set null,
  amount bigint not null default 0,
  shares integer not null default 0,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.round_logs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  round integer not null check (round between 1 and 12),
  total_asset bigint not null default 0,
  cash bigint not null default 0,
  deposit bigint not null default 0,
  holdings_summary text not null default '',
  events_summary text not null default '',
  created_at timestamptz not null default now(),
  unique (room_id, player_id, round)
);

create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  good text not null default '',
  improve text not null default '',
  next_plan text not null default '',
  updated_at timestamptz not null default now(),
  unique (room_id, player_id)
);

create table if not exists public.final_submissions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  nickname text not null,
  mode text not null default 'individual',
  student_number integer,
  team_key text not null default '',
  team_name text not null default '',
  submission_method text not null default 'student',
  total_asset bigint not null default 0,
  cash bigint not null default 0,
  deposit bigint not null default 0,
  deposit_interest_earned bigint not null default 0,
  invested_principal bigint not null default 100000000,
  cash_like_asset bigint not null default 0,
  investment_asset bigint not null default 0,
  return_rate numeric(8, 2) not null default 0,
  investor_type text not null default '',
  portfolio jsonb not null default '[]'::jsonb,
  trade_logs jsonb not null default '[]'::jsonb,
  round_logs jsonb not null default '[]'::jsonb,
  round_notes jsonb not null default '{}'::jsonb,
  round_reflections jsonb not null default '{}'::jsonb,
  round_results jsonb not null default '[]'::jsonb,
  price_index numeric(10, 6) not null default 1,
  demand_pull_cumulative numeric(10, 6) not null default 0,
  reflection jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (room_id, nickname)
);

alter table public.final_submissions add column if not exists deposit_interest_earned bigint not null default 0;
alter table public.final_submissions add column if not exists invested_principal bigint not null default 100000000;
alter table public.final_submissions add column if not exists mode text not null default 'individual';
alter table public.final_submissions add column if not exists student_number integer;
alter table public.final_submissions add column if not exists team_key text not null default '';
alter table public.final_submissions add column if not exists team_name text not null default '';
alter table public.final_submissions add column if not exists submission_method text not null default 'student';
alter table public.final_submissions add column if not exists round_notes jsonb not null default '{}'::jsonb;
alter table public.final_submissions add column if not exists round_reflections jsonb not null default '{}'::jsonb;
alter table public.final_submissions add column if not exists round_results jsonb not null default '[]'::jsonb;
alter table public.final_submissions add column if not exists price_index numeric(10, 6) not null default 1;
alter table public.final_submissions add column if not exists demand_pull_cumulative numeric(10, 6) not null default 0;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players') then
    alter publication supabase_realtime add table public.players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_states') then
    alter publication supabase_realtime add table public.student_states;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_accounts') then
    alter publication supabase_realtime add table public.team_accounts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'assets') then
    alter publication supabase_realtime add table public.assets;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'round_events') then
    alter publication supabase_realtime add table public.round_events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_round_results') then
    alter publication supabase_realtime add table public.room_round_results;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'final_submissions') then
    alter publication supabase_realtime add table public.final_submissions;
  end if;
end;
$$;

create or replace view public.active_rooms as
select *
from public.rooms
where expires_at > now()
  and phase <> 'expired';

create or replace function public.delete_expired_rooms()
returns integer
language plpgsql
security definer
as $$
declare
  deleted_count integer;
begin
  delete from public.rooms
  where expires_at <= now()
     or phase = 'expired';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_rooms_updated_at on public.rooms;
create trigger touch_rooms_updated_at
before update on public.rooms
for each row execute function public.touch_updated_at();

drop trigger if exists touch_players_updated_at on public.players;
create trigger touch_players_updated_at
before update on public.players
for each row execute function public.touch_updated_at();

drop trigger if exists touch_student_states_updated_at on public.student_states;
create trigger touch_student_states_updated_at
before update on public.student_states
for each row execute function public.touch_updated_at();

drop trigger if exists touch_team_accounts_updated_at on public.team_accounts;
create trigger touch_team_accounts_updated_at
before update on public.team_accounts
for each row execute function public.touch_updated_at();

drop trigger if exists touch_assets_updated_at on public.assets;
create trigger touch_assets_updated_at
before update on public.assets
for each row execute function public.touch_updated_at();

drop trigger if exists touch_portfolios_updated_at on public.portfolios;
create trigger touch_portfolios_updated_at
before update on public.portfolios
for each row execute function public.touch_updated_at();

drop trigger if exists touch_reflections_updated_at on public.reflections;
create trigger touch_reflections_updated_at
before update on public.reflections
for each row execute function public.touch_updated_at();

drop trigger if exists touch_room_round_results_updated_at on public.room_round_results;
create trigger touch_room_round_results_updated_at
before update on public.room_round_results
for each row execute function public.touch_updated_at();

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.student_states enable row level security;
alter table public.team_accounts enable row level security;
alter table public.assets enable row level security;
alter table public.portfolios enable row level security;
alter table public.round_events enable row level security;
alter table public.room_round_results enable row level security;
alter table public.trade_logs enable row level security;
alter table public.round_logs enable row level security;
alter table public.reflections enable row level security;
alter table public.final_submissions enable row level security;

drop policy if exists "classroom prototype rooms read" on public.rooms;
drop policy if exists "classroom prototype rooms write" on public.rooms;
drop policy if exists "classroom prototype players read" on public.players;
drop policy if exists "classroom prototype players write" on public.players;
drop policy if exists "classroom prototype student states read" on public.student_states;
drop policy if exists "classroom prototype student states write" on public.student_states;
drop policy if exists "classroom prototype team accounts read" on public.team_accounts;
drop policy if exists "classroom prototype team accounts write" on public.team_accounts;
drop policy if exists "classroom prototype assets read" on public.assets;
drop policy if exists "classroom prototype assets write" on public.assets;
drop policy if exists "classroom prototype portfolios read" on public.portfolios;
drop policy if exists "classroom prototype portfolios write" on public.portfolios;
drop policy if exists "classroom prototype round events read" on public.round_events;
drop policy if exists "classroom prototype round events write" on public.round_events;
drop policy if exists "classroom prototype room round results read" on public.room_round_results;
drop policy if exists "classroom prototype room round results write" on public.room_round_results;
drop policy if exists "classroom prototype trade logs read" on public.trade_logs;
drop policy if exists "classroom prototype trade logs write" on public.trade_logs;
drop policy if exists "classroom prototype round logs read" on public.round_logs;
drop policy if exists "classroom prototype round logs write" on public.round_logs;
drop policy if exists "classroom prototype reflections read" on public.reflections;
drop policy if exists "classroom prototype reflections write" on public.reflections;
drop policy if exists "classroom prototype final submissions read" on public.final_submissions;
drop policy if exists "classroom prototype final submissions write" on public.final_submissions;

create policy "classroom prototype rooms read" on public.rooms for select using (true);
create policy "classroom prototype rooms write" on public.rooms for all using (true) with check (true);

create policy "classroom prototype players read" on public.players for select using (true);
create policy "classroom prototype players write" on public.players for all using (true) with check (true);

create policy "classroom prototype student states read" on public.student_states for select using (true);
create policy "classroom prototype student states write" on public.student_states for all using (true) with check (true);

create policy "classroom prototype team accounts read" on public.team_accounts for select using (true);
create policy "classroom prototype team accounts write" on public.team_accounts for all using (true) with check (true);

create policy "classroom prototype assets read" on public.assets for select using (true);
create policy "classroom prototype assets write" on public.assets for all using (true) with check (true);

create policy "classroom prototype portfolios read" on public.portfolios for select using (true);
create policy "classroom prototype portfolios write" on public.portfolios for all using (true) with check (true);

create policy "classroom prototype round events read" on public.round_events for select using (true);
create policy "classroom prototype round events write" on public.round_events for all using (true) with check (true);

create policy "classroom prototype room round results read" on public.room_round_results for select using (true);
create policy "classroom prototype room round results write" on public.room_round_results for all using (true) with check (true);

create policy "classroom prototype trade logs read" on public.trade_logs for select using (true);
create policy "classroom prototype trade logs write" on public.trade_logs for all using (true) with check (true);

create policy "classroom prototype round logs read" on public.round_logs for select using (true);
create policy "classroom prototype round logs write" on public.round_logs for all using (true) with check (true);

create policy "classroom prototype reflections read" on public.reflections for select using (true);
create policy "classroom prototype reflections write" on public.reflections for all using (true) with check (true);

create policy "classroom prototype final submissions read" on public.final_submissions for select using (true);
create policy "classroom prototype final submissions write" on public.final_submissions for all using (true) with check (true);

create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'market_class_delete_expired_rooms';

    perform cron.schedule(
      'market_class_delete_expired_rooms',
      '*/30 * * * *',
      $cron$select public.delete_expired_rooms();$cron$
    );
  end if;
end;
$$;
