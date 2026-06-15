import { supabase, supabaseConfigured } from './supabaseClient.js';

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
    history: asset.history ?? [],
    delisted: Boolean(asset.delisted),
    delisted_round: asset.delistedRound ?? null,
    financial_profile: asset.financialProfile ?? asset.financials?.profile ?? null,
    financials: asset.financials ?? {},
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
  return {
    id: row.id,
    remoteId: row.id,
    round: row.round,
    templateId: row.template_id,
    title: row.title,
    detail: row.detail,
    principle: row.principle,
    affectedAssets: row.affected_assets ?? [],
    discussionPrompt: row.discussion_prompt ?? '',
    impact: row.impact ?? {},
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
    name: row.nickname,
    studentNumber: row.student_number ?? null,
    passcodeHash: row.passcode_hash ?? '',
    teamKey: row.team_key ?? '',
    returnRate: Number(row.return_rate ?? 0),
    cash: Number(row.cash ?? 0),
    deposit: Number(row.deposit ?? 0),
    totalAsset: Number(row.total_asset ?? 0),
    holdings: [],
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
    tradeHolder: row.trade_holder ?? null,
    tradeHolderExpiresAt: row.trade_holder_expires_at ? new Date(row.trade_holder_expires_at).getTime() : null,
    negativeRounds: Number(row.negative_rounds ?? 0),
    bankrupt: Boolean(row.bankrupt),
  };
}

function fromSubmissionRow(row) {
  return {
    id: row.id,
    nickname: row.nickname,
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
    reflection: row.reflection ?? {},
    submittedAt: row.submitted_at,
  };
}

async function fetchRoomBundle(query) {
  const { data: room, error: roomError } = await query.single();
  if (roomError) {
    if (roomError.code === 'PGRST116') return null;
    throw roomError;
  }

  const [assetsResult, eventsResult, playersResult, teamsResult] = await Promise.all([
    supabase.from('assets').select('*').eq('room_id', room.id).order('name', { ascending: true }),
    supabase.from('round_events').select('*').eq('room_id', room.id).order('created_at', { ascending: true }),
    supabase.from('players').select('*').eq('room_id', room.id).order('joined_at', { ascending: true }),
    supabase.from('team_accounts').select('*').eq('room_id', room.id).order('team_key', { ascending: true }),
  ]);

  if (assetsResult.error) throw assetsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (playersResult.error) throw playersResult.error;
  if (teamsResult.error && teamsResult.error.code !== '42P01') throw teamsResult.error;

  return {
    room,
    assets: assetsResult.data.map(fromAssetRow),
    events: eventsResult.data.map(fromEventRow),
    players: playersResult.data.map(fromPlayerRow),
    teams: teamsResult.error ? [] : teamsResult.data.map(fromTeamRow),
    submissions: [],
  };
}

export async function createRemoteRoom({ pin, now, baseRate, exchangeRate = 1350, unemploymentRate = 3.5, assets, mode = 'individual', teams = [] }) {
  if (!supabaseConfigured) return null;

  const { data: existing } = await supabase.from('rooms').select('id').eq('pin', pin).maybeSingle();
  if (existing?.id) {
    await supabase.from('rooms').delete().eq('id', existing.id);
  }

  const { data: room, error } = await supabase
    .from('rooms')
    .insert({
      pin,
      current_round: 1,
      phase: 'setup',
      mode,
      game_started: false,
      base_rate: baseRate,
      exchange_rate: exchangeRate,
      unemployment_rate: unemploymentRate,
      is_paused: false,
      created_at: toIso(now),
      expires_at: toIso(now + 24 * 60 * 60 * 1000),
    })
    .select()
    .single();

  if (error) throw error;

  const { error: assetsError } = await supabase.from('assets').insert(assets.map((asset) => toAssetRow(room.id, asset)));
  if (assetsError) throw assetsError;

  if (teams.length) {
    const { error: teamsError } = await supabase.from('team_accounts').upsert(teams.map((team) => toTeamRow(room.id, team)), { onConflict: 'room_id,team_key' });
    if (teamsError) throw teamsError;
  }

  return fetchRemoteRoomById(room.id);
}

export async function fetchRemoteRoomByPin(pin) {
  if (!supabaseConfigured || !/^[0-9]{6}$/.test(pin)) return null;
  return fetchRoomBundle(supabase.from('rooms').select('*').eq('pin', pin));
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
  await Promise.all(
    events.map((event) => {
      if (event.remoteId) {
        return supabase.from('round_events').update(toEventRow(roomId, event, round)).eq('id', event.remoteId);
      }
      return supabase.from('round_events').insert(toEventRow(roomId, event, round));
    }),
  );
  return true;
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

export async function registerRemotePlayer(roomId, player) {
  if (!supabaseConfigured || !roomId || !player?.studentNumber || !player?.name || !player?.passcodeHash) return null;
  const studentNumber = Number(player.studentNumber);
  const { data: existing, error: existingError } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', roomId)
    .eq('student_number', studentNumber)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    if (existing.nickname !== player.name || existing.passcode_hash !== player.passcodeHash) {
      throw new Error('이미 사용 중인 학번입니다. 이름과 개인 비밀번호를 확인하세요.');
    }
    const { data, error } = await supabase
      .from('players')
      .update({ team_key: player.teamKey ?? existing.team_key ?? '' })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return fromPlayerRow(data);
  }

  const { data, error } = await supabase
    .from('players')
    .insert({
      room_id: roomId,
      student_number: studentNumber,
      nickname: player.name,
      passcode_hash: player.passcodeHash,
      team_key: player.teamKey ?? '',
      cash: Math.round(player.cash ?? 0),
      deposit: Math.round(player.deposit ?? 0),
      total_asset: Math.round(player.totalAsset ?? 0),
      return_rate: Number(player.returnRate ?? 0),
    })
    .select()
    .single();
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
        student_number: player.studentNumber ? Number(player.studentNumber) : null,
        nickname: player.name,
        passcode_hash: player.passcodeHash ?? '',
        team_key: player.teamKey ?? '',
        cash: Math.round(player.cash ?? 0),
        deposit: Math.round(player.deposit ?? 0),
        total_asset: Math.round(player.totalAsset ?? 0),
        return_rate: Number(player.returnRate ?? 0),
      },
      { onConflict },
    )
    .select()
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
        nickname: report.nickname,
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_accounts', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'final_submissions', filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
