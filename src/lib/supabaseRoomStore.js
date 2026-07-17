import { supabase, supabaseConfigured } from './supabaseClient.js';

const SAFE_PLAYER_COLUMNS = [
  'id', 'room_id', 'user_id', 'nickname', 'student_number', 'team_key', 'cash', 'deposit',
  'total_asset', 'return_rate', 'joined_at', 'updated_at', 'last_seen_at',
  'time_deposit_balance', 'time_deposit_principal', 'time_deposit_deposited_at_round',
  'time_deposit_locked_until_round', 'time_deposit_rate',
].join(',');
const SAFE_STUDENT_STATE_COLUMNS = [
  'id', 'room_id', 'user_id', 'student_number', 'nickname', 'team_key', 'cash', 'deposit',
  'deposit_principal', 'deposit_interest_earned', 'portfolio', 'trade_logs', 'round_logs',
  'round_notes', 'round_reflections', 'reflection', 'salary_paid_rounds',
  'initial_capital_granted', 'updated_at', 'time_deposit_balance', 'time_deposit_principal',
  'time_deposit_deposited_at_round', 'time_deposit_locked_until_round', 'time_deposit_rate',
  'last_dividend_round',
].join(',');

function toIso(value) {
  return new Date(value).toISOString();
}

function toAssetRow(roomId, asset) {
  return {
    room_id: roomId,
    asset_key: asset.id,
    type: asset.type,
    country: asset.country,
    name: asset.name,
    sector: asset.sector,
    color: asset.color,
    price: asset.price,
    face_value: asset.faceValue ?? null,
    history: asset.history ?? [],
    delisted: Boolean(asset.delisted),
    delisted_round: asset.delistedRound ?? null,
    financial_profile: asset.financialProfile ?? asset.financials?.profile ?? null,
    // Week 4 §4.11 — SQL 스키마 변경 없이 financials(JSONB) 컬럼에
    //   배당 티어·배당율·쿠폰율을 함께 넣어 두면 fromAssetRow에서 그대로 복원할 수 있다.
    //   기존 financials 객체와 충돌하지 않도록 prefix '_'를 붙여 메타데이터로 보관.
    financials: {
      ...(asset.financials ?? {}),
      _size: asset.size ?? null,
      _dividendTier: asset.dividendTier ?? null,
      _dividendRate: asset.dividendRate ?? null,
      _couponRate: asset.couponRate ?? null,
    },
    negative_streak: asset.negativeStreak ?? 0,
  };
}

function fromAssetRow(row) {
  return {
    id: row.asset_key,
    type: row.type,
    country: row.country,
    name: row.name,
    sector: row.sector,
    color: row.color,
    price: Number(row.price),
    faceValue: row.face_value != null ? Number(row.face_value) : undefined,
    size: row.financials?._size ?? undefined,
    // Week 4 §4.11 — financials 메타에 끼워 둔 배당/쿠폰 정보를 자산 필드로 복원
    dividendTier: row.financials?._dividendTier ?? null,
    dividendRate: row.financials?._dividendRate != null ? Number(row.financials._dividendRate) : 0,
    couponRate: row.financials?._couponRate != null ? Number(row.financials._couponRate) : undefined,
    history: row.history?.length ? row.history.map(Number) : [Number(row.price)],
    delisted: row.delisted,
    delistedRound: row.delisted_round ?? undefined,
    financialProfile: row.financial_profile ?? row.financials?.profile ?? null,
    financials: row.financials && Object.keys(row.financials).length ? row.financials : null,
    negativeStreak: Number(row.negative_streak ?? 0),
  };
}

function toEventRow(roomId, event, round) {
  return {
    room_id: roomId,
    round,
    template_id: event.templateId ?? event.id,
    title: event.title,
    detail: event.detail,
    principle: event.principle,
    affected_assets: event.affectedAssets ?? [],
    discussion_prompt: event.discussionPrompt ?? '',
    impact: event.impact ?? {},
    probability: event.probability ?? 0.75,
    resolved: Boolean(event.resolved),
    did_apply: event.didApply ?? null,
    outcome_type: event.outcomeType ?? null,
    resolved_impact: event.resolvedImpact ?? {},
    failure_title: event.failureTitle ?? null,
    failure_detail: event.failureDetail ?? null,
    expectation_title: event.expectationTitle ?? null,
    expectation_detail: event.expectationDetail ?? null,
    published: Boolean(event.published),
  };
}

