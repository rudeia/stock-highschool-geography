-- 교사 이메일 회원가입 + 방 소유권 + 학생 익명 Auth 세션 기반 RLS
-- 주의: 이 마이그레이션을 적용하기 전에 Supabase Dashboard에서
-- Authentication > Providers > Anonymous Sign-Ins를 활성화해야 한다.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.teacher_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table public.players
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.student_states
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.final_submissions
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists rooms_owner_user_id_idx on public.rooms(owner_user_id);
create index if not exists players_user_room_idx on public.players(user_id, room_id);
create index if not exists student_states_user_room_idx on public.student_states(user_id, room_id);
create index if not exists final_submissions_user_room_idx on public.final_submissions(user_id, room_id);

create or replace function private.handle_new_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_anonymous is false then
    insert into public.teacher_profiles (id, display_name)
    values (
      new.id,
      case
        when char_length(trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''))) >= 2
          then left(trim(new.raw_user_meta_data ->> 'display_name'), 40)
        when char_length(split_part(coalesce(new.email, ''), '@', 1)) >= 2
          then left(split_part(new.email, '@', 1), 40)
        else '교사'
      end
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.handle_new_teacher() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_market_class on auth.users;
create trigger on_auth_user_created_market_class
after insert on auth.users
for each row execute function private.handle_new_teacher();

insert into public.teacher_profiles (id, display_name)
select
  id,
  case
    when char_length(trim(coalesce(raw_user_meta_data ->> 'display_name', ''))) >= 2
      then left(trim(raw_user_meta_data ->> 'display_name'), 40)
    when char_length(split_part(coalesce(email, ''), '@', 1)) >= 2
      then left(split_part(email, '@', 1), 40)
    else '교사'
  end
from auth.users
where is_anonymous is false
on conflict (id) do nothing;

drop trigger if exists touch_teacher_profiles_updated_at on public.teacher_profiles;
create trigger touch_teacher_profiles_updated_at
before update on public.teacher_profiles
for each row execute function public.touch_updated_at();

create or replace function private.current_user_is_permanent()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) is false;
$$;

