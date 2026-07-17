-- Supabase Database Advisor가 지적한 변경 가능한 search_path를 고정한다.
-- 두 함수는 본문에서 public 스키마를 명시하거나 NEW 레코드만 사용하므로 빈 search_path가 안전하다.
alter function public.touch_updated_at() set search_path = '';
alter function public.delete_expired_rooms() set search_path = '';

-- 외래 키 삭제/조인 시 전체 테이블 스캔을 피하기 위한 보조 인덱스
create index if not exists portfolios_asset_id_idx on public.portfolios(asset_id);
create index if not exists portfolios_room_id_idx on public.portfolios(room_id);
create index if not exists reflections_player_id_idx on public.reflections(player_id);
create index if not exists round_events_room_id_idx on public.round_events(room_id);
create index if not exists round_logs_player_id_idx on public.round_logs(player_id);
create index if not exists trade_logs_asset_id_idx on public.trade_logs(asset_id);
create index if not exists trade_logs_player_id_idx on public.trade_logs(player_id);
create index if not exists trade_logs_room_id_idx on public.trade_logs(room_id);