function fromEventRow(row) {
  const templateId = row.template_id;
  const impact = row.impact ?? {};
  const corporateRisk = String(templateId ?? '').startsWith('corp-risk-');
  return {
    id: row.id,
    remoteId: row.id,
    round: row.round,
    templateId,
    corporateRisk,
    riskTargetAssetId: corporateRisk ? Object.keys(impact)[0] ?? '' : undefined,
    title: row.title,
    detail: row.detail,
    principle: row.principle,
    affectedAssets: row.affected_assets ?? [],
    discussionPrompt: row.discussion_prompt ?? '',
    impact,
    probability: Number(row.probability ?? 0.75),
    resolved: row.resolved,
    didApply: row.did_apply ?? undefined,
    outcomeType: row.outcome_type ?? undefined,
    resolvedImpact: row.resolved_impact ?? {},
    failureTitle: row.failure_title ?? undefined,
    failureDetail: row.failure_detail ?? undefined,
    expectationTitle: row.expectation_title ?? undefined,
    expectationDetail: row.expectation_detail ?? undefined,
    published: Boolean(row.published),
  };
}

function fromPlayerRow(row) {
  return {
    id: row.id,
    authUserId: row.user_id ?? '',
    name: row.nickname,
    studentNumber: row.student_number ?? null,
    passcodeHash: row.passcode_hash ?? '',
    sessionToken: row.session_token ?? '',
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0,
    teamKey: row.team_key ?? '',
    returnRate: Number(row.return_rate ?? 0),
    cash: Number(row.cash ?? 0),
    deposit: Number(row.deposit ?? 0),
    totalAsset: Number(row.total_asset ?? 0),
    holdings: [],
  };
}

function toStudentStateRow(roomId, state) {
  return {
    room_id: roomId,
    ...(state.authUserId ? { user_id: state.authUserId } : {}),
    student_number: Number(state.studentNumber),
    nickname: state.nickname,
    ...(state.passcodeHash ? { passcode_hash: state.passcodeHash } : {}),
    team_key: state.teamKey ?? '',
    cash: Math.round(state.cash ?? 0),
    deposit: Math.round(state.deposit ?? 0),
    deposit_principal: Math.round(state.depositPrincipal ?? 0),
    deposit_interest_earned: Math.round(state.depositInterestEarned ?? 0),
    portfolio: state.portfolio ?? {},
    last_dividend_round: Number(state.lastDividendRound ?? 0),
    trade_logs: state.tradeLogs ?? [],
    round_logs: state.roundLogs ?? [],
    round_notes: state.roundNotes ?? {},
    round_reflections: state.roundReflections ?? {},
    reflection: state.reflection ?? {},
    salary_paid_rounds: state.salaryPaidRounds ?? [],
    initial_capital_granted: Boolean(state.initialCapitalGranted),
    updated_at: toIso(state.updatedAt ?? Date.now()),
  };
}

function fromStudentStateRow(row) {
  return {
    id: row.id,
    authUserId: row.user_id ?? '',
    studentNumber: row.student_number ?? null,
    nickname: row.nickname,
    passcodeHash: row.passcode_hash ?? '',
    teamKey: row.team_key ?? '',
    cash: Number(row.cash ?? 0),
    deposit: Number(row.deposit ?? 0),
    depositPrincipal: Number(row.deposit_principal ?? 0),
    depositInterestEarned: Number(row.deposit_interest_earned ?? 0),
    portfolio: row.portfolio ?? {},
    lastDividendRound: Number(row.last_dividend_round ?? 0),
    tradeLogs: row.trade_logs ?? [],
    roundLogs: row.round_logs ?? [],
    roundNotes: row.round_notes ?? {},
    roundReflections: row.round_reflections ?? {},
    reflection: row.reflection ?? {},
    salaryPaidRounds: row.salary_paid_rounds ?? [],
    initialCapitalGranted: Boolean(row.initial_capital_granted),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
  };
}

function toTeamRow(roomId, team) {
  return {
    room_id: roomId,
    team_key: team.key,
    team_name: team.name,
    cash: Math.round(team.cash ?? 0),
    deposit: Math.round(team.deposit ?? 0),
    deposit_interest_earned: Math.round(team.depositInterestEarned ?? 0),
    portfolio: team.portfolio ?? {},
    last_dividend_round: Number(team.lastDividendRound ?? 0),
    trade_holder: team.tradeHolder ?? null,
    trade_holder_expires_at: team.tradeHolderExpiresAt ? toIso(team.tradeHolderExpiresAt) : null,
    negative_rounds: team.negativeRounds ?? 0,
    bankrupt: Boolean(team.bankrupt),
  };
}