create or replace function private.owns_room(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_user_is_permanent()
    and exists (
      select 1
      from public.rooms
      where id = target_room_id
        and owner_user_id = (select auth.uid())
    );
$$;

create or replace function private.is_room_participant(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where room_id = target_room_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function private.can_manage_team(target_room_id uuid, target_team_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.owns_room(target_room_id)
    or exists (
      select 1
      from public.players
      where room_id = target_room_id
        and user_id = (select auth.uid())
        and team_key = target_team_key
    );
$$;

revoke all on function private.current_user_is_permanent() from public;
revoke all on function private.owns_room(uuid) from public;
revoke all on function private.is_room_participant(uuid) from public;
revoke all on function private.can_manage_team(uuid, text) from public;
grant execute on function private.current_user_is_permanent() to authenticated;
grant execute on function private.owns_room(uuid) to authenticated;
grant execute on function private.is_room_participant(uuid) to authenticated;
grant execute on function private.can_manage_team(uuid, text) to authenticated;

-- PIN을 아는 사용자가 입장 전에 확인할 수 있는 최소 방 정보만 반환한다.
create or replace function public.lookup_classroom_by_pin(p_pin text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_room public.rooms%rowtype;
  participant_count integer;
begin
  if p_pin !~ '^[0-9]{6}$' then
    return null;
  end if;

  select *
  into target_room
  from public.rooms
  where pin = p_pin
    and expires_at > now()
    and phase <> 'expired'
  limit 1;

  if not found then
    return null;
  end if;

  select count(*)::integer
  into participant_count
  from public.players
  where room_id = target_room.id;

  return jsonb_build_object(
    'id', target_room.id,
    'pin', target_room.pin,
    'host_id', target_room.host_id,
    'current_round', target_room.current_round,
    'total_rounds', target_room.total_rounds,
    'phase', target_room.phase,
    'mode', target_room.mode,
    'game_started', target_room.game_started,
    'final_reports_downloaded', target_room.final_reports_downloaded,
    'base_rate', target_room.base_rate,
    'property_index', target_room.property_index,
    'exchange_rate', target_room.exchange_rate,
    'unemployment_rate', target_room.unemployment_rate,
    'price_index', target_room.price_index,
    'demand_pull_cumulative', target_room.demand_pull_cumulative,
    'open_macro_context', target_room.open_macro_context,
    'trigger_cooldowns', target_room.trigger_cooldowns,
    'pending_macro_alerts', target_room.pending_macro_alerts,
    'active_macro_alerts', target_room.active_macro_alerts,
    'economic_seed', target_room.economic_seed,
    'is_paused', target_room.is_paused,
    'created_at', target_room.created_at,
    'expires_at', target_room.expires_at,
    'updated_at', target_room.updated_at,
    'player_count', participant_count
  );
end;
$$;

revoke all on function public.lookup_classroom_by_pin(text) from public;
grant execute on function public.lookup_classroom_by_pin(text) to anon, authenticated;

-- 학생 재접속 시 비밀번호를 검증하고 현재 익명 Auth 사용자에게 학번을 귀속한다.
create or replace function public.claim_student_seat(
  p_room_pin text,
  p_student_number integer,
  p_nickname text,
  p_passcode_hash text,
  p_session_token text,
  p_team_key text,
  p_cash bigint,
  p_deposit bigint,
  p_total_asset bigint,
  p_return_rate numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.rooms%rowtype;
  existing_player public.players%rowtype;
  saved_player public.players%rowtype;
begin
  if (select auth.uid()) is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) is false then
    raise exception '학생 입장을 위한 익명 인증 세션이 필요합니다.' using errcode = '42501';
  end if;

  if p_student_number < 1 or p_student_number > 40
    or p_passcode_hash is null or p_passcode_hash = ''
    or char_length(trim(coalesce(p_nickname, ''))) < 1 then
    raise exception '학생 입장 정보를 확인해주세요.' using errcode = '22023';
  end if;

  select *
  into target_room
  from public.rooms
  where pin = p_room_pin
    and expires_at > now()
    and phase <> 'expired'
  limit 1;

  if not found then
    raise exception '해당 PIN의 수업 방을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select *
  into existing_player
  from public.players
  where room_id = target_room.id
    and student_number = p_student_number
  for update;

  if found then
    if existing_player.passcode_hash <> p_passcode_hash then
      raise exception '이미 사용 중인 학번입니다. 이름과 개인 비밀번호를 확인하세요.' using errcode = '42501';
    end if;
    if existing_player.session_token <> ''
      and existing_player.session_token <> coalesce(p_session_token, '')
      and existing_player.last_seen_at > now() - interval '90 seconds' then
      raise exception '해당 학번은 다른 기기에서 접속 중입니다. 잠시 후 다시 시도하세요.' using errcode = '55000';
    end if;

    perform set_config('app.claim_student_seat', 'true', true);

    update public.players
    set user_id = (select auth.uid()),
        nickname = coalesce(nullif(existing_player.nickname, ''), trim(p_nickname)),
        team_key = existing_player.team_key,
        session_token = coalesce(p_session_token, ''),
        last_seen_at = now()
    where id = existing_player.id
    returning * into saved_player;

    update public.student_states
    set user_id = (select auth.uid())
    where room_id = target_room.id
      and student_number = p_student_number
      and (passcode_hash = p_passcode_hash or passcode_hash = '');
  else
    if (select count(*) from public.players where room_id = target_room.id) >= 40 then
      raise exception '정원이 찼습니다.' using errcode = '54000';
    end if;

    if target_room.mode = 'team' and not exists (
      select 1
      from public.team_accounts
      where room_id = target_room.id
        and team_key = p_team_key
    ) then
      raise exception '선택한 모둠을 찾을 수 없습니다.' using errcode = '22023';
    end if;

    insert into public.players (
      room_id,
      user_id,
      student_number,
      nickname,
      passcode_hash,
      session_token,
      last_seen_at,
      team_key,
      cash,
      deposit,
      total_asset,
      return_rate
    ) values (
      target_room.id,
      (select auth.uid()),
      p_student_number,
      trim(p_nickname),
      p_passcode_hash,
      coalesce(p_session_token, ''),
      now(),
      coalesce(p_team_key, ''),
      coalesce(p_cash, 0),
      coalesce(p_deposit, 0),
      coalesce(p_total_asset, 0),
      coalesce(p_return_rate, 0)
    )
    returning * into saved_player;
  end if;

  return jsonb_build_object(
    'id', saved_player.id,
    'room_id', saved_player.room_id,
    'user_id', saved_player.user_id,
    'nickname', saved_player.nickname,
    'student_number', saved_player.student_number,
    'team_key', saved_player.team_key,
    'cash', saved_player.cash,
    'deposit', saved_player.deposit,
    'total_asset', saved_player.total_asset,
    'return_rate', saved_player.return_rate,
    'last_seen_at', saved_player.last_seen_at,
    'joined_at', saved_player.joined_at,
    'updated_at', saved_player.updated_at
  );
end;
$$;

revoke all on function public.claim_student_seat(text, integer, text, text, text, text, bigint, bigint, bigint, numeric) from public, anon;
grant execute on function public.claim_student_seat(text, integer, text, text, text, text, bigint, bigint, bigint, numeric) to authenticated;

-- 익명 학생이 일반 UPDATE 요청으로 학번·방·사용자 소유권을 바꾸지 못하게 고정한다.
create or replace function private.protect_student_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.claim_student_seat', true) = 'true' then
    return new;
  end if;

  if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) is false then
    return new;
  end if;

  if tg_table_name = 'players' then
    new.room_id := old.room_id;
    new.user_id := old.user_id;
    new.student_number := old.student_number;
    new.nickname := old.nickname;
    new.passcode_hash := old.passcode_hash;
    new.team_key := old.team_key;
    new.joined_at := old.joined_at;
  elsif tg_table_name = 'student_states' then
    new.room_id := old.room_id;
    new.user_id := old.user_id;
    new.student_number := old.student_number;
    new.nickname := old.nickname;
    new.passcode_hash := old.passcode_hash;
    new.team_key := old.team_key;
  elsif tg_table_name = 'final_submissions' then
    new.room_id := old.room_id;
    new.user_id := old.user_id;
    new.student_number := old.student_number;
    new.nickname := old.nickname;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_student_identity() from public, anon, authenticated;

drop trigger if exists protect_student_player_identity on public.players;
create trigger protect_student_player_identity
before update on public.players
for each row execute function private.protect_student_identity();

drop trigger if exists protect_student_state_identity on public.student_states;
create trigger protect_student_state_identity
before update on public.student_states
for each row execute function private.protect_student_identity();

drop trigger if exists protect_student_submission_identity on public.final_submissions;
create trigger protect_student_submission_identity
before update on public.final_submissions
for each row execute function private.protect_student_identity();

-- 기존 프로토타입의 무제한 정책 제거
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

alter table public.teacher_profiles enable row level security;

-- 기존 뷰도 호출자의 RLS를 따르게 하며, 입장 전에는 미리보기 RPC만 허용한다.
alter view public.active_rooms set (security_invoker = true);
revoke all on table public.active_rooms from anon;
grant select on table public.active_rooms to authenticated;

create policy "teachers read own profile"
on public.teacher_profiles for select to authenticated
using (id = (select auth.uid()) and private.current_user_is_permanent());
create policy "teachers update own profile"
on public.teacher_profiles for update to authenticated
using (id = (select auth.uid()) and private.current_user_is_permanent())
with check (id = (select auth.uid()) and private.current_user_is_permanent());

create policy "room members read room"
on public.rooms for select to authenticated
using (
  (owner_user_id = (select auth.uid()) and private.current_user_is_permanent())
  or private.is_room_participant(id)
);
create policy "permanent teachers create room"
on public.rooms for insert to authenticated
with check (owner_user_id = (select auth.uid()) and private.current_user_is_permanent());
create policy "room owners update room"
on public.rooms for update to authenticated
using (owner_user_id = (select auth.uid()) and private.current_user_is_permanent())
with check (owner_user_id = (select auth.uid()) and private.current_user_is_permanent());
create policy "room owners delete room"
on public.rooms for delete to authenticated
using (owner_user_id = (select auth.uid()) and private.current_user_is_permanent());

create policy "room roster is visible to members"
on public.players for select to authenticated
using (private.owns_room(room_id) or private.is_room_participant(room_id));
create policy "room owners insert players"
on public.players for insert to authenticated
with check (private.owns_room(room_id));
create policy "student or owner updates player"
on public.players for update to authenticated
using (user_id = (select auth.uid()) or private.owns_room(room_id))
with check (user_id = (select auth.uid()) or private.owns_room(room_id));
create policy "room owners delete players"
on public.players for delete to authenticated
using (private.owns_room(room_id));

create policy "student or owner reads account"
on public.student_states for select to authenticated
using (user_id = (select auth.uid()) or private.owns_room(room_id));
create policy "student or owner creates account"
on public.student_states for insert to authenticated
with check (
  private.owns_room(room_id)
  or (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.players
      where public.players.room_id = public.student_states.room_id
        and public.players.student_number = public.student_states.student_number
        and public.players.user_id = (select auth.uid())
    )
  )
);
create policy "student or owner updates account"
on public.student_states for update to authenticated
using (user_id = (select auth.uid()) or private.owns_room(room_id))
with check (
  private.owns_room(room_id)
  or (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.players
      where public.players.room_id = public.student_states.room_id
        and public.players.student_number = public.student_states.student_number
        and public.players.user_id = (select auth.uid())
    )
  )
);
create policy "room owners delete account"
on public.student_states for delete to authenticated
using (private.owns_room(room_id));

create policy "room members read team accounts"
on public.team_accounts for select to authenticated
using (private.owns_room(room_id) or private.is_room_participant(room_id));
create policy "room owners create team accounts"
on public.team_accounts for insert to authenticated
with check (private.owns_room(room_id));
create policy "team members or owners update team account"
on public.team_accounts for update to authenticated
using (private.can_manage_team(room_id, team_key))
with check (private.can_manage_team(room_id, team_key));
create policy "room owners delete team accounts"
on public.team_accounts for delete to authenticated
using (private.owns_room(room_id));

create policy "room members read assets"
on public.assets for select to authenticated
using (private.owns_room(room_id) or private.is_room_participant(room_id));
create policy "room owners manage assets"
on public.assets for all to authenticated
using (private.owns_room(room_id)) with check (private.owns_room(room_id));

create policy "room members read events"
on public.round_events for select to authenticated
using (private.owns_room(room_id) or private.is_room_participant(room_id));
create policy "room owners manage events"
on public.round_events for all to authenticated
using (private.owns_room(room_id)) with check (private.owns_room(room_id));

create policy "room members read round results"
on public.room_round_results for select to authenticated
using (private.owns_room(room_id) or private.is_room_participant(room_id));
create policy "room owners manage round results"
on public.room_round_results for all to authenticated
using (private.owns_room(room_id)) with check (private.owns_room(room_id));

create policy "student or owner reads submission"
on public.final_submissions for select to authenticated
using (user_id = (select auth.uid()) or private.owns_room(room_id));
create policy "student or owner creates submission"
on public.final_submissions for insert to authenticated
with check (
  private.owns_room(room_id)
  or (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.players
      where public.players.room_id = public.final_submissions.room_id
        and public.players.student_number = public.final_submissions.student_number
        and public.players.user_id = (select auth.uid())
    )
  )
);
create policy "student or owner updates submission"
on public.final_submissions for update to authenticated
using (user_id = (select auth.uid()) or private.owns_room(room_id))
with check (
  private.owns_room(room_id)
  or (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.players
      where public.players.room_id = public.final_submissions.room_id
        and public.players.student_number = public.final_submissions.student_number
        and public.players.user_id = (select auth.uid())
    )
  )
);
create policy "room owners delete submissions"
on public.final_submissions for delete to authenticated
using (private.owns_room(room_id));

