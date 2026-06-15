export const classroomRoles = {
  host: 'host',
  projector: 'projector',
  student: 'student',
};

export function getRoomCapacityState({ basePlayerCount, joined, maxPlayers }) {
  const playerCount = basePlayerCount + (joined ? 1 : 0);
  return {
    playerCount,
    roomFull: !joined && playerCount >= maxPlayers,
  };
}

export function buildNewRoomState({
  pin,
  now,
  initialBaseRate,
  assets,
  players,
  initialCash,
  initialAssetId,
}) {
  return {
    roomPin: pin,
    roomCreatedAt: now,
    roomExpired: false,
    round: 1,
    phase: 'setup',
    isPaused: false,
    baseRate: initialBaseRate,
    assets,
    triggeredEventsByRound: {},
    latestRoundSummary: null,
    issueDraft: '',
    newsFeed: [
      {
        id: `opening-${pin}`,
        round: 1,
        title: '새 방 생성',
        detail: '방마다 초기 가격 후보 3개 중 하나가 랜덤으로 배치되었습니다.',
      },
    ],
    players,
    cash: initialCash,
    deposit: 0,
    portfolio: {},
    selectedAssetId: initialAssetId,
    tradeAmount: '10000000',
    depositAmount: '10000000',
    tradeLogs: [],
    roundLogs: [],
    reflection: { good: '', improve: '', next: '' },
  };
}

export function buildRegisteredIssue({ event, issueOption, issueDraft, round, now, defaultProbability }) {
  const issueTitle = issueOption?.title ?? (issueDraft.trim() || event.title);

  return {
    ...event,
    id: `${event.id}-${round}-${now}`,
    templateId: event.id,
    title: issueTitle,
    detail: issueOption?.detail ?? `${issueTitle} (${event.title} 유형)`,
    failureTitle: issueOption?.failureTitle ?? `${issueTitle} 영향 제한`,
    failureDetail: issueOption?.failureDetail ?? '후속 보도에서 이슈의 실제 영향이 크지 않은 것으로 확인됐습니다.',
    probability: event.probability ?? defaultProbability,
  };
}

export function buildTradeLog({ round, type, detail, sequence, now }) {
  return {
    id: `${now}-${type}-${sequence}`,
    round,
    type,
    detail,
  };
}

export function buildRoundLog({ round, now, totalAsset, holdings, events }) {
  return {
    id: `${round}-${now}`,
    round,
    totalAsset,
    holdings,
    events,
  };
}

export function buildStudentSnapshot({ id, name, totalAsset, holdings }) {
  return {
    id,
    name,
    totalAsset,
    holdings,
  };
}