function fromTeamRow(row) {
  return {
    key: row.team_key,
    name: row.team_name,
    cash: Number(row.cash ?? 0),
    deposit: Number(row.deposit ?? 0),
    depositInterestEarned: Number(row.deposit_interest_earned ?? 0),
    portfolio: row.portfolio ?? {},
    lastDividendRound: Number(row.last_dividend_round ?? 0),
    tradeHolder: row.trade_holder ?? null,
    tradeHolderExpiresAt: row.trade_holder_expires_at ? new Date(row.trade_holder_expires_at).getTime() : null,
    negativeRounds: Number(row.negative_rounds ?? 0),
    bankrupt: Boolean(row.bankrupt),
  };
}

function fromSubmissionRow(row) {
  return {
    id: row.id,
    authUserId: row.user_id ?? '',
    nickname: row.nickname,
    studentNumber: row.student_number ?? null,
    mode: row.mode ?? 'individual',
    teamKey: row.team_key ?? '',
    teamName: row.team_name ?? '',
    submissionMethod: row.submission_method ?? 'student',
    totalAsset: Number(row.total_asset ?? 0),
    cash: Number(row.cash ?? 0),
    deposit: Number(row.deposit ?? 0),
    depositInterestEarned: Number(row.deposit_interest_earned ?? 0),
    investedPrincipal: Number(row.invested_principal ?? 100000000),
    cashLikeAsset: Number(row.cash_like_asset ?? 0),
    investmentAsset: Number(row.investment_asset ?? 0),
    returnRate: Number(row.return_rate ?? 0),
    investorType: row.investor_type ?? '',
    portfolio: row.portfolio ?? [],
    tradeLogs: row.trade_logs ?? [],
    roundLogs: row.round_logs ?? [],
    roundNotes: row.round_notes ?? {},
    roundReflections: row.round_reflections ?? {},
    roundResults: row.round_results ?? [],
    priceIndex: Number(row.price_index ?? 1),
    demandPullCumulative: Number(row.demand_pull_cumulative ?? 0),
    reflection: row.reflection ?? {},
    submittedAt: row.submitted_at,
  };
}

function toRoundResultRow(roomId, result) {
  return {
    room_id: roomId,
    round: Number(result.round),
    events: result.events ?? [],
    macro_alerts: result.macroAlerts ?? [],
    macro_move: result.macroMove ?? {},
    delisted_assets: result.delistedAssets ?? [],
    price_index: Number(result.priceIndex ?? 1),
    aggregate_return: Number(result.aggregateReturn ?? 0),
    demand_pull_delta: Number(result.demandPullDelta ?? 0),
    demand_pull_cumulative: Number(result.demandPullCumulative ?? 0),
  };
}

function fromRoundResultRow(row) {
  return {
    id: row.id,
    round: Number(row.round),
    events: row.events ?? [],
    macroAlerts: row.macro_alerts ?? [],
    macroMove: row.macro_move ?? {},
    delistedAssets: row.delisted_assets ?? [],
    priceIndex: Number(row.price_index ?? 1),
    aggregateReturn: Number(row.aggregate_return ?? 0),
    demandPullDelta: Number(row.demand_pull_delta ?? 0),
    demandPullCumulative: Number(row.demand_pull_cumulative ?? 0),
    createdAt: row.created_at,
  };
}