create policy "player portfolio access"
on public.portfolios for all to authenticated
using (
  private.owns_room(room_id)
  or exists (
    select 1 from public.players
    where id = player_id
      and public.players.room_id = public.portfolios.room_id
      and user_id = (select auth.uid())
  )
)
with check (
  private.owns_room(room_id)
  or exists (
    select 1 from public.players
    where id = player_id
      and public.players.room_id = public.portfolios.room_id
      and user_id = (select auth.uid())
  )
);
create policy "player trade log access"
on public.trade_logs for all to authenticated
using (
  private.owns_room(room_id)
  or exists (
    select 1 from public.players
    where id = player_id
      and public.players.room_id = public.trade_logs.room_id
      and user_id = (select auth.uid())
  )
)
with check (
  private.owns_room(room_id)
  or exists (
    select 1 from public.players
    where id = player_id
      and public.players.room_id = public.trade_logs.room_id
      and user_id = (select auth.uid())
  )
);
create policy "player round log access"
on public.round_logs for all to authenticated
using (
  private.owns_room(room_id)
  or exists (
    select 1 from public.players
    where id = player_id
      and public.players.room_id = public.round_logs.room_id
      and user_id = (select auth.uid())
  )
)
with check (
  private.owns_room(room_id)
  or exists (
    select 1 from public.players
    where id = player_id
      and public.players.room_id = public.round_logs.room_id
      and user_id = (select auth.uid())
  )
);
create policy "player reflection access"
on public.reflections for all to authenticated
using (
  private.owns_room(room_id)
  or exists (
    select 1 from public.players
    where id = player_id
      and public.players.room_id = public.reflections.room_id
      and user_id = (select auth.uid())
  )
)
with check (
  private.owns_room(room_id)
  or exists (
    select 1 from public.players
    where id = player_id
      and public.players.room_id = public.reflections.room_id
      and user_id = (select auth.uid())
  )
);