async function fetchRoomBundle(query) {
  const { data: room, error: roomError } = await query.single();
  if (roomError) {
    if (roomError.code === 'PGRST116') return null;
    throw roomError;
  }

  const [assetsResult, eventsResult, playersResult, teamsResult, statesResult, roundResultsResult] = await Promise.all([
    supabase.from('assets').select('*').eq('room_id', room.id).order('name', { ascending: true }),
    supabase.from('round_events').select('*').eq('room_id', room.id).order('created_at', { ascending: true }),
    supabase.from('players').select(SAFE_PLAYER_COLUMNS).eq('room_id', room.id).order('joined_at', { ascending: true }),
    supabase.from('team_accounts').select('*').eq('room_id', room.id).order('team_key', { ascending: true }),
    supabase.from('student_states').select(SAFE_STUDENT_STATE_COLUMNS).eq('room_id', room.id).order('updated_at', { ascending: true }),
    supabase.from('room_round_results').select('*').eq('room_id', room.id).order('round', { ascending: true }),
  ]);

  if (assetsResult.error) throw assetsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (playersResult.error) throw playersResult.error;
  if (teamsResult.error && teamsResult.error.code !== '42P01') throw teamsResult.error;
  if (statesResult.error && statesResult.error.code !== '42P01') throw statesResult.error;
  if (roundResultsResult.error && roundResultsResult.error.code !== '42P01') throw roundResultsResult.error;

  return {
    room,
    assets: assetsResult.data.map(fromAssetRow),
    events: eventsResult.data.map(fromEventRow),
    players: playersResult.data.map(fromPlayerRow),
    teams: teamsResult.error ? [] : teamsResult.data.map(fromTeamRow),
    studentStates: statesResult.error ? [] : statesResult.data.map(fromStudentStateRow),
    roundResults: roundResultsResult.error ? [] : roundResultsResult.data.map(fromRoundResultRow),
    submissions: [],
  };
}

export async function createRemoteRoom({ pin, now, hostId = '교사', ownerUserId, totalRounds = 12, baseRate, propertyIndex = 250000, exchangeRate = 1350, unemploymentRate = 3.5, economicSeed = {}, assets, mode = 'individual', teams = [] }) {
  if (!supabaseConfigured) return null;

  if (!ownerUserId) throw new Error('교사 로그인 세션을 확인할 수 없습니다. 다시 로그인해주세요.');
  const { error: previousRoomsError } = await supabase.from('rooms').delete().eq('owner_user_id', ownerUserId);
  if (previousRoomsError) throw previousRoomsError;

  const { data: room, error } = await supabase
    .from('rooms')
    .insert({
      pin,
      host_id: hostId,
      owner_user_id: ownerUserId,
      current_round: 1,
      total_rounds: totalRounds,
      phase: 'setup',
      mode,
      game_started: false,
      final_reports_downloaded: false,
      base_rate: baseRate,
      property_index: propertyIndex,
      exchange_rate: exchangeRate,
      unemployment_rate: unemploymentRate,
      price_index: 1,
      demand_pull_cumulative: 0,
      open_macro_context: {},
      trigger_cooldowns: {},
      pending_macro_alerts: [],
      active_macro_alerts: [],
      economic_seed: economicSeed,
      is_paused: false,
      created_at: toIso(now),
      expires_at: toIso(now + 24 * 60 * 60 * 1000),
    })
    .select()
    .single();

  if (error?.code === '23505') throw new Error('방 PIN이 겹쳤습니다. 새 방 생성을 다시 눌러주세요.');
  if (error) throw error;

  const { error: assetsError } = await supabase.from('assets').insert(assets.map((asset) => toAssetRow(room.id, asset)));
  if (assetsError) throw assetsError;

  if (teams.length) {
    const { error: teamsError } = await supabase.from('team_accounts').upsert(teams.map((team) => toTeamRow(room.id, team)), { onConflict: 'room_id,team_key' });
    if (teamsError) throw teamsError;
  }

  return fetchRemoteRoomById(room.id);
}

export async function fetchRemoteRoomPreviewByPin(pin) {
  if (!supabaseConfigured || !/^[0-9]{6}$/.test(pin)) return null;
  const { data, error } = await supabase.rpc('lookup_classroom_by_pin', { p_pin: pin });
  if (error) throw error;
  if (!data) return null;
  return {
    room: data,
    assets: [],
    events: [],
    players: [],
    teams: [],
    studentStates: [],
    roundResults: [],
    submissions: [],
    preview: true,
  };
}

export async function fetchRemoteActiveRoomByOwnerId(ownerUserId) {
  if (!supabaseConfigured || !ownerUserId) return null;
  return fetchRoomBundle(
    supabase
      .from('rooms')
      .select('*')
      .eq('owner_user_id', ownerUserId)
      .gt('expires_at', new Date().toISOString())
      .neq('phase', 'expired')
      .order('updated_at', { ascending: false })
      .limit(1),
  );
}

export async function fetchRemoteRoomById(roomId) {
  if (!supabaseConfigured || !roomId) return null;
  return fetchRoomBundle(supabase.from('rooms').select('*').eq('id', roomId));
}