-- Data API 권한: 익명 키는 PIN 미리보기 RPC만 사용하고, 테이블은 Auth 세션만 접근한다.
revoke all on table public.teacher_profiles from anon;
revoke all on table public.rooms, public.players, public.student_states, public.team_accounts,
  public.assets, public.portfolios, public.round_events, public.room_round_results,
  public.trade_logs, public.round_logs, public.reflections, public.final_submissions from anon;

grant select, insert, update on table public.teacher_profiles to authenticated;
grant select, insert, update, delete on table public.rooms to authenticated;
grant insert, update, delete on table public.players to authenticated;
grant insert, update, delete on table public.student_states to authenticated;
grant select, insert, update, delete on table public.team_accounts, public.assets, public.portfolios,
  public.round_events, public.room_round_results, public.trade_logs, public.round_logs,
  public.reflections, public.final_submissions to authenticated;

-- 학생 비밀번호 해시와 세션 토큰은 어떤 클라이언트도 SELECT하지 않는다.
revoke select on table public.players from authenticated;
grant select (
  id, room_id, user_id, nickname, student_number, team_key, cash, deposit, total_asset,
  return_rate, joined_at, updated_at, last_seen_at, time_deposit_balance,
  time_deposit_principal, time_deposit_deposited_at_round,
  time_deposit_locked_until_round, time_deposit_rate
) on public.players to authenticated;

revoke select on table public.student_states from authenticated;
grant select (
  id, room_id, user_id, student_number, nickname, team_key, cash, deposit,
  deposit_principal, deposit_interest_earned, portfolio, trade_logs, round_logs,
  round_notes, round_reflections, reflection, salary_paid_rounds,
  initial_capital_granted, updated_at, time_deposit_balance, time_deposit_principal,
  time_deposit_deposited_at_round, time_deposit_locked_until_round,
  time_deposit_rate, last_dividend_round
) on public.student_states to authenticated;

revoke execute on function public.delete_expired_rooms() from public, anon, authenticated;