export async function updateRemoteRoom(roomId, patch) {
  if (!supabaseConfigured || !roomId) return null;
  const { error } = await supabase.from('rooms').update(patch).eq('id', roomId);
  if (error) throw error;
  return true;
}

export async function upsertRemoteAssets(roomId, assets) {
  if (!supabaseConfigured || !roomId) return null;
  const { error } = await supabase
    .from('assets')
    .upsert(assets.map((asset) => toAssetRow(roomId, asset)), { onConflict: 'room_id,asset_key' });
  if (error) throw error;
  return true;
}

export async function insertRemoteIssue(roomId, event, round) {
  if (!supabaseConfigured || !roomId) return null;
  const { data, error } = await supabase.from('round_events').insert(toEventRow(roomId, event, round)).select().single();
  if (error) throw error;
  return fromEventRow(data);
}

export async function updateRemoteIssues(roomId, events, round) {
  if (!supabaseConfigured || !roomId) return null;
  const results = await Promise.all(
    events.map((event) => {
      if (event.remoteId) {
        return supabase.from('round_events').update(toEventRow(roomId, event, round)).eq('id', event.remoteId);
      }
      return supabase.from('round_events').insert(toEventRow(roomId, event, round));
    }),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
  return true;
}

export async function upsertRemoteRoundResult(roomId, result) {
  if (!supabaseConfigured || !roomId || !result?.round) return null;
  const { data, error } = await supabase
    .from('room_round_results')
    .upsert(toRoundResultRow(roomId, result), { onConflict: 'room_id,round' })
    .select()
    .single();
  if (error) throw error;
  return fromRoundResultRow(data);
}

export async function deleteRemoteIssue(roomId, event) {
  if (!supabaseConfigured || !roomId || !event?.remoteId) return null;
  const { error } = await supabase.from('round_events').delete().eq('room_id', roomId).eq('id', event.remoteId);
  if (error) throw error;
  return true;
}

export async function deleteRemoteRoundDraftIssues(roomId, round) {
  if (!supabaseConfigured || !roomId) return null;
  const { error } = await supabase
    .from('round_events')
    .delete()
    .eq('room_id', roomId)
    .eq('round', round)
    .eq('published', false)
    .eq('resolved', false);
  if (error) throw error;
  return true;
}

export async function registerRemotePlayer(roomPin, player) {
  if (!supabaseConfigured || !roomPin || !player?.studentNumber || !player?.name || !player?.passcodeHash) return null;
  const { data, error } = await supabase.rpc('claim_student_seat', {
    p_room_pin: roomPin,
    p_student_number: Number(player.studentNumber),
    p_nickname: player.name,
    p_passcode_hash: player.passcodeHash,
    p_session_token: player.sessionToken ?? '',
    p_team_key: player.teamKey ?? '',
    p_cash: Math.round(player.cash ?? 0),
    p_deposit: Math.round(player.deposit ?? 0),
    p_total_asset: Math.round(player.totalAsset ?? 0),
    p_return_rate: Number(player.returnRate ?? 0),
  });
  if (error) throw error;
  return fromPlayerRow(data);
}

export async function upsertRemotePlayer(roomId, player) {
  if (!supabaseConfigured || !roomId || !player?.name) return null;
  const onConflict = player.studentNumber ? 'room_id,student_number' : 'room_id,nickname';
  const { data, error } = await supabase
    .from('players')
    .upsert(
      {
        room_id: roomId,
        ...(player.authUserId ? { user_id: player.authUserId } : {}),
        student_number: player.studentNumber ? Number(player.studentNumber) : null,
        nickname: player.name,
        ...(player.passcodeHash ? { passcode_hash: player.passcodeHash } : {}),
        ...(player.sessionToken ? { session_token: player.sessionToken } : {}),
        last_seen_at: toIso(player.lastSeenAt ?? Date.now()),
        team_key: player.teamKey ?? '',
        cash: Math.round(player.cash ?? 0),
        deposit: Math.round(player.deposit ?? 0),
        total_asset: Math.round(player.totalAsset ?? 0),
        return_rate: Number(player.returnRate ?? 0),
      },
      { onConflict },
    )
    .select(SAFE_PLAYER_COLUMNS)
    .single();
  if (error) throw error;
  return fromPlayerRow(data);
}

export async function upsertRemoteTeamAccount(roomId, team) {
  if (!supabaseConfigured || !roomId || !team?.key) return null;
  const { data, error } = await supabase
    .from('team_accounts')
    .upsert(toTeamRow(roomId, team), { onConflict: 'room_id,team_key' })
    .select()
    .single();
  if (error) throw error;
  return fromTeamRow(data);
}

export async function upsertRemoteTeamAccounts(roomId, teams) {
  if (!supabaseConfigured || !roomId || !teams?.length) return null;
  const { error } = await supabase
    .from('team_accounts')
    .upsert(teams.map((team) => toTeamRow(roomId, team)), { onConflict: 'room_id,team_key' });
  if (error) throw error;
  return true;
}

export async function fetchRemoteStudentStates(roomId) {
  if (!supabaseConfigured || !roomId) return [];
  const { data, error } = await supabase
    .from('student_states')
    .select(SAFE_STUDENT_STATE_COLUMNS)
    .eq('room_id', roomId)
    .order('updated_at', { ascending: true });
  if (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
  return data.map(fromStudentStateRow);
}

export async function fetchRemoteStudentState(roomId, studentNumber) {
  if (!supabaseConfigured || !roomId || !studentNumber) return null;
  const { data, error } = await supabase
    .from('student_states')
    .select(SAFE_STUDENT_STATE_COLUMNS)
    .eq('room_id', roomId)
    .eq('student_number', Number(studentNumber))
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') return null;
    throw error;
  }
  return data ? fromStudentStateRow(data) : null;
}

export async function upsertRemoteStudentState(roomId, state) {
  if (!supabaseConfigured || !roomId || !state?.studentNumber || !state?.nickname) return null;
  const { data, error } = await supabase
    .from('student_states')
    .upsert(toStudentStateRow(roomId, state), { onConflict: 'room_id,student_number' })
    .select(SAFE_STUDENT_STATE_COLUMNS)
    .single();
  if (error) throw error;
  return fromStudentStateRow(data);
}

export async function fetchRemoteSubmissions(roomId) {
  if (!supabaseConfigured || !roomId) return [];
  const { data, error } = await supabase
    .from('final_submissions')
    .select('*')
    .eq('room_id', roomId)
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  return data.map(fromSubmissionRow);
}

export async function upsertRemoteSubmission(roomId, report) {
  if (!supabaseConfigured || !roomId || !report?.nickname) return null;
  const { data, error } = await supabase
    .from('final_submissions')
    .upsert(
      {
        room_id: roomId,
        ...(report.authUserId ? { user_id: report.authUserId } : {}),
        nickname: report.nickname,
        student_number: report.studentNumber == null ? null : Number(report.studentNumber),
        mode: report.mode ?? 'individual',
        team_key: report.teamKey ?? '',
        team_name: report.teamName ?? '',
        submission_method: report.submissionMethod ?? 'student',
        total_asset: Math.round(report.totalAsset ?? 0),
        cash: Math.round(report.cash ?? 0),
        deposit: Math.round(report.deposit ?? 0),
        deposit_interest_earned: Math.round(report.depositInterestEarned ?? 0),
        invested_principal: Math.round(report.investedPrincipal ?? 100000000),
        cash_like_asset: Math.round(report.cashLikeAsset ?? 0),
        investment_asset: Math.round(report.investmentAsset ?? 0),
        return_rate: Number(report.returnRate ?? 0),
        investor_type: report.investorType ?? '',
        portfolio: report.portfolio ?? [],
        trade_logs: report.tradeLogs ?? [],
        round_logs: report.roundLogs ?? [],
        round_notes: report.roundNotes ?? {},
        round_reflections: report.roundReflections ?? {},
        round_results: report.roundResults ?? [],
        price_index: Number(report.priceIndex ?? 1),
        demand_pull_cumulative: Number(report.demandPullCumulative ?? 0),
        reflection: report.reflection ?? {},
        submitted_at: toIso(report.submittedAt ?? Date.now()),
      },
      { onConflict: 'room_id,nickname' },
    )
    .select()
    .single();
  if (error) throw error;
  return fromSubmissionRow(data);
}

export function groupEventsByRound(events) {
  return events.reduce((acc, event) => {
    const round = event.round ?? 1;
    acc[round] = [...(acc[round] ?? []), event];
    return acc;
  }, {});
}

export function subscribeRemoteRoom(roomId, onChange) {
  if (!supabaseConfigured || !roomId) return () => {};

  const channel = supabase
    .channel(`market-class-room-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assets', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'round_events', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_round_results', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_accounts', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'student_states', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'final_submissions', filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
