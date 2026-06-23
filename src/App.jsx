import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BadgePercent,
  BellRing,
  Building2,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  Globe2,
  Landmark,
  LogIn,
  Megaphone,
  Pause,
  PiggyBank,
  Play,
  Radio,
  RotateCcw,
  School,
  Shuffle,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  buildNewRoomState,
  buildRegisteredIssue,
  buildRoundLog,
  buildStudentSnapshot,
  buildTradeLog,
  getRoomCapacityState,
} from './lib/classroomStore.js';
import { supabaseConfigured } from './lib/supabaseClient.js';
import {
  createRemoteRoom,
  deleteRemoteIssue,
  deleteRemoteRoundDraftIssues,
  fetchRemoteActiveRoomByHostId,
  fetchRemoteStudentState,
  fetchRemoteStudentStates,
  fetchRemoteSubmissions,
  fetchRemoteRoomById,
  fetchRemoteRoomByPin,
  groupEventsByRound,
  insertRemoteIssue,
  registerRemotePlayer,
  subscribeRemoteRoom,
  updateRemoteIssues,
  updateRemoteRoom,
  upsertRemoteAssets,
  upsertRemotePlayer,
  upsertRemoteRoundResult,
  upsertRemoteTeamAccount,
  upsertRemoteTeamAccounts,
  upsertRemoteStudentState,
  upsertRemoteSubmission,
} from './lib/supabaseRoomStore.js';

const INITIAL_CASH = 100_000_000;
const ROUND_SALARY = 3_000_000;
const DEFAULT_TOTAL_ROUNDS = 12;
const ROUND_OPTIONS = [4, 12];
const MAX_PLAYERS_PER_ROOM = 40;
const INITIAL_BASE_RATE = 3.5;
const INITIAL_UNEMPLOYMENT_RATE = 3.5;
const MAX_EVENTS_PER_ROUND = 5;
const EVENT_SUCCESS_PROBABILITY = 0.7;
const EXPECTATION_WITHIN_SUCCESS_PROBABILITY = 0.3;
const DEFAULT_EVENT_PROBABILITY = EVENT_SUCCESS_PROBABILITY;
const DELISTING_START_ROUND = 9;
const DELISTING_PROBABILITY = 0.2;
const STRONG_NEGATIVE_IMPACT = -0.07;
const MIN_EVENT_IMPACT = 0.15;
const MIN_REPEATED_EVENT_IMPACT = 0.5;
const MIN_TRIPLE_EVENT_IMPACT = 0.7;
const MIN_EXTREME_EVENT_IMPACT = 0.9;
const DIRECT_REPEATED_IMPACT_THRESHOLD = 0.08;
const MIN_INDIRECT_REPEATED_EVENT_IMPACT = 0.05;
const MAX_INDIRECT_REPEATED_EVENT_IMPACT = 0.12;
const PASSIVE_MARKET_MOVE = 0.05;
// 배당 지급일과 학습 회고 체크포인트는 서로 독립적으로 관리한다.
const DIVIDEND_ROUNDS = [3, 6, 9, 11];
const LEARNING_CHECKPOINT_ROUNDS = [4, 8, 12];

// Week 4 §3.6 — 체크포인트 라운드 학습 질문 (객관식 + 자유 서술)
const REFLECTION_PROMPTS = {
  4: {
    title: 'R4 — 1년 차 점검 (명목 vs 실질)',
    objective: {
      question: '왜 명목 수익률보다 실질 수익률이 낮을까요?',
      options: [
        '물가가 함께 올랐기 때문 (구매력 감소)',
        '예금 금리가 너무 낮아서',
        '환율이 변동했기 때문',
        '거래 수수료가 누적됐기 때문',
      ],
      answerIndex: 0,
      explanation: '물가가 오르면 같은 금액으로 살 수 있는 양이 줄어들어, 명목 수익률에서 인플레이션을 빼야 실제 구매력 증가분(실질 수익률)이 나옵니다.',
    },
    open: {
      label: '한 줄 정리',
      placeholder: '명목/실질 차이를 자기 말로 한 줄 설명해 보세요',
    },
  },
  8: {
    title: 'R8 — 2년 차 점검 (수요견인 인플레이션)',
    objective: {
      question: '이 방의 평균 수익률이 높을 때 물가가 더 빨리 오른 이유로 가장 적절한 것은?',
      options: [
        '사람들 손에 돈이 많아져 물가 압력이 커졌기 때문 (수요견인)',
        '환율이 급락해서 수입품 가격이 올랐기 때문',
        '예금 금리가 올라 저축이 늘었기 때문',
      ],
      answerIndex: 0,
      explanation: '시장 전체 수익률이 높을수록 가처분 자금이 늘어, 같은 상품에 더 많은 돈이 몰려 물가가 가속됩니다. 이를 수요견인 인플레이션이라고 합니다.',
    },
    open: {
      label: '내가 관찰한 점',
      placeholder: '내 수익률과 방 평균, 물가의 관계를 한 줄로 적어 보세요',
    },
  },
  12: {
    title: 'R12 — 3년 차 점검 (장기 자산 배분 회고)',
    objective: null,
    open: {
      label: '다시 시작한다면',
      placeholder: '다시 시작한다면 어떤 자산을 늘리고, 어떤 자산을 줄이겠습니까? 이유도 함께 적어 보세요',
    },
  },
};
const REFLECTION_OPEN_MAX_BYTES = 200; // 자유 서술 200바이트 (한글 약 66자)
const EX_DIVIDEND_RATIO = 0.5;
const DIVIDEND_TIER_RATES = { growth: 0, stable: 0.05, highYield: 0.10 };
const DIVIDEND_TIER_LABELS = { growth: '성장주(배당 없음)', stable: '안정 배당주', highYield: '고배당주' };
const DIVIDEND_TIER_DISTRIBUTION = [
  { tier: 'growth', weight: 0.40 },
  { tier: 'stable', weight: 0.40 },
  { tier: 'highYield', weight: 0.20 },
];
// Week 2 K — 방 생성 난수 시드(경제 체질 / 이슈 강도 / 트리거 민감도)
const SEED_BASE_RATE_RANGE = [3.0, 4.5];
const SEED_UNEMPLOYMENT_RANGE = [3.0, 4.5];
const SEED_EXCHANGE_RATE_RANGE = [1280, 1430];
const SEED_ISSUE_INTENSITY_RANGE = [0.85, 1.15];
const SEED_TRIGGER_SENSITIVITY_RANGE = [0.90, 1.10];
// Week 4 §2.2 — 시드 D · 인플레이션 민감도 (방마다 같은 충격에 물가가 얼마나 더 민감하게 반응하는지)
const SEED_INFLATION_SENSITIVITY_RANGE = [0.80, 1.20];

// Week 4 §2.2 — 물가(인플레이션) 상수
//   매 라운드 종료 시점에 priceIndex 갱신. 분기당 기본 1% + α (수요견인 / 이슈 / 거시) × 시드 D.
//   학습 목표: 명목수익률과 실질수익률의 차이, "다 같이 벌면 물가가 따라온다"는 수요견인 직관 체험.
// Week 4 §2.2 — A안 (연 ~4% 수준): 한국 고물가기와 비슷한 일반 인플레이션 강도
const BASE_INFLATION_RATE = 0.01;      // 분기(1라운드)당 1% 기본 = 연 ~4%
const MIN_INFLATION_FLOOR = 0.003;     // 손실 라운드에도 최소 0.3%/round → 우상향 보장
const DEMAND_PULL_COEF = 0.08;         // 집계수익률 증가분 → 인플레 변환 계수 (직전 대비 +5% 수익이면 +0.4%p 가속)
const INITIAL_PRICE_INDEX = 1.000;
// Week 1 B — 거래 수수료(매수·매도 양쪽) + 매도 시 거래세
const TRADE_FEE_RATE = 0.0025;
const TRADE_TAX_RATE = 0.0018;
// 우량주 vs 중소형주 대립 난수 (PASSIVE 노이즈에 적용)
const PASSIVE_MOVE_LARGE_MULT = 0.7;
const PASSIVE_MOVE_SMALL_MULT = 1.6;
const PASSIVE_MOVE_BOND_MULT = 0.3;
const PASSIVE_MOVE_FOREX_MULT = 0.4;
const PASSIVE_MOVE_GOLD_MULT = 0.6;
// 이슈 impact 에 사이즈 가중치 (호재/악재 진폭도 사이즈 차등)
const SIZE_ISSUE_MULT = { large: 0.8, small: 1.4 };
// 거시지표 임계점 트리거
const MACRO_TRIGGERS = [
  // Week 2 K — sensitivity 적용된 _adj 값이 있으면 우선 사용, 없으면 원본 값 사용 (하위 호환)
  { id: 'emergency-stimulus', when: (m) => (m._adjUnempHigh ?? m.unemploymentRate) > 8.0, metric: '실업률', threshold: '8.0% 초과', valueKey: 'unemploymentRate', unit: '%', cooldown: 3 },
  { id: 'wage-spiral', when: (m) => (m._adjUnempLow ?? m.unemploymentRate) < 2.5, metric: '실업률', threshold: '2.5% 미만', valueKey: 'unemploymentRate', unit: '%', cooldown: 3 },
  { id: 'credit-crunch', when: (m) => (m._adjBaseRateHigh ?? m.baseRate) > 7.0, metric: '기준금리', threshold: '7.0% 초과', valueKey: 'baseRate', unit: '%', cooldown: 4 },
  { id: 'liquidity-flood', when: (m) => (m._adjBaseRateLow ?? m.baseRate) < 1.0, metric: '기준금리', threshold: '1.0% 미만', valueKey: 'baseRate', unit: '%', cooldown: 4 },
  { id: 'fx-intervention', when: (m) => (m._adjExchange ?? m.exchangeRate) > 1600, metric: '원/달러 환율', threshold: '1,600원 초과', valueKey: 'exchangeRate', unit: '원', cooldown: 3 },
  { id: 'realty-cooling-policy', when: (m) => (m._adjProperty ?? m.propertyIndex) > 350000, metric: '부동산지수', threshold: '350,000 초과', valueKey: 'propertyIndex', unit: '', cooldown: 3 },
];
const INITIAL_EXCHANGE_RATE = 1350;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const PLAYER_SESSION_TIMEOUT_MS = 90_000;
const PLAYER_HEARTBEAT_MS = 30_000;
const EMPTY_PORTFOLIO = Object.freeze({});
const HOST_PASSWORD = '72727272';
const HOST_IDS = ['geography', ...Array.from({ length: 20 }, (_, index) => `geography${index + 1}`)];
const TEAM_TRADE_LOCK_MS = 60_000;
const teamTemplates = Array.from({ length: 8 }, (_, index) => ({
  key: `team-${index + 1}`,
  name: `${index + 1}모둠`,
}));

function getAuthorizedHostId(id, password) {
  const normalizedId = id.trim().toLowerCase();
  if (password !== HOST_PASSWORD) return '';
  return HOST_IDS.includes(normalizedId) ? normalizedId : '';
}

function createStudentSessionToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getStudentSessionKey(roomPin, studentNumber) {
  return `market-class-session:${roomPin}:${studentNumber}`;
}

function getStoredStudentSessionToken(roomPin, studentNumber) {
  try {
    return window.localStorage.getItem(getStudentSessionKey(roomPin, studentNumber)) ?? '';
  } catch {
    return '';
  }
}

function storeStudentSessionToken(roomPin, studentNumber, token) {
  try {
    window.localStorage.setItem(getStudentSessionKey(roomPin, studentNumber), token);
  } catch {
    // Storage can be blocked in some browsers; the server-side check still protects remote rooms.
  }
}

function getStudentStateCacheKey(roomScope, studentNumber) {
  return `market-class-state:${roomScope}:${studentNumber}`;
}

function loadCachedStudentState(roomScope, studentNumber) {
  if (!roomScope) return null;
  try {
    const raw = window.localStorage.getItem(getStudentStateCacheKey(roomScope, studentNumber));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cacheStudentState(roomScope, studentNumber, state) {
  if (!roomScope || !state) return;
  try {
    window.localStorage.setItem(getStudentStateCacheKey(roomScope, studentNumber), JSON.stringify(state));
  } catch {
    // Server persistence remains the source of truth when browser storage is unavailable.
  }
}

function getRoundNoteDraftCacheKey(roomScope, studentNumber) {
  return `market-class-note-drafts:${roomScope}:${studentNumber}`;
}

function loadRoundNoteDrafts(roomScope, studentNumber) {
  if (!roomScope || !studentNumber) return {};
  try {
    const raw = window.localStorage.getItem(getRoundNoteDraftCacheKey(roomScope, studentNumber));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function cacheRoundNoteDrafts(roomScope, studentNumber, drafts) {
  if (!roomScope || !studentNumber) return;
  try {
    const key = getRoundNoteDraftCacheKey(roomScope, studentNumber);
    if (Object.keys(drafts ?? {}).length) window.localStorage.setItem(key, JSON.stringify(drafts));
    else window.localStorage.removeItem(key);
  } catch {
    // Draft caching is a convenience; explicit server save remains authoritative.
  }
}

function hasActiveDifferentSession(player, sessionToken) {
  if (!player?.sessionToken || player.sessionToken === sessionToken) return false;
  const lastSeenAt = Number(player.lastSeenAt ?? 0);
  return lastSeenAt && Date.now() - lastSeenAt < PLAYER_SESSION_TIMEOUT_MS;
}

function getPlayerConnectionLabel(player) {
  const lastSeenAt = Number(player?.lastSeenAt ?? 0);
  if (!lastSeenAt) return '접속 확인 대기';
  return Date.now() - lastSeenAt < PLAYER_SESSION_TIMEOUT_MS ? '접속 중' : '재접속 가능';
}

const phaseLabels = {
  setup: '라운드 준비',
  open: '장 진행 중',
  closed: '장 마감',
  ended: '게임 종료',
  expired: '방 만료',
};

const initialTradableAssets = [
  { id: 'neo', type: 'stock', size: 'large', country: '한국', name: '네오모빌리티', sector: '전기차/자율주행', priceOptions: [86_000, 126_000, 168_000], color: '#2563eb' },
  { id: 'core', type: 'stock', size: 'large', country: '미국', name: '코어실리콘', sector: '반도체', priceOptions: [312_000, 482_000, 548_000], color: '#7c3aed' },
  { id: 'eco', type: 'stock', size: 'small', country: '한국', name: '에코에너지', sector: '재생에너지', priceOptions: [48_000, 74_000, 96_000], color: '#059669' },
  { id: 'oil', type: 'stock', size: 'large', country: '한국', name: '글로벌오일', sector: '정유/원자재', priceOptions: [63_000, 93_000, 118_000], color: '#b45309' },
  { id: 'enter', type: 'stock', size: 'small', country: '미국', name: '유니버스엔터', sector: '미디어/콘텐츠', priceOptions: [38_000, 58_000, 82_000], color: '#db2777' },
  { id: 'food', type: 'stock', size: 'small', country: '한국', name: '미래푸드', sector: '식품/바이오소재', priceOptions: [18_500, 31_500, 46_000], color: '#16a34a' },
  { id: 'air', type: 'stock', size: 'small', country: '한국', name: '스카이항공', sector: '항공/여행', priceOptions: [9_800, 18_200, 27_500], color: '#0891b2' },
  { id: 'bank', type: 'stock', size: 'large', country: '한국', name: '대한은행', sector: '금융', priceOptions: [37_000, 51_000, 68_000], color: '#475569' },
  { id: 'medi', type: 'stock', size: 'large', country: '미국', name: '메디케어', sector: '헬스케어', priceOptions: [142_000, 211_000, 286_000], color: '#0d9488' },
  { id: 'infra', type: 'stock', size: 'small', country: '한국', name: '한빛인프라', sector: '건설/인프라', priceOptions: [5_400, 8_700, 13_800], color: '#ea580c' },
  { id: 'dogemars', type: 'stock', size: 'large', country: '미국', name: '도지인마스', sector: 'AI/우주 반도체', priceOptions: [92_000, 154_000, 238_000], color: '#9333ea' },
  { id: 'riverbank', type: 'stock', size: 'small', country: '한국', name: '한강은행', sector: '금융', priceOptions: [24_000, 39_000, 57_000], color: '#64748b' },
  { id: 'oceanair', type: 'stock', size: 'small', country: '한국', name: '오션항공', sector: '항공/물류', priceOptions: [7_600, 14_400, 22_800], color: '#0284c7' },
  { id: 'purefood', type: 'stock', size: 'small', country: '한국', name: '바른푸드', sector: '식품/농산물', priceOptions: [14_500, 24_500, 38_000], color: '#65a30d' },
  { id: 'metroinfra', type: 'stock', size: 'small', country: '한국', name: '메트로인프라', sector: '건설/인프라', priceOptions: [6_200, 11_600, 19_500], color: '#c2410c' },
  { id: 'bio', type: 'stock', size: 'small', country: '한국', name: '제노믹스바이오', sector: '바이오/신약', priceOptions: [12_500, 24_000, 41_000], color: '#a21caf' },
  { id: 'sp500', type: 'etf', country: '미국', name: 'S&P 500 ETF', sector: '미국 대표지수', priceOptions: [48_000, 62_000, 76_000], color: '#1d4ed8' },
  { id: 'kospi', type: 'etf', country: '한국', name: 'KOSPI 200 ETF', sector: '한국 대표지수', priceOptions: [27_500, 34_500, 42_000], color: '#0f766e' },
  { id: 'realty', type: 'property', country: '한국', name: '도시부동산지수 추종 ETF', sector: '주거/상업 부동산 지수', priceOptions: [180_000, 250_000, 320_000], color: '#a16207' },
  { id: 'oilFut', type: 'futures', country: '글로벌', name: '글로벌 원유 선물', sector: '에너지 원자재', priceOptions: [71_000, 88_000, 104_000], color: '#92400e' },
  { id: 'grainFut', type: 'futures', country: '글로벌', name: '글로벌 곡물 선물', sector: '식량 원자재', priceOptions: [31_000, 45_000, 59_000], color: '#ca8a04' },
  { id: 'goldFut', type: 'futures', country: '글로벌', name: '글로벌 금 선물', sector: '귀금속 안전자산', priceOptions: [78_000, 96_000, 118_000], color: '#d4a017' },
  { id: 'usdKrw', type: 'forex', country: '글로벌', name: '원/달러 환율 추종 ETN', sector: '외환 파생', priceOptions: [12_800, 13_500, 14_200], color: '#7c2d12' },
  { id: 'usBond', type: 'bond', country: '미국', name: '미국 10년 국채', sector: '선진국 국채', priceOptions: [91_000, 100_000, 108_000], color: '#334155', faceValue: 100_000, couponRate: 0.012 },
  { id: 'argBond', type: 'bond', country: '아르헨티나', name: '아르헨티나 국채', sector: '고위험 신흥국 국채', priceOptions: [64_000, 92_000, 115_000], color: '#be123c', faceValue: 100_000, couponRate: 0.040 },
];

// 채권 라운드별 단리 이자 계산
// portfolio: { [assetId]: shares }, assets: 자산 배열
// 반환: { totalInterest, breakdown: [{assetId, name, shares, faceValue, rate, interest}] }
function computeBondInterest(portfolio, assets) {
  if (!portfolio || !assets) return { totalInterest: 0, breakdown: [] };
  const breakdown = [];
  let totalInterest = 0;
  for (const asset of assets) {
    if (asset.type !== 'bond') continue;
    if (!asset.couponRate || !asset.faceValue) continue;
    const shares = portfolio[asset.id] ?? 0;
    if (shares <= 0) continue;
    const interest = Math.round(shares * asset.faceValue * asset.couponRate);
    if (interest <= 0) continue;
    totalInterest += interest;
    breakdown.push({
      assetId: asset.id,
      name: asset.name,
      shares,
      faceValue: asset.faceValue,
      rate: asset.couponRate,
      interest,
    });
  }
  return { totalInterest, breakdown };
}

const financialProfileVariants = [
  { key: 'stable', label: '재무 안정형', revenue: 0.96, margin: 1.08, debt: 0.72, cash: 1.28, rd: 0.92, credit: 0.78 },
  { key: 'growth', label: '성장 투자형', revenue: 1.12, margin: 0.92, debt: 1.05, cash: 0.92, rd: 1.34, credit: 1.05 },
  { key: 'leveraged', label: '고부채 확장형', revenue: 1.05, margin: 0.86, debt: 1.45, cash: 0.72, rd: 1.02, credit: 1.32 },
];

const financialBaseByAsset = {
  neo: { revenue: 3.2, margin: 6.8, debt: 118, cash: 0.58, rd: 14, exportRatio: 42, commodityExposure: 72, laborSensitivity: 42, cyclicality: 72, policySensitivity: 62, creditRisk: 48 },
  core: { revenue: 18.6, margin: 24.5, debt: 54, cash: 4.8, rd: 21, exportRatio: 68, commodityExposure: 42, laborSensitivity: 24, cyclicality: 58, policySensitivity: 72, creditRisk: 32 },
  eco: { revenue: 1.8, margin: 5.4, debt: 132, cash: 0.31, rd: 9, exportRatio: 37, commodityExposure: 78, laborSensitivity: 38, cyclicality: 66, policySensitivity: 82, creditRisk: 55 },
  oil: { revenue: 9.7, margin: 7.1, debt: 86, cash: 1.2, rd: 3, exportRatio: 31, commodityExposure: 92, laborSensitivity: 28, cyclicality: 72, policySensitivity: 48, creditRisk: 42 },
  enter: { revenue: 5.4, margin: 11.2, debt: 72, cash: 0.94, rd: 6, exportRatio: 55, commodityExposure: 18, laborSensitivity: 38, cyclicality: 64, policySensitivity: 58, creditRisk: 38 },
  food: { revenue: 2.6, margin: 4.9, debt: 95, cash: 0.42, rd: 5, exportRatio: 24, commodityExposure: 82, laborSensitivity: 44, cyclicality: 38, policySensitivity: 44, creditRisk: 42 },
  air: { revenue: 1.4, margin: 3.2, debt: 214, cash: 0.26, rd: 1, exportRatio: 18, commodityExposure: 88, laborSensitivity: 66, cyclicality: 86, policySensitivity: 50, creditRisk: 78 },
  bank: { revenue: 7.8, margin: 18.1, debt: 135, cash: 2.1, rd: 2, exportRatio: 6, commodityExposure: 8, laborSensitivity: 36, cyclicality: 52, policySensitivity: 74, creditRisk: 44 },
  medi: { revenue: 8.1, margin: 16.7, debt: 61, cash: 1.7, rd: 18, exportRatio: 49, commodityExposure: 16, laborSensitivity: 30, cyclicality: 28, policySensitivity: 70, creditRisk: 30 },
  infra: { revenue: 3.9, margin: 5.9, debt: 156, cash: 0.63, rd: 2, exportRatio: 11, commodityExposure: 76, laborSensitivity: 58, cyclicality: 82, policySensitivity: 76, creditRisk: 62 },
  dogemars: { revenue: 6.8, margin: 13.6, debt: 96, cash: 1.36, rd: 24, exportRatio: 72, commodityExposure: 48, laborSensitivity: 24, cyclicality: 78, policySensitivity: 84, creditRisk: 46 },
  riverbank: { revenue: 4.2, margin: 13.8, debt: 104, cash: 1.4, rd: 3, exportRatio: 4, commodityExposure: 6, laborSensitivity: 34, cyclicality: 58, policySensitivity: 78, creditRisk: 36 },
  oceanair: { revenue: 1.1, margin: 2.7, debt: 246, cash: 0.18, rd: 1, exportRatio: 22, commodityExposure: 91, laborSensitivity: 72, cyclicality: 88, policySensitivity: 52, creditRisk: 84 },
  purefood: { revenue: 1.9, margin: 6.2, debt: 64, cash: 0.52, rd: 6, exportRatio: 18, commodityExposure: 68, laborSensitivity: 42, cyclicality: 34, policySensitivity: 46, creditRisk: 28 },
  metroinfra: { revenue: 2.8, margin: 4.8, debt: 188, cash: 0.34, rd: 2, exportRatio: 8, commodityExposure: 84, laborSensitivity: 64, cyclicality: 86, policySensitivity: 82, creditRisk: 70 },
};

// Week 2 E — 가중확률로 주식 배당 티어 추첨 (성장 40% / 안정 40% / 고배당 20%)
function pickDividendTier() {
  const r = Math.random();
  let acc = 0;
  for (const entry of DIVIDEND_TIER_DISTRIBUTION) {
    acc += entry.weight;
    if (r < acc) return entry.tier;
  }
  return DIVIDEND_TIER_DISTRIBUTION[DIVIDEND_TIER_DISTRIBUTION.length - 1].tier;
}

function createRandomizedAssets() {
  return initialTradableAssets.map((asset) => {
    const price = asset.priceOptions[Math.floor(Math.random() * asset.priceOptions.length)];
    const financials = createInitialFinancials(asset);
    // Week 2 E — 주식 자산에 한해 방 생성 시 배당 티어 난수 부여
    // Week 4 §2.5 — 배당율도 ±1%p 난수를 더해 같은 안정주여도 방마다 4~6%, 같은 고배당주여도 9~11% 사이에서 갈리도록 함.
    //   성장주(0%)는 변동 없이 0 유지. 학습자가 상세 수치 없이도 '성향' 차이를 체감하도록 미세한 분산을 둠.
    const dividendTier = asset.type === 'stock' ? pickDividendTier() : null;
    let dividendRate = 0;
    if (dividendTier === 'stable' || dividendTier === 'highYield') {
      const base = DIVIDEND_TIER_RATES[dividendTier]; // 0.05 또는 0.10
      const jitter = (Math.random() * 2 - 1) * 0.01;  // -0.01 ~ +0.01
      dividendRate = Math.max(0, Math.round((base + jitter) * 10000) / 10000);
    }
    return {
      ...asset,
      price,
      history: [price, price, price],
      financialProfile: financials?.profile ?? null,
      financials,
      negativeStreak: 0,
      dividendTier,
      dividendRate,
    };
  });
}

// Week 2 K — 방 생성 시 3가지 난수 시드 생성 + 표시용 짧은 코드
function createEconomicSeed() {
  const baseRate = Number((SEED_BASE_RATE_RANGE[0] + Math.random() * (SEED_BASE_RATE_RANGE[1] - SEED_BASE_RATE_RANGE[0])).toFixed(2));
  const unemploymentRate = Number((SEED_UNEMPLOYMENT_RANGE[0] + Math.random() * (SEED_UNEMPLOYMENT_RANGE[1] - SEED_UNEMPLOYMENT_RANGE[0])).toFixed(2));
  const exchangeRate = Math.round(SEED_EXCHANGE_RATE_RANGE[0] + Math.random() * (SEED_EXCHANGE_RATE_RANGE[1] - SEED_EXCHANGE_RATE_RANGE[0]));
  const issueIntensity = Number((SEED_ISSUE_INTENSITY_RANGE[0] + Math.random() * (SEED_ISSUE_INTENSITY_RANGE[1] - SEED_ISSUE_INTENSITY_RANGE[0])).toFixed(3));
  const triggerSensitivity = Number((SEED_TRIGGER_SENSITIVITY_RANGE[0] + Math.random() * (SEED_TRIGGER_SENSITIVITY_RANGE[1] - SEED_TRIGGER_SENSITIVITY_RANGE[0])).toFixed(3));
  // Week 4 §2.2 — 시드 D · 인플레이션 민감도 (0.8 ~ 1.2)
  const inflationSensitivity = Number((SEED_INFLATION_SENSITIVITY_RANGE[0] + Math.random() * (SEED_INFLATION_SENSITIVITY_RANGE[1] - SEED_INFLATION_SENSITIVITY_RANGE[0])).toFixed(3));
  // 4자리 16진수 + 하이픈 + 1자리 (시드 D 식별) — 호스트 화면 표시용
  const baseHex = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  const inflationHex = Math.floor(Math.random() * 0xF).toString(16).toUpperCase();
  const code = `${baseHex}-${inflationHex}`;
  return {
    code,
    economicConstitution: { baseRate, unemploymentRate, exchangeRate },
    issueIntensity,
    triggerSensitivity,
    inflationSensitivity,
  };
}

// Week 2 K — 시드 적용된 트리거 임계점 (민감도가 높을수록 더 빨리 발동)
function applyTriggerSensitivity(macroSnapshot, sensitivity) {
  // sensitivity > 1 이면 임계점에 더 빨리 닿도록 지표를 약간 부풀려서 비교
  const factor = sensitivity ?? 1;
  return {
    baseRate: macroSnapshot.baseRate,
    propertyIndex: macroSnapshot.propertyIndex,
    exchangeRate: macroSnapshot.exchangeRate,
    unemploymentRate: macroSnapshot.unemploymentRate,
    // 비교용 sensitivity 적용 값 (트리거 when() 에서 사용)
    _adjBaseRateHigh: macroSnapshot.baseRate * factor,
    _adjBaseRateLow: macroSnapshot.baseRate / factor,
    _adjUnempHigh: macroSnapshot.unemploymentRate * factor,
    _adjUnempLow: macroSnapshot.unemploymentRate / factor,
    _adjExchange: macroSnapshot.exchangeRate * factor,
    _adjProperty: macroSnapshot.propertyIndex * factor,
  };
}

function getPortfolioShares(portfolio, assetId) {
  const holding = portfolio?.[assetId];
  if (typeof holding === 'number') return holding;
  return Number(holding?.shares ?? 0);
}

// 배당일 라운드 마감 시점에 보유한 주식 수량을 기준으로 배당을 계산한다.
function computeDividendPayout(currentPortfolio, assets, currentRound) {
  const result = { totalDividend: 0, exDividendByAsset: {}, breakdown: [] };
  if (!DIVIDEND_ROUNDS.includes(currentRound)) return result;
  for (const asset of assets) {
    if (asset.type !== 'stock' || asset.delisted) continue;
    const shares = getPortfolioShares(currentPortfolio, asset.id);
    if (shares <= 0) continue;
    const rate = asset.dividendRate ?? 0;
    if (rate <= 0) continue;
    const dividendPerShare = Math.round(asset.price * rate);
    const totalDividend = Math.round(dividendPerShare * shares);
    if (totalDividend <= 0) continue;
    const exDividendDrop = Math.round(dividendPerShare * EX_DIVIDEND_RATIO);
    result.totalDividend += totalDividend;
    result.exDividendByAsset[asset.id] = exDividendDrop;
    result.breakdown.push({
      id: asset.id,
      name: asset.name,
      shares,
      tier: asset.dividendTier,
      rate,
      dividendPerShare,
      totalDividend,
      exDividendDrop,
    });
  }
  return result;
}

function formatDividendShares(shares) {
  return Number(shares).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}

function buildDividendLogs(breakdown, currentRound, existingLogs = []) {
  return breakdown.map((entry, index) => buildTradeLog({
    round: currentRound,
    type: '배당 지급',
    detail: `${currentRound}라운드 ${entry.name} · 마감 보유 ${formatDividendShares(entry.shares)}주 · ${DIVIDEND_TIER_LABELS[entry.tier]} · 배당 +${formatWon(entry.totalDividend)} · 배당락 -${formatWon(entry.exDividendDrop)}/주`,
    sequence: existingLogs.length + index,
    now: Date.now(),
  }));
}

function mergeExDividendDrops(target, source) {
  for (const [assetId, drop] of Object.entries(source)) {
    target[assetId] = Math.max(target[assetId] ?? 0, drop);
  }
  return target;
}

// Week 2 E — 배당락을 자산 가격에 적용 + 히스토리 마지막 값도 동기화
function applyExDividendDrop(assets, exDividendByAsset) {
  const ids = Object.keys(exDividendByAsset);
  if (ids.length === 0) return assets;
  return assets.map((asset) => {
    const drop = exDividendByAsset[asset.id];
    if (!drop) return asset;
    const nextPrice = Math.max(1000, Math.round((asset.price - drop) / 100) * 100);
    const nextHistory = asset.history.slice(0, -1).concat([nextPrice]);
    return { ...asset, price: nextPrice, history: nextHistory };
  });
}

function getInitialPropertyIndexFromAssets(assets) {
  return assets.find((asset) => asset.type === 'property')?.price ?? 250_000;
}

function createInitialAssetBundle() {
  const assets = createRandomizedAssets();
  return {
    assets,
    propertyIndex: getInitialPropertyIndexFromAssets(assets),
  };
}

const assetTypeLabels = {
  stock: '주식',
  etf: 'ETF',
  property: '부동산 ETF',
  futures: '선물',
  bond: '채권',
  forex: '외환',
};

const assetTypeFilterOptions = [
  { key: 'all', label: '전체' },
  { key: 'domestic-stock', label: '국내 주식' },
  { key: 'overseas-stock', label: '해외 주식' },
  { key: 'etf', label: 'ETF' },
  { key: 'bond', label: '채권' },
  { key: 'futures', label: '선물' },
  { key: 'property', label: '부동산' },
  { key: 'forex', label: '외환' },
];

const assetSortOptions = [
  { key: 'default', label: '기본 순서' },
  { key: 'gain', label: '상승률 높은 순' },
  { key: 'loss', label: '하락률 큰 순' },
  { key: 'type', label: '상품 종류순' },
  { key: 'theme', label: '테마순' },
];

const assetThemeOptions = [
  { key: 'all', label: '전체 테마', assetIds: null },
  { key: 'growthTech', label: '기술·성장주', assetIds: ['core', 'dogemars', 'neo', 'sp500', 'bio', 'eco'] },
  { key: 'rateSensitive', label: '금리 민감', assetIds: ['bank', 'riverbank', 'realty', 'infra', 'metroinfra', 'usBond', 'kospi'] },
  { key: 'commodityInflation', label: '원자재·인플레이션', assetIds: ['oil', 'oilFut', 'grainFut', 'goldFut', 'food', 'purefood'] },
  { key: 'fxGlobal', label: '환율·글로벌', assetIds: ['usdKrw', 'sp500', 'core', 'dogemars', 'enter', 'medi', 'argBond'] },
  { key: 'cyclical', label: '경기민감·소비/여행', assetIds: ['air', 'oceanair', 'enter', 'infra', 'metroinfra', 'kospi'] },
  { key: 'defensive', label: '방어·안전자산', assetIds: ['usBond', 'goldFut', 'food', 'purefood', 'medi', 'bank'] },
  { key: 'highVolatility', label: '고위험·고변동성', assetIds: ['argBond', 'oilFut', 'grainFut', 'dogemars', 'bio', 'eco'] },
];

const assetTypeOrder = {
  stock: 1,
  etf: 2,
  property: 3,
  futures: 4,
  forex: 5,
  bond: 6,
};

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomRange(min, max, decimals = 2) {
  return Number((min + Math.random() * (max - min)).toFixed(decimals));
}

function createInitialFinancials(asset) {
  if (asset.type !== 'stock') return null;
  const base = financialBaseByAsset[asset.id] ?? {
    revenue: 2.5,
    margin: 6,
    debt: 100,
    cash: 0.4,
    rd: 5,
    exportRatio: 25,
    commodityExposure: 45,
    laborSensitivity: 45,
    cyclicality: 55,
    policySensitivity: 50,
    creditRisk: 45,
  };
  const variant = financialProfileVariants[Math.floor(Math.random() * financialProfileVariants.length)];
  const revenue = clampNumber(base.revenue * variant.revenue * randomRange(0.92, 1.08), 0.3, 30);
  const operatingMargin = clampNumber(base.margin * variant.margin + randomRange(-1.1, 1.1, 1), -4, 35);
  const debtRatio = clampNumber(base.debt * variant.debt + randomRange(-12, 12, 1), 15, 320);
  const cashReserve = clampNumber(base.cash * variant.cash * randomRange(0.86, 1.14), 0.05, 8);
  const rdRatio = clampNumber(base.rd * variant.rd + randomRange(-1.2, 1.2, 1), 0.5, 32);
  const creditRisk = clampNumber(base.creditRisk * variant.credit + randomRange(-5, 5, 1), 5, 95);

  return {
    profile: variant.label,
    revenue: Number(revenue.toFixed(2)),
    operatingMargin: Number(operatingMargin.toFixed(1)),
    debtRatio: Math.round(debtRatio),
    cashReserve: Number(cashReserve.toFixed(2)),
    rdRatio: Number(rdRatio.toFixed(1)),
    exportRatio: Math.round(clampNumber(base.exportRatio + randomRange(-7, 7, 1), 0, 95)),
    commodityExposure: Math.round(clampNumber(base.commodityExposure + randomRange(-8, 8, 1), 0, 100)),
    laborSensitivity: Math.round(clampNumber(base.laborSensitivity + randomRange(-7, 7, 1), 0, 100)),
    cyclicality: Math.round(clampNumber(base.cyclicality + randomRange(-8, 8, 1), 0, 100)),
    policySensitivity: Math.round(clampNumber(base.policySensitivity + randomRange(-7, 7, 1), 0, 100)),
    creditRisk: Math.round(creditRisk),
  };
}

function formatTrillion(value) {
  if (value >= 1) return `${value.toFixed(1)}조 원`;
  return `${Math.round(value * 10000).toLocaleString('ko-KR')}억 원`;
}

function exposureLabel(value) {
  if (value >= 75) return '매우 높음';
  if (value >= 55) return '높음';
  if (value >= 35) return '보통';
  return '낮음';
}

function getFinancialSignals(financials) {
  const stability = financials.debtRatio <= 80 && financials.cashReserve / Math.max(financials.revenue, 0.1) >= 0.18
    ? '높음'
    : financials.debtRatio >= 170 || financials.creditRisk >= 70
      ? '낮음'
      : '보통';
  const growth = financials.rdRatio >= 14 || financials.operatingMargin >= 13 ? '높음' : financials.rdRatio <= 3 && financials.operatingMargin <= 4 ? '낮음' : '보통';
  const volatility = financials.cyclicality >= 75 || financials.commodityExposure >= 75 || financials.debtRatio >= 170
    ? '높음'
    : financials.cyclicality <= 35 && financials.debtRatio <= 80
      ? '낮음'
      : '보통';

  return { stability, growth, volatility };
}

function buildFinancialMetrics(asset) {
  if (!asset.financials) return null;
  const financials = asset.financials;
  return [
    ['재무 유형', financials.profile],
    ['매출', formatTrillion(financials.revenue)],
    ['영업이익률', `${financials.operatingMargin.toFixed(1)}%`],
    ['부채비율', `${financials.debtRatio}%`],
    ['현금보유', formatTrillion(financials.cashReserve)],
    ['R&D 비중', `${financials.rdRatio.toFixed(1)}%`],
    ['수출비중', `${financials.exportRatio}%`],
    ['원자재 의존도', exposureLabel(financials.commodityExposure)],
  ];
}

const assetLearningProfiles = {
  neo: {
    story: '도심 전기차와 자율주행 셔틀을 만드는 한국 모빌리티 기업입니다. 2016년 배터리 교체형 소형 전기차로 시작해 물류 로봇과 자율주행 소프트웨어까지 사업을 넓혔습니다.',
    metrics: [['매출', '3.2조 원'], ['영업이익률', '6.8%'], ['부채비율', '118%'], ['현금보유', '5,800억 원'], ['R&D 비중', '14%'], ['수출비중', '42%'], ['원자재 의존도', '높음']],
    signals: { stability: '보통', growth: '높음', volatility: '높음' },
    riskTags: ['성장주', '원자재민감', '환율민감', '기술규제민감'],
    sensitivity: ['희토류·배터리 소재 이슈', '환율 변화', '금리 변화', '기술 규제'],
    prompt: '성장성이 높지만 원자재 의존도가 높은 기업은 어떤 이슈에서 변동 가능성이 커질까요?',
  },
  core: {
    story: 'AI 서버용 반도체와 차량용 칩을 설계하는 미국 기술 기업입니다. 2008년 데이터센터 칩 설계사로 출발했고, 최근에는 AI 가속기 매출 비중이 커졌습니다.',
    metrics: [['매출', '18.6조 원'], ['영업이익률', '24.5%'], ['부채비율', '54%'], ['현금보유', '4.8조 원'], ['R&D 비중', '21%'], ['수출비중', '68%'], ['원자재 의존도', '보통']],
    signals: { stability: '높음', growth: '높음', volatility: '높음' },
    riskTags: ['기술성장주', '수출민감', '정책민감', 'AI투자민감'],
    sensitivity: ['미국 기술 규제', '반도체 수출 규정', 'AI 투자 확대', '환율 변화'],
    prompt: 'R&D 비중이 높은 기술 기업은 규제와 투자 뉴스에 왜 민감할까요?',
  },
  eco: {
    story: '태양광 부품과 에너지 저장장치를 생산하는 한국 재생에너지 기업입니다. 2012년 소형 태양광 모듈 업체로 시작해 산업용 ESS 시장으로 확장했습니다.',
    metrics: [['매출', '1.8조 원'], ['영업이익률', '5.4%'], ['부채비율', '132%'], ['현금보유', '3,100억 원'], ['R&D 비중', '9%'], ['수출비중', '37%'], ['원자재 의존도', '높음']],
    signals: { stability: '보통', growth: '높음', volatility: '높음' },
    riskTags: ['정책민감', '원자재민감', '금리민감', '친환경테마'],
    sensitivity: ['정부 보조금', '희토류·금속 가격', '금리 변화', '에너지 가격'],
    prompt: '친환경 기업이 정부 정책과 금리에 동시에 민감한 이유는 무엇일까요?',
  },
  oil: {
    story: '정유, 윤활유, 석유화학 원료를 다루는 한국 에너지 기업입니다. 항만 저장시설을 기반으로 성장했고 원유 가격과 정제마진 변화에 민감합니다.',
    metrics: [['매출', '9.7조 원'], ['영업이익률', '7.1%'], ['부채비율', '86%'], ['현금보유', '1.2조 원'], ['R&D 비중', '3%'], ['수출비중', '31%'], ['원자재 의존도', '매우 높음']],
    signals: { stability: '보통', growth: '보통', volatility: '높음' },
    riskTags: ['원유민감', '물가민감', '환율민감', '경기민감'],
    sensitivity: ['산유국 감산', '중동 긴장', '원유 재고', '달러 강세'],
    prompt: '원유를 사서 정제하는 기업은 원유 가격 변화가 항상 같은 방향으로 유리할까요?',
  },
  enter: {
    story: '글로벌 팬덤 플랫폼과 영상 콘텐츠를 운영하는 미국 엔터테인먼트 기업입니다. 스트리밍과 공연 IP를 결합해 성장했지만 소비심리와 광고 경기에 영향을 받습니다.',
    metrics: [['매출', '5.4조 원'], ['영업이익률', '11.2%'], ['부채비율', '72%'], ['현금보유', '9,400억 원'], ['R&D 비중', '6%'], ['수출비중', '55%'], ['원자재 의존도', '낮음']],
    signals: { stability: '보통', growth: '높음', volatility: '보통' },
    riskTags: ['소비심리민감', '광고민감', '미국기술규제', '환율민감'],
    sensitivity: ['소비 둔화', '미국 기술 규제', '광고 경기', '환율 변화'],
    prompt: '콘텐츠 기업은 공장보다 팬덤과 광고 경기에 더 민감할 수 있는 이유가 무엇일까요?',
  },
  food: {
    story: '대체 단백질과 가공식품을 만드는 한국 식품 기업입니다. 1998년 냉동식품 회사로 시작해 곡물 기반 간편식과 바이오 소재로 사업을 넓혔습니다.',
    metrics: [['매출', '2.6조 원'], ['영업이익률', '4.9%'], ['부채비율', '95%'], ['현금보유', '4,200억 원'], ['R&D 비중', '5%'], ['수출비중', '24%'], ['원자재 의존도', '높음']],
    signals: { stability: '보통', growth: '보통', volatility: '보통' },
    riskTags: ['곡물민감', '물가민감', '소비심리민감', '환율민감'],
    sensitivity: ['곡물 가격', '비료 가격', '원유 가격', '소비 심리'],
    prompt: '식품 기업은 매출이 안정적이어도 원재료 가격에 왜 흔들릴 수 있을까요?',
  },
  air: {
    story: '국내선과 동아시아 노선을 운영하는 한국 항공사입니다. 저비용 항공으로 출발해 화물 노선까지 확장했지만 유류비와 여행 수요에 민감합니다.',
    metrics: [['매출', '1.4조 원'], ['영업이익률', '3.2%'], ['부채비율', '214%'], ['현금보유', '2,600억 원'], ['R&D 비중', '1%'], ['수출비중', '18%'], ['원자재 의존도', '매우 높음']],
    signals: { stability: '낮음', growth: '보통', volatility: '높음' },
    riskTags: ['고부채', '유가민감', '환율민감', '여행수요민감'],
    sensitivity: ['원유 가격', '환율 급등', '경기 둔화', '여행 수요'],
    prompt: '항공사는 왜 유가와 환율, 부채비율을 함께 봐야 할까요?',
  },
  bank: {
    story: '가계대출과 기업금융을 주력으로 하는 한국 상업은행입니다. 1970년 지역은행으로 출발해 디지털 대출과 자산관리로 확장했습니다.',
    metrics: [['매출', '7.8조 원'], ['영업이익률', '18.1%'], ['부채비율', '은행업 특성상 높음'], ['현금보유', '유동성 높음'], ['R&D 비중', '2%'], ['수출비중', '낮음'], ['원자재 의존도', '낮음']],
    signals: { stability: '높음', growth: '보통', volatility: '보통' },
    riskTags: ['금리민감', '부동산민감', '신용위험민감', '경기민감'],
    sensitivity: ['기준금리', '부동산 경기', '가계대출', '신용위험'],
    prompt: '은행은 금리가 오를 때 항상 유리할까요, 아니면 대출 부실 위험도 같이 커질까요?',
  },
  medi: {
    story: '만성질환 치료제와 원격진료 솔루션을 가진 미국 헬스케어 기업입니다. 2003년 의료기기 회사로 시작해 바이오 의약품과 데이터 기반 진료로 확장했습니다.',
    metrics: [['매출', '8.1조 원'], ['영업이익률', '16.7%'], ['부채비율', '61%'], ['현금보유', '1.7조 원'], ['R&D 비중', '18%'], ['수출비중', '49%'], ['원자재 의존도', '낮음']],
    signals: { stability: '높음', growth: '보통', volatility: '보통' },
    riskTags: ['규제민감', 'R&D민감', '방어주', '미국정책민감'],
    sensitivity: ['의료 규제', '임상 결과', '미국 정책', '기술 규제'],
    prompt: '헬스케어 기업은 경기보다 규제와 연구개발 뉴스에 더 민감할 수 있는 이유가 무엇일까요?',
  },
  infra: {
    story: '도로, 철도, 데이터센터 기반 시설을 짓는 한국 인프라 기업입니다. 공공공사에서 시작해 민간 데이터센터 시공으로 사업을 확장했습니다.',
    metrics: [['매출', '3.9조 원'], ['영업이익률', '5.9%'], ['부채비율', '156%'], ['현금보유', '6,300억 원'], ['R&D 비중', '2%'], ['수출비중', '11%'], ['원자재 의존도', '높음']],
    signals: { stability: '보통', growth: '보통', volatility: '높음' },
    riskTags: ['정책민감', '고부채', '원자재민감', '부동산민감'],
    sensitivity: ['인프라 예산', '금리 변화', '철강·시멘트 가격', '부동산 정책'],
    prompt: '건설 기업은 수주가 늘어도 금리와 원자재 가격을 함께 봐야 하는 이유가 무엇일까요?',
  },
  dogemars: {
    story: 'AI 서버용 칩과 우주 통신 장비를 함께 설계하는 미국 기술 기업입니다. 2014년 위성 데이터 처리 칩 회사로 출발해 AI 가속기와 저궤도 통신 반도체로 사업을 넓혔습니다.',
    metrics: [['매출', '6.8조 원'], ['영업이익률', '13.6%'], ['부채비율', '96%'], ['현금보유', '1.4조 원'], ['R&D 비중', '24%'], ['수출비중', '72%'], ['원자재 의존도', '보통']],
    signals: { stability: '보통', growth: '높음', volatility: '높음' },
    riskTags: ['기술성장주', 'AI투자민감', '미국규제민감', '희토류민감'],
    sensitivity: ['AI 투자 확대', '미국 기술 규제', '희토류 공급', '미국 국채금리'],
    prompt: '기술주가 좋은 실적 기대에도 금리와 규제 뉴스에 크게 흔들리는 이유는 무엇일까요?',
  },
  riverbank: {
    story: '중소기업 대출과 디지털 예금을 주력으로 하는 한국 은행입니다. 지역 기업금융에서 출발해 모바일 예금과 소상공인 대출 플랫폼으로 성장했습니다.',
    metrics: [['매출', '4.2조 원'], ['영업이익률', '13.8%'], ['부채비율', '은행업 특성상 높음'], ['현금보유', '유동성 높음'], ['R&D 비중', '3%'], ['수출비중', '낮음'], ['원자재 의존도', '낮음']],
    signals: { stability: '높음', growth: '보통', volatility: '보통' },
    riskTags: ['금리민감', '예금경쟁민감', '신용위험민감', '부동산민감'],
    sensitivity: ['기준금리', '예금 특판', '부동산 경기', '신용위험'],
    prompt: '은행끼리도 예금 경쟁과 대출 부실 위험에 따라 움직임이 다를 수 있는 이유는 무엇일까요?',
  },
  oceanair: {
    story: '동아시아 노선과 해상·항공 복합 물류를 운영하는 한국 항공 기업입니다. 화물 운송으로 시작해 저가 여객 노선까지 넓혔지만 유가와 환율 부담이 큽니다.',
    metrics: [['매출', '1.1조 원'], ['영업이익률', '2.7%'], ['부채비율', '246%'], ['현금보유', '1,800억 원'], ['R&D 비중', '1%'], ['수출비중', '22%'], ['원자재 의존도', '매우 높음']],
    signals: { stability: '낮음', growth: '보통', volatility: '높음' },
    riskTags: ['고부채', '유가민감', '환율민감', '경기민감'],
    sensitivity: ['산유국 감산', '환율 급등', '전쟁 위험', '실업률 상승'],
    prompt: '항공 기업은 왜 매출보다 유류비와 부채 부담을 먼저 봐야 할 때가 있을까요?',
  },
  purefood: {
    story: '곡물 가공식품과 학교 급식용 간편식을 만드는 한국 식품 기업입니다. 1989년 지역 제분소로 시작해 안정적인 내수 식품 브랜드로 자리 잡았습니다.',
    metrics: [['매출', '1.9조 원'], ['영업이익률', '6.2%'], ['부채비율', '64%'], ['현금보유', '5,200억 원'], ['R&D 비중', '6%'], ['수출비중', '18%'], ['원자재 의존도', '높음']],
    signals: { stability: '높음', growth: '보통', volatility: '보통' },
    riskTags: ['곡물민감', '방어주', '물가민감', '환율민감'],
    sensitivity: ['곡물 공급 충격', '원/달러 환율', '소비심리', '물가 변화'],
    prompt: '식품 기업은 방어주 성격이 있어도 곡물 가격에는 왜 민감할까요?',
  },
  metroinfra: {
    story: '도시철도, 교량, 복합역세권 개발을 담당하는 한국 인프라 기업입니다. 공공 토목공사 중심에서 민간 복합개발로 확장해 부동산 경기와 금리에 민감합니다.',
    metrics: [['매출', '2.8조 원'], ['영업이익률', '4.8%'], ['부채비율', '188%'], ['현금보유', '3,400억 원'], ['R&D 비중', '2%'], ['수출비중', '8%'], ['원자재 의존도', '매우 높음']],
    signals: { stability: '낮음', growth: '보통', volatility: '높음' },
    riskTags: ['고부채', '정책민감', '부동산민감', '원자재민감'],
    sensitivity: ['인프라 예산', '부동산 규제', '금리 변화', '철강·시멘트 가격'],
    prompt: '비슷한 건설 기업이라도 부채비율이 높으면 금리 인상기에 왜 더 흔들릴까요?',
  },
  bio: {
    story: '항암제와 희귀질환 신약을 개발하는 한국 소형 바이오 기업입니다. 임상 결과에 따라 주가가 크게 출렁이며, 매출보다 R&D 투자가 훨씬 큰 전형적인 신약개발 회사입니다.',
    metrics: [['매출', '430억 원'], ['영업이익률', '-22%'], ['부채비율', '38%'], ['현금보유', '1,200억 원'], ['R&D 비중', '58%'], ['수출비중', '12%'], ['원자재 의존도', '낮음']],
    signals: { stability: '낮음', growth: '높음', volatility: '높음' },
    riskTags: ['임상결과민감', '소형주', '현금소진위험', '뉴스 변동성'],
    sensitivity: ['임상 시험 결과', '신약 승인', '금리 변화', '벤처 투자 심리'],
    prompt: '매출은 작지만 R&D 투자가 매출보다 큰 회사를 어떻게 평가해야 할까요?',
  },
  sp500: {
    story: '미국 대표 기업 묶음에 투자하는 ETF입니다. 한 기업이 아니라 미국 대형주의 평균적인 흐름을 따라가도록 설계되었습니다.',
    metrics: [['구성 종목', '대형주 500개'], ['분산도', '높음'], ['기술주 비중', '높음'], ['배당성향', '보통'], ['환율노출', '있음'], ['국가노출', '미국'], ['변동성', '보통']],
    signals: { stability: '높음', growth: '보통', volatility: '보통' },
    riskTags: ['미국시장민감', '환율민감', '기술주비중', '분산투자'],
    sensitivity: ['미국 금리', '미국 증시', '달러 환율', '기술주 규제'],
    prompt: 'ETF는 분산투자가 되지만 왜 미국 전체 뉴스에는 민감할까요?',
  },
  kospi: {
    story: '한국 대표 기업 묶음에 투자하는 ETF입니다. 반도체, 자동차, 금융 등 국내 대형주의 흐름을 압축해서 보여줍니다.',
    metrics: [['구성 종목', '대형주 200개'], ['분산도', '높음'], ['수출주 비중', '높음'], ['배당성향', '보통'], ['환율노출', '있음'], ['국가노출', '한국'], ['변동성', '보통']],
    signals: { stability: '보통', growth: '보통', volatility: '보통' },
    riskTags: ['한국시장민감', '수출민감', '환율민감', '반도체비중'],
    sensitivity: ['한국 수출', '반도체 경기', '환율 변화', '외국인 자금'],
    prompt: '한국 지수 ETF는 왜 특정 대형 업종 뉴스에 함께 흔들릴 수 있을까요?',
  },
  realty: {
    story: '도시 주거·상업 부동산 가격 흐름을 단순화한 지수입니다. 실제 건물이 아니라 부동산 시장 분위기를 학습하기 위한 가상 지표입니다.',
    metrics: [['대출 의존도', '높음'], ['금리 민감도', '높음'], ['거래량 민감도', '높음'], ['정책 민감도', '높음'], ['임대수요', '보통'], ['공급탄력성', '낮음'], ['변동성', '보통']],
    signals: { stability: '보통', growth: '보통', volatility: '보통' },
    riskTags: ['금리민감', '정책민감', '대출민감', '경기민감'],
    sensitivity: ['금리 변화', '대출 규제', '부동산 정책', '경기 둔화'],
    prompt: '부동산은 왜 금리와 대출 규제에 크게 반응할 수 있을까요?',
  },
  oilFut: {
    story: '미래의 원유 가격 기대를 반영하는 원자재 선물입니다. 기업이 아니라 에너지 수요, 공급, 지정학적 불안이 가격 판단의 핵심입니다.',
    metrics: [['기초자산', '원유'], ['수요 민감도', '높음'], ['공급 민감도', '매우 높음'], ['달러 민감도', '높음'], ['물가 연결성', '높음'], ['보관비용 영향', '있음'], ['변동성', '매우 높음']],
    signals: { stability: '낮음', growth: '보통', volatility: '높음' },
    riskTags: ['원자재', '유가민감', '지정학민감', '인플레이션민감'],
    sensitivity: ['산유국 감산', '중동 긴장', '원유 재고', '글로벌 경기'],
    prompt: '원유 선물은 왜 기업 실적보다 수요·공급 뉴스에 더 민감할까요?',
  },
  grainFut: {
    story: '밀과 옥수수 같은 주요 곡물 가격 기대를 반영하는 식량 원자재 선물입니다. 기후, 전쟁, 비료, 물류 이슈가 모두 연결됩니다.',
    metrics: [['기초자산', '밀·옥수수'], ['기후 민감도', '매우 높음'], ['비료 민감도', '높음'], ['물류 민감도', '높음'], ['물가 연결성', '높음'], ['수출규제 영향', '높음'], ['변동성', '높음']],
    signals: { stability: '낮음', growth: '보통', volatility: '높음' },
    riskTags: ['식량민감', '기후민감', '물가민감', '원자재'],
    sensitivity: ['곡창지대 가뭄', '수출 제한', '비료 가격', '해상 운송'],
    prompt: '곡물 가격 변화가 식품 기업과 물가, 금리까지 연결되는 이유는 무엇일까요?',
  },
  usBond: {
    story: '미국 정부가 발행한 10년 만기 국채를 단순화한 자산입니다. 안전자산 성격이 있지만 금리와 재정 이슈에 따라 가격 변동 가능성이 생깁니다.',
    metrics: [['발행자', '미국 정부'], ['신용위험', '낮음'], ['금리 민감도', '높음'], ['안전자산 선호', '높음'], ['달러 민감도', '높음'], ['만기', '10년'], ['변동성', '보통']],
    signals: { stability: '높음', growth: '낮음', volatility: '보통' },
    riskTags: ['안전자산', '금리민감', '달러민감', '재정이슈민감'],
    sensitivity: ['미국 금리', '인플레이션', '경기 침체 우려', '미국 재정적자'],
    prompt: '안전자산인 국채도 금리가 움직이면 가격 변동 가능성이 커지는 이유는 무엇일까요?',
  },
  argBond: {
    story: '아르헨티나 정부가 발행한 고위험 국채를 단순화한 자산입니다. 높은 이자 기대가 있지만 환율, 정치, 신용등급 이슈에 크게 민감합니다.',
    metrics: [['발행자', '아르헨티나 정부'], ['신용위험', '높음'], ['금리 민감도', '높음'], ['통화가치 민감도', '매우 높음'], ['원자재 수출 영향', '있음'], ['만기', '중장기'], ['변동성', '매우 높음']],
    signals: { stability: '낮음', growth: '보통', volatility: '높음' },
    riskTags: ['고위험채권', '신용등급민감', '환율민감', '정치위험'],
    sensitivity: ['IMF 협상', '신용등급 하향', '통화가치 급락', '원자재 수출'],
    prompt: '채권은 안전하다고만 생각하기 쉬운데, 저신용 국가 채권은 왜 위험자산처럼 움직일까요?',
  },
  goldFut: {
    story: '금 가격을 추종하는 선물 상품입니다. 위기·인플레이션·실질금리 하락 국면에서 안전자산으로 주목받습니다.',
    metrics: [['자산 유형', '귀금속 선물'], ['거래 시장', '글로벌'], ['주요 변수', '실질금리·달러'], ['안전자산성', '높음'], ['배당/이자', '없음'], ['보관 비용', '있음'], ['변동성', '중간']],
    signals: { stability: '높음', growth: '보통', volatility: '보통' },
    riskTags: ['안전자산', '인플레이션헤지', '환율민감', '달러반대'],
    sensitivity: ['실질금리 변화', '달러 강세/약세', '지정학적 위기', '인플레이션 기대'],
    prompt: '금이 위기에 강한 자산이라고 하는데, 왜 항상 오르지는 않을까요?',
  },
  usdKrw: {
    story: '원/달러 환율을 추종하는 ETN입니다. 환율이 오르면 가격이 오르고, 떨어지면 가격이 떨어지는 외환 파생 상품입니다.',
    metrics: [['추종 대상', '원/달러 환율'], ['거래 시장', '외환'], ['주요 변수', '한미 금리차'], ['안전자산성', '보통'], ['배당/이자', '없음'], ['보유 비용', '있음'], ['변동성', '낮음']],
    signals: { stability: '보통', growth: '보통', volatility: '낮음' },
    riskTags: ['외환', '한미금리차민감', '거시지표연동', '위기시 강세'],
    sensitivity: ['미국 금리 인상', '한미 금리차', '경상수지', '외국인 자금 흐름'],
    prompt: '환율 상승이 우리 경제와 자산 가격에 어떤 영향을 줄까요?',
  },
};

const productLearningDetails = {
  sp500: {
    structure: '미국 대형주 약 500개로 구성된 지수를 한 상품으로 추종합니다. 한 기업의 주식이 아니라 미국 대표 기업 묶음에 투자하는 구조입니다.',
    returnSource: '구성 기업들의 평균적인 주가 변화와 원/달러 환율 변화가 원화 기준 손익을 함께 만듭니다.',
    keyRisk: '분산돼 있어도 미국 시장과 대형 기술주 비중이 높아 미국 금리·기술 규제·경기 충격을 함께 받을 수 있습니다.',
    simulationRule: '이 게임에서는 운용보수·추적오차·분배금을 생략하고 ETF 가격 변화만 반영합니다.',
    marketSensitivity: '높음',
    checklist: ['미국 기준금리와 장기 국채금리는 어느 방향인가?', '대형 기술주 비중이 전체 지수에 미치는 영향은 큰가?', '원/달러 환율이 원화 수익률을 돕는가 방해하는가?', 'ETF라고 해서 미국 시장 전체 위험까지 사라지는가?'],
  },
  kospi: {
    structure: '한국 대형주 200개로 구성된 대표지수를 추종합니다. 반도체·자동차·금융 등 국내 주요 산업을 한 번에 담는 상품입니다.',
    returnSource: '국내 대형주의 평균 가격 변화가 핵심이며, 수출 경기와 외국인 자금 흐름이 지수 전체에 영향을 줍니다.',
    keyRisk: '종목 수는 많아도 반도체와 수출 대기업의 영향력이 커서 특정 산업 충격에 지수 전체가 흔들릴 수 있습니다.',
    simulationRule: '이 게임에서는 운용보수·추적오차·분배금을 생략하고 지수 가격 변화만 반영합니다.',
    marketSensitivity: '높음',
    checklist: ['한국 수출과 반도체 경기는 개선 중인가?', '원/달러 환율이 수출주와 외국인 자금에 어떤 영향을 주는가?', '대형 업종 한두 개가 지수 방향을 주도하고 있지 않은가?', '개별주보다 분산됐지만 국내시장 집중 위험은 남아 있지 않은가?'],
  },
  realty: {
    structure: '실제 건물 한 채를 사는 상품이 아니라 도시 주거·상업 부동산 지수의 움직임을 추종하는 가상 ETF입니다.',
    returnSource: '부동산 가격과 거래 심리가 좋아지면 상승 압력이 생기고, 금리·대출 규제·경기 둔화가 부담으로 작용합니다.',
    keyRisk: '부동산은 대출 의존도가 높고 거래가 느립니다. 가격이 버티더라도 거래량 급감과 금융 부실 위험이 먼저 나타날 수 있습니다.',
    simulationRule: '이 게임에서는 임대료·세금·공실·매매비용을 생략하고 부동산지수 변화만 반영합니다.',
    marketSensitivity: '높음',
    checklist: ['기준금리와 대출금리는 오르는가 내리는가?', '대출 규제와 세금 정책은 수요를 늘리는가 줄이는가?', '가격뿐 아니라 거래량과 미분양 위험도 확인했는가?', '현금화가 쉬운 주식과 같은 방식으로 생각하고 있지 않은가?'],
  },
  oilFut: {
    structure: '미래 인도 시점의 원유 가격 기대를 거래하는 선물 상품입니다. 기업의 재무제표보다 세계 원유 수요와 공급이 중요합니다.',
    returnSource: '산유국 감산·전쟁·재고 감소는 공급 부족 기대를, 경기 침체·증산·재고 증가는 수요 또는 공급 완화 기대를 만듭니다.',
    keyRisk: '원유는 지정학과 공급 결정에 매우 민감해 짧은 시간에 큰 폭으로 움직일 수 있습니다. 달러 가치도 가격에 영향을 줍니다.',
    simulationRule: '실제 선물의 증거금·레버리지·만기·롤오버는 생략하고 원유 가격 방향과 변동성만 학습합니다.',
    marketSensitivity: '매우 높음',
    checklist: ['가격 변화가 수요 때문인가 공급 때문인가?', '산유국 생산량과 원유 재고는 어떤 방향인가?', '전쟁·운송로 차질이 실제 공급을 줄였는가?', '실제 선물에는 레버리지와 만기 위험이 있다는 점을 구분했는가?'],
  },
  grainFut: {
    structure: '밀·옥수수 등 주요 곡물의 미래 가격 기대를 반영하는 식량 원자재 선물입니다.',
    returnSource: '가뭄·홍수·전쟁·수출 제한은 공급 부족 기대를 높이고, 풍작·비료 가격 안정·수출 정상화는 공급 부담을 낮춥니다.',
    keyRisk: '날씨와 정책은 예측이 어렵고 식량은 대체가 제한적이어서 작은 공급 충격도 가격을 크게 움직일 수 있습니다.',
    simulationRule: '실제 선물의 증거금·레버리지·만기·롤오버는 생략하고 곡물 가격 변화만 반영합니다.',
    marketSensitivity: '매우 높음',
    checklist: ['주요 곡창지대의 작황과 기후는 어떤가?', '수출 제한이나 전쟁이 실제 물류를 막고 있는가?', '비료·에너지 가격이 생산비를 올리는가?', '곡물 상승이 식품기업과 물가까지 어떻게 이어지는가?'],
  },
  goldFut: {
    structure: '국제 금 가격의 미래 기대를 추종하는 귀금속 선물입니다. 기업 실적 대신 실질금리·달러·위기 심리가 핵심 변수입니다.',
    returnSource: '실질금리 하락, 달러 약세, 지정학적 불안이 금 수요를 높일 수 있고 반대 상황에서는 보유 매력이 약해질 수 있습니다.',
    keyRisk: '안전자산이라는 이름과 달리 이자를 주지 않으며 달러와 실질금리가 오르면 위기 상황에서도 하락할 수 있습니다.',
    simulationRule: '실제 선물의 레버리지·만기·롤오버와 금 보관비용은 생략하고 금 가격 변화만 반영합니다.',
    marketSensitivity: '높음',
    checklist: ['명목금리가 아니라 물가를 뺀 실질금리는 어떤 방향인가?', '달러가 강해지고 있는가 약해지고 있는가?', '위기 뉴스가 실제 안전자산 수요로 이어졌는가?', '금은 이자와 배당이 없다는 점을 고려했는가?'],
  },
  usdKrw: {
    structure: '원/달러 환율을 추종하는 ETN입니다. 1달러를 사는 데 필요한 원화가 늘면 상품 가격도 오르는 구조입니다.',
    returnSource: '미국 금리 상승·달러 선호·외국인 자금 유출은 상승 압력을, 한국 수출 호조·외환시장 안정은 하락 압력을 만들 수 있습니다.',
    keyRisk: '환율 방향을 맞혀도 ETN에는 발행사 신용위험과 추적오차가 존재합니다. 환율 상승은 한국 경제 전체에 일방적인 호재가 아닙니다.',
    simulationRule: '이 게임에서는 발행사 신용위험·운용보수·추적오차를 생략하고 원/달러 환율 변화만 반영합니다.',
    marketSensitivity: '높음',
    checklist: ['한미 금리차는 확대되는가 축소되는가?', '외국인 자금이 국내로 들어오는가 빠져나가는가?', '한국 수출과 경상수지는 환율을 지지하는가?', '환율 상승의 수혜 업종과 피해 업종을 구분했는가?'],
  },
  usBond: {
    structure: '미국 정부가 발행한 10년 만기 채권을 단순화한 상품입니다. 약속된 이자와 만기 상환 기대를 가격으로 거래합니다.',
    returnSource: '보유 중 받는 쿠폰 이자와 채권 가격 변화가 수익을 만듭니다. 시장금리가 내려가면 기존 채권의 상대적 매력이 커져 가격이 오를 수 있습니다.',
    keyRisk: '신용위험은 낮지만 금리 상승과 인플레이션에는 가격이 하락할 수 있습니다. 한국 투자자에게는 달러 환율 위험도 있습니다.',
    simulationRule: '이 게임에서는 만기 상환을 생략하고 매 라운드 액면가 기준 쿠폰 이자와 시장가격 변화만 반영합니다.',
    marketSensitivity: '보통',
    checklist: ['시장금리와 채권 가격이 반대로 움직이는 이유를 설명할 수 있는가?', '물가 상승이 고정 이자의 실질가치를 낮추지 않는가?', '경기 침체로 안전자산 수요가 늘고 있는가?', '원/달러 환율이 원화 기준 손익에 어떤 영향을 주는가?'],
  },
  argBond: {
    structure: '아르헨티나 정부가 발행한 고금리 국채를 단순화한 상품입니다. 높은 이자는 높은 상환 위험에 대한 보상입니다.',
    returnSource: '쿠폰 이자와 채권 가격 변화가 수익을 만들며, IMF 협상·재정개혁·신용등급 개선은 상환 기대를 높일 수 있습니다.',
    keyRisk: '국가 부도·채무 재조정·통화가치 급락이 발생하면 높은 이자를 받아도 원금을 크게 잃을 수 있습니다.',
    simulationRule: '이 게임에서는 실제 채무 재조정과 통화 환전을 단순화하고 쿠폰 이자와 신용위험에 따른 가격 변화만 반영합니다.',
    marketSensitivity: '매우 높음',
    checklist: ['높은 이자율이 왜 높은 위험의 신호일 수 있는가?', '정부 재정과 외환보유액은 상환에 충분한가?', 'IMF 협상과 신용등급은 개선되는가 악화되는가?', '통화가치 하락이 이자 수익을 지워버릴 수 있지 않은가?'],
  },
};

function getProductLearningDetail(asset) {
  if (!asset || asset.type === 'stock') return null;
  return productLearningDetails[asset.id] ?? {
    structure: `${asset.name}은 ${asset.sector} 가격 흐름을 추종하도록 단순화한 상품입니다.`,
    returnSource: '보유 중 발생하는 현금흐름과 시장가격 변화가 수익과 손실을 만듭니다.',
    keyRisk: '기초자산, 금리, 환율, 정책 변화가 동시에 작용할 수 있습니다.',
    simulationRule: '실제 상품의 비용과 복잡한 계약 조건 일부는 학습을 위해 생략했습니다.',
    marketSensitivity: '보통',
    checklist: ['무엇의 가격을 추종하는 상품인가?', '수익은 이자·분배금·가격 변화 중 어디서 발생하는가?', '가장 직접적인 거시지표는 무엇인가?', '실제 상품에서 생략된 위험은 무엇인가?'],
  };
}

const scenarioEvents = [
  {
    id: 'rate-up',
    title: '금리 인상',
    detail: '중앙은행이 물가 안정을 위해 기준금리를 0.5%p 인상했습니다.',
    principle: '금리가 오르면 예금의 매력은 커지지만, 기업의 대출 비용과 부동산 매수 부담은 커집니다.',
    affectedAssets: ['예금금리 상승', '은행주 상승 압력', '부동산 하락 압력', '성장주 하락 압력'],
    discussionPrompt: '금리 인상기에 모든 돈을 예금으로 옮기는 전략은 항상 좋은 선택일까요?',
    issueOptions: [
      {
        title: '물가 상승률 예상보다 높게 발표',
        detail: '소비자물가가 시장 예상보다 높게 나오며 기준금리 인상 가능성이 커졌습니다.',
        failureTitle: '물가 충격 완화, 금리 인상 우려 진정',
        failureDetail: '추가 자료에서 물가 상승이 일시적이라는 분석이 나오며 시장 영향은 제한적이었습니다.',
      },
      {
        title: '중앙은행 총재, 긴축 가능성 언급',
        detail: '중앙은행 총재가 물가 안정을 위해 긴축 기조를 유지할 수 있다고 발언했습니다.',
        failureTitle: '총재 발언 해석 엇갈려 시장 영향 제한',
        failureDetail: '후속 발언에서 급격한 금리 인상은 없을 것이라는 해석이 나오며 이슈가 약화됐습니다.',
      },
      {
        title: '가계대출 증가세 재확대',
        detail: '가계대출이 다시 빠르게 늘며 금리 인상 압력이 커졌습니다.',
        failureTitle: '대출 증가세 둔화 확인',
        failureDetail: '세부 통계에서 증가분이 일부 계절 요인으로 확인되며 시장 반응은 크지 않았습니다.',
      },
    ],
    baseRateDelta: 0.5,
    impact: { bank: 0.08, riverbank: 0.07, infra: -0.07, metroinfra: -0.09, air: -0.05, oceanair: -0.08, enter: -0.04, dogemars: -0.07, neo: -0.03, realty: -0.08, kospi: -0.03, sp500: -0.02, usBond: -0.06, argBond: -0.05, goldFut: -0.04, usdKrw: -0.02 },
  },
  {
    id: 'rate-down',
    title: '금리 인하',
    detail: '경기 부양을 위해 기준금리가 0.5%p 인하되었습니다.',
    principle: '금리가 내려가면 돈을 빌리는 부담이 줄어 투자와 소비가 늘 수 있지만, 예금의 매력은 낮아집니다.',
    affectedAssets: ['부동산 상승 압력', '성장주 상승 압력', 'ETF 상승 압력', '은행주 하락 압력'],
    discussionPrompt: '금리가 내려가면 왜 부동산과 성장주가 동시에 좋아질 수 있을까요?',
    issueOptions: [
      {
        title: '경기 둔화 우려에 금리 인하 기대 확산',
        detail: '소비와 투자가 둔화되며 중앙은행이 경기 부양에 나설 수 있다는 전망이 커졌습니다.',
        failureTitle: '경기 둔화 우려 과장으로 확인',
        failureDetail: '고용 지표가 양호하게 나오며 금리 인하 기대가 빠르게 약해졌습니다.',
      },
      {
        title: '중앙은행, 완화적 통화정책 검토',
        detail: '중앙은행이 경기 회복을 위해 금리 인하 가능성을 열어두겠다고 밝혔습니다.',
        failureTitle: '금리 인하 검토 부인',
        failureDetail: '중앙은행 관계자가 당장 금리 인하를 논의하지 않는다고 설명했습니다.',
      },
    ],
    baseRateDelta: -0.5,
    impact: { realty: 0.09, infra: 0.05, metroinfra: 0.07, neo: 0.04, enter: 0.04, dogemars: 0.06, bank: -0.04, riverbank: -0.04, kospi: 0.04, sp500: 0.03, usBond: 0.06, argBond: 0.04, goldFut: 0.04, usdKrw: 0.02 },
  },
  {
    id: 'deposit-special',
    title: '예금 특판 출시',
    detail: '은행권이 고금리 정기예금 상품을 내놓으며 안전자산 선호가 커졌습니다.',
    principle: '예금 금리가 높아지면 위험한 투자보다 확정 이자를 선호하는 사람이 늘어날 수 있습니다.',
    affectedAssets: ['예금 선호 상승', '은행주 상승 압력', '위험자산 수요 둔화', '부동산 하락 압력'],
    discussionPrompt: '수익률이 낮아도 예금을 선택하는 이유는 무엇일까요?',
    issueOptions: [
      {
        title: '시중은행, 고금리 정기예금 특판 출시',
        detail: '주요 은행들이 고객 유치를 위해 평소보다 높은 예금 금리를 제시했습니다.',
        failureTitle: '예금 특판 조기 축소',
        failureDetail: '은행권이 한도 소진과 비용 부담을 이유로 특판 규모를 줄이며 시장 영향이 약해졌습니다.',
      },
      {
        title: '안전자산 선호 심리 확대',
        detail: '증시 변동성이 커지며 학생 투자자들 사이에서도 예금 선호가 높아졌습니다.',
        failureTitle: '위험자산 선호 회복',
        failureDetail: '증시가 빠르게 안정되며 예금 쏠림은 예상보다 강하지 않았습니다.',
      },
    ],
    baseRateDelta: 0.2,
    impact: { bank: 0.05, riverbank: 0.06, enter: -0.02, dogemars: -0.03, neo: -0.02, realty: -0.03 },
  },
  {
    id: 'growth-boom',
    title: '경기 호황',
    detail: '소비와 기업 투자가 함께 늘며 경기 회복 기대가 강해졌습니다.',
    principle: '경기가 좋아지면 기업 매출과 고용 기대가 커지고, 주식과 부동산 같은 위험자산 선호가 높아질 수 있습니다.',
    affectedAssets: ['경기민감주 상승 압력', '부동산 상승 압력', '채권 가격 하락 압력', '실업률 하락 압력'],
    discussionPrompt: '경기 호황이 모든 기업에 같은 크기의 호재로 작용하지 않는 이유는 무엇일까요?',
    financialLinks: ['경기민감도', '영업이익률', '고용', '소비심리'],
    issueOptions: [
      {
        title: '소매판매와 설비투자 동반 증가',
        detail: '소비 지출과 기업 설비투자가 함께 늘며 경기 확장 기대가 커졌습니다.',
        failureTitle: '소비 증가세 일시적 요인으로 확인',
        failureDetail: '세부 통계에서 계절 행사와 일회성 지출 영향이 컸다는 분석이 나오며 경기 호황 기대가 약해졌습니다.',
      },
      {
        title: '기업 실적 전망 상향',
        detail: '주요 기업들이 매출 전망을 올리며 투자자들의 위험자산 선호가 살아났습니다.',
        failureTitle: '실적 전망 상향 폭 제한',
        failureDetail: '비용 부담이 여전히 크다는 평가가 나오며 시장 영향은 제한됐습니다.',
      },
    ],
    impact: { kospi: 0.08, sp500: 0.06, enter: 0.08, air: 0.09, oceanair: 0.1, neo: 0.05, realty: 0.05, bank: 0.04, riverbank: 0.04, usBond: -0.05, argBond: -0.04, goldFut: -0.03 },
  },
  {
    id: 'recession-risk',
    title: '경기 침체 우려',
    detail: '소비와 투자가 둔화되며 기업 매출 감소와 위험자산 회피 우려가 커졌습니다.',
    principle: '경기가 나빠질 것 같으면 기업 이익 기대가 낮아지고, 투자자는 주식보다 현금성 자산이나 안전자산을 선호할 수 있습니다.',
    affectedAssets: ['경기민감주 하락 압력', '부동산 하락 압력', '미국 국채 선호', '실업률 상승 압력'],
    discussionPrompt: '경기 침체 우려가 커질 때 방어주와 안전자산이 상대적으로 주목받는 이유는 무엇일까요?',
    financialLinks: ['경기민감도', '현금보유', '고용', '안전자산 선호'],
    issueOptions: [
      {
        title: '소비자심리지수 급락',
        detail: '가계가 지출을 줄일 가능성이 커지며 소비 관련 기업의 실적 우려가 확대됐습니다.',
        failureTitle: '소비심리 급락세 반등',
        failureDetail: '후속 조사에서 고용과 임금 기대가 개선되며 소비 둔화 우려가 완화됐습니다.',
      },
      {
        title: '기업 투자 계획 축소',
        detail: '주요 기업들이 신규 투자 일정을 늦추며 경기 둔화 가능성이 부각됐습니다.',
        failureTitle: '투자 축소 발표 제한적',
        failureDetail: '일부 업종에 국한된 조정으로 확인되며 전체 경기 영향은 작게 평가됐습니다.',
      },
    ],
    impact: { kospi: -0.09, sp500: -0.07, enter: -0.08, air: -0.12, oceanair: -0.13, neo: -0.06, realty: -0.06, infra: -0.06, metroinfra: -0.07, usBond: 0.08, food: 0.03, purefood: 0.04, goldFut: 0.08 },
  },
  {
    id: 'jobs-improve',
    title: '고용 개선',
    detail: '취업자 수가 늘고 임금 흐름이 안정되며 소비 여력이 개선됐습니다.',
    principle: '고용이 좋아지면 가계 소득과 소비 기대가 커져 여행, 콘텐츠, 금융, 부동산에 긍정적으로 작용할 수 있습니다.',
    affectedAssets: ['소비 관련주 상승 압력', '항공·여행 상승 압력', '은행 대출 기대 상승', '실업률 하락'],
    discussionPrompt: '고용 개선이 주식시장과 부동산 심리에 동시에 영향을 줄 수 있는 이유는 무엇일까요?',
    financialLinks: ['실업률', '소비심리', '매출 성장', '대출 수요'],
    issueOptions: [
      {
        title: '취업자 수 예상보다 큰 폭 증가',
        detail: '고용 지표가 예상보다 좋게 나오며 소비와 대출 수요 회복 기대가 커졌습니다.',
        failureTitle: '고용 증가 질적 개선 부족',
        failureDetail: '단기 일자리 증가 비중이 큰 것으로 확인되며 시장 영향은 제한됐습니다.',
      },
      {
        title: '청년 고용률 개선',
        detail: '청년층 고용률이 개선되며 소비 회복 기대가 높아졌습니다.',
        failureTitle: '청년 고용 개선 일시적',
        failureDetail: '계절 채용 영향이 컸다는 분석이 나오며 기대감이 약해졌습니다.',
      },
    ],
    impact: { enter: 0.08, air: 0.1, oceanair: 0.09, bank: 0.05, riverbank: 0.04, realty: 0.04, kospi: 0.05, sp500: 0.03, food: 0.03, purefood: 0.03 },
  },
  {
    id: 'unemployment-worse',
    title: '실업률 악화',
    detail: '실업률이 오르고 채용 계획이 줄어들며 소비 둔화 우려가 커졌습니다.',
    principle: '실업률이 오르면 가계 소비가 줄고 경기민감 업종의 매출 기대가 약해질 수 있습니다. 동시에 안전자산 선호가 커질 수 있습니다.',
    affectedAssets: ['소비·여행 하락 압력', '부동산 하락 압력', '미국 국채 선호', '은행 신용위험 점검'],
    discussionPrompt: '실업률 상승이 주가뿐 아니라 은행과 부동산에도 부담이 되는 이유는 무엇일까요?',
    financialLinks: ['실업률', '소비심리', '신용위험', '현금흐름'],
    issueOptions: [
      {
        title: '실업률 예상보다 높게 발표',
        detail: '고용시장이 식고 있다는 신호가 나오며 소비와 대출 상환 능력에 대한 우려가 커졌습니다.',
        failureTitle: '실업률 상승 일시적 요인',
        failureDetail: '구직활동 증가에 따른 통계 효과가 컸다는 분석이 나오며 충격이 완화됐습니다.',
      },
      {
        title: '기업 채용 계획 축소',
        detail: '주요 기업들이 채용 계획을 줄이며 경기 둔화 우려가 커졌습니다.',
        failureTitle: '채용 축소 일부 업종에 그쳐',
        failureDetail: '서비스업과 공공부문 채용이 유지되며 전체 고용 충격은 제한됐습니다.',
      },
    ],
    impact: { enter: -0.1, air: -0.12, oceanair: -0.14, bank: -0.06, riverbank: -0.07, realty: -0.06, kospi: -0.06, sp500: -0.04, usBond: 0.07, argBond: -0.05 },
  },
  {
    id: 'inflation-cool',
    title: '물가 둔화',
    detail: '소비자물가 상승률이 낮아지며 금리 부담 완화 기대가 커졌습니다.',
    principle: '물가가 안정되면 중앙은행이 금리를 덜 올리거나 내릴 여지가 생기고, 성장주와 채권 가격에 긍정적으로 작용할 수 있습니다.',
    affectedAssets: ['성장주 상승 압력', '채권 가격 상승 압력', '원자재 선물 하락 압력', '예금 매력 일부 둔화'],
    discussionPrompt: '물가가 안정되면 왜 주식과 채권이 동시에 좋아질 수 있을까요?',
    financialLinks: ['물가', '할인율', '원자재 의존도', '금리 민감도'],
    issueOptions: [
      {
        title: '소비자물가 예상보다 낮게 발표',
        detail: '물가 상승률이 예상보다 낮아 금리 부담이 줄어들 수 있다는 기대가 커졌습니다.',
        failureTitle: '근원물가 여전히 높음',
        failureDetail: '에너지 제외 물가가 높게 유지되며 금리 부담 완화 기대가 약해졌습니다.',
      },
      {
        title: '국제 원자재 가격 안정',
        detail: '원유와 곡물 가격이 안정되며 기업 원가 부담 완화 기대가 커졌습니다.',
        failureTitle: '원자재 가격 안정세 제한적',
        failureDetail: '일부 품목 가격은 여전히 높아 전체 물가 영향은 제한적이었습니다.',
      },
    ],
    impact: { core: 0.07, dogemars: 0.09, neo: 0.06, sp500: 0.06, kospi: 0.05, usBond: 0.08, argBond: 0.04, oilFut: -0.07, grainFut: -0.06, bank: -0.03, riverbank: -0.03 },
  },
  {
    id: 'inflation-rebound',
    title: '물가 재상승',
    detail: '물가가 다시 오르며 금리 인상과 기업 비용 부담 우려가 커졌습니다.',
    principle: '물가가 다시 오르면 금리 부담이 커지고 원가가 높은 기업의 이익 기대가 낮아질 수 있습니다. 원자재와 예금 선호는 커질 수 있습니다.',
    affectedAssets: ['성장주 하락 압력', '채권 가격 하락 압력', '원자재 선물 상승 압력', '은행주 변동성 확대'],
    discussionPrompt: '물가 상승이 기업 매출에는 좋아 보여도 이익과 주가에는 부담이 될 수 있는 이유는 무엇일까요?',
    financialLinks: ['물가', '원자재 의존도', '부채비율', '금리 민감도'],
    issueOptions: [
      {
        title: '근원물가 재상승',
        detail: '서비스와 임금 관련 물가가 다시 오르며 금리 인상 우려가 커졌습니다.',
        failureTitle: '물가 재상승 우려 완화',
        failureDetail: '세부 항목에서 일시적 요인이 확인되며 시장 충격이 줄었습니다.',
      },
      {
        title: '에너지·식품 가격 동반 상승',
        detail: '생활 물가에 직접 연결되는 에너지와 식품 가격이 함께 오르며 비용 부담이 커졌습니다.',
        failureTitle: '에너지·식품 가격 상승세 진정',
        failureDetail: '재고와 공급 계약 안정으로 가격 상승 압력이 빠르게 낮아졌습니다.',
      },
    ],
    impact: { core: -0.08, dogemars: -0.1, neo: -0.07, sp500: -0.06, kospi: -0.05, usBond: -0.09, argBond: -0.05, oilFut: 0.08, grainFut: 0.08, bank: 0.04, riverbank: 0.04, air: -0.07, oceanair: -0.08, food: -0.05, purefood: -0.04 },
  },
  {
    id: 'fx-stabilize',
    title: '환율 안정',
    detail: '원/달러 환율 변동성이 줄고 원화 가치가 안정되며 수입 비용 부담이 완화됐습니다.',
    principle: '환율이 안정되면 해외 비용이 큰 기업의 부담이 줄고, 외국인 투자 심리가 개선될 수 있습니다. 다만 미국 자산의 환산 이익 기대는 약해질 수 있습니다.',
    affectedAssets: ['항공·식품 비용 부담 완화', '국내 지수 안정', '미국 ETF 환산가치 부담', '신흥국 채권 안정'],
    discussionPrompt: '환율 안정이 수출 기업과 수입 비용 기업에 서로 다르게 작용하는 이유는 무엇일까요?',
    financialLinks: ['환율노출', '해외 비용', '수출비중', '달러 자산'],
    issueOptions: [
      {
        title: '외환시장 안정 조치 효과',
        detail: '외환시장 안정 조치와 달러 약세가 겹치며 환율 변동성이 줄었습니다.',
        failureTitle: '환율 안정 효과 제한',
        failureDetail: '미국 금리 전망이 다시 강해지며 환율 안정 기대가 약해졌습니다.',
      },
      {
        title: '원화 강세 전환',
        detail: '외국인 자금 유입과 무역수지 개선으로 원화가 안정되는 흐름을 보였습니다.',
        failureTitle: '원화 강세 흐름 둔화',
        failureDetail: '달러 수요가 다시 늘며 원화 안정세가 오래 이어지지 못했습니다.',
      },
    ],
    impact: { air: 0.1, oceanair: 0.11, food: 0.05, purefood: 0.05, kospi: 0.02, argBond: 0.05, sp500: -0.04, core: -0.02, dogemars: -0.02, usdKrw: -0.04, goldFut: -0.02 },
  },
  {
    id: 'fx-volatility',
    title: '환율 불안 확대',
    detail: '원/달러 환율이 크게 출렁이며 수출입 기업과 해외 자산의 손익 전망이 불안정해졌습니다.',
    principle: '환율 변동성이 커지면 수출 기업에는 기회가 될 수 있지만, 해외 비용과 달러 부채가 큰 기업에는 부담이 됩니다.',
    affectedAssets: ['항공·식품 비용 부담', '미국 ETF 환산가치 변동', '신흥국 채권 부담', '수출주 차별화'],
    discussionPrompt: '환율이 오른다는 사실보다 변동성이 커지는 것이 기업에 더 부담이 될 수 있는 이유는 무엇일까요?',
    financialLinks: ['환율노출', '달러 부채', '수출비중', '해외 비용'],
    issueOptions: [
      {
        title: '달러 수요 급증',
        detail: '글로벌 불확실성으로 달러 수요가 늘며 환율 변동성이 커졌습니다.',
        failureTitle: '달러 수요 급증세 진정',
        failureDetail: '외환 유동성 공급과 위험 심리 개선으로 환율 불안이 완화됐습니다.',
      },
      {
        title: '외국인 자금 유출 우려',
        detail: '외국인 투자자금 유출 가능성이 제기되며 국내 금융시장 변동성이 커졌습니다.',
        failureTitle: '외국인 자금 유입 전환',
        failureDetail: '국내 기업 실적 기대가 유지되며 자금 유출 우려가 약해졌습니다.',
      },
    ],
    impact: { air: -0.1, oceanair: -0.12, food: -0.05, purefood: -0.04, kospi: -0.05, argBond: -0.07, sp500: 0.05, core: 0.03, dogemars: 0.03, neo: 0.03, usdKrw: 0.04, goldFut: 0.05 },
  },
  {
    id: 'property-ease',
    title: '부동산 규제 완화',
    detail: '대출 규제와 세금 부담이 일부 완화되며 부동산 투자 심리가 회복됐습니다.',
    principle: '규제가 완화되면 부동산을 사기 쉬워지고 관련 산업의 기대 수익도 함께 높아질 수 있습니다.',
    affectedAssets: ['부동산 상승 압력', '건설/인프라 상승 압력', '은행 대출 기대 상승', '국내 지수 일부 상승'],
    discussionPrompt: '부동산 규제 완화가 건설회사와 은행에도 영향을 주는 이유는 무엇일까요?',
    issueOptions: [
      {
        title: '정부, 부동산 대출 규제 완화 검토',
        detail: '주택 거래 회복을 위해 대출 규제를 일부 완화하는 방안이 논의되고 있습니다.',
        failureTitle: '대출 규제 완화 보류',
        failureDetail: '가계부채 우려가 커지며 정부가 규제 완화 결정을 미뤘습니다.',
      },
      {
        title: '재건축 규제 완화 기대감 확산',
        detail: '주요 도심 지역의 재건축 규제 완화 가능성이 제기되며 부동산 심리가 살아났습니다.',
        failureTitle: '재건축 완화안 국회 논의 지연',
        failureDetail: '정책 처리 일정이 늦어지며 기대감이 실제 가격에는 반영되지 못했습니다.',
      },
    ],
    impact: { realty: 0.12, infra: 0.05, metroinfra: 0.08, bank: 0.03, riverbank: 0.03, kospi: 0.02 },
  },
  {
    id: 'property-tighten',
    title: '부동산 규제 강화',
    detail: '가계부채와 집값 불안을 잡기 위해 대출 규제와 세금 부담을 다시 높이는 방안이 부각됐습니다.',
    principle: '부동산을 사기 어려워지면 거래와 개발 기대가 약해지고, 건설사와 은행의 관련 수익 기대도 함께 줄 수 있습니다.',
    affectedAssets: ['부동산 하락 압력', '건설/인프라 부담 가능성', '은행 대출 성장 둔화', '국내 지수 일부 부담'],
    discussionPrompt: '부동산 규제 강화가 집값뿐 아니라 건설회사와 은행에도 영향을 줄 수 있는 이유는 무엇일까요?',
    issueOptions: [
      {
        title: '정부, 주택담보대출 규제 강화 검토',
        detail: '가계부채 관리 차원에서 대출 한도와 심사 기준을 강화하는 방안이 논의되고 있습니다.',
        failureTitle: '대출 규제 강화안 보류',
        failureDetail: '경기 둔화 우려가 커지며 대출 규제 강화 결정이 미뤄졌습니다.',
      },
      {
        title: '부동산 세제 강화 논의',
        detail: '투기 수요를 억제하기 위한 보유세·거래세 강화 논의가 부동산 심리를 위축시켰습니다.',
        failureTitle: '세제 강화안 후퇴',
        failureDetail: '정책 부담 우려로 세제 강화안이 축소되며 시장 충격이 줄었습니다.',
      },
    ],
    impact: { realty: -0.13, infra: -0.06, metroinfra: -0.08, bank: -0.04, riverbank: -0.04, kospi: -0.03 },
  },
  {
    id: 'us-rally',
    title: '미국 증시 강세',
    detail: '빅테크 실적 호조로 미국 대표지수가 상승했습니다.',
    principle: '미국 대형 기업의 실적이 좋아지면 글로벌 투자 심리가 개선되고 미국 지수 ETF가 직접 영향을 받습니다.',
    affectedAssets: ['S&P 500 ETF 상승 압력', '반도체 상승 압력', '한국 지수 일부 상승'],
    discussionPrompt: '미국 증시 뉴스가 한국 투자자에게도 중요한 이유는 무엇일까요?',
    issueOptions: [
      {
        title: '미국 빅테크 기업 실적 발표',
        detail: '미국 대형 기술 기업들이 예상보다 좋은 실적을 발표했습니다.',
        failureTitle: '빅테크 실적 기대 이하로 판명',
        failureDetail: '세부 실적에서 비용 증가가 확인되며 미국 증시 강세 기대가 꺾였습니다.',
      },
      {
        title: 'S&P 500 사상 최고치 근접',
        detail: '미국 대표지수가 대형 기술주 강세에 힘입어 사상 최고치에 가까워졌습니다.',
        failureTitle: '미국 증시 상승세 차익실현에 둔화',
        failureDetail: '단기 급등 부담으로 매물이 나오며 지수 강세가 이어지지 못했습니다.',
      },
      {
        title: 'AI 투자 확대 소식',
        detail: '미국 기업들의 AI 데이터센터 투자가 확대되며 기술주 기대감이 커졌습니다.',
        failureTitle: 'AI 투자 비용 부담 부각',
        failureDetail: '투자 확대보다 비용 부담이 더 크게 해석되며 시장 영향은 제한됐습니다.',
      },
    ],
    impact: { sp500: 0.1, core: 0.04, dogemars: 0.09, enter: 0.04, kospi: 0.02 },
  },
  {
    id: 'korea-export',
    title: '한국 수출 호조',
    detail: '반도체와 자동차 수출 증가로 국내 대표지수가 상승했습니다.',
    principle: '수출이 늘면 기업 매출과 이익 기대가 커지고, 국내 대표지수에도 긍정적으로 작용할 수 있습니다.',
    affectedAssets: ['KOSPI ETF 상승 압력', '반도체 상승 압력', '전기차 상승 압력', '은행주 일부 상승'],
    discussionPrompt: '수출이 늘면 왜 주식시장 전체 분위기가 좋아질 수 있을까요?',
    issueOptions: [
      {
        title: '반도체 수출 두 자릿수 증가',
        detail: '반도체 수출이 크게 늘며 국내 기업 실적 회복 기대가 커졌습니다.',
        failureTitle: '반도체 수출 증가 일시적 요인으로 확인',
        failureDetail: '일부 대형 주문 영향이 컸다는 분석이 나오며 시장 반응은 제한됐습니다.',
      },
      {
        title: '자동차·배터리 수출 호조',
        detail: '자동차와 배터리 수출이 늘며 국내 제조업 전반의 기대감이 높아졌습니다.',
        failureTitle: '수출 호조에도 환율 부담 확대',
        failureDetail: '환율과 물류비 부담이 커지며 수출 증가의 긍정 효과가 약해졌습니다.',
      },
    ],
    impact: { kospi: 0.09, core: 0.06, neo: 0.03, dogemars: 0.02, bank: 0.02, riverbank: 0.02 },
  },
  {
    id: 'rare',
    title: '희토류 수출 통제',
    detail: '주요 생산국이 희토류 수출 제한을 발표했습니다.',
    principle: '핵심 원재료 공급이 줄면 생산 비용이 오르고, 관련 제조업의 이익 기대가 낮아질 수 있습니다.',
    affectedAssets: ['반도체 하락 압력', '전기차 하락 압력', '재생에너지 하락 압력', '원자재 관련주 상승 압력'],
    discussionPrompt: '같은 뉴스가 어떤 기업에는 악재이고 어떤 기업에는 호재가 되는 이유는 무엇일까요?',
    issueOptions: [
      {
        title: '희토류 공급 차질 우려',
        detail: '주요 생산국의 수출 제한 가능성으로 핵심 원재료 공급 불안이 커졌습니다.',
        failureTitle: '희토류 공급 차질 우려 완화',
        failureDetail: '대체 공급 계약 소식이 나오며 원재료 부족 우려가 줄었습니다.',
      },
      {
        title: '전기차 핵심 소재 가격 급등',
        detail: '전기차와 반도체에 필요한 핵심 소재 가격이 급등했습니다.',
        failureTitle: '소재 가격 급등세 진정',
        failureDetail: '재고 물량이 충분하다는 발표가 나오며 가격 급등 우려가 완화됐습니다.',
      },
    ],
    impact: { core: -0.11, dogemars: -0.1, neo: -0.08, eco: -0.04, oil: 0.04, kospi: -0.03 },
  },
  {
    id: 'housing',
    title: '인프라 예산 확대',
    detail: '대규모 도로, 철도, 데이터센터 투자가 확정됐습니다.',
    principle: '정부 지출이 늘면 관련 기업의 수주 기대가 커지고 주변 부동산 가치에도 영향을 줄 수 있습니다.',
    affectedAssets: ['건설/인프라 상승 압력', '부동산 상승 압력', '반도체 상승 압력', '은행주 일부 상승'],
    discussionPrompt: '정부의 인프라 투자는 왜 민간 기업의 주가에도 영향을 줄까요?',
    issueOptions: [
      {
        title: '국가 인프라 예산 확대 발표',
        detail: '정부가 철도, 도로, 데이터센터 등 대규모 인프라 투자 계획을 발표했습니다.',
        failureTitle: '인프라 예산안 처리 지연',
        failureDetail: '예산안 심사가 늦어지며 관련 기업의 수주 기대가 바로 반영되지 못했습니다.',
      },
      {
        title: '신도시 교통망 투자 확대',
        detail: '신도시와 주요 산업단지를 연결하는 교통망 투자 계획이 공개됐습니다.',
        failureTitle: '교통망 투자 계획 축소',
        failureDetail: '재정 부담 우려로 사업 규모가 조정되며 기대감이 약해졌습니다.',
      },
    ],
    impact: { infra: 0.16, metroinfra: 0.18, realty: 0.06, core: 0.05, dogemars: 0.04, bank: 0.03, riverbank: 0.02, eco: 0.02 },
  },
  {
    id: 'green-subsidy',
    title: '친환경 보조금 확대',
    detail: '정부와 주요국이 재생에너지와 전기차 전환 지원을 늘릴 수 있다는 기대가 커졌습니다.',
    principle: '친환경 지원이 늘면 관련 설비와 소재 수요 기대가 높아지고, 화석연료 의존 산업에는 상대적인 부담이 생길 수 있습니다.',
    affectedAssets: ['재생에너지 상승 압력', '전기차 상승 압력', '원유 관련주 부담 가능성', '국내 지수 일부 상승'],
    discussionPrompt: '정책 지원만으로도 아직 실적이 나오지 않은 산업의 주가가 먼저 움직일 수 있는 이유는 무엇일까요?',
    issueOptions: [
      {
        title: '재생에너지 설비 보조금 확대 검토',
        detail: '태양광, 풍력, ESS 설비 지원 확대 가능성이 제기되며 친환경 관련주 기대가 커졌습니다.',
        failureTitle: '보조금 확대안 재검토',
        failureDetail: '재정 부담 우려가 커지며 친환경 지원 확대 논의가 속도를 내지 못했습니다.',
      },
      {
        title: '전기차 전환 세제 혜택 논의',
        detail: '전기차와 배터리 산업 지원을 위한 세제 혜택 확대 논의가 부각됐습니다.',
        failureTitle: '세제 혜택 확대 지연',
        failureDetail: '정책 협의가 길어지며 전기차 지원 기대가 시장에 크게 이어지지 못했습니다.',
      },
    ],
    impact: { eco: 0.14, neo: 0.06, dogemars: 0.03, kospi: 0.03, oil: -0.06, oilFut: -0.08 },
  },
  {
    id: 'us-regulation',
    title: '미국 기술 규제 강화',
    detail: '미국 정부가 대형 기술 기업에 대한 규제를 강화할 수 있다는 소식이 나왔습니다.',
    principle: '규제가 강해지면 해당 국가의 기업은 비용 부담과 성장 둔화 우려를 받을 수 있습니다.',
    affectedAssets: ['미국 기술주 하락 압력', 'S&P 500 ETF 하락 압력', '한국 일부 기업 반사이익 가능성'],
    discussionPrompt: '한 나라의 규제가 그 나라 기업 주가에 직접 영향을 주는 이유는 무엇일까요?',
    issueOptions: [
      {
        title: '미국, 대형 기술기업 반독점 조사 확대',
        detail: '미국 정부가 플랫폼과 반도체 기업의 시장 지배력 조사를 확대했습니다.',
        failureTitle: '미국 기술 규제 우려 완화',
        failureDetail: '조사 범위가 예상보다 제한적인 것으로 알려지며 시장 충격은 크지 않았습니다.',
      },
      {
        title: '미국 의회, AI 기업 규제 법안 논의',
        detail: 'AI와 데이터 산업에 대한 규제 법안이 논의되며 미국 기술주 투자심리가 약해졌습니다.',
        failureTitle: 'AI 규제 법안 처리 지연',
        failureDetail: '의회 논의가 길어지며 당장 기업 실적에 미치는 영향은 제한적이었습니다.',
      },
    ],
    impact: { core: -0.1, dogemars: -0.13, enter: -0.08, medi: -0.07, sp500: -0.05, kospi: 0.01 },
  },
  {
    id: 'drug-breakthrough',
    title: '신약 승인 기대',
    detail: '바이오 기업의 임상 결과와 신약 승인 가능성이 부각되며 헬스케어 업종 기대가 커졌습니다.',
    principle: '헬스케어 기업은 생산설비보다 임상 성공과 승인 여부가 미래 매출 기대를 크게 좌우할 수 있습니다.',
    affectedAssets: ['헬스케어 상승 압력', '성장주 심리 개선 가능성', '국내 지수 일부 상승'],
    discussionPrompt: '바이오 기업은 현재 매출보다 미래 승인 가능성이 더 크게 가격에 반영될 수 있는 이유가 무엇일까요?',
    issueOptions: [
      {
        title: '신약 3상 결과 기대 확대',
        detail: '주요 치료제의 임상 3상 결과 발표를 앞두고 시장 기대가 빠르게 커졌습니다.',
        failureTitle: '임상 기대감 과열 진정',
        failureDetail: '세부 일정과 결과 불확실성이 부각되며 기대감이 가격에 크게 반영되지 못했습니다.',
      },
      {
        title: '해외 보건당국 승인 심사 진전',
        detail: '핵심 신약 후보의 승인 심사가 진전되고 있다는 소식이 전해졌습니다.',
        failureTitle: '승인 심사 진전 확인 지연',
        failureDetail: '추가 자료 요청 가능성이 제기되며 승인 기대가 다소 약해졌습니다.',
      },
    ],
    impact: { medi: 0.16, kospi: 0.02, sp500: 0.01 },
  },
  {
    id: 'drug-setback',
    title: '임상 실패 우려',
    detail: '핵심 신약 후보의 임상 지연과 약가 규제 우려가 겹치며 헬스케어 업종 변동성이 커졌습니다.',
    principle: '바이오 기업은 임상 실패나 약가 부담이 생기면 미래 매출 기대가 빠르게 낮아질 수 있습니다.',
    affectedAssets: ['헬스케어 하락 압력', '성장주 변동성 확대 가능성', '국내 지수 일부 부담'],
    discussionPrompt: '바이오 기업은 왜 단일 임상 결과 하나로도 가격 변동 폭이 커질 수 있을까요?',
    issueOptions: [
      {
        title: '주요 임상 일정 지연',
        detail: '핵심 치료제의 임상 결과 발표가 늦어질 수 있다는 공시가 나오며 불안이 커졌습니다.',
        failureTitle: '임상 일정 지연 우려 완화',
        failureDetail: '회사 측이 일정 차질이 크지 않다고 설명하며 시장 충격이 줄었습니다.',
      },
      {
        title: '약가 인하 압박 부각',
        detail: '보건당국의 약가 통제 강화 가능성이 부각되며 헬스케어 수익성 우려가 커졌습니다.',
        failureTitle: '약가 인하 압박 완화',
        failureDetail: '정책 논의가 장기 과제로 밀리며 단기 부담은 제한됐습니다.',
      },
    ],
    impact: { medi: -0.16, kospi: -0.02, sp500: -0.01 },
  },
  {
    id: 'fx-spike',
    title: '원/달러 환율 급등',
    detail: '달러 강세로 원/달러 환율이 크게 오르며 수출입 기업의 손익 전망이 엇갈렸습니다.',
    principle: '환율이 오르면 수출 기업은 유리할 수 있지만, 해외 비용이 큰 기업은 부담을 받을 수 있습니다.',
    affectedAssets: ['한국 수출주 상승 압력', '항공주 하락 압력', '미국 ETF 환산가치 상승 압력'],
    discussionPrompt: '환율이 오르면 모든 한국 기업에 좋은 일일까요?',
    issueOptions: [
      {
        title: '달러 강세, 원/달러 환율 급등',
        detail: '달러 가치가 오르며 수출 기업과 해외 비용이 큰 기업의 전망이 엇갈렸습니다.',
        failureTitle: '환율 급등세 진정',
        failureDetail: '외환시장 안정 조치와 달러 약세 전환으로 환율 영향이 제한됐습니다.',
      },
      {
        title: '미국 금리 장기화 전망에 달러 강세',
        detail: '미국 금리가 오래 높게 유지될 수 있다는 전망이 나오며 달러가 강세를 보였습니다.',
        failureTitle: '미국 금리 전망 완화로 달러 약세',
        failureDetail: '후속 지표가 둔화되며 달러 강세 압력이 빠르게 줄었습니다.',
      },
    ],
    impact: { neo: 0.05, core: 0.04, dogemars: 0.05, air: -0.09, oceanair: -0.11, food: -0.04, purefood: -0.03, oil: -0.04, kospi: -0.02, sp500: 0.05, usdKrw: 0.07, goldFut: 0.04 },
  },
  {
    id: 'korea-us-chip-tension',
    title: '한미 반도체 갈등',
    detail: '반도체 보조금과 수출 규정을 둘러싼 한미 협의가 난항을 겪고 있습니다.',
    principle: '국가 간 산업 정책 갈등은 특정 업종의 비용과 매출 전망을 크게 바꿀 수 있습니다.',
    affectedAssets: ['미국 반도체 기업 하락 압력', '한국 지수 하락 압력', '공급망 불확실성 확대'],
    discussionPrompt: '같은 반도체 산업이라도 국가 정책에 따라 기업별 영향이 다른 이유는 무엇일까요?',
    issueOptions: [
      {
        title: '한미 반도체 보조금 협상 난항',
        detail: '보조금 조건과 기술 이전 규정을 둘러싼 협상이 길어지며 반도체 기업 불확실성이 커졌습니다.',
        failureTitle: '한미 반도체 협상 진전',
        failureDetail: '양국이 핵심 쟁점에 잠정 합의하며 반도체 갈등 우려가 완화됐습니다.',
      },
      {
        title: '미국, 첨단 반도체 수출 규정 강화 검토',
        detail: '미국이 첨단 반도체 수출 규정을 강화할 수 있다는 보도가 나왔습니다.',
        failureTitle: '수출 규정 강화 보도 부인',
        failureDetail: '미국 정부가 당장 추가 규제를 검토하지 않는다고 밝히며 시장 영향이 줄었습니다.',
      },
    ],
    impact: { core: -0.12, dogemars: -0.14, kospi: -0.05, neo: -0.04, sp500: -0.03 },
  },
  {
    id: 'oil-supply-shock',
    title: '산유국 감산',
    detail: '주요 산유국이 원유 생산량을 줄일 수 있다는 소식이 나오며 에너지 가격 불확실성이 커졌습니다.',
    principle: '원유 공급이 줄어들면 에너지 가격 기대가 움직이고, 유류비 부담이 큰 산업의 변동 가능성이 커집니다.',
    affectedAssets: ['원유 선물 변동성 확대', '정유/원자재 변동성 확대', '항공주 부담 가능성', '물가 압력 가능성'],
    discussionPrompt: '원유 가격 이슈가 항공, 식품, 채권까지 연결될 수 있는 이유는 무엇일까요?',
    financialLinks: ['원유 선물', '유류비', '원자재 의존도', '물가'],
    issueOptions: [
      {
        title: 'OPEC+ 감산 연장 논의',
        detail: '주요 산유국들이 원유 생산량 감축을 더 오래 유지할 가능성이 제기됐습니다.',
        failureTitle: '감산 연장 합의 불발',
        failureDetail: '산유국 간 이해관계가 엇갈리며 감산 연장 가능성이 낮아졌습니다.',
      },
      {
        title: '중동 해상 운송 차질 우려',
        detail: '중동 지역 해상 운송 불안으로 원유 공급 일정이 흔들릴 수 있다는 보도가 나왔습니다.',
        failureTitle: '해상 운송 차질 우려 완화',
        failureDetail: '주요 항로가 정상 운항 중이라는 확인이 나오며 시장 영향이 줄었습니다.',
      },
      {
        title: '원유 재고 예상보다 큰 폭 감소',
        detail: '글로벌 원유 재고가 예상보다 빠르게 줄었다는 통계가 발표됐습니다.',
        failureTitle: '원유 재고 감소폭 재해석',
        failureDetail: '일시적 통계 요인이 컸다는 분석이 나오며 공급 부족 우려가 약해졌습니다.',
      },
    ],
    impact: { oilFut: 0.18, oil: 0.1, air: -0.12, oceanair: -0.15, food: -0.04, purefood: -0.03, grainFut: 0.03, usBond: 0.02 },
  },
  {
    id: 'oil-supply-relief',
    title: '원유 공급 안정',
    detail: '산유국 증산과 재고 증가 기대가 겹치며 원유 가격 부담이 완화될 수 있다는 전망이 나왔습니다.',
    principle: '원유 공급이 안정되면 에너지 가격 부담이 줄고, 유류비 비중이 큰 산업은 비용 완화 기대를 받을 수 있습니다.',
    affectedAssets: ['원유 선물 하락 압력', '정유/원자재 조정 가능성', '항공주 비용 부담 완화', '식품 원가 부담 완화'],
    discussionPrompt: '유가가 안정되면 왜 항공과 식품처럼 비용 민감 업종이 상대적으로 좋아질 수 있을까요?',
    financialLinks: ['원유 선물', '유류비', '원자재 의존도', '물가'],
    issueOptions: [
      {
        title: '산유국 증산 가능성 부각',
        detail: '주요 산유국이 생산량을 늘릴 수 있다는 보도가 나오며 유가 안정 기대가 커졌습니다.',
        failureTitle: '증산 기대 약화',
        failureDetail: '산유국이 실제 증산에는 신중한 태도를 보이며 공급 안정 기대가 줄었습니다.',
      },
      {
        title: '원유 재고 예상보다 큰 폭 증가',
        detail: '글로벌 원유 재고가 예상보다 빠르게 늘었다는 통계가 발표됐습니다.',
        failureTitle: '원유 재고 증가 일시적 해석',
        failureDetail: '단기 통계 왜곡이라는 분석이 나오며 유가 안정 기대가 약해졌습니다.',
      },
      {
        title: '해상 운송 정상화 확인',
        detail: '주요 항로 운송 차질 우려가 완화되며 원유 공급 불안이 줄었습니다.',
        failureTitle: '운송 정상화 기대 후퇴',
        failureDetail: '일부 항로 불안이 다시 부각되며 공급 안정 기대가 이어지지 못했습니다.',
      },
    ],
    impact: { oilFut: -0.18, oil: -0.1, air: 0.12, oceanair: 0.15, food: 0.04, purefood: 0.04, usBond: -0.02, grainFut: -0.03 },
  },
  {
    id: 'grain-shock',
    title: '곡물 공급 충격',
    detail: '주요 곡물 생산 지역의 작황과 수출 정책이 흔들리며 식량 원자재 불확실성이 커졌습니다.',
    principle: '곡물 가격 기대가 움직이면 식품 원가, 소비자물가, 일부 국가의 재정과 통화가치까지 영향을 받을 수 있습니다.',
    affectedAssets: ['곡물 선물 변동성 확대', '식품 기업 원가 부담 가능성', '물가 압력 가능성', '신흥국 채권 변동성 확대'],
    discussionPrompt: '식량 가격 변화가 왜 한 기업의 문제가 아니라 경제 전체 이슈가 될 수 있을까요?',
    financialLinks: ['곡물 선물', '식품 원가', '원자재 의존도', '물가'],
    issueOptions: [
      {
        title: '주요 곡창지대 가뭄 확산',
        detail: '곡물 생산 지역의 가뭄이 길어지며 수확량 감소 우려가 커졌습니다.',
        failureTitle: '가뭄 피해 예상보다 제한적',
        failureDetail: '비 예보와 관개 시설 효과가 확인되며 곡물 공급 우려가 완화됐습니다.',
      },
      {
        title: '곡물 수출국 수출 제한 검토',
        detail: '식량 안보를 이유로 주요 수출국이 곡물 수출 제한을 검토한다는 소식이 나왔습니다.',
        failureTitle: '곡물 수출 제한 보류',
        failureDetail: '국제 협의 이후 수출 제한 논의가 보류되며 시장 영향이 줄었습니다.',
      },
      {
        title: '비료 가격 급등',
        detail: '천연가스와 운송비 부담으로 비료 가격이 올라 농산물 생산비가 커질 수 있다는 분석이 나왔습니다.',
        failureTitle: '비료 공급 계약 안정',
        failureDetail: '장기 공급 계약과 재고가 확인되며 비료 가격 충격이 제한됐습니다.',
      },
    ],
    impact: { grainFut: 0.2, food: -0.11, purefood: -0.08, argBond: 0.04, usBond: 0.02, kospi: -0.02 },
  },
  {
    id: 'grain-relief',
    title: '곡물 공급 안정',
    detail: '풍작 기대와 수출 제한 완화 가능성이 겹치며 식량 원자재 가격 부담이 낮아질 수 있다는 전망이 나왔습니다.',
    principle: '곡물 공급이 안정되면 식품 기업의 원가 부담이 줄고, 물가 압력도 일부 완화될 수 있습니다.',
    affectedAssets: ['곡물 선물 하락 압력', '식품 기업 원가 완화 가능성', '물가 부담 완화 가능성', '고위험 수출국 채권 변수 점검'],
    discussionPrompt: '곡물 가격이 내려가면 식품 기업과 물가, 금리 기대에 어떤 변화가 생길 수 있을까요?',
    financialLinks: ['곡물 선물', '식품 원가', '원자재 의존도', '물가'],
    issueOptions: [
      {
        title: '주요 곡창지대 풍작 전망',
        detail: '기상 여건이 개선되며 주요 곡물 생산량이 늘어날 것이라는 전망이 확산됐습니다.',
        failureTitle: '풍작 전망 과도 평가',
        failureDetail: '병해충과 지역별 기상 차이로 실제 수확량 증가 기대가 약해졌습니다.',
      },
      {
        title: '곡물 수출 제한 완화 기대',
        detail: '주요 수출국이 식량 안보 우려 완화에 따라 수출 제한을 완화할 수 있다는 보도가 나왔습니다.',
        failureTitle: '수출 제한 완화 지연',
        failureDetail: '국내 물가 우려가 남아 수출 제한 완화 논의가 미뤄졌습니다.',
      },
      {
        title: '비료 가격 안정세 확인',
        detail: '에너지 가격 안정과 공급 계약 확대로 비료 가격이 진정되고 있다는 분석이 나왔습니다.',
        failureTitle: '비료 가격 안정세 제한적',
        failureDetail: '물류비 부담이 남아 있어 생산비 완화 기대가 크게 이어지지 못했습니다.',
      },
    ],
    impact: { grainFut: -0.18, food: 0.11, purefood: 0.09, usBond: 0.03, kospi: 0.02, argBond: -0.03 },
  },
  {
    id: 'us-yield-spike',
    title: '미국 국채금리 급등',
    detail: '미국 물가와 재정 우려로 장기 국채금리가 급등하며 글로벌 자산 가격의 할인율 부담이 커졌습니다.',
    principle: '금리가 오르면 채권 가격은 부담을 받고, 미래 이익 기대가 큰 성장자산의 현재 가치도 흔들릴 수 있습니다.',
    affectedAssets: ['미국 국채 가격 변동성 확대', '성장주 부담 가능성', '고위험 채권 부담 가능성', '은행주 변동성 확대'],
    discussionPrompt: '국채가 안전자산인데도 금리가 급등하면 가격이 흔들리는 이유는 무엇일까요?',
    financialLinks: ['금리 민감도', '부채비율', '할인율', '안전자산'],
    issueOptions: [
      {
        title: '미국 인플레이션 예상 상회',
        detail: '미국 물가 지표가 예상보다 높게 나오며 장기 금리 상승 압력이 커졌습니다.',
        failureTitle: '미국 물가 충격 일시적 평가',
        failureDetail: '세부 지표에서 일시 요인이 확인되며 금리 급등 우려가 완화됐습니다.',
      },
      {
        title: '미국 재정적자 우려 확대',
        detail: '미국 정부의 재정 부담이 커질 수 있다는 전망이 국채시장 불안을 키웠습니다.',
        failureTitle: '재정 우려 완화 발언',
        failureDetail: '정책 당국의 재정 안정화 계획 발표로 국채시장 불안이 줄었습니다.',
      },
      {
        title: '연준 긴축 장기화 전망',
        detail: '미국 기준금리가 더 오래 높게 유지될 수 있다는 전망이 확산됐습니다.',
        failureTitle: '연준 완화 가능성 재부각',
        failureDetail: '경기 둔화 신호가 나오며 긴축 장기화 전망이 약해졌습니다.',
      },
    ],
    baseRateDelta: 0.3,
    impact: { usBond: -0.12, sp500: -0.06, core: -0.07, dogemars: -0.11, enter: -0.05, argBond: -0.08, bank: 0.04, riverbank: 0.03 },
  },
  {
    id: 'us-yield-cooldown',
    title: '미국 국채시장 안정',
    detail: '미국 물가 둔화와 재정 우려 완화가 겹치며 장기 국채금리가 안정되고 채권 가격 부담이 줄었습니다.',
    principle: '장기 금리가 내려가면 채권 가격은 오를 수 있고, 미래 이익 기대가 큰 성장자산의 할인율 부담도 완화될 수 있습니다.',
    affectedAssets: ['미국 국채 가격 상승 압력', '성장주 부담 완화 가능성', '고위험 채권 안정 가능성', '은행주 금리 기대 조정'],
    discussionPrompt: '장기 금리가 안정되면 왜 채권과 성장주가 함께 안도할 수 있을까요?',
    financialLinks: ['금리 민감도', '부채비율', '할인율', '안전자산'],
    issueOptions: [
      {
        title: '미국 물가 지표 안정',
        detail: '미국 물가 상승세가 예상보다 빠르게 둔화되며 장기 금리 부담이 줄었습니다.',
        failureTitle: '물가 둔화 신호 재해석',
        failureDetail: '세부 지표에서 끈질긴 물가 압력이 확인되며 채권시장 안도감이 약해졌습니다.',
      },
      {
        title: '미국 재정 안정화 방안 발표',
        detail: '재정 적자 관리 방안이 제시되며 국채시장 불안이 완화됐습니다.',
        failureTitle: '재정 안정화 신뢰 부족',
        failureDetail: '시장에서는 정책 실효성에 의문을 제기하며 장기 금리 안정이 이어지지 못했습니다.',
      },
      {
        title: '연준 완화 가능성 재부각',
        detail: '경기 둔화 신호가 나오며 연준이 긴축을 오래 끌지 않을 것이라는 기대가 커졌습니다.',
        failureTitle: '연준 완화 기대 후퇴',
        failureDetail: '연준 인사들의 매파적 발언으로 채권시장 안도감이 줄었습니다.',
      },
    ],
    baseRateDelta: -0.2,
    impact: { usBond: 0.14, sp500: 0.06, core: 0.07, dogemars: 0.1, enter: 0.04, argBond: 0.06, bank: -0.03, riverbank: -0.03 },
  },
  {
    id: 'em-credit-stress',
    title: '신흥국 신용위험 확대',
    detail: '저신용 국가의 채무 상환 능력에 대한 의심이 커지며 고위험 채권과 위험자산 변동성이 확대됐습니다.',
    principle: '국가 신용위험이 커지면 높은 이자를 기대한 투자도 손실 위험이 커지고, 자금은 안전자산으로 이동할 수 있습니다.',
    affectedAssets: ['고위험 신흥국 채권 변동성 확대', '미국 국채 선호 가능성', '위험자산 회피 가능성', '은행 신용위험 점검'],
    discussionPrompt: '높은 이자를 주는 채권이 오히려 위험할 수 있는 이유는 무엇일까요?',
    financialLinks: ['신용위험', '통화가치', '국가 부채', '안전자산 선호'],
    issueOptions: [
      {
        title: '아르헨티나 IMF 협상 지연',
        detail: '채무 조정과 지원 조건을 둘러싼 협상이 늦어지며 상환 불확실성이 커졌습니다.',
        failureTitle: 'IMF 협상 진전',
        failureDetail: '핵심 조건에 대한 합의가 알려지며 신용위험 우려가 줄었습니다.',
      },
      {
        title: '신흥국 통화가치 급락',
        detail: '달러 강세와 자금 유출 우려로 일부 신흥국 통화가 빠르게 약세를 보였습니다.',
        failureTitle: '신흥국 통화 안정 조치',
        failureDetail: '외환시장 안정 조치와 자금 유입으로 통화 급락 우려가 진정됐습니다.',
      },
      {
        title: '국가 신용등급 하향 경고',
        detail: '국제 신용평가사가 일부 신흥국의 신용등급 하향 가능성을 경고했습니다.',
        failureTitle: '신용등급 유지 확인',
        failureDetail: '신용평가사가 단기 등급 조정 가능성을 낮게 평가하며 시장 충격이 제한됐습니다.',
      },
    ],
    impact: { argBond: -0.22, usBond: 0.08, sp500: -0.03, kospi: -0.04, bank: -0.03, riverbank: -0.03 },
  },
  {
    id: 'em-credit-relief',
    title: '신흥국 신용안정 기대',
    detail: 'IMF 협상 진전과 재정 안정 신호가 겹치며 고위험 국가 채권에 대한 불안이 다소 완화됐습니다.',
    principle: '신용위험이 완화되면 높은 이자를 받는 대신 감수해야 했던 손실 우려가 줄고, 위험자산 선호도 일부 회복될 수 있습니다.',
    affectedAssets: ['고위험 신흥국 채권 반등 가능성', '미국 국채 선호 완화 가능성', '위험자산 심리 회복 가능성'],
    discussionPrompt: '고위험 채권도 정책 신뢰가 회복되면 왜 가격이 반등할 수 있을까요?',
    financialLinks: ['신용위험', '통화가치', '국가 부채', '안전자산 선호'],
    issueOptions: [
      {
        title: '아르헨티나 IMF 협상 진전',
        detail: '채무 조정과 지원 조건에 대한 합의 가능성이 높아지며 시장 불안이 완화됐습니다.',
        failureTitle: 'IMF 협상 진전 보도 부인',
        failureDetail: '핵심 조건 이견이 남아 있다는 보도가 나오며 신용안정 기대가 약해졌습니다.',
      },
      {
        title: '신흥국 통화 안정 조치 효과',
        detail: '외환시장 안정 조치와 자금 유입으로 일부 신흥국 통화가치 급락 우려가 진정됐습니다.',
        failureTitle: '통화 안정 조치 효과 제한',
        failureDetail: '달러 강세 압력이 이어지며 통화 안정 기대가 충분히 이어지지 못했습니다.',
      },
      {
        title: '국가 신용등급 전망 상향',
        detail: '국제 신용평가사가 재정 개선 가능성을 반영해 일부 신흥국의 전망을 높였습니다.',
        failureTitle: '신용등급 전망 상향 보류',
        failureDetail: '정치 불확실성이 남아 있어 등급 전망 조정이 보류됐습니다.',
      },
    ],
    impact: { argBond: 0.2, usBond: -0.05, sp500: 0.03, kospi: 0.04, bank: 0.03, riverbank: 0.03 },
  },
  {
    id: 'war-risk',
    title: '지정학적 긴장 확대',
    detail: '주요 지역의 군사적 긴장이 높아지며 원자재, 항공, 안전자산 변동성이 커졌습니다.',
    principle: '전쟁 위험은 공급망과 물류를 흔들고, 투자자는 위험자산을 줄이고 안전자산을 찾을 수 있습니다.',
    affectedAssets: ['원유 선물 변동성 확대', '항공주 부담 가능성', '미국 국채 선호 가능성', '글로벌 ETF 부담 가능성'],
    discussionPrompt: '전쟁 위험이 기업 실적과 투자 심리에 동시에 영향을 주는 이유는 무엇일까요?',
    financialLinks: ['안전자산 선호', '물류비', '유류비', '공급망'],
    issueOptions: [
      {
        title: '중동 지역 군사 긴장 고조',
        detail: '주요 산유 지역의 군사적 긴장이 높아지며 원유 공급과 해상 운송 우려가 커졌습니다.',
        failureTitle: '중동 긴장 완화 합의',
        failureDetail: '외교 협의가 진전되며 군사 충돌 우려가 낮아졌습니다.',
      },
      {
        title: '해상 운송로 봉쇄 우려',
        detail: '주요 해상 운송로가 불안해질 수 있다는 보도가 나오며 물류비 상승 우려가 확대됐습니다.',
        failureTitle: '운송로 정상 운항 확인',
        failureDetail: '국제 감시단이 주요 운송로가 정상 운영 중이라고 확인했습니다.',
      },
      {
        title: '방산·에너지 안보 이슈 부각',
        detail: '각국이 에너지 안보와 전략 물자 확보를 강조하며 시장 불확실성이 커졌습니다.',
        failureTitle: '안보 이슈 시장 영향 제한',
        failureDetail: '구체적인 충돌이나 공급 차질이 확인되지 않아 시장 영향은 제한됐습니다.',
      },
    ],
    impact: { oilFut: 0.18, oil: 0.12, air: -0.15, oceanair: -0.17, usBond: 0.08, sp500: -0.06, dogemars: -0.05, kospi: -0.05, grainFut: 0.06 },
  },
  {
    id: 'peace-progress',
    title: '지정학적 긴장 완화',
    detail: '휴전 협상과 운송 정상화 기대가 겹치며 전쟁 관련 불안이 다소 누그러졌습니다.',
    principle: '전쟁 위험이 줄면 공급망과 물류비 부담이 완화되고, 위험자산 투자심리도 회복될 수 있습니다.',
    affectedAssets: ['항공주 부담 완화 가능성', '원유 선물 안정 가능성', '미국 국채 선호 완화 가능성', '글로벌 ETF 심리 회복'],
    discussionPrompt: '전쟁 위험이 줄어들면 왜 항공, ETF, 원자재 가격이 함께 반응할 수 있을까요?',
    financialLinks: ['안전자산 선호', '물류비', '유류비', '공급망'],
    issueOptions: [
      {
        title: '휴전 협상 진전 보도',
        detail: '분쟁 지역에서 휴전 협상이 진전되고 있다는 보도가 나오며 군사 충돌 우려가 낮아졌습니다.',
        failureTitle: '휴전 협상 진전 보도 후퇴',
        failureDetail: '핵심 쟁점에서 합의가 이뤄지지 않으며 긴장 완화 기대가 약해졌습니다.',
      },
      {
        title: '주요 해상 운송로 정상화 기대',
        detail: '국제 감시와 호위 강화로 해상 운송 차질 우려가 줄었습니다.',
        failureTitle: '운송로 정상화 기대 제한',
        failureDetail: '국지적 충돌 우려가 남아 있어 운송 정상화 기대가 충분히 이어지지 못했습니다.',
      },
      {
        title: '에너지 안보 협력 발표',
        detail: '각국이 전략 비축분 활용과 공급망 협력을 발표하며 시장 불안이 완화됐습니다.',
        failureTitle: '에너지 안보 협력 실효성 논란',
        failureDetail: '실제 공급 차질 우려가 남아 있어 시장 안도감이 제한됐습니다.',
      },
    ],
    impact: { oilFut: -0.15, oil: -0.08, air: 0.14, oceanair: 0.16, usBond: -0.06, sp500: 0.06, dogemars: 0.05, kospi: 0.05, grainFut: -0.05 },
  },
  {
    id: 'election-risk',
    title: '정치 불확실성 확대',
    detail: '선거와 정책 갈등으로 규제, 세금, 재정 지출 방향이 불확실해졌습니다.',
    principle: '정치 불확실성은 기업의 투자 계획과 국가 신용위험, 환율 흐름에 영향을 줄 수 있습니다.',
    affectedAssets: ['국내 지수 변동성 확대', '은행·건설 정책 민감도 확대', '신흥국 채권 부담 가능성'],
    discussionPrompt: '정치 뉴스가 기업의 실제 매출이 바뀌기 전에도 가격에 반영되는 이유는 무엇일까요?',
    financialLinks: ['정책 민감도', '규제 위험', '국가 부채', '환율'],
    issueOptions: [
      {
        title: '주요 선거 결과 불확실성 확대',
        detail: '경제 정책 방향이 크게 달라질 수 있다는 전망이 나오며 투자자들이 관망세를 보였습니다.',
        failureTitle: '정책 연속성 확인',
        failureDetail: '주요 후보들이 핵심 경제정책의 연속성을 강조하며 불확실성이 줄었습니다.',
      },
      {
        title: '기업 규제 강화 법안 논의',
        detail: '대기업과 플랫폼에 대한 규제 강화 법안이 논의되며 일부 성장 산업 부담이 커졌습니다.',
        failureTitle: '규제 법안 처리 지연',
        failureDetail: '정치권 협의가 늦어지며 단기 시장 영향은 제한됐습니다.',
      },
      {
        title: '재정 지출 확대 논쟁',
        detail: '대규모 재정 지출 가능성이 제기되며 금리와 국가부채 우려가 함께 커졌습니다.',
        failureTitle: '재정 지출안 축소',
        failureDetail: '재정 건전성 우려로 지출안 규모가 조정됐습니다.',
      },
    ],
    impact: { kospi: -0.08, bank: -0.06, riverbank: -0.05, infra: -0.06, metroinfra: -0.08, realty: -0.04, argBond: -0.08, usBond: 0.04 },
  },
  {
    id: 'policy-stability',
    title: '정책 불확실성 완화',
    detail: '선거 이후 정책 방향이 비교적 명확해지고 재정·규제 계획이 정리되며 시장 불안이 줄었습니다.',
    principle: '정책 방향이 분명해지면 기업은 투자 계획을 세우기 쉬워지고, 정책 민감 업종의 할인 요인도 줄 수 있습니다.',
    affectedAssets: ['국내 지수 심리 회복', '은행·건설 정책 민감도 완화', '부동산 심리 안정 가능성', '신흥국 채권 불안 완화 가능성'],
    discussionPrompt: '정치 불확실성이 줄어들면 실제 실적이 바로 바뀌지 않아도 왜 가격이 움직일 수 있을까요?',
    financialLinks: ['정책 민감도', '규제 위험', '국가 부채', '환율'],
    issueOptions: [
      {
        title: '선거 이후 정책 연속성 확인',
        detail: '핵심 경제정책의 큰 방향이 유지될 것이라는 신호가 나오며 투자자들의 불안이 줄었습니다.',
        failureTitle: '정책 연속성 신호 혼선',
        failureDetail: '구체적 실행 계획이 부족하다는 평가로 시장 안도감이 오래가지 못했습니다.',
      },
      {
        title: '기업 규제안 조정 발표',
        detail: '시장과의 협의를 거쳐 기업 규제안이 완화 조정되며 성장 산업 부담 우려가 줄었습니다.',
        failureTitle: '규제안 조정 효과 제한',
        failureDetail: '정치권 이견이 남아 있어 규제 부담 완화 기대가 충분히 반영되지 못했습니다.',
      },
      {
        title: '재정 계획 명확화',
        detail: '정부가 지출 우선순위와 재정 관리 계획을 함께 제시하며 시장 신뢰가 회복됐습니다.',
        failureTitle: '재정 계획 신뢰도 부족',
        failureDetail: '실행 방안이 불분명하다는 평가로 시장 반응이 제한됐습니다.',
      },
    ],
    impact: { kospi: 0.08, bank: 0.05, riverbank: 0.05, infra: 0.06, metroinfra: 0.08, realty: 0.05, argBond: 0.05, usBond: -0.04 },
  },
  {
    id: 'argentina-reform',
    title: '아르헨티나 개혁안 충돌',
    detail: '아르헨티나의 재정 개혁과 통화 안정 정책을 둘러싼 정치 갈등이 커졌습니다.',
    principle: '저신용 국가 채권은 높은 이자 기대가 있지만, 정치·환율·재정 문제가 생기면 가격 변동 가능성이 매우 커집니다.',
    affectedAssets: ['아르헨티나 국채 변동성 확대', '신흥국 위험 회피', '미국 국채 선호 가능성'],
    discussionPrompt: '국가가 발행한 채권도 왜 주식처럼 위험해질 수 있을까요?',
    financialLinks: ['국가 신용등급', '통화가치', '재정적자', 'IMF 협상'],
    issueOptions: [
      {
        title: '아르헨티나 재정 개혁안 의회 부결',
        detail: '재정 지출을 줄이려던 개혁안이 의회에서 막히며 국가 신용위험 우려가 커졌습니다.',
        failureTitle: '개혁안 수정 통과',
        failureDetail: '수정안이 의회를 통과하며 재정 불안 우려가 일부 완화됐습니다.',
      },
      {
        title: '페소화 급락 우려 확대',
        detail: '통화가치 하락과 외환보유고 감소 우려가 커지며 채권 상환 능력에 의문이 제기됐습니다.',
        failureTitle: '외환시장 안정 조치 발표',
        failureDetail: '중앙은행의 안정 조치와 외화 유입 소식으로 통화 급락 우려가 줄었습니다.',
      },
      {
        title: '국가 신용등급 하향',
        detail: '신용평가사가 재정과 정치 불확실성을 이유로 국가 신용등급을 낮췄습니다.',
        failureTitle: '신용등급 전망 유지',
        failureDetail: '신용평가사가 등급을 유지하며 추가 하락 우려가 진정됐습니다.',
      },
    ],
    impact: { argBond: -0.24, usBond: 0.06, sp500: -0.03, kospi: -0.03, grainFut: 0.04 },
  },
  {
    id: 'emergency-stimulus',
    triggerOnly: true,
    title: '실업률 급등 → 긴급 경기부양 패키지 발동',
    detail: '실업률이 8%를 돌파하자 정부와 중앙은행이 동시 완화 정책을 가동했습니다.',
    principle: '경기 침체 신호가 짙어지면 정부는 재정지출을 늘리고 중앙은행은 금리를 낮춥니다.',
    affectedAssets: ['위험자산 단기 반등', '건설/인프라 수혜', '은행 마진 축소', '안전자산 동반 강세'],
    discussionPrompt: '실업률이 너무 높을 때 정부가 돈을 푸는 정책은 어떤 효과와 부작용이 있을까요?',
    issueOptions: [
      {
        title: '대규모 경기부양 패키지 발표',
        detail: '재정지출 확대와 금리 인하가 동시 발표됐습니다. 시장은 단기 반등에 들어갑니다.',
        failureTitle: '부양책 효과 제한',
        failureDetail: '부양책이 발표됐지만 시장 신뢰가 약해 반응이 미약했습니다.',
      },
    ],
    impact: { kospi: 0.05, sp500: 0.04, neo: 0.06, enter: 0.05, realty: 0.04, infra: 0.06, metroinfra: 0.07, bank: -0.03, riverbank: -0.03, usBond: 0.04, goldFut: 0.03, usdKrw: 0.02 },
  },
  {
    id: 'wage-spiral',
    triggerOnly: true,
    title: '완전고용 진입 → 임금-물가 악순환 우려',
    detail: '실업률이 2.5% 아래로 내려가며 임금 상승이 가파릅니다.',
    principle: '실업률이 너무 낮으면 임금이 빠르게 올라 기업 비용과 물가가 함께 상승합니다.',
    affectedAssets: ['금융 수익성 개선', '식품/항공 마진 압박', '안전자산 약세', '원자재 강세'],
    discussionPrompt: '완전고용은 좋은 일인데 왜 중앙은행은 추가 긴축을 시사할까요?',
    issueOptions: [
      {
        title: '인건비 급등에 따른 마진 압박',
        detail: '기업들이 임금 인상을 발표하며 물가 자극이 우려됩니다.',
        failureTitle: '임금 상승 일시적 안정',
        failureDetail: '임금 상승세가 잠시 둔화돼 우려가 가라앉았습니다.',
      },
    ],
    impact: { food: -0.04, purefood: -0.05, air: -0.05, oceanair: -0.06, enter: -0.03, bank: 0.05, riverbank: 0.04, usBond: -0.04, goldFut: 0.05, oilFut: 0.04 },
  },
  {
    id: 'credit-crunch',
    triggerOnly: true,
    title: '고금리 장기화 → 신용경색 현실화',
    detail: '기준금리가 7%를 넘기며 기업 차입과 가계 대출이 급격히 위축됐습니다.',
    principle: '금리가 장기간 높으면 부채가 많은 기업과 신흥국이 자금난을 겪습니다.',
    affectedAssets: ['부채 많은 기업 직격탄', '신흥국 채권 폭락', '안전자산 선호 강화', '금 강세'],
    discussionPrompt: '금리가 높을수록 모두에게 좋을까요? 누구에게 가장 큰 부담이 될까요?',
    issueOptions: [
      {
        title: '기업 부도 우려 확산',
        detail: '부채가 많은 기업과 신흥국 채권에서 자금이 빠르게 이탈하고 있습니다.',
        failureTitle: '신용시장 일시 안정',
        failureDetail: '중앙은행 구두 개입으로 우려가 잠시 진정됐습니다.',
      },
    ],
    impact: { realty: -0.12, infra: -0.10, metroinfra: -0.13, neo: -0.08, dogemars: -0.10, bank: -0.05, riverbank: -0.07, argBond: -0.14, usBond: 0.05, goldFut: 0.08, usdKrw: 0.04 },
  },
  {
    id: 'liquidity-flood',
    triggerOnly: true,
    title: '초저금리 지속 → 유동성 과잉 경고',
    detail: '기준금리가 1% 아래로 내려가며 시중에 자금이 넘쳐납니다.',
    principle: '금리가 너무 낮으면 자산 가격이 급등하지만, 거품 위험이 함께 쌓입니다.',
    affectedAssets: ['위험자산 급등', '부동산 과열', '금융주 마진 압박', '안전자산 약세'],
    discussionPrompt: '자산 가격이 빠르게 오르는 것이 모두에게 좋은 일일까요?',
    issueOptions: [
      {
        title: '유동성 파티 — 자산 가격 급등',
        detail: '저금리로 풀린 자금이 위험자산에 몰리며 단기 급등이 나타납니다.',
        failureTitle: '유동성 효과 제한',
        failureDetail: '시장이 향후 긴축을 미리 반영해 반응이 약했습니다.',
      },
    ],
    impact: { realty: 0.10, neo: 0.09, dogemars: 0.12, enter: 0.07, kospi: 0.06, sp500: 0.05, argBond: 0.06, goldFut: 0.06, usBond: 0.03, bank: -0.04 },
  },
  {
    id: 'fx-intervention',
    triggerOnly: true,
    title: '환율 1,600원 돌파 → 외환당국 시장 개입',
    detail: '원화 약세가 심화되자 외환보유고를 동원한 시장 안정화에 들어갔습니다.',
    principle: '환율이 급등하면 외환당국은 보유한 달러를 풀어 환율을 진정시킵니다.',
    affectedAssets: ['환율 단기 하락', '항공/수입주 회복', '신흥국 채권 안정', '미국 ETF 환차익 축소'],
    discussionPrompt: '외환보유고를 사용해 환율을 막는 정책의 한계는 무엇일까요?',
    issueOptions: [
      {
        title: '외환당국 강력 개입',
        detail: '대규모 달러 매도로 환율이 단기 진정됐습니다.',
        failureTitle: '개입 효과 제한',
        failureDetail: '시장 압력이 강해 개입 효과가 오래가지 않았습니다.',
      },
    ],
    impact: { usdKrw: -0.05, air: 0.06, oceanair: 0.07, food: 0.03, purefood: 0.03, kospi: 0.02, sp500: -0.03, argBond: -0.04 },
  },
  {
    id: 'realty-cooling-policy',
    triggerOnly: true,
    title: '부동산 과열 → 정부 규제 패키지 발표',
    detail: '부동산 지수가 과열권에 진입하자 대출 규제와 보유세 강화가 발표됐습니다.',
    principle: '자산 가격이 과열되면 정부는 대출 규제와 세금으로 수요를 억제합니다.',
    affectedAssets: ['부동산 ETF 조정', '건설 약세', '금융주 부담', '안전자산 선호'],
    discussionPrompt: '정부가 자산 가격을 직접 통제하는 것은 시장 원리에 어긋날까요?',
    issueOptions: [
      {
        title: '부동산 규제 종합 패키지 시행',
        detail: '대출 규제와 보유세 강화가 동시 발표되며 부동산 자산이 조정에 들어갑니다.',
        failureTitle: '규제 효과 제한',
        failureDetail: '규제가 발표됐지만 시장 충격은 예상보다 작았습니다.',
      },
    ],
    impact: { realty: -0.10, infra: -0.06, metroinfra: -0.07, bank: -0.04, riverbank: -0.05, usBond: 0.04, goldFut: 0.03 },
  },
];

const won = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat('ko-KR', {
  signDisplay: 'exceptZero',
  maximumFractionDigits: 1,
});

// Week 3 G — UTF-8 바이트 길이 측정 (한글 1자 = 3바이트)
function getByteLength(str) {
  if (!str) return 0;
  try {
    return new TextEncoder().encode(str).length;
  } catch {
    // Fallback: 대략 추정
    let bytes = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else bytes += 3;
    }
    return bytes;
  }
}

// Week 3 G — 입력 문자열을 maxBytes 이하로 자르기 (한글자 단위 절단 보장)
function clampToByteLength(str, maxBytes) {
  if (!str) return '';
  if (getByteLength(str) <= maxBytes) return str;
  let result = str;
  while (getByteLength(result) > maxBytes && result.length > 0) {
    result = result.slice(0, -1);
  }
  return result;
}

function formatWon(value) {
  return won.format(Math.round(value));
}

function formatPercent(value) {
  return `${percent.format(value)}%`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getJoinUrl(roomPin) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/?view=student&pin=${roomPin}&entry=qr`;
}

function getInitialRoomPin() {
  if (typeof window === 'undefined') return '';
  const pinFromUrl = new URLSearchParams(window.location.search).get('pin');
  return pinFromUrl && /^[0-9]{6}$/.test(pinFromUrl) ? pinFromUrl : '';
}

function getInitialView() {
  if (typeof window === 'undefined') return 'host-login';
  const params = new URLSearchParams(window.location.search);
  return params.get('view') === 'student' && params.get('entry') === 'qr' ? 'student' : 'host-login';
}

function getInitialStudentEntryAllowed() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('view') === 'student' && params.get('entry') === 'qr';
}

function getPortfolioValue(portfolio, assets) {
  return assets.reduce((sum, asset) => sum + (portfolio[asset.id] ?? 0) * asset.price, 0);
}

function getTotalAsset({ cash, deposit, portfolio, assets }) {
  return cash + deposit + getPortfolioValue(portfolio, assets);
}

function getPaidRoundCount({ gameStarted, round, phase }) {
  if (!gameStarted) return 0;
  return phase === 'setup' ? Math.max(0, round - 1) : round;
}

function getInvestedPrincipal({ gameStarted, round, phase, memberCount = 1, salaryPaidRounds = null }) {
  if (!gameStarted) return 0;
  // 가능하면 실제로 지급된 급여 횟수(salaryPaidRounds)를 기준으로 원금을 계산해
  //   "phase는 open으로 바뀌었지만 급여 effect가 아직 실행되지 않은 한 박자"에
  //   원금만 먼저 부풀어 수익률이 잠깐 -%로 표시되는 깜빡임을 막는다.
  // salaryPaidRounds가 주어지지 않으면(팀 모드/교사 산출) 기존 phase 기반 추정값 사용.
  const paidCount = Array.isArray(salaryPaidRounds)
    ? salaryPaidRounds.length
    : getPaidRoundCount({ gameStarted, round, phase });
  return INITIAL_CASH + ROUND_SALARY * paidCount * Math.max(1, memberCount);
}

function getInvestmentReturnRate(totalAsset, investedPrincipal) {
  if (!investedPrincipal) return 0;
  return ((totalAsset - investedPrincipal) / investedPrincipal) * 100;
}

function getHoldingSummary(portfolio, assets) {
  const rows = getHoldingRows(portfolio, assets);
  return rows.length
    ? rows.map(({ asset, shares }) => `${asset.name} ${shares.toLocaleString('ko-KR')}주`).join(', ')
    : '보유 종목 없음';
}

function getPassiveMarketMove(asset, volatilityMode = 'standard') {
  let mult = 1;
  if (asset?.type === 'stock') {
    if (asset.size === 'large') mult = PASSIVE_MOVE_LARGE_MULT;
    else if (asset.size === 'small') mult = PASSIVE_MOVE_SMALL_MULT;
  } else if (asset?.type === 'bond') mult = PASSIVE_MOVE_BOND_MULT;
  else if (asset?.type === 'forex') mult = PASSIVE_MOVE_FOREX_MULT;
  else if (asset?.type === 'futures' && asset.id === 'goldFut') mult = PASSIVE_MOVE_GOLD_MULT;
  // Week 1 M — 변동성 학습 모드: ±5% → ±8% (1.6배)
  const volatilityBoost = volatilityMode === 'volatility' ? 1.6 : 1;
  const raw = (Math.random() * 2 - 1) * PASSIVE_MARKET_MOVE * mult * volatilityBoost;
  return Number(raw.toFixed(3));
}

function getImpactBounds(asset, absoluteImpact) {
  const isDirectAsset = absoluteImpact >= DIRECT_REPEATED_IMPACT_THRESHOLD;
  if (!asset) return { min: isDirectAsset ? MIN_EVENT_IMPACT : 0.03, max: isDirectAsset ? 0.28 : 0.08 };
  if (asset.type === 'stock' || asset.type === 'futures') {
    return isDirectAsset ? { min: MIN_EVENT_IMPACT, max: 0.32 } : { min: 0.03, max: 0.08 };
  }
  if (asset.type === 'etf') {
    return isDirectAsset ? { min: 0.05, max: 0.12 } : { min: 0.015, max: 0.055 };
  }
  if (asset.type === 'bond' || asset.type === 'property') {
    return isDirectAsset ? { min: 0.04, max: 0.1 } : { min: 0.015, max: 0.05 };
  }
  return { min: 0.03, max: 0.08 };
}

function getRepeatedImpactBounds(asset, repeatedFloor, absoluteImpact) {
  const isDirectAsset = absoluteImpact >= DIRECT_REPEATED_IMPACT_THRESHOLD;
  if (isDirectAsset && (asset?.type === 'stock' || asset?.type === 'futures')) {
    return { min: repeatedFloor, max: 0.95 };
  }
  if (isDirectAsset && asset?.type === 'etf') return { min: 0.08, max: Math.min(0.22, repeatedFloor * 0.28) };
  if (isDirectAsset && (asset?.type === 'bond' || asset?.type === 'property')) return { min: 0.06, max: Math.min(0.18, repeatedFloor * 0.22) };
  return { min: MIN_INDIRECT_REPEATED_EVENT_IMPACT, max: MAX_INDIRECT_REPEATED_EVENT_IMPACT };
}

function normalizeEventImpact(impact = {}, assets = []) {
  const assetMap = Object.fromEntries(assets.map((asset) => [asset.id, asset]));
  return Object.fromEntries(
    Object.entries(impact).map(([assetId, value]) => {
      if (value === 0) return [assetId, 0];
      const direction = value > 0 ? 1 : -1;
      const absoluteImpact = Math.abs(value);
      const { min, max } = getImpactBounds(assetMap[assetId], absoluteImpact);
      const adjustedValue = direction * clampNumber(absoluteImpact, min, max);
      return [assetId, Number(adjustedValue.toFixed(3))];
    }),
  );
}

function getRepeatedImpactFloor(count) {
  if (count >= 4) return MIN_EXTREME_EVENT_IMPACT;
  if (count >= 3) return MIN_TRIPLE_EVENT_IMPACT;
  return MIN_REPEATED_EVENT_IMPACT;
}

function normalizeRepeatedEventImpact(impact = {}, repeatedCount = 2, assets = []) {
  const repeatedFloor = getRepeatedImpactFloor(repeatedCount);
  const assetMap = Object.fromEntries(assets.map((asset) => [asset.id, asset]));
  return Object.fromEntries(
    Object.entries(impact).map(([assetId, value]) => {
      if (value === 0) return [assetId, 0];
      const direction = value > 0 ? 1 : -1;
      const absoluteImpact = Math.abs(value);
      const { min, max } = getRepeatedImpactBounds(assetMap[assetId], repeatedFloor, absoluteImpact);
      const adjustedValue = clampNumber(absoluteImpact, min, max);
      return [assetId, Number((direction * adjustedValue).toFixed(3))];
    }),
  );
}

function getAppliedEventTypeCounts(events) {
  return events.reduce((acc, event) => {
    if (!event.didApply) return acc;
    const eventKey = getEventKey(event);
    acc[eventKey] = (acc[eventKey] ?? 0) + 1;
    return acc;
  }, {});
}

const eventMacroImpacts = {
  'rate-up': { baseRateDelta: 0.5, propertyMove: -0.04, exchangeMove: 0.01, unemploymentDelta: 0.1 },
  'rate-down': { baseRateDelta: -0.5, propertyMove: 0.04, exchangeMove: -0.01, unemploymentDelta: -0.08 },
  'deposit-special': { baseRateDelta: 0.25, propertyMove: -0.02, exchangeMove: 0, unemploymentDelta: 0.02 },
  'growth-boom': { baseRateDelta: 0.25, propertyMove: 0.035, exchangeMove: -0.01, unemploymentDelta: -0.18 },
  'recession-risk': { baseRateDelta: -0.15, propertyMove: -0.04, exchangeMove: 0.015, unemploymentDelta: 0.22 },
  'jobs-improve': { baseRateDelta: 0.15, propertyMove: 0.025, exchangeMove: -0.005, unemploymentDelta: -0.25 },
  'unemployment-worse': { baseRateDelta: -0.1, propertyMove: -0.035, exchangeMove: 0.015, unemploymentDelta: 0.3 },
  'inflation-cool': { baseRateDelta: -0.25, propertyMove: 0.02, exchangeMove: -0.01, unemploymentDelta: -0.04 },
  'inflation-rebound': { baseRateDelta: 0.3, propertyMove: -0.025, exchangeMove: 0.015, unemploymentDelta: 0.06 },
  'fx-stabilize': { baseRateDelta: -0.05, propertyMove: 0.01, exchangeMove: -0.035, unemploymentDelta: -0.04 },
  'fx-volatility': { baseRateDelta: 0.05, propertyMove: -0.015, exchangeMove: 0.045, unemploymentDelta: 0.06 },
  'property-ease': { baseRateDelta: 0, propertyMove: 0.06, exchangeMove: 0, unemploymentDelta: -0.05 },
  'property-tighten': { baseRateDelta: 0.05, propertyMove: -0.06, exchangeMove: 0.005, unemploymentDelta: 0.06 },
  'us-rally': { baseRateDelta: 0, propertyMove: 0.01, exchangeMove: -0.015, unemploymentDelta: -0.08 },
  'korea-export': { baseRateDelta: 0.05, propertyMove: 0.01, exchangeMove: -0.01, unemploymentDelta: -0.12 },
  rare: { baseRateDelta: 0, propertyMove: -0.01, exchangeMove: 0.02, unemploymentDelta: 0.05 },
  housing: { baseRateDelta: 0, propertyMove: 0.04, exchangeMove: 0, unemploymentDelta: -0.08 },
  'green-subsidy': { baseRateDelta: -0.05, propertyMove: 0.01, exchangeMove: -0.005, unemploymentDelta: -0.04 },
  'us-regulation': { baseRateDelta: 0, propertyMove: -0.01, exchangeMove: 0.01, unemploymentDelta: 0.08 },
  'drug-breakthrough': { baseRateDelta: 0, propertyMove: 0, exchangeMove: 0, unemploymentDelta: -0.03 },
  'drug-setback': { baseRateDelta: 0, propertyMove: -0.005, exchangeMove: 0.005, unemploymentDelta: 0.03 },
  'fx-spike': { baseRateDelta: 0, propertyMove: -0.01, exchangeMove: 0.06, unemploymentDelta: 0.04 },
  'korea-us-chip-tension': { baseRateDelta: 0, propertyMove: -0.01, exchangeMove: 0.02, unemploymentDelta: 0.08 },
  'oil-supply-shock': { baseRateDelta: 0.1, propertyMove: -0.01, exchangeMove: 0.025, unemploymentDelta: 0.08 },
  'oil-supply-relief': { baseRateDelta: -0.1, propertyMove: 0.01, exchangeMove: -0.02, unemploymentDelta: -0.06 },
  'grain-shock': { baseRateDelta: 0.1, propertyMove: -0.005, exchangeMove: 0.015, unemploymentDelta: 0.06 },
  'grain-relief': { baseRateDelta: -0.08, propertyMove: 0.005, exchangeMove: -0.01, unemploymentDelta: -0.04 },
  'us-yield-spike': { baseRateDelta: 0.3, propertyMove: -0.03, exchangeMove: 0.03, unemploymentDelta: 0.1 },
  'us-yield-cooldown': { baseRateDelta: -0.2, propertyMove: 0.025, exchangeMove: -0.025, unemploymentDelta: -0.06 },
  'em-credit-stress': { baseRateDelta: 0, propertyMove: -0.02, exchangeMove: 0.035, unemploymentDelta: 0.12 },
  'em-credit-relief': { baseRateDelta: -0.05, propertyMove: 0.015, exchangeMove: -0.025, unemploymentDelta: -0.08 },
  'war-risk': { baseRateDelta: 0.1, propertyMove: -0.025, exchangeMove: 0.04, unemploymentDelta: 0.15 },
  'peace-progress': { baseRateDelta: -0.08, propertyMove: 0.02, exchangeMove: -0.03, unemploymentDelta: -0.12 },
  'election-risk': { baseRateDelta: 0.05, propertyMove: -0.025, exchangeMove: 0.025, unemploymentDelta: 0.08 },
  'policy-stability': { baseRateDelta: -0.02, propertyMove: 0.02, exchangeMove: -0.015, unemploymentDelta: -0.06 },
  'argentina-reform': { baseRateDelta: 0, propertyMove: -0.01, exchangeMove: 0.025, unemploymentDelta: 0.05 },
  'emergency-stimulus': { baseRateDelta: -0.4, propertyMove: 0.02, exchangeMove: 0.005, unemploymentDelta: -0.3 },
  'wage-spiral': { baseRateDelta: 0.3, propertyMove: -0.01, exchangeMove: -0.005, unemploymentDelta: 0.05 },
  'credit-crunch': { baseRateDelta: -0.2, propertyMove: -0.04, exchangeMove: 0.01, unemploymentDelta: 0.4 },
  'liquidity-flood': { baseRateDelta: 0.15, propertyMove: 0.04, exchangeMove: -0.005, unemploymentDelta: -0.1 },
  'fx-intervention': { baseRateDelta: 0, propertyMove: 0, exchangeMove: -0.025, unemploymentDelta: 0 },
  'realty-cooling-policy': { baseRateDelta: 0.05, propertyMove: -0.05, exchangeMove: 0, unemploymentDelta: 0.1 },
};

function combineEventMacroImpacts(events) {
  return events.reduce(
    (acc, event) => {
      // Week 3 H — 반전 이슈도 매크로 영향 반영 (강도 reverseFactor, 기본 -0.5)
      const isReverse = event.outcomeType === 'reverse';
      if (!event.didApply && !isReverse) return acc;
      const factor = isReverse ? (event.reverseFactor ?? -0.5) : 1;
      const impact = event.macroImpact ?? eventMacroImpacts[getEventKey(event)] ?? {};
      return {
        baseRateDelta: acc.baseRateDelta + (impact.baseRateDelta ?? 0) * factor,
        propertyMove: acc.propertyMove + (impact.propertyMove ?? 0) * factor,
        exchangeMove: acc.exchangeMove + (impact.exchangeMove ?? 0) * factor,
        unemploymentDelta: acc.unemploymentDelta + (impact.unemploymentDelta ?? 0) * factor,
      };
    },
    { baseRateDelta: 0, propertyMove: 0, exchangeMove: 0, unemploymentDelta: 0 },
  );
}

function combineResolvedImpacts(events) {
  const groupedImpacts = events.reduce((groups, event) => {
    // Week 3 H — 반전 이슈(outcomeType === 'reverse')도 가격 합산 대상에 포함
    const isReverse = event.outcomeType === 'reverse';
    if (!event.didApply && !isReverse) return groups;
    const groupKey = event.repeatedVolatility ? getEventKey(event) : event.id;
    const group = groups[groupKey] ?? {};

    Object.entries(event.resolvedImpact).forEach(([assetId, value]) => {
      const currentValue = group[assetId] ?? 0;
      group[assetId] = event.repeatedVolatility && Math.abs(currentValue) >= Math.abs(value)
        ? currentValue
        : currentValue + value;
    });

    groups[groupKey] = group;
    return groups;
  }, {});

  return Object.values(groupedImpacts).reduce((acc, group) => {
    Object.entries(group).forEach(([assetId, value]) => {
      acc[assetId] = (acc[assetId] ?? 0) + value;
    });
    return acc;
  }, {});
}

// 사이즈 팩터: 우량주 vs 중소형주 — 같은 이슈에 다른 진폭으로 반응
function applySizeFactor(impactMap, assetsList) {
  if (!impactMap || !assetsList) return impactMap;
  const out = {};
  const assetMap = {};
  for (const a of assetsList) assetMap[a.id] = a;
  for (const id of Object.keys(impactMap)) {
    const a = assetMap[id];
    const val = impactMap[id];
    if (a?.type === 'stock' && a.size && SIZE_ISSUE_MULT[a.size]) {
      out[id] = Number((val * SIZE_ISSUE_MULT[a.size]).toFixed(3));
    } else {
      out[id] = val;
    }
  }
  return out;
}

// 거시지표 임계점 트리거 감지 (다음 라운드에 자동 발동될 이슈 결정)
function detectMacroTriggers(macroSnapshot, triggerCooldowns) {
  const fired = [];
  const nextCooldowns = { ...(triggerCooldowns ?? {}) };
  for (const trig of MACRO_TRIGGERS) {
    const onCooldown = (nextCooldowns[trig.id] ?? 0) > 0;
    if (!onCooldown && trig.when(macroSnapshot)) {
      fired.push(trig.id);
      nextCooldowns[trig.id] = trig.cooldown;
    }
  }
  for (const id of Object.keys(nextCooldowns)) {
    nextCooldowns[id] = Math.max(0, (nextCooldowns[id] ?? 0) - 1);
  }
  return { fired, nextCooldowns };
}

// 학습용 비교 시뮬레이션: 같은 총 납입금으로 정기예금 vs 정기적금 만기 금액 비교
function simulateSavingsComparison(totalAmount, rounds, annualRate) {
  // 정기예금: 라운드 0에 totalAmount 일시 예치, 만기까지 분기 복리
  const quarterly = annualRate / 100 / 4;
  const timeDepositFinal = Math.round(totalAmount * Math.pow(1 + quarterly, rounds));
  // 정기적금: 매 라운드 monthly만큼 납입 (회차별로 잔여 기간이 다름)
  const monthly = totalAmount / rounds;
  let recurringFinal = 0;
  for (let r = 1; r <= rounds; r++) {
    // r번째 납입은 (rounds - r + 1) 라운드 동안 이자 받음... 단순화: (rounds - r)
    const remaining = rounds - r + 1;
    recurringFinal += monthly * Math.pow(1 + quarterly, remaining);
  }
  recurringFinal = Math.round(recurringFinal);
  return {
    timeDepositFinal,
    recurringFinal,
    timeDepositInterest: timeDepositFinal - totalAmount,
    recurringInterest: recurringFinal - totalAmount,
    diff: timeDepositFinal - recurringFinal,
  };
}


function getRandomMacroDelta(max, decimals = 2) {
  return Number(((Math.random() * 2 - 1) * max).toFixed(decimals));
}

function createMacroMove({ baseRate, propertyIndex, exchangeRate, unemploymentRate, eventMacroImpact = {}, randomMacroImpact = null }) {
  const randomBaseRateDelta = randomMacroImpact?.baseRateDelta ?? getRandomMacroDelta(0.2, 2);
  const randomPropertyMove = randomMacroImpact?.propertyMove ?? getRandomMacroDelta(0.03, 3);
  const randomExchangeMove = randomMacroImpact?.exchangeMove ?? getRandomMacroDelta(0.04, 3);
  const randomUnemploymentDelta = randomMacroImpact?.unemploymentDelta ?? getRandomMacroDelta(0.18, 2);
  const baseRateDelta = Number((randomBaseRateDelta + (eventMacroImpact.baseRateDelta ?? 0)).toFixed(2));
  const propertyMove = Number((randomPropertyMove + (eventMacroImpact.propertyMove ?? 0)).toFixed(3));
  const exchangeMove = Number((randomExchangeMove + (eventMacroImpact.exchangeMove ?? 0)).toFixed(3));
  const unemploymentDelta = Number((randomUnemploymentDelta + (eventMacroImpact.unemploymentDelta ?? 0)).toFixed(2));
  const nextBaseRate = Math.max(0, Number((baseRate + baseRateDelta).toFixed(2)));
  const nextPropertyIndex = Math.max(80, Math.round(propertyIndex * (1 + propertyMove)));
  const nextExchangeRate = Math.max(900, Math.round(exchangeRate * (1 + exchangeMove)));
  const nextUnemploymentRate = clampNumber(Number((unemploymentRate + unemploymentDelta).toFixed(2)), 1.5, 14);
  const assetImpact = {
    bank: baseRateDelta > 0 ? 0.03 : -0.03,
    riverbank: baseRateDelta > 0 ? 0.025 : -0.025,
    neo: baseRateDelta > 0 ? -0.03 : 0.03,
    dogemars: baseRateDelta > 0 ? -0.035 : 0.035,
    enter: baseRateDelta > 0 ? -0.03 : 0.03,
    realty: propertyMove * 0.8 + (baseRateDelta > 0 ? -0.03 : 0.03),
    infra: propertyMove * 0.5,
    metroinfra: propertyMove * 0.65,
    sp500: exchangeMove * 0.8,
    // KOSPI: 환율 상승 시 외국인 자금 유출로 하락 압력 (정석)
    kospi: exchangeMove > 0 ? -0.02 : 0.02,
    air: exchangeMove > 0 ? -0.04 : 0.03,
    oceanair: exchangeMove > 0 ? -0.05 : 0.035,
    food: exchangeMove > 0 ? -0.03 : 0.02,
    purefood: exchangeMove > 0 ? -0.02 : 0.015,
    // 채권: 금리 변동에 선형 비례 직접 충격 (금리 +0.5%p → 채권 -4%)
    usBond: -baseRateDelta * 0.08,
    argBond: -baseRateDelta * 0.05 + (exchangeMove > 0 ? -0.04 : 0.02),
    // 금: 실질금리 ↑ 시 약세, 환율 변동성 보호
    goldFut: -baseRateDelta * 0.04 + (exchangeMove > 0 ? 0.02 : -0.01),
    // USD/KRW: 환율 변화 직접 추종
    usdKrw: exchangeMove * 1.0,
  };
  const unemploymentImpact = unemploymentDelta > 0
    ? { air: -0.03, oceanair: -0.04, enter: -0.03, realty: -0.025, infra: -0.02, metroinfra: -0.03, bank: -0.015, riverbank: -0.02, usBond: 0.02, food: 0.01, purefood: 0.015 }
    : { air: 0.025, oceanair: 0.03, enter: 0.025, realty: 0.02, infra: 0.018, metroinfra: 0.02, bank: 0.012, riverbank: 0.012, usBond: -0.01 };

  return {
    baseRateDelta,
    propertyMove,
    exchangeMove,
    unemploymentDelta,
    nextBaseRate,
    nextPropertyIndex,
    nextExchangeRate,
    nextUnemploymentRate,
    assetImpact: combineImpacts(assetImpact, unemploymentImpact),
    eventMacroImpact,
    randomMacroImpact: {
      baseRateDelta: randomBaseRateDelta,
      propertyMove: randomPropertyMove,
      exchangeMove: randomExchangeMove,
      unemploymentDelta: randomUnemploymentDelta,
    },
  };
}

function combineImpacts(...impacts) {
  return impacts.reduce((acc, impact = {}) => {
    Object.entries(impact).forEach(([assetId, value]) => {
      acc[assetId] = (acc[assetId] ?? 0) + value;
    });
    return acc;
  }, {});
}

function getFinancialSensitivityImpact(asset, macroMove, resolvedEvents) {
  if (asset.type !== 'stock' || !asset.financials) return 0;
  const financials = asset.financials;
  const appliedEventKeys = new Set(resolvedEvents.filter((event) => event.didApply).map(getEventKey));
  let impact = 0;

  if (macroMove.baseRateDelta > 0) {
    impact -= clampNumber((financials.debtRatio - 60) / 260, 0, 1) * 0.035;
  } else if (macroMove.baseRateDelta < 0) {
    impact += clampNumber((financials.debtRatio - 60) / 260, 0, 1) * 0.025;
  }

  impact += macroMove.exchangeMove * ((financials.exportRatio - financials.commodityExposure * 0.45) / 100) * 0.45;

  if (macroMove.unemploymentDelta > 0) {
    impact -= ((financials.cyclicality + financials.laborSensitivity) / 200) * 0.025;
  } else if (macroMove.unemploymentDelta < 0) {
    impact += ((financials.cyclicality + financials.laborSensitivity) / 200) * 0.015;
  }

  if (appliedEventKeys.has('oil-supply-shock') || appliedEventKeys.has('war-risk')) {
    impact -= (financials.commodityExposure / 100) * 0.022;
  }
  if (appliedEventKeys.has('grain-shock') && asset.sector.includes('식품')) {
    impact -= (financials.commodityExposure / 100) * 0.026;
  }
  if (appliedEventKeys.has('rare') && (asset.sector.includes('반도체') || asset.sector.includes('전기차') || asset.sector.includes('재생'))) {
    impact -= (financials.commodityExposure / 100) * 0.024;
  }
  if (appliedEventKeys.has('us-regulation') && asset.country === '미국') {
    impact -= (financials.policySensitivity / 100) * 0.024;
  }
  if ((appliedEventKeys.has('housing') || appliedEventKeys.has('property-ease')) && asset.sector.includes('인프라')) {
    impact += (financials.policySensitivity / 100) * 0.022;
  }
  if (appliedEventKeys.has('growth-boom') || appliedEventKeys.has('jobs-improve')) {
    impact += (financials.cyclicality / 100) * 0.018;
  }
  if (appliedEventKeys.has('recession-risk') || appliedEventKeys.has('unemployment-worse')) {
    impact -= ((financials.cyclicality + financials.creditRisk) / 200) * 0.026;
  }
  if (appliedEventKeys.has('inflation-cool')) {
    impact += clampNumber((financials.debtRatio - 60) / 260, 0, 1) * 0.018;
    impact += (financials.rdRatio / 100) * 0.025;
  }
  if (appliedEventKeys.has('inflation-rebound')) {
    impact -= (financials.commodityExposure / 100) * 0.02;
    impact -= clampNumber((financials.debtRatio - 80) / 260, 0, 1) * 0.018;
  }
  if (appliedEventKeys.has('fx-stabilize') && financials.commodityExposure > financials.exportRatio) {
    impact += ((financials.commodityExposure - financials.exportRatio) / 100) * 0.018;
  }
  if (appliedEventKeys.has('fx-volatility') && financials.commodityExposure > 55) {
    impact -= (financials.commodityExposure / 100) * 0.018;
  }

  if (impact < 0) {
    const cashBuffer = clampNumber((financials.cashReserve / Math.max(financials.revenue, 0.1)) * 0.12, 0, 0.25);
    impact *= (1 - cashBuffer);
    if (financials.debtRatio >= 180) impact *= 1.15;
  }

  return Number(clampNumber(impact, -0.04, 0.04).toFixed(3));
}

function getFinancialImpactMap(assets, macroMove, resolvedEvents) {
  return Object.fromEntries(
    assets
      .map((asset) => [asset.id, getFinancialSensitivityImpact(asset, macroMove, resolvedEvents)])
      .filter(([, impact]) => impact !== 0),
  );
}

function updateAssetFinancials(asset, totalImpact, macroMove) {
  if (!asset.financials) return null;
  const financials = asset.financials;
  const revenueMove = clampNumber(
    totalImpact * 0.45
      + macroMove.exchangeMove * ((financials.exportRatio - financials.commodityExposure * 0.35) / 100)
      - Math.max(0, macroMove.unemploymentDelta) * 0.015,
    -0.08,
    0.08,
  );
  const marginDelta = clampNumber(
    totalImpact * 5
      - Math.max(0, macroMove.baseRateDelta) * (financials.debtRatio / 240) * 0.8
      - Math.max(0, macroMove.unemploymentDelta) * (financials.laborSensitivity / 100),
    -2.4,
    2.4,
  );
  const debtDelta = macroMove.baseRateDelta * (financials.debtRatio >= 150 ? 8 : 4) - totalImpact * 10;
  const nextMargin = clampNumber(financials.operatingMargin + marginDelta, -8, 38);

  return {
    ...financials,
    revenue: Number(clampNumber(financials.revenue * (1 + revenueMove), 0.2, 40).toFixed(2)),
    operatingMargin: Number(nextMargin.toFixed(1)),
    debtRatio: Math.round(clampNumber(financials.debtRatio + debtDelta + (nextMargin < 2 ? 4 : 0), 10, 360)),
    cashReserve: Number(clampNumber(financials.cashReserve * (1 + nextMargin / 1000 + totalImpact * 0.08), 0.02, 10).toFixed(2)),
    creditRisk: Math.round(clampNumber(financials.creditRisk + macroMove.unemploymentDelta * 2 + Math.max(0, macroMove.baseRateDelta) * 2 - totalImpact * 8, 3, 98)),
  };
}

function moveAssetsLocally(currentAssets, modifier = {}, delistedIds = [], roundNumber = 1, macroMove = null, negativeStreakByAsset = {}, volatilityMode = 'standard') {
  return currentAssets.map((asset) => {
    if (asset.delisted) return asset;
    if (delistedIds.includes(asset.id)) {
      return {
        ...asset,
        delisted: true,
        delistedRound: roundNumber,
        negativeStreak: negativeStreakByAsset[asset.id] ?? asset.negativeStreak ?? 0,
        price: 0,
        history: [...asset.history, 0].slice(-13),
      };
    }
    const eventImpact = modifier[asset.id] ?? 0;
    const marketMove = getPassiveMarketMove(asset, volatilityMode);
    const nextPrice = Math.max(1000, Math.round((asset.price * (1 + marketMove + eventImpact)) / 100) * 100);
    return {
      ...asset,
      price: nextPrice,
      history: [...asset.history, nextPrice].slice(-13),
      negativeStreak: negativeStreakByAsset[asset.id] ?? asset.negativeStreak ?? 0,
      financials: macroMove ? updateAssetFinancials(asset, eventImpact + marketMove, macroMove) ?? asset.financials : asset.financials,
    };
  });
}

function getChange(asset) {
  const before = asset.history.at(-2) ?? asset.price;
  if (!before) return 0;
  return ((asset.price - before) / before) * 100;
}

function assetMatchesTypeFilter(asset, filterKey) {
  if (filterKey === 'domestic-stock') return asset.type === 'stock' && asset.country === '한국';
  if (filterKey === 'overseas-stock') return asset.type === 'stock' && asset.country !== '한국';
  if (filterKey === 'property') return asset.type === 'property';
  if (filterKey === 'all') return true;
  return asset.type === filterKey;
}

function assetMatchesThemeFilter(asset, themeKey) {
  const theme = assetThemeOptions.find((option) => option.key === themeKey);
  if (!theme || !theme.assetIds) return true;
  return theme.assetIds.includes(asset.id);
}

function getPrimaryThemeIndex(asset) {
  const index = assetThemeOptions.findIndex((option) => option.assetIds?.includes(asset.id));
  return index === -1 ? assetThemeOptions.length : index;
}

function getPrimaryThemeLabel(asset) {
  return assetThemeOptions.find((option) => option.assetIds?.includes(asset.id))?.label ?? '기타';
}

function getAssetFilterLabel(options, value) {
  return options.find((option) => option.key === value)?.label ?? '전체';
}

function getVisibleAssets(assets, { typeFilter = 'all', themeFilter = 'all', sortMode = 'default' } = {}) {
  const filtered = assets.filter((asset) => assetMatchesTypeFilter(asset, typeFilter) && assetMatchesThemeFilter(asset, themeFilter));
  return [...filtered].sort((a, b) => {
    if (sortMode === 'gain') return getChange(b) - getChange(a);
    if (sortMode === 'loss') return getChange(a) - getChange(b);
    if (sortMode === 'type') {
      const typeDiff = (assetTypeOrder[a.type] ?? 99) - (assetTypeOrder[b.type] ?? 99);
      if (typeDiff !== 0) return typeDiff;
      return a.name.localeCompare(b.name, 'ko-KR');
    }
    if (sortMode === 'theme') {
      const themeDiff = getPrimaryThemeIndex(a) - getPrimaryThemeIndex(b);
      if (themeDiff !== 0) return themeDiff;
      return a.name.localeCompare(b.name, 'ko-KR');
    }
    return 0;
  });
}

function getDepositRate(baseRate) {
  return Math.max(0.5, baseRate + 0.8);
}

function getAssetProfile(asset) {
  const baseProfile = assetLearningProfiles[asset.id] ?? {
    story: `${asset.name}은 ${asset.sector} 흐름을 단순화한 가상 자산입니다. 가격만 보지 말고 어떤 이슈에서 변동 가능성이 커지는지 함께 확인해보세요.`,
    metrics: [['자산 유형', assetTypeLabels[asset.type] ?? asset.type], ['국가', asset.country], ['분야', asset.sector], ['현재가', formatAssetPrice(asset)]],
    signals: { stability: '보통', growth: '보통', volatility: '보통' },
    riskTags: ['이슈민감', '분산투자필요'],
    sensitivity: ['금리 변화', '정책 변화', '시장 심리'],
    prompt: '이 자산은 어떤 뉴스에서 변동 가능성이 커질까요?',
  };
  const financialMetrics = buildFinancialMetrics(asset);
  if (!financialMetrics) return baseProfile;

  return {
    ...baseProfile,
    metrics: financialMetrics,
    signals: getFinancialSignals(asset.financials),
    riskTags: [...new Set([...baseProfile.riskTags, asset.financials.profile, asset.financials.debtRatio >= 160 ? '부채주의' : '재무체크'])],
  };
}

// Week 4 §4.9 — ?debug=1 쿼리스트링 감지 훅
function useDebugMode() {
  const [enabled, setEnabled] = useState(() => {
    try {
      if (typeof window === 'undefined') return false;
      const params = new URLSearchParams(window.location.search || '');
      return params.get('debug') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPopState = () => {
      try {
        const params = new URLSearchParams(window.location.search || '');
        setEnabled(params.get('debug') === '1');
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  return enabled;
}

// Week 4 §4.9 — 회귀 자동 점검: 5종 검사를 순수 함수로 수행
// returns: [{ id, label, status: 'ok'|'fail'|'warn', detail }]
function runRegressionChecks({ round, phase, gameStarted, salaryPaidRounds, tradeLogs, assets, macroTimeline, macroAlertsByRound, economicSeed, initialSeedSensitivity }) {
  const checks = [];

  // (1) 생활소득 누락 검사 — R5~R11 각 1회 입금
  {
    const expectedRounds = [];
    for (let r = 5; r <= Math.min(11, round); r += 1) expectedRounds.push(r);
    if (!gameStarted || expectedRounds.length === 0) {
      checks.push({ id: 'salary', label: '생활소득 입금 (R5~R11)', status: 'ok', detail: '아직 생활소득 라운드 진입 전' });
    } else {
      const missing = expectedRounds.filter((r) => !(salaryPaidRounds || []).includes(r));
      if (missing.length === 0) {
        checks.push({ id: 'salary', label: '생활소득 입금 (R5~R11)', status: 'ok', detail: `${expectedRounds.length}회 모두 입금` });
      } else {
        checks.push({ id: 'salary', label: '생활소득 입금 (R5~R11)', status: 'fail', detail: `누락 라운드: ${missing.join(', ')}` });
      }
    }
  }

  // (2) 배당 지급 검사 — 지정 배당일 종료 후 배당 로그 확인
  {
    const checkpoints = DIVIDEND_ROUNDS.filter((r) => r < round || (r === round && phase === 'closed'));
    if (!gameStarted || checkpoints.length === 0) {
      checks.push({ id: 'dividend', label: '배당 지급 (R3·R6·R9·R11)', status: 'ok', detail: '아직 배당 체크포인트 미도달' });
    } else {
      // 배당 가능 자산 = stock + dividendTier !== 'growth'
      const dividendAssets = (assets || []).filter((a) => a.type === 'stock' && a.dividendTier && a.dividendTier !== 'growth');
      const dividendAssetIds = new Set(dividendAssets.map((a) => a.id));
      // 호스트 화면에서는 portfolio가 비어 있을 수 있으므로 학생 모드에서만 정밀 검사
      const logsAll = (tradeLogs || []).filter((l) => typeof l === 'string' || typeof l === 'object');
      const dividendLogs = logsAll.filter((l) => {
        const msg = typeof l === 'string' ? l : (l?.message || '');
        return msg.includes('배당 지급');
      });
      if (dividendLogs.length === 0 && dividendAssetIds.size > 0) {
        checks.push({ id: 'dividend', label: '배당 지급 (R3·R6·R9·R11)', status: 'warn', detail: `체크포인트 ${checkpoints.length}회 통과했으나 배당 로그 없음 (마감 보유분 없음 가능)` });
      } else {
        checks.push({ id: 'dividend', label: '배당 지급 (R3·R6·R9·R11)', status: 'ok', detail: `배당 로그 ${dividendLogs.length}건 확인` });
      }
    }
  }

  // (3) 트리거 발동 검사 — 거시 임계치 돌파 라운드에서 pending/active/byRound 중 어디에든 기록되어 있어야 함
  {
    const tl = Array.isArray(macroTimeline) ? macroTimeline : [];
    if (tl.length === 0) {
      checks.push({ id: 'trigger', label: '거시 트리거 발동', status: 'ok', detail: '아직 라운드 진행 없음' });
    } else {
      // 임계치 위반 라운드 카운트
      let violationRounds = 0;
      let recordedRounds = 0;
      tl.forEach((p) => {
        const violatesRate = p.baseRate >= 7.0 || p.baseRate <= 1.0;
        const violatesFx = p.exchangeRate >= 1600 || p.exchangeRate <= 1100;
        const violatesUnemp = p.unemploymentRate >= 6.0 || p.unemploymentRate <= 2.0;
        if (violatesRate || violatesFx || violatesUnemp) {
          violationRounds += 1;
          if (p.hasMacroAlert || (macroAlertsByRound && macroAlertsByRound[p.round + 1])) {
            recordedRounds += 1;
          }
        }
      });
      if (violationRounds === 0) {
        checks.push({ id: 'trigger', label: '거시 트리거 발동', status: 'ok', detail: '임계치 위반 라운드 없음' });
      } else if (recordedRounds >= violationRounds) {
        checks.push({ id: 'trigger', label: '거시 트리거 발동', status: 'ok', detail: `위반 ${violationRounds}회, 모두 기록됨` });
      } else {
        checks.push({ id: 'trigger', label: '거시 트리거 발동', status: 'warn', detail: `위반 ${violationRounds}회 중 ${recordedRounds}회만 기록 (쿨다운 가능)` });
      }
    }
  }

  // (4) 물가 단조 증가 검사 — priceIndex가 항상 직전 라운드 이상
  {
    const tl = Array.isArray(macroTimeline) ? macroTimeline : [];
    if (tl.length < 2) {
      checks.push({ id: 'inflation-mono', label: '물가 단조 증가', status: 'ok', detail: tl.length === 0 ? '아직 데이터 없음' : '1라운드만 진행됨' });
    } else {
      const violations = [];
      for (let i = 1; i < tl.length; i += 1) {
        if (tl[i].priceIndex < tl[i - 1].priceIndex) {
          violations.push(tl[i].round);
        }
      }
      if (violations.length === 0) {
        checks.push({ id: 'inflation-mono', label: '물가 단조 증가', status: 'ok', detail: `${tl.length}라운드 모두 ≥ 이전` });
      } else {
        checks.push({ id: 'inflation-mono', label: '물가 단조 증가', status: 'fail', detail: `위반 라운드: ${violations.join(', ')}` });
      }
    }
  }

  // (5) 시드 D 일관성 — economicSeed.inflationSensitivity가 초기값과 동일
  {
    if (!economicSeed) {
      checks.push({ id: 'seed-d', label: '시드 D 일관성', status: 'ok', detail: '게임 시작 전' });
    } else {
      const current = economicSeed.inflationSensitivity;
      if (initialSeedSensitivity === null || initialSeedSensitivity === undefined) {
        checks.push({ id: 'seed-d', label: '시드 D 일관성', status: 'ok', detail: `현재 시드 D = ${current?.toFixed?.(3) ?? current}` });
      } else if (Math.abs(current - initialSeedSensitivity) < 1e-9) {
        checks.push({ id: 'seed-d', label: '시드 D 일관성', status: 'ok', detail: `시드 D = ${current.toFixed(3)} (변동 없음)` });
      } else {
        checks.push({ id: 'seed-d', label: '시드 D 일관성', status: 'fail', detail: `초기 ${initialSeedSensitivity.toFixed(3)} → 현재 ${current.toFixed(3)} 불일치` });
      }
    }
  }

  return checks;
}

// Week 4 §4.9 — 회귀 자동 점검 DEV 패널 (?debug=1 시에만 노출, 호스트 전용 우하단 floating)
function DevPanel({ checks, onRecheck, round }) {
  const [expanded, setExpanded] = useState(false);
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const totalBad = failCount + warnCount;
  const isExpanded = expanded || failCount > 0;

  // console.warn 출력
  useEffect(() => {
    if (typeof console === 'undefined') return;
    checks.forEach((c) => {
      if (c.status === 'fail') {
        console.warn(`[DevPanel·FAIL] R${round} ${c.label}: ${c.detail}`);
      }
    });
  }, [checks, round]);

  let statusClass = 'ok';
  if (failCount > 0) statusClass = 'fail';
  else if (warnCount > 0) statusClass = 'warn';

  return (
    <aside className={`dev-panel ${isExpanded ? 'expanded' : 'collapsed'}`} aria-label="회귀 자동 점검 DEV 패널">
      <button
        type="button"
        className={`dev-panel-toggle ${statusClass}`}
        onClick={() => setExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className="dev-panel-dot" />
        <span className="dev-panel-toggle-label">DEV · {failCount + warnCount === 0 ? 'OK' : `${totalBad}건`}</span>
      </button>
      {isExpanded ? (
        <div className="dev-panel-body">
          <header className="dev-panel-head">
            <strong>회귀 자동 점검</strong>
            <button type="button" className="dev-panel-recheck" onClick={onRecheck} aria-label="재검사">재검사</button>
          </header>
          <ul className="dev-panel-list">
            {checks.map((c) => (
              <li key={c.id} className={`dev-panel-item ${c.status}`}>
                <div className="dev-panel-item-head">
                  <span className={`dev-panel-status ${c.status}`}>{c.status === 'ok' ? 'OK' : c.status === 'warn' ? 'WARN' : 'FAIL'}</span>
                  <strong>{c.label}</strong>
                </div>
                <p className="dev-panel-item-detail">{c.detail}</p>
              </li>
            ))}
          </ul>
          <p className="dev-panel-help">?debug=1 쿼리스트링이 붙은 호스트 화면에만 노출. 매 라운드 종료 후 자동 재실행.</p>
        </div>
      ) : null}
    </aside>
  );
}

// Week 4 §4.8 — 거시 시계열 라이트 차트 (5개 SmallMultiples + demandPull 누적 영역 + 트리거 점선 마커)
function MacroTimelineSparklines({ timeline, compact = false, title = '거시 시계열' }) {
  if (!Array.isArray(timeline) || timeline.length === 0) return null;
  const formatters = {
    baseRate: (v) => `${(Number(v) || 0).toFixed(2)}%`,
    priceIndex: (v) => (Number(v) || 0).toFixed(3),
    exchangeRate: (v) => `${Math.round(Number(v) || 0)}원`,
    unemploymentRate: (v) => `${(Number(v) || 0).toFixed(1)}%`,
    aggregateReturn: (v) => `${((Number(v) || 0) * 100).toFixed(1)}%`,
  };
  const series = [
    { key: 'baseRate', label: '기준금리', color: '#60a5fa' },
    { key: 'priceIndex', label: '물가지수', color: '#f59e0b', withDemandPull: true },
    { key: 'exchangeRate', label: '환율', color: '#a78bfa' },
    { key: 'unemploymentRate', label: '실업률', color: '#fb923c' },
    { key: 'aggregateReturn', label: '집계 수익률', color: '#34d399' },
  ];
  function buildPathPoints(values) {
    if (values.length === 0) return { line: '', points: [] };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const W = 100;
    const H = 28;
    const pad = 2;
    const xs = values.map((_, i) => values.length === 1 ? W / 2 : (i / (values.length - 1)) * (W - pad * 2) + pad);
    const ys = values.map((v) => H - pad - ((v - min) / range) * (H - pad * 2));
    const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${ys[i].toFixed(2)}`).join(' ');
    return { line, points: xs.map((x, i) => ({ x, y: ys[i] })), W, H };
  }
  function buildDemandPullArea(timelineData) {
    const pi = timelineData.map((p) => Number(p.priceIndex) || 1.0);
    const dp = timelineData.map((p) => Number(p.demandPullDelta) || 0);
    let acc = 0;
    const ratios = dp.map((d) => { acc += d; return acc; });
    if (Math.max(...ratios) <= 0) return null;
    const min = Math.min(...pi);
    const max = Math.max(...pi);
    const range = max - min || 1;
    const W = 100;
    const H = 28;
    const pad = 2;
    const xs = pi.map((_, i) => pi.length === 1 ? W / 2 : (i / (pi.length - 1)) * (W - pad * 2) + pad);
    const ysTop = pi.map((v) => H - pad - ((v - min) / range) * (H - pad * 2));
    const piRise = pi[pi.length - 1] - pi[0];
    const dpRise = ratios[ratios.length - 1];
    if (piRise <= 0) return null;
    const dpRatio = Math.min(1, Math.max(0, dpRise / piRise));
    if (dpRatio <= 0) return null;
    const baselineY = H - pad;
    const fillHeight = (H - pad * 2) * dpRatio;
    const ysFillTop = ysTop.map((y) => Math.max(y, baselineY - fillHeight));
    const path = [
      `M ${xs[0].toFixed(2)} ${baselineY.toFixed(2)}`,
      ...xs.map((x, i) => `L ${x.toFixed(2)} ${ysFillTop[i].toFixed(2)}`),
      `L ${xs[xs.length - 1].toFixed(2)} ${baselineY.toFixed(2)}`,
      'Z',
    ].join(' ');
    return { path, ratio: dpRatio };
  }
  return (
    <section className={compact ? 'macro-timeline compact' : 'macro-timeline'} aria-label={title}>
      <header className="macro-timeline-head">
        <strong>{title}</strong>
        <span>{timeline.length}라운드 · 점선은 거시 경보 발동 라운드</span>
      </header>
      <div className="macro-timeline-grid">
        {series.map(({ key, label, color, withDemandPull }) => {
          const values = timeline.map((p) => Number(p[key]) || 0);
          const { line, points, W = 100, H = 28 } = buildPathPoints(values);
          const last = values[values.length - 1];
          const first = values[0];
          const delta = values.length > 1 ? last - first : 0;
          const deltaTone = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
          const dpArea = withDemandPull ? buildDemandPullArea(timeline) : null;
          return (
            <div className="macro-timeline-cell" key={key}>
              <div className="macro-timeline-cell-head">
                <span className="macro-timeline-label">{label}</span>
                <strong className="macro-timeline-value">{formatters[key](last)}</strong>
              </div>
              <svg className="macro-timeline-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                {dpArea ? (<path d={dpArea.path} fill={color} opacity="0.18" />) : null}
                <path d={line} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                {points && points.map((pt, i) => {
                  const point = timeline[i];
                  if (!point?.hasMacroAlert) return null;
                  return (
                    <line key={`marker-${key}-${i}`} x1={pt.x} y1={0} x2={pt.x} y2={H} stroke="#f97316" strokeWidth="0.6" strokeDasharray="1.2 1.2" opacity="0.7" />
                  );
                })}
                {points && points.length > 0 ? (
                  <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="1.4" fill={color} />
                ) : null}
              </svg>
              <div className={`macro-timeline-delta ${deltaTone}`}>
                {delta === 0 ? '변동 없음' : `${delta >= 0 ? '+' : ''}${formatters[key](Math.abs(delta)).replace('-', '')}`}
                {withDemandPull && dpArea ? (
                  <span className="macro-timeline-dp-note"> · 수요견인 비중 {(dpArea.ratio * 100).toFixed(0)}%</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sr-only">
        <table aria-label={`${title} 라운드별 값`}>
          <thead>
            <tr>
              <th>라운드</th>
              {series.map((s) => <th key={s.key}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {timeline.map((p) => (
              <tr key={`sr-${p.round}`}>
                <td>R{p.round}</td>
                {series.map((s) => <td key={`sr-${p.round}-${s.key}`}>{formatters[s.key](p[s.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Sparkline({ history, color }) {
  const width = 150;
  const height = 48;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const points = history
    .map((value, index) => {
      const x = (index / (history.length - 1 || 1)) * width;
      const y = height - ((value - min) / range) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="가격 추이">
      <polyline points={points} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getEventKey(event) {
  return event.templateId ?? event.id;
}

function getSimpleExplanation(event) {
  const explanations = {
    'rate-up': '금리 인상 = 돈을 빌리는 비용 증가',
    'rate-down': '금리 인하 = 돈을 빌리는 부담 감소',
    'deposit-special': '예금 특판 = 안전하게 받을 수 있는 이자 증가',
    'growth-boom': '경기 호황 = 소비와 기업 투자가 함께 좋아짐',
    'recession-risk': '경기 침체 우려 = 소비와 기업 투자가 둔화될 가능성',
    'jobs-improve': '고용 개선 = 가계 소득과 소비 여력 증가',
    'unemployment-worse': '실업률 악화 = 소비 둔화와 신용위험 우려',
    'inflation-cool': '물가 둔화 = 금리 부담 완화 기대',
    'inflation-rebound': '물가 재상승 = 금리와 원가 부담 증가',
    'fx-stabilize': '환율 안정 = 수입 비용과 금융시장 불안 완화',
    'fx-volatility': '환율 불안 = 수출입 손익과 외국인 자금 불확실성',
    'property-ease': '부동산 규제 완화 = 집이나 건물을 사기 쉬워짐',
    'property-tighten': '부동산 규제 강화 = 대출과 거래 부담 증가',
    'us-rally': '미국 증시 강세 = 글로벌 투자 분위기 개선',
    'korea-export': '한국 수출 호조 = 국내 기업 실적 기대 증가',
    rare: '희토류 통제 = 핵심 원재료 공급 불안',
    housing: '인프라 예산 확대 = 정부가 관련 산업에 돈을 더 씀',
    'green-subsidy': '친환경 보조금 확대 = 재생에너지 수요 기대 증가',
    'us-regulation': '미국 기술 규제 = 미국 기업 성장 부담',
    'drug-breakthrough': '신약 승인 기대 = 미래 매출 가능성 확대',
    'drug-setback': '임상 실패 우려 = 미래 매출 기대 약화',
    'fx-spike': '환율 급등 = 수출입 기업의 손익 변화',
    'korea-us-chip-tension': '국가 간 반도체 갈등 = 공급망 불확실성 증가',
    'oil-supply-shock': '산유국 감산 = 원유 공급 기대 변화',
    'oil-supply-relief': '원유 공급 안정 = 에너지 비용 부담 완화 기대',
    'grain-shock': '곡물 공급 충격 = 식품 원가와 물가 불확실성 증가',
    'grain-relief': '곡물 공급 안정 = 식품 원가 부담 완화 기대',
    'us-yield-spike': '미국 국채금리 급등 = 글로벌 돈값 상승',
    'us-yield-cooldown': '미국 국채시장 안정 = 장기 금리 부담 완화',
    'em-credit-stress': '신흥국 신용위험 = 높은 이자 뒤의 상환 위험 부각',
    'em-credit-relief': '신흥국 신용안정 = 상환 불안 일부 완화',
    'war-risk': '지정학적 긴장 = 공급망과 안전자산 선호 변화',
    'peace-progress': '지정학 완화 = 물류와 위험자산 심리 회복',
    'election-risk': '정치 불확실성 = 정책 방향 예측 어려움',
    'policy-stability': '정책 불확실성 완화 = 투자 계획 세우기 쉬워짐',
    'argentina-reform': '개혁안 충돌 = 국가 신용위험 확대',
  };

  return explanations[getEventKey(event)] ?? '뉴스가 투자자의 기대를 바꾸면 가격도 움직일 수 있습니다.';
}

function getCausalChain(event) {
  const chains = {
    'rate-up': ['이자가 오름', '대출 부담 증가', '부동산·성장주 부담'],
    'rate-down': ['이자가 내려감', '투자·소비 기대 증가', '부동산·성장주 선호'],
    'deposit-special': ['예금 이자 증가', '안전자산 선호', '위험자산 수요 둔화'],
    'growth-boom': ['소비·투자 증가', '기업 매출 기대 상승', '경기민감주·부동산 선호'],
    'recession-risk': ['소비·투자 둔화', '기업 이익 기대 하락', '안전자산 선호와 위험자산 부담'],
    'jobs-improve': ['고용 개선', '가계 소득·소비 기대 증가', '여행·콘텐츠·금융 상승 압력'],
    'unemployment-worse': ['실업률 상승', '소비와 대출 상환 우려', '경기민감주·부동산 하락 압력'],
    'inflation-cool': ['물가 안정', '금리 부담 완화 기대', '성장주·채권 가격 상승 압력'],
    'inflation-rebound': ['물가 재상승', '금리와 원가 부담 증가', '성장주·채권 가격 하락 압력'],
    'fx-stabilize': ['환율 변동성 완화', '수입 비용 부담 감소', '국내 투자심리 개선'],
    'fx-volatility': ['환율 변동성 확대', '수출입 손익 불확실', '항공·식품·신흥국 채권 부담'],
    'property-ease': ['규제 부담 감소', '거래 기대 증가', '부동산·건설주 선호'],
    'property-tighten': ['대출·세금 부담 증가', '거래 기대 둔화', '부동산·건설주 부담'],
    'us-rally': ['미국 대형주 기대 증가', '글로벌 투자심리 개선', '미국 ETF 상승 압력'],
    'korea-export': ['수출 증가', '기업 매출 기대 증가', 'KOSPI·제조업 상승 압력'],
    rare: ['원재료 공급 불안', '생산 비용 증가', '제조업 하락 압력'],
    housing: ['정부 투자 확대', '수주 기대 증가', '인프라·부동산 상승 압력'],
    'green-subsidy': ['정책 지원 확대 기대', '친환경 설비 수요 증가', '재생에너지·전기차 선호'],
    'us-regulation': ['미국 규제 강화', '비용·성장 부담', '미국 기술주 하락 압력'],
    'drug-breakthrough': ['임상·승인 기대 확대', '미래 매출 기대 상승', '헬스케어 강세 가능성'],
    'drug-setback': ['임상 차질·약가 우려', '미래 매출 기대 하락', '헬스케어 변동성 확대'],
    'fx-spike': ['달러 강세', '수출입 손익 변화', '업종별 주가 차별화'],
    'korea-us-chip-tension': ['정책 갈등', '수출·보조금 불확실', '반도체주 하락 압력'],
    'oil-supply-shock': ['원유 공급 우려', '에너지 비용 기대 변화', '유가 민감 산업 변동성 확대'],
    'oil-supply-relief': ['원유 공급 안정 기대', '에너지 비용 부담 완화', '항공·식품 심리 개선'],
    'grain-shock': ['곡물 공급 우려', '식품 원가·물가 부담', '식량 민감 자산 변동성 확대'],
    'grain-relief': ['곡물 공급 안정 기대', '식품 원가 완화', '물가 부담 일부 둔화'],
    'us-yield-spike': ['미국 금리 상승', '채권 가격·할인율 부담', '성장자산·고위험채 변동성 확대'],
    'us-yield-cooldown': ['장기 금리 안정', '채권 가격 회복', '성장자산 할인율 부담 완화'],
    'em-credit-stress': ['상환 위험 부각', '위험자산 회피', '고위험 채권 부담·안전자산 선호'],
    'em-credit-relief': ['상환 불안 완화', '위험자산 심리 회복', '고위험 채권 반등 가능성'],
    'war-risk': ['군사 긴장 확대', '원자재·물류 불안', '안전자산 선호와 위험자산 부담'],
    'peace-progress': ['군사 긴장 완화', '물류·공급망 안정 기대', '위험자산 심리 회복'],
    'election-risk': ['정책 방향 불확실', '투자 심리 위축', '정책 민감 업종 변동성 확대'],
    'policy-stability': ['정책 방향 명확화', '투자 계획 정상화', '정책 민감 업종 할인 완화'],
    'argentina-reform': ['재정 개혁 불확실', '통화·신용위험 확대', '고위험 국채 부담'],
  };

  return chains[getEventKey(event)] ?? ['뉴스 발생', '기대 변화', '가격 변동'];
}

function getFinancialLinks(event) {
  const links = {
    'rate-up': ['부채비율', '금리 민감도', '현금보유', '대출 의존도'],
    'rate-down': ['성장성', '금리 민감도', '투자 계획', '부동산 지수'],
    'deposit-special': ['예금금리', '안정성', '현금흐름', '위험자산 선호'],
    'growth-boom': ['경기민감도', '영업이익률', '고용', '소비심리'],
    'recession-risk': ['경기민감도', '현금보유', '고용', '안전자산 선호'],
    'jobs-improve': ['실업률', '소비심리', '매출 성장', '대출 수요'],
    'unemployment-worse': ['실업률', '소비심리', '신용위험', '현금흐름'],
    'inflation-cool': ['물가', '할인율', '원자재 의존도', '금리 민감도'],
    'inflation-rebound': ['물가', '원자재 의존도', '부채비율', '금리 민감도'],
    'fx-stabilize': ['환율노출', '해외 비용', '수출비중', '달러 자산'],
    'fx-volatility': ['환율노출', '달러 부채', '수출비중', '해외 비용'],
    'property-ease': ['대출 의존도', '부동산 민감도', '수주 기대', '가계부채'],
    'property-tighten': ['대출 의존도', '부동산 민감도', '수주 기대', '가계부채'],
    'us-rally': ['국가노출', '성장성', '기술주 비중', '환율노출'],
    'korea-export': ['수출비중', '환율노출', '제조업 경기', '매출 성장'],
    rare: ['원자재 의존도', '공급망', 'R&D 비중', '재고 부담'],
    housing: ['수주잔고', '부채비율', '원자재 의존도', '정책 민감도'],
    'green-subsidy': ['정책 민감도', '설비 투자', '원자재 의존도', '미래 수요'],
    'us-regulation': ['국가노출', '규제 민감도', 'R&D 비중', '플랫폼 의존도'],
    'drug-breakthrough': ['R&D 비중', '임상 일정', '현금보유', '승인 가능성'],
    'drug-setback': ['R&D 비중', '임상 일정', '현금보유', '약가 규제'],
    'fx-spike': ['수출비중', '환율노출', '해외 비용', '달러 부채'],
    'korea-us-chip-tension': ['국가노출', '공급망', '수출규제', '반도체 의존도'],
    'oil-supply-shock': ['원유 선물', '유류비', '원자재 의존도', '물가'],
    'oil-supply-relief': ['원유 선물', '유류비', '원자재 의존도', '물가'],
    'grain-shock': ['곡물 선물', '식품 원가', '원자재 의존도', '물가'],
    'grain-relief': ['곡물 선물', '식품 원가', '원자재 의존도', '물가'],
    'us-yield-spike': ['금리 민감도', '부채비율', '할인율', '안전자산'],
    'us-yield-cooldown': ['금리 민감도', '부채비율', '할인율', '안전자산'],
    'em-credit-stress': ['신용위험', '통화가치', '국가 부채', '안전자산 선호'],
    'em-credit-relief': ['신용위험', '통화가치', '국가 부채', '안전자산 선호'],
    'war-risk': ['안전자산 선호', '물류비', '유류비', '공급망'],
    'peace-progress': ['안전자산 선호', '물류비', '유류비', '공급망'],
    'election-risk': ['정책 민감도', '규제 위험', '국가 부채', '환율'],
    'policy-stability': ['정책 민감도', '규제 위험', '국가 부채', '환율'],
    'argentina-reform': ['국가 신용등급', '통화가치', '재정적자', 'IMF 협상'],
  };

  return event.financialLinks ?? links[getEventKey(event)] ?? ['부채비율', '현금보유', '원자재 의존도', '국가노출'];
}

function getResultLabel(event, compact) {
  if (event.outcomeType === 'event') return compact ? '뉴스가 가격을 움직였어요' : '실제 이벤트 발생';
  if (event.outcomeType === 'expectation') return compact ? '기대감이 가격을 움직였어요' : '이슈 기대감 반영';
  // Week 3 H — 반전 케이스 라벨
  if (event.outcomeType === 'reverse') return compact ? '예상이 빗나가 반대로 움직였어요' : '이슈 무산, 반대 흐름 부각';
  if (event.outcomeType === 'failed') return compact ? '뉴스가 실패했어요' : '이슈 실패';
  return event.didApply ? '영향 반영' : '영향 미반영';
}

function getResultClass(event) {
  if (event.outcomeType === 'event') return 'applied';
  if (event.outcomeType === 'expectation') return 'expectation';
  // Week 3 H — 반전 케이스 색상 클래스 (파랑 계열)
  if (event.outcomeType === 'reverse') return 'reverse';
  return 'skipped';
}

function getEventMovers(event, assets) {
  return Object.entries(event.resolvedImpact ?? event.impact)
    .map(([assetId, change]) => {
      const asset = assets.find((item) => item.id === assetId);
      return asset ? { name: asset.name, change } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 4);
}

function formatAssetPrice(asset) {
  return asset.delisted ? '상장폐지' : formatWon(asset.price);
}

// Week 4 §2.2 Phase B — 인플레이션 체크포인트 카드
//   R4·R8·R12 종료 시점에 학생/교사 화면 모두에 노출.
//   학습 목표: "명목수익률 ≠ 실질수익률"을 숫자로 직접 체험.
//   수요견인 인식: 방 평균 수익이 높을수록 물가가 더 빨리 올랐다는 점을 안내.
// Week 4 §3.6 — 체크포인트 학습 질문 패널 (객관식 1 + 자유 서술 1)
function ReflectionPrompt({ round, reflection, onReflectionChange, readOnly = false }) {
  const prompt = REFLECTION_PROMPTS[round];
  if (!prompt) return null;
  const current = reflection || {};
  const selectedIndex = Number.isInteger(current.selected) ? current.selected : null;
  const openText = current.open ?? '';
  const isAnswered = prompt.objective ? selectedIndex !== null : openText.trim().length > 0;
  const isCorrect = prompt.objective && selectedIndex === prompt.objective.answerIndex;

  return (
    <div className="reflection-prompt" aria-label={`${prompt.title} 학습 질문`}>
      <header className="reflection-prompt-head">
        <strong>학습 질문</strong>
        <span>{prompt.title}</span>
      </header>

      {prompt.objective ? (
        <div className="reflection-objective">
          <p className="reflection-question">{prompt.objective.question}</p>
          <ul className="reflection-options" role="radiogroup" aria-label={prompt.objective.question}>
            {prompt.objective.options.map((option, idx) => {
              const isSelected = selectedIndex === idx;
              const isAnswerKey = prompt.objective.answerIndex === idx;
              let optionClass = 'reflection-option';
              if (isSelected) optionClass += ' selected';
              if (selectedIndex !== null && isAnswerKey) optionClass += ' correct';
              if (isSelected && !isAnswerKey && selectedIndex !== null) optionClass += ' wrong';
              return (
                <li key={idx} className={optionClass}>
                  <label>
                    <input
                      type="radio"
                      name={`reflection-r${round}`}
                      value={idx}
                      checked={isSelected}
                      onChange={() => !readOnly && onReflectionChange(round, { ...current, selected: idx })}
                      disabled={readOnly}
                    />
                    <span>{option}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {selectedIndex !== null ? (
            <p className={isCorrect ? 'reflection-feedback correct' : 'reflection-feedback wrong'}>
              {isCorrect ? '정답입니다. ' : '한 번 더 생각해 보세요. '}
              {prompt.objective.explanation}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="reflection-open">
        <label className="reflection-open-label">
          {prompt.open.label}
          {!readOnly ? (
            <span className="reflection-open-meter">{getByteLength(openText)}/{REFLECTION_OPEN_MAX_BYTES}바이트</span>
          ) : null}
        </label>
        {readOnly ? (
          openText.trim() ? (
            <p className="reflection-open-readonly">{openText}</p>
          ) : (
            <p className="reflection-open-readonly empty">작성 전</p>
          )
        ) : (
          <textarea
            className="reflection-open-input"
            value={openText}
            onChange={(event) => {
              const clamped = clampToByteLength(event.target.value, REFLECTION_OPEN_MAX_BYTES);
              onReflectionChange(round, { ...current, open: clamped });
            }}
            placeholder={prompt.open.placeholder}
            rows={2}
            aria-label={prompt.open.label}
          />
        )}
      </div>

      {isAnswered ? (
        <p className="reflection-status done">기록됨 · 회고 화면에서 다시 볼 수 있습니다.</p>
      ) : (
        <p className="reflection-status pending">{prompt.objective ? '보기를 고르고 ' : ''}한 줄 정리를 적어 보세요.</p>
      )}
    </div>
  );
}

function InflationCheckpointCard({ round, totalAsset, investedPrincipal, priceIndex, aggregateReturn, compact = false, roundReflection = null, onRoundReflectionChange = null, macroTimeline = null }) {
  if (!LEARNING_CHECKPOINT_ROUNDS.includes(round)) return null;
  if (priceIndex == null || priceIndex <= 0) return null;
  if (investedPrincipal == null || investedPrincipal <= 0) return null;

  const cumulativeInflationPct = (priceIndex - 1) * 100;
  const nominalReturnPct = ((totalAsset - investedPrincipal) / investedPrincipal) * 100;
  const realNetWorth = totalAsset / priceIndex;
  const realReturnPct = ((realNetWorth - investedPrincipal) / investedPrincipal) * 100;
  const inflationLoss = realNetWorth - totalAsset; // 음수: 물가로 인해 줄어든 구매력
  const gapPct = nominalReturnPct - realReturnPct;
  const yearLabel = round === 4 ? '1년' : round === 8 ? '2년' : '3년';

  // 수요견인 코멘트: 방 평균 수익률이 높으면 물가 가속 인식 강화
  const aggregatePct = aggregateReturn != null ? aggregateReturn * 100 : null;
  let demandPullComment = null;
  if (aggregatePct != null && aggregatePct >= 10) {
    demandPullComment = `이 방 평균 수익률이 +${aggregatePct.toFixed(1)}%로 높아, 물가 상승이 가속됐어요. (수요견인 인플레이션)`;
  } else if (aggregatePct != null && aggregatePct >= 5) {
    demandPullComment = `이 방 평균 수익률이 +${aggregatePct.toFixed(1)}%로 양호한 편이라, 물가에도 영향이 있었어요.`;
  }

  return (
    <section className={compact ? 'inflation-checkpoint-card compact' : 'inflation-checkpoint-card'} aria-label={`R${round} 인플레이션 체크포인트`}>
      <header className="inflation-checkpoint-head">
        <strong>체크포인트 R{round} — {yearLabel} 점검</strong>
        <span>명목수익률과 실질수익률을 비교해 보세요.</span>
      </header>
      <div className="inflation-checkpoint-grid">
        <div className="inflation-row">
          <span>원금 누적</span>
          <strong>{formatWon(investedPrincipal)}</strong>
        </div>
        <div className="inflation-row">
          <span>현재 순자산 (명목)</span>
          <strong>{formatWon(totalAsset)} <em className={nominalReturnPct >= 0 ? 'pos' : 'neg'}>({nominalReturnPct >= 0 ? '+' : ''}{nominalReturnPct.toFixed(1)}%)</em></strong>
        </div>
        <div className="inflation-row">
          <span>물가지수</span>
          <strong>{priceIndex.toFixed(3)} <em className="neutral">(+{cumulativeInflationPct.toFixed(1)}%)</em></strong>
        </div>
        <div className="inflation-row real">
          <span>실질 순자산</span>
          <strong>{formatWon(Math.round(realNetWorth))} <em className={realReturnPct >= 0 ? 'pos' : 'neg'}>({realReturnPct >= 0 ? '+' : ''}{realReturnPct.toFixed(1)}%)</em></strong>
        </div>
        <div className="inflation-row loss">
          <span>인플레이션 손실</span>
          <strong className="neg">{formatWon(Math.round(inflationLoss))}</strong>
        </div>
      </div>
      <p className="inflation-checkpoint-note">
        명목으로는 {nominalReturnPct >= 0 ? '+' : ''}{nominalReturnPct.toFixed(1)}% 였지만, 물가를 빼면 실질은 {realReturnPct >= 0 ? '+' : ''}{realReturnPct.toFixed(1)}% 였습니다.
        구매력 기준으로는 <strong>{Math.abs(gapPct).toFixed(1)}%p</strong> 만큼 줄어든 셈입니다. 물가를 이기려면 꾸준히 벌어야합니다. 남은 라운드에서 따 잡을 수 있어요.
      </p>
      {demandPullComment ? <p className="inflation-checkpoint-demand-pull">{demandPullComment}</p> : null}
      {/* Week 4 §4.8 — 체크포인트에서 거시 시계열 라이트 차트 노출 */}
      {Array.isArray(macroTimeline) && macroTimeline.length > 0 ? (
        <MacroTimelineSparklines timeline={macroTimeline} compact title="거시 흐름 점검" />
      ) : null}
      {/* Week 4 §3.6 — 체크포인트 학습 질문 */}
      {onRoundReflectionChange ? (
        <ReflectionPrompt
          round={round}
          reflection={roundReflection}
          onReflectionChange={onRoundReflectionChange}
        />
      ) : null}
    </section>
  );
}

function RoundExplanation({ summary, assets, compact = false }) {
  if (!summary?.events?.length && !summary?.macroAlerts?.length) {
    return (
      <section className="explain-panel muted" aria-label="라운드 해설">
        <div className="panel-heading">
          <BadgePercent size={22} aria-hidden="true" />
          <h2>라운드 해설</h2>
        </div>
        <p>아직 해설할 이벤트가 없습니다. 이벤트를 선택한 뒤 다음 라운드를 시작하면 해설이 표시됩니다.</p>
      </section>
    );
  }

  return (
    <section className={compact ? 'explain-panel compact' : 'explain-panel'} aria-label="라운드 해설">
      <div className="panel-heading">
        <BadgePercent size={22} aria-hidden="true" />
        <h2>{summary.round}라운드 해설</h2>
      </div>
      <div className="explain-list">
        {summary.macroMove && !compact ? (
          <article className="macro-summary">
            <div className="explain-head">
              <strong>거시 지표 변화</strong>
              <b className="result-badge expectation">시장 환경 변화</b>
              <span>선택된 이슈와 라운드별 시장 흐름이 함께 반영되어 금리, 부동산, 환율, 실업률이 움직였습니다.</span>
            </div>
            <div className="impact-chips">
              <span className={summary.macroMove.baseRateDelta >= 0 ? 'up-chip' : 'down-chip'}>
                기준금리 {formatPercent(summary.macroMove.baseRateDelta)}
              </span>
              <span className={summary.macroMove.propertyMove >= 0 ? 'up-chip' : 'down-chip'}>
                부동산지수 {formatPercent(summary.macroMove.propertyMove * 100)}
              </span>
              <span className={summary.macroMove.exchangeMove >= 0 ? 'up-chip' : 'down-chip'}>
                원/달러 환율 {formatPercent(summary.macroMove.exchangeMove * 100)}
              </span>
              <span className={summary.macroMove.unemploymentDelta >= 0 ? 'up-chip' : 'down-chip'}>
                실업률 {formatPercent(summary.macroMove.unemploymentDelta)}
              </span>
            </div>
          </article>
        ) : null}
        {summary.delistedAssets?.length ? (
          <article className="delist-summary">
            <div className="explain-head">
              <strong>상장폐지 발생</strong>
              <b className="result-badge skipped">분산투자 경고</b>
            </div>
            <p>9라운드 이후 강한 부정 이슈가 실제로 반영되며 일부 기업이 거래 불가능 상태가 되었습니다.</p>
            <div className="impact-chips">
              {summary.delistedAssets.map((asset) => (
                <span className="down-chip" key={asset.id}>{asset.name}</span>
              ))}
            </div>
          </article>
        ) : null}
        {summary.macroAlerts?.map((alert, index) => (
          <article className="macro-summary" key={`macro-${summary.round}-${alert.id}-${index}`}>
            <div className="explain-head">
              <strong>{alert.title}</strong>
              <b className="result-badge expectation">거시 트리거 적용</b>
              <span>{alert.triggerReason ?? alert.detail}</span>
            </div>
            <p className="simple-explain">{alert.principle}</p>
            {alert.affectedAssets?.length ? (
              <div className="impact-chips">
                {alert.affectedAssets.map((item) => <span key={item}>{item}</span>)}
              </div>
            ) : null}
          </article>
        ))}
        {(summary.events ?? []).map((event, index) => {
          const movers = getEventMovers(event, assets);
          const financialLinks = getFinancialLinks(event);
          return (
            <article key={`${summary.round}-${event.id}-${index}`}>
              <div className="explain-head">
                <strong>{event.title}</strong>
                {event.resolved ? <b className={`result-badge ${getResultClass(event)}`}>{getResultLabel(event, compact)}</b> : null}
                <span>{event.affectedAssets.join(' · ')}</span>
              </div>
              <p className="simple-explain">{getSimpleExplanation(event)}</p>
              {!compact ? <p>{event.principle}</p> : null}
              <div className="causal-chain" aria-label={`${event.title} 인과 흐름`}>
                {getCausalChain(event).map((step) => (
                  <span key={step}>{step}</span>
                ))}
              </div>
              {!compact ? (
                <div className="financial-links" aria-label={`${event.title} 연결 지표`}>
                  <strong>같이 볼 재무·시장 신호</strong>
                  <div>
                    {financialLinks.map((link) => (
                      <span key={link}>{link}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {/* Week 3 H — 반전 케이스는 영향 자산도 표시 (부호 반전된 값이 그대로 반영됨) */}
              {!compact && (event.didApply !== false || event.outcomeType === 'reverse') ? (
                <div className="impact-chips" aria-label={`${event.title} 영향 자산`}>
                  {movers.map((mover) => (
                    <span className={mover.change >= 0 ? 'up-chip' : 'down-chip'} key={mover.name}>
                      {mover.name} {formatPercent(mover.change * 100)}
                    </span>
                  ))}
                </div>
              ) : null}
              {event.outcomeType === 'expectation' ? (
                <p className="expectation-note">
                  <strong>{event.expectationTitle}</strong>
                  <span>{event.expectationDetail}</span>
                </p>
              ) : null}
              {/* Week 3 H — 반전 안내 (failure 대신 표시) */}
              {event.outcomeType === 'reverse' ? (
                <p className="reverse-note">
                  <strong>{event.reverseTitle}</strong>
                  <span>{event.reverseDetail}</span>
                </p>
              ) : null}
              {event.repeatedVolatility ? (
                <p className="volatility-note">
                  <strong>동일 유형 이슈 반복 적용</strong>
                  <span>같은 유형의 이슈가 {event.repeatedCount ?? 2}회 실제로 반영되어 시장 변동성이 단계적으로 확대되었습니다.</span>
                </p>
              ) : null}
              {event.didApply === false && event.outcomeType !== 'reverse' ? (
                <p className="no-impact">
                  <strong>{event.failureTitle}</strong>
                  <span>{event.failureDetail} 이 이슈의 직접 가격 영향은 0이며, 같은 라운드의 거시 변화와 기본 시장 변동은 별도로 반영됐습니다.</span>
                </p>
              ) : null}
              {event.conflictLabel && event.didApply ? (
                <p className="expectation-note">
                  <strong>{event.conflictLabel}</strong>
                  <span>상충 이슈 중 이 경향성이 실제로 우세하게 반영되었습니다.</span>
                </p>
              ) : null}
              <em>{event.discussionPrompt}</em>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function IssueTicker({ events, phase, compact = false }) {
  if (!events.length) {
    return (
      <section className={compact ? 'issue-panel compact muted' : 'issue-panel muted'} aria-label="공개 이슈">
        <div className="panel-heading">
          <Megaphone size={22} aria-hidden="true" />
          <h2>공개 이슈</h2>
        </div>
        <p>아직 등록된 이슈가 없습니다.</p>
      </section>
    );
  }

  return (
    <section className={compact ? 'issue-panel compact' : 'issue-panel'} aria-label="공개 이슈">
      <div className="panel-heading split">
        <div>
          <Megaphone size={22} aria-hidden="true" />
          <h2>{phase === 'open' ? '진행 중 공개 이슈' : '등록된 이슈'}</h2>
        </div>
        <span className="limit-pill">{events.length}/{MAX_EVENTS_PER_ROUND}</span>
      </div>
      <div className="issue-list">
        {events.map((event) => (
          <article key={event.id}>
            <strong>{event.title}</strong>
            <p>{event.detail}</p>
            {phase === 'open' ? <em>장 마감 후 이 이슈가 실제 가격에 반영됐는지 확인해보세요.</em> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

// Week 4 §2.4 — 거시 경보 배너 (트리거 전용 UI, 이슈와 채널 완전 분리)
//   거시 지표가 임계치를 돌파하면 교사 선택과 무관하게 라운드 시작과 동시에 자동 발동.
//   학생/교사 모두 IssueTicker 위쪽에 별도 색·아이콘으로 표시되어 이슈와 시각적으로 구별된다.
function MacroAlertBanner({ alerts, compact = false }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <section
      className={compact ? 'macro-alert-banner compact' : 'macro-alert-banner'}
      aria-label="거시 경보"
    >
      <div className="macro-alert-banner__head">
        <strong>거시 경보 — 임계치 돌파에 따른 자동 발동</strong>
        <span>교사가 선택한 이슈와 별개로, 거시 지표가 기준을 넘어 라운드 시작과 동시에 적용된 변수입니다.</span>
      </div>
      <ul className="macro-alert-list">
        {alerts.map((alert) => (
          <li key={alert.uniqueId ?? alert.id} className="macro-alert-item">
            <strong>{alert.title}</strong>
            <p>{alert.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MacroTriggerPanel({ alertsByRound = {}, activeAlerts = [], compact = false }) {
  const history = Object.entries(alertsByRound)
    .flatMap(([triggerRound, alerts]) => (alerts ?? []).map((alert) => ({ ...alert, triggerRound: Number(triggerRound) })))
    .sort((a, b) => a.triggerRound - b.triggerRound);
  const rows = history.length ? history : activeAlerts.map((alert) => ({ ...alert, triggerRound: null }));
  if (!rows.length) return null;

  return (
    <section className={compact ? 'macro-alert-banner compact' : 'macro-alert-banner'} aria-label="거시경제 트리거 작용 기록">
      <div className="macro-alert-banner__head">
        <strong>거시경제 트리거 작용</strong>
        <span>지표가 임계치를 넘으면 다음 라운드에 자동으로 작동하며, 교사가 고른 이슈와 별도로 계산됩니다.</span>
      </div>
      <ul className="macro-alert-list">
        {rows.map((alert, index) => (
          <li className="macro-alert-item" key={`${alert.triggerRound ?? 'active'}-${alert.id}-${index}`}>
            <strong>{alert.triggerRound ? `R${alert.triggerRound} · ` : ''}{alert.title}</strong>
            <p>{alert.triggerReason ?? alert.detail}</p>
            {alert.affectedAssets?.length ? <span>관련 자산: {alert.affectedAssets.join(' · ')}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Week 3 H — 교사 대시보드: 라운드별 이슈 분석 탭
function TeacherRoundIssuesPanel({ triggeredEventsByRound, totalRounds }) {
  const roundsWithData = Object.keys(triggeredEventsByRound ?? {})
    .map((k) => Number(k))
    .filter((r) => Number.isFinite(r) && (triggeredEventsByRound[r] ?? []).length > 0)
    .sort((a, b) => a - b);
  const [selected, setSelected] = useState(null);
  const activeRound = selected && roundsWithData.includes(selected)
    ? selected
    : (roundsWithData.at(-1) ?? null);
  const events = activeRound ? (triggeredEventsByRound[activeRound] ?? []) : [];
  return (
    <section className="round-issues-panel" aria-label="라운드별 이슈 분석">
      <div className="panel-heading split">
        <div>
          <Activity size={20} aria-hidden="true" />
          <h2>라운드별 이슈 분석</h2>
        </div>
        <span className="limit-pill">{roundsWithData.length}/{totalRounds} 라운드 기록</span>
      </div>
      {roundsWithData.length === 0 ? (
        <p className="teacher-hint" style={{ padding: 12 }}>
          아직 등록된 이슈가 없습니다. 라운드를 시작하면 여기에 라운드별로 누적됩니다.
        </p>
      ) : (
        <>
          <div className="round-selector" role="tablist" aria-label="라운드 선택">
            {roundsWithData.map((r) => {
              const list = triggeredEventsByRound[r] ?? [];
              const triggered = list.filter((e) => e.triggered).length;
              return (
                <button
                  key={r}
                  type="button"
                  className={r === activeRound ? 'active' : ''}
                  onClick={() => setSelected(r)}
                  title={triggered > 0 ? `트리거 자동 발동 ${triggered}건 포함` : undefined}
                >
                  R{r}
                  {triggered > 0 ? <span style={{ marginLeft: 4, color: '#d97706' }}>•</span> : null}
                </button>
              );
            })}
          </div>
          <div className="round-issues-list" style={{ display: 'grid', gap: 8, padding: 12 }}>
            {events.length === 0 ? (
              <p>이 라운드에는 등록된 이슈가 없습니다.</p>
            ) : (
              events.map((event) => {
                const resolved = event.resolved === true;
                const applied = resolved && event.didApply === true;
                const isReverse = event.outcomeType === 'reverse';
                const status = !resolved
                  ? '미마감'
                  : applied
                  ? (event.outcomeType === 'expectation' ? '기대 선반영' : '실제 발생')
                  : isReverse
                  ? '반대 흐름'
                  : '발생 안 함';
                const statusColor = !resolved
                  ? '#6b7280'
                  : applied
                  ? (event.outcomeType === 'expectation' ? '#d97706' : '#047857')
                  : isReverse
                  ? '#2563eb'
                  : '#9ca3af';
                return (
                  <article
                    key={event.uniqueId ?? event.id}
                    style={{
                      border: '1px solid var(--border, #d1d5db)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      background: event.triggered ? '#fffbeb' : (isReverse ? '#eff6ff' : '#fff'),
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>
                        {event.triggered ? '[트리거] ' : ''}{event.title}
                      </strong>
                      <span style={{ fontSize: 11, color: statusColor, fontWeight: 600 }}>{status}</span>
                    </div>
                    <p style={{ margin: '4px 0', fontSize: 12, color: '#374151' }}>{event.detail}</p>
                    {event.principle ? (
                      <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>{event.principle}</p>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </>
      )}
    </section>
  );
}

function CloseDashboard({ phase, players }) {
  if (phase !== 'closed') return null;

  return (
    <section className="close-dashboard" aria-label="장 마감 순위">
      <div className="panel-heading">
        <Trophy size={22} aria-hidden="true" />
        <h2>장 마감 순위</h2>
      </div>
      <ol className="close-ranks">
        {[...players].sort((a, b) => b.returnRate - a.returnRate).map((player, index) => (
          <li key={player.id}>
            <span>{index + 1}위</span>
            <strong>{player.name}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

function getHoldingRows(portfolio, assets) {
  return assets
    .map((asset) => {
      const shares = portfolio[asset.id] ?? 0;
      return shares > 0
        ? {
            asset,
            shares,
            value: shares * asset.price,
            change: getChange(asset),
          }
        : null;
    })
    .filter(Boolean);
}

function createDefaultTeamAccounts() {
  return createTeamAccounts(false);
}

function createTeamAccounts(funded) {
  return teamTemplates.map((team) => ({
    ...team,
    cash: funded ? INITIAL_CASH : 0,
    deposit: 0,
    depositInterestEarned: 0,
    portfolio: {},
    lastDividendRound: 0,
    tradeHolder: null,
    tradeHolderExpiresAt: null,
    negativeRounds: 0,
    bankrupt: false,
  }));
}

function fundTeamAccounts(teamAccounts) {
  return teamAccounts.map((team) => ({
    ...team,
    cash: team.bankrupt ? 0 : Math.max(team.cash, INITIAL_CASH),
    deposit: 0,
    depositInterestEarned: 0,
    portfolio: {},
    lastDividendRound: 0,
    tradeHolder: null,
    tradeHolderExpiresAt: null,
    negativeRounds: 0,
    bankrupt: false,
  }));
}

function payTeamRoundSalary(teamAccounts, players) {
  return teamAccounts.map((team) => {
    const memberCount = players.filter((player) => player.teamKey === team.key).length;
    const salaryTotal = ROUND_SALARY * memberCount;
    return team.bankrupt
      ? team
      : {
          ...team,
          cash: team.cash + salaryTotal,
        };
  });
}

function getStudentDisplayName(studentNumber, nickname) {
  return studentNumber ? `${studentNumber}번 ${nickname}` : nickname;
}

function hashStudentPasscode(roomPin, studentNumber, passcode) {
  const source = `${roomPin}:${studentNumber}:${passcode}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return `mc-${Math.abs(hash).toString(36)}`;
}

function isTeamTradeLockActive(team, studentLabel) {
  return Boolean(
    team?.tradeHolder
      && team.tradeHolder === studentLabel
      && team.tradeHolderExpiresAt
      && team.tradeHolderExpiresAt > Date.now(),
  );
}

function cleanTeamTradeLock(team) {
  if (!team?.tradeHolderExpiresAt || team.tradeHolderExpiresAt > Date.now()) return team;
  return { ...team, tradeHolder: null, tradeHolderExpiresAt: null };
}

function getTeamParticipantRows(teamAccounts, assets, players = [], gameStarted = false, round = 1, phase = 'setup') {
  return teamAccounts.map((team) => {
    const cleanTeam = cleanTeamTradeLock(team);
    const holdingsValue = getPortfolioValue(cleanTeam.portfolio, assets);
    const totalAsset = cleanTeam.cash + cleanTeam.deposit + holdingsValue;
    const memberCount = players.filter((player) => player.teamKey === cleanTeam.key).length;
    const investedPrincipal = getInvestedPrincipal({ gameStarted, round, phase, memberCount });
    return {
      id: cleanTeam.key,
      name: cleanTeam.name,
      cash: cleanTeam.cash,
      deposit: cleanTeam.deposit,
      totalAsset,
      cashLikeAsset: cleanTeam.cash + cleanTeam.deposit,
      investmentAsset: holdingsValue,
      investedPrincipal,
      returnRate: getInvestmentReturnRate(totalAsset, investedPrincipal),
      holdings: getHoldingRows(cleanTeam.portfolio, assets).map(({ asset, shares }) => `${asset.name} ${shares.toLocaleString('ko-KR')}주`),
      bankrupt: cleanTeam.bankrupt,
    };
  });
}

function getAssetBucket(asset) {
  if (asset.type === 'futures') return '선물';
  if (asset.type === 'bond') return '채권';
  if (asset.type === 'etf') return asset.country === '미국' ? '해외 ETF' : '국내 ETF';
  if (asset.type === 'property') return '부동산';
  if (asset.type === 'stock') return asset.country === '미국' ? '해외 주식' : '국내 주식';
  return assetTypeLabels[asset.type] ?? '기타';
}

function getInvestorType({ cashLikeAsset, holdingsValue, portfolioRows, totalAsset }) {
  const cashLikeRatio = totalAsset > 0 ? cashLikeAsset / totalAsset : 0;
  const buckets = portfolioRows.reduce((acc, row) => {
    const bucket = getAssetBucket(row.asset);
    acc[bucket] = (acc[bucket] ?? 0) + row.value;
    return acc;
  }, {});
  const overseasValue = (buckets['해외 주식'] ?? 0) + (buckets['해외 ETF'] ?? 0);
  const futuresValue = buckets['선물'] ?? 0;
  const stableValue = cashLikeAsset + (buckets['채권'] ?? 0);
  const domesticStockValue = buckets['국내 주식'] ?? 0;

  if (totalAsset <= 0) return '파산 위험형 투자자';
  if (futuresValue / totalAsset >= 0.3) return '고변동성 승부형 투자자';
  if (overseasValue / totalAsset >= 0.45) return '글로벌 공격형 투자자';
  if (stableValue / totalAsset >= 0.65) return '안정 추구형 투자자';
  if (cashLikeRatio >= 0.55) return '현금 방어형 투자자';
  if (domesticStockValue / totalAsset >= 0.45) return '국내 산업 분석형 투자자';
  if (holdingsValue / totalAsset >= 0.75) return '공격적 성장형 투자자';
  return '균형 분산형 투자자';
}

function buildFinalSubmissionReport({ nickname, studentNumber = null, mode = 'individual', teamKey = '', teamName = '', submissionMethod = 'student', cash, deposit, depositInterestEarned = 0, investedPrincipal = INITIAL_CASH, portfolio, assets, tradeLogs, roundLogs, roundResults = [], roundNotes = {}, roundReflections = {}, reflection, priceIndex = INITIAL_PRICE_INDEX, demandPullCumulative = 0 }) {
  const portfolioRows = getHoldingRows(portfolio, assets);
  const investmentAsset = portfolioRows.reduce((sum, row) => sum + row.value, 0);
  const cashLikeAsset = cash + deposit;
  const totalAsset = cashLikeAsset + investmentAsset;
  const returnRate = getInvestmentReturnRate(totalAsset, investedPrincipal);
  const investorType = getInvestorType({ cashLikeAsset, holdingsValue: investmentAsset, portfolioRows, totalAsset });
  const portfolioReport = portfolioRows.map(({ asset, shares, value }) => ({
    name: asset.name,
    country: asset.country,
    type: assetTypeLabels[asset.type] ?? asset.type,
    bucket: getAssetBucket(asset),
    shares,
    value,
    ratio: totalAsset > 0 ? value / totalAsset : 0,
  }));

  // Week 4 §2.2 Phase C — 명목 vs 실질 KPI
  //   누적 인플레이션으로 화폐가치가 깎인 만큼을 실질로 환산.
  const safePriceIndex = priceIndex > 0 ? priceIndex : 1;
  const cumulativeInflation = safePriceIndex - 1;
  const realNetWorth = totalAsset / safePriceIndex;
  const realPrincipal = investedPrincipal;
  const realReturnRate = realPrincipal > 0 ? (realNetWorth / realPrincipal) - 1 : 0;
  const nominalGain = totalAsset - investedPrincipal;
  const realGain = realNetWorth - investedPrincipal;
  const inflationLoss = realNetWorth - totalAsset; // 음수 → 물가로 인한 구매력 손실
  // 수요견인 비중: 전체 인플레이션 중 demand-pull 누적분이 차지하는 비율
  const demandPullShare = cumulativeInflation > 0
    ? Math.min(1, Math.max(0, demandPullCumulative / cumulativeInflation))
    : 0;

  return {
    nickname,
    studentNumber: studentNumber == null ? null : Number(studentNumber),
    mode,
    teamKey,
    teamName,
    submissionMethod,
    totalAsset,
    cash,
    deposit,
    depositInterestEarned,
    investedPrincipal,
    cashLikeAsset,
    investmentAsset,
    returnRate,
    investorType,
    portfolio: portfolioReport,
    tradeLogs,
    roundLogs,
    roundResults,
    roundNotes: { ...roundNotes },
    roundReflections: { ...roundReflections },
    reflection,
    // Week 4 §2.2 Phase C — 인플레이션 KPI
    priceIndex: safePriceIndex,
    cumulativeInflation,
    realNetWorth,
    realReturnRate,
    nominalGain,
    realGain,
    inflationLoss,
    demandPullCumulative,
    demandPullShare,
    submittedAt: Date.now(),
  };
}

function buildRoundSummaryFromLog(log) {
  if (!log?.eventAnalysis?.length && !log?.macroAlerts?.length) return null;

  return {
    round: log.round,
    events: log.eventAnalysis,
    macroAlerts: log.macroAlerts ?? [],
    macroMove: log.macroMove ?? null,
    delistedAssets: log.delistedAssets ?? [],
  };
}

function mergeRoundResultsIntoLogs(roundLogs = [], roundResults = []) {
  const byRound = new Map(roundLogs.map((log) => [Number(log.round), log]));
  roundResults.forEach((result) => {
    const existing = byRound.get(Number(result.round)) ?? {};
    byRound.set(Number(result.round), {
      id: existing.id ?? `room-result-${result.round}`,
      totalAsset: existing.totalAsset ?? 0,
      holdings: existing.holdings ?? '보유 기록은 학생 계좌 기록을 확인하세요.',
      events: existing.events ?? (result.events ?? []).map((event) => `${event.title}: ${getResultLabel(event, false)}`).join(' / '),
      ...existing,
      round: Number(result.round),
      eventAnalysis: result.events ?? existing.eventAnalysis ?? [],
      macroAlerts: result.macroAlerts ?? existing.macroAlerts ?? [],
      macroMove: result.macroMove ?? existing.macroMove ?? null,
      delistedAssets: result.delistedAssets ?? existing.delistedAssets ?? [],
      priceIndex: result.priceIndex ?? existing.priceIndex,
    });
  });
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

function escapeCsv(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function formatRoundNotesForExport(roundNotes = {}) {
  return Object.entries(roundNotes)
    .filter(([, note]) => String(note ?? '').trim())
    .sort(([firstRound], [secondRound]) => Number(firstRound) - Number(secondRound))
    .map(([roundNumber, note]) => `R${roundNumber}: ${String(note).trim()}`)
    .join(' / ');
}

function formatCheckpointReflectionsForExport(roundReflections = {}) {
  return LEARNING_CHECKPOINT_ROUNDS
    .map((roundNumber) => {
      const answer = roundReflections[roundNumber];
      if (!answer) return '';
      const prompt = REFLECTION_PROMPTS[roundNumber];
      const selectedText = Number.isInteger(answer.selected)
        ? prompt?.objective?.options?.[answer.selected] ?? ''
        : '';
      const openText = String(answer.open ?? '').trim();
      const parts = [selectedText ? `선택: ${selectedText}` : '', openText ? `서술: ${openText}` : ''].filter(Boolean);
      return parts.length ? `R${roundNumber} ${parts.join(' · ')}` : '';
    })
    .filter(Boolean)
    .join(' / ');
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function HoldingsDashboard({ portfolio, assets, onSelectAsset, onSetTradeAmount }) {
  const rows = getHoldingRows(portfolio, assets);

  return (
    <section className="holdings-panel" aria-label="내 보유 종목">
      <div className="panel-heading">
        <Wallet size={20} aria-hidden="true" />
        <h2>내 보유 종목</h2>
      </div>
      {rows.length ? (
        <div className="holding-list">
          {rows.map(({ asset, shares, value, change }) => (
            <article key={asset.id}>
              <div>
                <strong>{asset.name}</strong>
                <span>{asset.country} · {shares.toLocaleString('ko-KR')}주</span>
              </div>
              <div>
                <strong>{formatWon(value)}</strong>
                <em className={change >= 0 ? 'up' : 'down'}>{formatPercent(change)}</em>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectAsset(asset.id);
                  onSetTradeAmount(String(value));
                }}
                disabled={asset.delisted}
              >
                전량 매도 준비
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-note">아직 보유한 투자 상품이 없습니다.</p>
      )}
    </section>
  );
}

function PortfolioDonut({ cash, deposit, portfolio, assets }) {
  const holdingRows = getHoldingRows(portfolio, assets);
  const slices = [
    { label: '현금', value: cash, color: '#94a3b8' },
    { label: '예금', value: deposit, color: '#16a34a' },
    ...holdingRows.map(({ asset, value }) => ({ label: asset.name, value, color: asset.color })),
  ].filter((item) => item.value > 0);
  const total = slices.reduce((sum, item) => sum + item.value, 0);
  let offset = 25;

  if (!total) return null;

  // Week 1 F — 섹터 편중 경고: 예금 제외, 단일 투자상품이 60% 초과인지 검사
  const investableTotal = total - deposit;
  const investableSlices = slices.filter((s) => s.label !== '예금');
  const topInvestable = investableSlices.reduce((max, s) => (s.value > max.value ? s : max), { label: '', value: 0 });
  const topRatio = investableTotal > 0 ? (topInvestable.value / investableTotal) * 100 : 0;
  let lightStatus = 'green';
  let lightLabel = '분산이 잘 되어 있습니다';
  if (topRatio > 60) {
    lightStatus = 'red';
    lightLabel = `${topInvestable.label}에 ${Math.round(topRatio)}% 집중 — 위험합니다`;
  } else if (topRatio > 40) {
    lightStatus = 'amber';
    lightLabel = `${topInvestable.label}이 ${Math.round(topRatio)}% — 비중을 점검하세요`;
  }
  // 간단한 분산 점수: 보유 자산 종류 × 단일종목 비중 페널티
  const holdingCount = holdingRows.length;
  const penaltyFromTop = Math.min(60, Math.max(0, topRatio - 20));
  const diversificationScore = Math.max(0, Math.min(100, Math.round(20 + holdingCount * 10 - penaltyFromTop)));

  return (
    <section className="portfolio-donut-panel" aria-label="내 자산 구성 원 그래프">
      <div className="panel-heading">
        <BadgePercent size={20} aria-hidden="true" />
        <h2>내 자산 구성</h2>
      </div>
      <div className="donut-layout">
        <svg className="donut-chart" viewBox="0 0 42 42" role="img" aria-label="자산 구성 비율">
          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#e2e8f0" strokeWidth="6" />
          {slices.map((slice) => {
            const ratio = (slice.value / total) * 100;
            const currentOffset = offset;
            offset -= ratio;
            return (
              <circle
                key={slice.label}
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke={slice.color}
                strokeWidth="6"
                strokeDasharray={`${ratio} ${100 - ratio}`}
                strokeDashoffset={currentOffset}
              />
            );
          })}
        </svg>
        <div className="donut-legend">
          {slices.slice(0, 6).map((slice) => (
            <span key={slice.label}>
              <i style={{ background: slice.color }} />
              {slice.label} {Math.round((slice.value / total) * 100)}%
            </span>
          ))}
        </div>
      </div>
      <div className={`concentration-alert light-${lightStatus}`} role="status" aria-live="polite">
        <span className="signal-light" aria-hidden="true">
          <i className={lightStatus === 'red' ? 'on' : ''} data-color="red" />
          <i className={lightStatus === 'amber' ? 'on' : ''} data-color="amber" />
          <i className={lightStatus === 'green' ? 'on' : ''} data-color="green" />
        </span>
        <div className="concentration-text">
          <strong>{lightLabel}</strong>
          <span>분산투자 점수 {diversificationScore}점 / 100점 (보유 {holdingCount}종)</span>
        </div>
      </div>
    </section>
  );
}

function TeacherStudentMonitor({ players, activeStudent, assets }) {
  const sampleHoldings = {
    p1: ['core', 'sp500'],
    p2: ['neo', 'kospi'],
    p3: ['bank', 'realty'],
    p4: ['eco', 'food'],
    p5: ['air', 'infra'],
  };

  const monitoredStudents = [
    ...(activeStudent.name.includes('(대기)') ? [] : [activeStudent]),
    ...players.map((player) => {
      const holdingNames = (sampleHoldings[player.id] ?? []).map((id) => assets.find((asset) => asset.id === id)?.name).filter(Boolean);
      return {
        id: player.id,
        name: getStudentDisplayName(player.studentNumber, player.name),
        totalAsset: player.totalAsset ?? Math.round(INITIAL_CASH * (1 + player.returnRate / 100)),
        holdings: player.holdings?.length ? player.holdings : holdingNames,
        connectionLabel: getPlayerConnectionLabel(player),
      };
    }),
  ];

  return (
    <section className="student-monitor" aria-label="참여 학생 모니터링">
      <div className="panel-heading">
        <Users size={22} aria-hidden="true" />
        <h2>참여 학생 현황</h2>
      </div>
      <div className="student-monitor-list">
        {monitoredStudents.map((student) => (
          <article key={student.id}>
            <div>
              <strong>{student.name}</strong>
              <span>{formatWon(student.totalAsset)} · {student.connectionLabel ?? '현재 화면'}</span>
            </div>
            <p>{student.holdings.length ? student.holdings.join(', ') : '보유 종목 없음'}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function TeacherTeamPanel({ roomMode, teamAccounts, assets, players, gameStarted, round, phase }) {
  if (roomMode !== 'team') return null;

  const rows = getTeamParticipantRows(teamAccounts, assets, players, gameStarted, round, phase);

  return (
    <section className="team-dashboard-panel" aria-label="모둠 계좌 현황">
      <div className="panel-heading">
        <Users size={22} aria-hidden="true" />
        <h2>모둠 계좌 현황</h2>
      </div>
      <div className="team-dashboard-list">
        {rows.map((team) => {
          const sourceTeam = teamAccounts.find((item) => item.key === team.id);
          const members = players.filter((player) => player.teamKey === team.id);
          return (
            <article className={team.bankrupt ? 'bankrupt' : ''} key={team.id}>
              <div className="team-dashboard-head">
                <div>
                  <strong>{team.name}</strong>
                  <span>{members.length ? members.map((member) => getStudentDisplayName(member.studentNumber, member.name)).join(', ') : '모둠원 대기'}</span>
                </div>
                <em>{team.bankrupt ? '파산' : sourceTeam?.tradeHolder ? `${sourceTeam.tradeHolder} 거래권` : '거래권 없음'}</em>
              </div>
              <div className="team-dashboard-metrics">
                <span>현금 {formatWon(team.cash)}</span>
                <span>예금 {formatWon(team.deposit)}</span>
                <span>투자 {formatWon(team.investmentAsset)}</span>
                <span>총자산 {formatWon(team.totalAsset)}</span>
              </div>
              <p>
                {team.bankrupt
                  ? '2라운드 연속 잔고 문제가 발생해 거래가 중단되었습니다.'
                  : (sourceTeam?.negativeRounds ?? 0) > 0
                    ? `잔고 경고 ${sourceTeam.negativeRounds}/2라운드`
                    : '잔고 정상'}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function getSubmissionParticipantNames(players) {
  return [...new Set(players.map((player) => getStudentDisplayName(player.studentNumber, player.name)).filter(Boolean))];
}

function submissionMatchesPlayer(submission, player) {
  if (submission?.studentNumber != null && player?.studentNumber != null) {
    return Number(submission.studentNumber) === Number(player.studentNumber);
  }
  return submission?.nickname === getStudentDisplayName(player?.studentNumber, player?.name);
}

function reportsMatchParticipant(first, second) {
  if (first?.studentNumber != null && second?.studentNumber != null) {
    return Number(first.studentNumber) === Number(second.studentNumber);
  }
  return first?.nickname === second?.nickname;
}

function TeacherSubmissionPanel({ players, submissions, gameFinished, allSubmissionsComplete, finalReportsDownloaded, onCloseSubmissions, onDownloadSubmissions }) {
  const participantNames = getSubmissionParticipantNames(players);
  const submittedRows = [...submissions].sort((a, b) => b.totalAsset - a.totalAsset);
  const submittedPlayerCount = players.filter((player) => submissions.some((submission) => submissionMatchesPlayer(submission, player))).length;
  const missingNames = players
    .filter((player) => !submissions.some((submission) => submissionMatchesPlayer(submission, player)))
    .map((player) => getStudentDisplayName(player.studentNumber, player.name));

  return (
    <section className="submission-panel" aria-label="최종 제출 현황">
      <div className="panel-heading split">
        <div>
          <Download size={22} aria-hidden="true" />
          <h2>최종 제출 현황</h2>
        </div>
        <span className="limit-pill">{submittedPlayerCount}/{participantNames.length}</span>
      </div>
      {!gameFinished ? <p className="empty-note">최종 라운드 종료 후 학생 제출과 다운로드를 사용할 수 있습니다.</p> : null}
      <div className="submission-actions">
        <button className="command secondary" type="button" onClick={() => window.print()} disabled={!gameFinished || !submittedRows.length}>
          보고서 인쇄
        </button>
        <button className="command secondary" type="button" onClick={onCloseSubmissions} disabled={!gameFinished || allSubmissionsComplete}>
          제출 마감
        </button>
        <button className="command primary" type="button" onClick={onDownloadSubmissions} disabled={!gameFinished || !allSubmissionsComplete || !submissions.length}>
          {finalReportsDownloaded ? 'CSV 다시 다운로드' : 'CSV 다운로드'}
        </button>
      </div>
      {gameFinished && submittedRows.length && !allSubmissionsComplete ? <p className="teacher-hint warning">미제출 학생이 있으면 제출 마감으로 현재 저장 상태를 자동 제출할 수 있습니다.</p> : null}
      {finalReportsDownloaded ? <p className="teacher-hint success">CSV 다운로드가 완료되었습니다. 제출이 모두 끝났다면 게임 종료를 진행할 수 있습니다.</p> : null}
      <div className="submission-list">
        {submittedRows.map((submission, index) => (
          <article key={submission.nickname}>
            <span>{index + 1}위</span>
            <strong>{submission.nickname}</strong>
            <em>{submission.investorType}</em>
            <small>
              {submission.mode === 'team' ? `${submission.teamName || '모둠'} · ` : ''}
              {submission.submissionMethod === 'teacher-close' ? '교사 마감 제출 · ' : ''}
              {formatWon(submission.totalAsset)} · {formatPercent(submission.returnRate)}
            </small>
          </article>
        ))}
        {missingNames.map((name) => (
          <article className="missing" key={name}>
            <span>미제출</span>
            <strong>{name}</strong>
            <em>대기 중</em>
            <small>학생 화면에서 최종 제출하기를 눌러야 합니다.</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function TeacherRankingPanel({ players, submissions, activeStudent, gameFinished }) {
  const activeStudentRows = activeStudent.name.includes('(대기)')
    ? []
    : [{
        nickname: activeStudent.name,
        totalAsset: activeStudent.totalAsset,
        cashLikeAsset: activeStudent.cashLikeAsset ?? activeStudent.totalAsset,
        investmentAsset: activeStudent.investmentAsset ?? 0,
        investedPrincipal: activeStudent.investedPrincipal ?? INITIAL_CASH,
        returnRate: activeStudent.returnRate ?? getInvestmentReturnRate(activeStudent.totalAsset, activeStudent.investedPrincipal ?? INITIAL_CASH),
        investorType: '제출 전',
      }];
  const submittedRows = submissions.length
    ? submissions
    : [
        ...activeStudentRows,
        ...players.map((player) => ({
          nickname: getStudentDisplayName(player.studentNumber, player.name),
          totalAsset: player.totalAsset ?? Math.round(INITIAL_CASH * (1 + player.returnRate / 100)),
          cashLikeAsset: player.cash ?? 0,
          investmentAsset: Math.max(0, (player.totalAsset ?? Math.round(INITIAL_CASH * (1 + player.returnRate / 100))) - (player.cash ?? 0) - (player.deposit ?? 0)),
          returnRate: player.returnRate,
          investorType: '제출 전',
        })),
      ];

  return (
    <section className="ranking-panel">
      <div className="panel-heading">
        <Trophy size={22} aria-hidden="true" />
        <h2>{gameFinished ? '최종 순위' : '실시간 수익률 랭킹'}</h2>
      </div>
      <ol className="ranking-list detailed">
        {[...submittedRows].sort((a, b) => b.totalAsset - a.totalAsset).map((player, index) => {
          const total = player.totalAsset || 1;
          const cashRatio = ((player.cashLikeAsset ?? 0) / total) * 100;
          const investmentRatio = ((player.investmentAsset ?? 0) / total) * 100;
          return (
            <li key={player.nickname}>
              <span className="rank">{index + 1}</span>
              <div>
                <strong>{player.nickname}</strong>
                <small>현금성 {cashRatio.toFixed(0)}% · 투자 {investmentRatio.toFixed(0)}%</small>
              </div>
              <em className={player.returnRate >= 0 ? 'up' : 'down'}>{gameFinished ? player.investorType : formatPercent(player.returnRate)}</em>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function EndGameFlowPanel({ finalRoundClosed, submittedCount, participantCount, allSubmissionsComplete, finalReportsDownloaded, phase }) {
  if (phase === 'ended') {
    return (
      <section className="end-flow-panel complete" aria-label="게임 종료 상태">
        <strong>게임이 종료되었습니다.</strong>
        <span>이제 새 게임 시작으로 다음 수업 방을 만들 수 있습니다.</span>
      </section>
    );
  }

  return (
    <section className="end-flow-panel" aria-label="게임 종료 조건">
      <div>
        <strong>종료 전 확인</strong>
        <span>마지막 라운드가 끝난 뒤 제출과 다운로드가 완료되어야 게임을 종료할 수 있습니다.</span>
      </div>
      <ol>
        <li className={finalRoundClosed ? 'done' : ''}>최종 라운드 마감</li>
        <li className={allSubmissionsComplete ? 'done' : ''}>학생 제출 {submittedCount}/{participantCount}</li>
        <li className={finalReportsDownloaded ? 'done' : ''}>CSV 다운로드</li>
      </ol>
    </section>
  );
}

function ResetRoomModal({ value, error, onChange, onCancel, onConfirm }) {
  return (
    <section className="choice-modal-backdrop" aria-label="방 초기화 암호 입력">
      <form className="choice-modal reset-modal" onSubmit={onConfirm}>
        <div>
          <p className="eyebrow">방 초기화</p>
          <h2>초기화 암호를 입력하세요.</h2>
          <p>현재 방의 라운드, 학생, 제출, 자산 데이터를 지우고 같은 PIN으로 새로 시작합니다.</p>
        </div>
        <label>
          초기화 암호
          <input
            type="password"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="암호 입력"
            aria-label="초기화 암호"
          />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <div className="choice-actions">
          <button className="command danger" type="submit">
            <RotateCcw size={18} aria-hidden="true" />
            초기화 실행
          </button>
          <button className="command secondary" type="button" onClick={onCancel}>
            취소
          </button>
        </div>
      </form>
    </section>
  );
}

function HostLoginView({ login, error, onLoginChange, onSubmit }) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <p className="eyebrow">교사용 로그인</p>
        <h1>교사용 대시보드에 접속하세요.</h1>
        <form onSubmit={onSubmit}>
          <label>
            아이디
            <input
              value={login.id}
              onChange={(event) => onLoginChange((current) => ({ ...current, id: event.target.value }))}
              placeholder="아이디"
              aria-label="교사용 아이디"
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={login.password}
              onChange={(event) => onLoginChange((current) => ({ ...current, password: event.target.value }))}
              placeholder="비밀번호"
              aria-label="교사용 비밀번호"
            />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="command primary wide" type="submit">
            <LogIn size={19} aria-hidden="true" />
            교사용 대시보드 입장
          </button>
        </form>
      </section>
    </main>
  );
}

function RoomExpiryNotice({ roomPin, expiresAt, expired, canCreateRoom, onCreateRoom }) {
  return (
    <section className={expired ? 'expiry-notice expired' : 'expiry-notice'} aria-label="방 유지 시간">
      <div>
        <strong>{expired ? '방이 자동 폐기되었습니다.' : `방 ${roomPin} 유지 중`}</strong>
        <span>{expired ? '24시간이 지나 새 방 생성이 필요합니다.' : `${formatDateTime(expiresAt)}까지 유지됩니다.`}</span>
      </div>
      {canCreateRoom ? (
        <button className="command secondary" type="button" onClick={onCreateRoom}>
          <Radio size={18} aria-hidden="true" />
          새 방 생성
        </button>
      ) : null}
    </section>
  );
}

function JoinQrCard({ roomPin }) {
  const [copied, setCopied] = useState(false);
  const joinUrl = getJoinUrl(roomPin);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="join-qr-card" aria-label="학생 접속 QR">
      <div className="qr-box">
        <QRCodeSVG value={joinUrl} size={148} level="M" includeMargin />
      </div>
      <div className="qr-copy">
        <span>학생 접속 QR</span>
        <strong>{roomPin}</strong>
        <p>학생은 QR을 스캔하거나 PIN을 입력해 입장합니다.</p>
        <button className="command secondary" type="button" onClick={handleCopyLink}>
          {copied ? '복사 완료' : '접속 링크 복사'}
        </button>
      </div>
    </section>
  );
}

function HeroMarketGraphic() {
  const bars = [42, 68, 54, 86, 62, 92, 74, 108];

  return (
    <section className="hero-market-graphic" aria-label="시장 차트 미리보기">
      <div className="market-graphic-head">
        <span>LIVE CLASS MARKET</span>
        <strong>RISK / RETURN</strong>
      </div>
      <div className="market-chart">
        {bars.map((height, index) => (
          <span
            className={index % 3 === 1 ? 'loss' : 'gain'}
            key={`${height}-${index}`}
            style={{ height: `${height}px` }}
          />
        ))}
        <Sparkline history={[72, 86, 64, 112, 92, 128, 98, 146]} color="#f59e0b" />
      </div>
      <div className="market-tickers">
        <div>
          <span>NEO</span>
          <strong className="up">+12.4%</strong>
        </div>
        <div>
          <span>KOSPI ETF</span>
          <strong className="up">+5.1%</strong>
        </div>
        <div>
          <span>AIR</span>
          <strong className="down">-8.7%</strong>
        </div>
      </div>
    </section>
  );
}

function FinalReport({
  nickname,
  mode,
  teamName,
  cash,
  deposit,
  depositInterestEarned,
  investedPrincipal,
  portfolio,
  assets,
  tradeLogs,
  roundLogs,
  roundResults,
  reflection,
  submission,
  onSubmitReport,
  onReflectionChange,
  roundNotes, // Week 3 G — 라운드별 메모
  roundReflections, // Week 4 §3.6 — 체크포인트 학습 질문 응답
  // Week 4 §2.2 Phase C — 인플레이션 KPI
  priceIndex = INITIAL_PRICE_INDEX,
  demandPullCumulative = 0,
}) {
  const holdingsValue = getPortfolioValue(portfolio, assets);
  const totalAsset = cash + deposit + holdingsValue;
  const returnRate = getInvestmentReturnRate(totalAsset, investedPrincipal);
  const reportRoundResults = submission?.roundResults?.length ? submission.roundResults : (roundResults ?? []);
  const reportRoundLogs = mergeRoundResultsIntoLogs(
    submission?.roundLogs?.length ? submission.roundLogs : roundLogs,
    reportRoundResults,
  );
  const reportRoundNotes = submission?.roundNotes ?? roundNotes ?? {};
  const reportRoundReflections = submission?.roundReflections ?? roundReflections ?? {};
  const reportReflection = submission?.reflection ?? reflection;
  const investorType = submission?.investorType ?? buildFinalSubmissionReport({ nickname, mode, teamName, cash, deposit, depositInterestEarned, investedPrincipal, portfolio, assets, tradeLogs, roundLogs: reportRoundLogs, roundResults: reportRoundResults, roundNotes: reportRoundNotes, roundReflections: reportRoundReflections, reflection: reportReflection, priceIndex, demandPullCumulative }).investorType;
  // Week 4 §2.2 Phase C — 명목 vs 실질 KPI (submission이 있으면 거기서 가져오고, 없으면 즉시 계산)
  const finalPriceIndex = submission?.priceIndex ?? priceIndex;
  const finalDemandPullCumulative = submission?.demandPullCumulative ?? demandPullCumulative;
  const safePriceIndex = finalPriceIndex > 0 ? finalPriceIndex : 1;
  const cumulativeInflationPct = (safePriceIndex - 1) * 100;
  const nominalReturnPct = returnRate;
  const realNetWorth = totalAsset / safePriceIndex;
  const realReturnPct = investedPrincipal > 0 ? ((realNetWorth - investedPrincipal) / investedPrincipal) * 100 : 0;
  const inflationLossWon = Math.max(0, Math.round(totalAsset - realNetWorth));
  const demandPullSharePct = (safePriceIndex - 1) > 0
    ? Math.min(100, Math.max(0, (finalDemandPullCumulative / (safePriceIndex - 1)) * 100))
    : 0;
  const sortedRoundLogs = useMemo(
    () => [...reportRoundLogs].sort((a, b) => a.round - b.round),
    [reportRoundLogs],
  );
  const [selectedRoundPreference, setSelectedRoundPreference] = useState(null);
  const selectedRound = sortedRoundLogs.some((log) => log.round === selectedRoundPreference)
    ? selectedRoundPreference
    : (sortedRoundLogs.at(-1)?.round ?? null);
  const selectedRoundLog = sortedRoundLogs.find((log) => log.round === selectedRound) ?? sortedRoundLogs.at(-1) ?? null;
  const selectedRoundSummary = buildRoundSummaryFromLog(selectedRoundLog);
  const reportMacroAlertsByRound = Object.fromEntries(
    reportRoundResults
      .filter((result) => (result.macroAlerts ?? []).length)
      .map((result) => [result.round, result.macroAlerts]),
  );

  return (
    <section className="final-report" aria-label="나의 투자 결과 보고서">
      <div className="panel-heading split">
        <div>
          <BadgePercent size={22} aria-hidden="true" />
          <h2>나의 투자 결과 보고서</h2>
        </div>
        <button className="command secondary print-hide" type="button" onClick={() => window.print()}>
          PDF 저장
        </button>
      </div>

      <div className="report-summary">
        <div>
          <span>이름</span>
          <strong>{nickname}</strong>
        </div>
        <div>
          <span>투자 방식</span>
          <strong>{mode === 'team' ? teamName : '개인 투자'}</strong>
        </div>
        <div>
          <span>현금성 자산</span>
          <strong>{formatWon(cash + deposit)}</strong>
        </div>
        <div>
          <span>투입 원금</span>
          <strong>{formatWon(investedPrincipal)}</strong>
        </div>
        <div>
          <span>최종 수익률</span>
          <strong className={returnRate >= 0 ? 'up' : 'down'}>{formatPercent(returnRate)}</strong>
        </div>
      </div>

      <div className="submission-box">
        <div>
          <span>투자 성향</span>
          <strong>{investorType}</strong>
          <p>최종 자산은 현금과 예금을 현금성 자산으로 합산해 계산합니다.</p>
        </div>
      </div>

      {/* Week 4 §2.2 Phase C — 명목 vs 실질 수익률 비교 (인플레이션 영향 시각화) */}
      <div className="report-section final-inflation-section" aria-label="명목 실질 비교">
        <h3>명목수익률 vs 실질수익률</h3>
        <p className="final-inflation-lead">
          게임 기간 동안 누적된 물가지수는 <strong>{safePriceIndex.toFixed(3)}</strong> (+{cumulativeInflationPct.toFixed(1)}%)
          {demandPullSharePct > 0 ? <> 이며, 이 중 약 <strong>{demandPullSharePct.toFixed(0)}%</strong> 가 학생들 수익 증가에 따른 <strong>수요견인</strong>에서 발생했습니다.</> : '입니다.'}
        </p>
        <div className="final-inflation-grid">
          <div className="final-inflation-bar">
            <div className="bar-label">
              <span>명목 수익률</span>
              <strong className={nominalReturnPct >= 0 ? 'up' : 'down'}>{nominalReturnPct >= 0 ? '+' : ''}{nominalReturnPct.toFixed(1)}%</strong>
            </div>
            {(() => {
              const maxAbs = Math.max(Math.abs(nominalReturnPct), Math.abs(realReturnPct), Math.abs(cumulativeInflationPct), 1);
              const w = (val) => `${Math.min(100, Math.abs(val) / maxAbs * 100)}%`;
              return (
                <>
                  <div className="bar-track"><div className={`bar-fill ${nominalReturnPct >= 0 ? 'pos' : 'neg'}`} style={{ width: w(nominalReturnPct) }}></div></div>
                  <div className="bar-label" style={{ marginTop: 8 }}>
                    <span>실질 수익률</span>
                    <strong className={realReturnPct >= 0 ? 'up' : 'down'}>{realReturnPct >= 0 ? '+' : ''}{realReturnPct.toFixed(1)}%</strong>
                  </div>
                  <div className="bar-track"><div className={`bar-fill ${realReturnPct >= 0 ? 'pos' : 'neg'}`} style={{ width: w(realReturnPct) }}></div></div>
                  <div className="bar-label" style={{ marginTop: 8 }}>
                    <span>누적 인플레이션</span>
                    <strong className="neutral">+{cumulativeInflationPct.toFixed(1)}%</strong>
                  </div>
                  <div className="bar-track"><div className="bar-fill inflation" style={{ width: w(cumulativeInflationPct) }}></div></div>
                </>
              );
            })()}
          </div>
          <div className="final-inflation-kpis">
            <div><span>최종 순자산 (명목)</span><strong>{formatWon(totalAsset)}</strong></div>
            <div><span>실질 순자산 (구매력)</span><strong>{formatWon(Math.round(realNetWorth))}</strong></div>
            <div><span>인플레이션 손실</span><strong className="neg">{formatWon(inflationLossWon)}</strong></div>
            <div title="전체 인플레이션 중 학생들 수익 증가가 만들어낸 비중. 클수록 다 같이 잘 벌어 물가가 가속됐다는 뜻.">
              <span>수요견인 기여분</span><strong>{demandPullSharePct.toFixed(0)}%</strong>
            </div>
          </div>
        </div>
        <p className="final-inflation-note">
          명목 수익은 통장에 찍힌 숫자, 실질 수익은 실제로 살 수 있는 양의 변화입니다.
          물가가 오르면 같은 금액으로 살 수 있는 양이 줄어들기 때문에, 실제 부의 변화는 실질수익률로 봐야 합니다.
        </p>
      </div>

      <div className="report-section">
        <h3>최종 보유 현황</h3>
        <p>{getHoldingSummary(portfolio, assets)}</p>
        <p>현금성 자산 {formatWon(cash + deposit)} · 투자 평가금 {formatWon(holdingsValue)} · 총자산 {formatWon(totalAsset)}</p>
        <p>예금 이자 수익 {formatWon(depositInterestEarned)} · 예금은 라운드마다 이자가 원금에 더해지는 분기 복리로 계산됩니다.</p>
      </div>

      <div className="report-section">
        <h3>거래 로그</h3>
        {tradeLogs.length ? (
          <div className="report-list">
            {tradeLogs.map((log) => (
              <article key={log.id}>
                <strong>R{log.round} · {log.type}</strong>
                <span>{log.detail}</span>
              </article>
            ))}
          </div>
        ) : (
          <p>아직 기록된 거래가 없습니다.</p>
        )}
      </div>

      <div className="report-section">
        <h3>라운드별 이벤트 분석</h3>
        {sortedRoundLogs.length ? (
          <div className="round-analysis-panel">
            <div className="round-selector" role="tablist" aria-label="라운드 선택">
              {sortedRoundLogs.map((log) => (
                <button
                  key={log.id}
                  className={log.round === selectedRound ? 'active' : ''}
                  type="button"
                  onClick={() => setSelectedRoundPreference(log.round)}
                >
                  {log.round}라운드
                </button>
              ))}
            </div>
            {selectedRoundLog ? (
              <div className="round-analysis-card">
                <div className="round-analysis-meta">
                  <strong>{selectedRoundLog.round}라운드 · 총자산 {formatWon(selectedRoundLog.totalAsset)}</strong>
                  <span>{selectedRoundLog.events}</span>
                  <em>{selectedRoundLog.holdings}</em>
                </div>
                {selectedRoundSummary ? (
                  <RoundExplanation summary={selectedRoundSummary} assets={assets} />
                ) : (
                  <p>이 라운드의 상세 이슈 분석 데이터는 아직 저장되지 않았습니다.</p>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <p>라운드 마감 기록이 아직 없습니다.</p>
        )}
      </div>

      <MacroTriggerPanel alertsByRound={reportMacroAlertsByRound} />

      {/* Week 3 H — 회고 작성 보조용: 전체 라운드 이슈 타임라인 (스크롤로 한 번에 확인) */}
      {sortedRoundLogs.some((log) => (log.eventAnalysis ?? []).length > 0) ? (
        <details className="report-section round-issue-timeline" open>
          <summary>
            <strong>라운드별 이슈 타임라인</strong>
            <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280' }}>
              회고 작성 시 참고
            </span>
          </summary>
          <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
            {sortedRoundLogs.map((log) => {
              const events = log.eventAnalysis ?? [];
              if (events.length === 0) return null;
              return (
                <article
                  key={log.id}
                  style={{
                    border: '1px solid var(--border, #d1d5db)',
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <strong style={{ fontSize: 13 }}>{log.round}라운드</strong>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>총자산 {formatWon(log.totalAsset)}</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                    {events.map((ev, idx) => {
                      const resolved = ev.resolved === true;
                      const applied = resolved && ev.didApply === true;
                      const expectation = applied && ev.outcomeType === 'expectation';
                      const isReverse = ev.outcomeType === 'reverse';
                      const status = !resolved
                        ? '미마감'
                        : applied
                        ? (expectation ? '기대 선반영' : '실제 발생')
                        : isReverse
                        ? '반대 흐름'
                            : '발생 안 함 · 직접 영향 0';
                      const color = !resolved
                        ? '#6b7280'
                        : applied
                        ? (expectation ? '#d97706' : '#047857')
                        : isReverse
                        ? '#2563eb'
                        : '#9ca3af';
                      return (
                        <li key={`${log.round}-${ev.id}-${idx}`} style={{ fontSize: 12, lineHeight: 1.5 }}>
                          <span style={{ fontWeight: 600 }}>
                            {ev.triggered ? '[트리거] ' : ''}{ev.title}
                          </span>
                          <span style={{ marginLeft: 6, color, fontSize: 11, fontWeight: 600 }}>
                            {status}
                          </span>
                          {ev.affectedAssets?.length ? (
                            <div style={{ color: '#6b7280', fontSize: 11 }}>
                              영향: {ev.affectedAssets.join(' · ')}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </div>
        </details>
      ) : null}

      {/* Week 3 G — 라운드별 메모 회고 타임라인 */}
      {Object.keys(reportRoundNotes).filter((k) => (reportRoundNotes[k] ?? '').trim().length > 0).length > 0 ? (
        <details className="round-notes-timeline" open>
          <summary>
            <strong>라운드별 한 줄 메모 회고</strong>
            <span className="round-notes-count">
              {Object.keys(reportRoundNotes).filter((k) => (reportRoundNotes[k] ?? '').trim().length > 0).length}건
            </span>
          </summary>
          <ol className="round-notes-list">
            {Object.entries(reportRoundNotes)
              .filter(([, note]) => (note ?? '').trim().length > 0)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([noteRound, note]) => {
              return (
                <li key={`note-${noteRound}`} className="round-note-item">
                  <span className="round-note-label">R{noteRound}</span>
                  <p className="round-note-text">{note}</p>
                </li>
              );
            })}
          </ol>
          <p className="round-notes-help">
            라운드별로 남긴 결정 이유를 시간순으로 다시 봅니다. 어떤 판단이 결과로 이어졌는지 추적해 보세요.
          </p>
        </details>
      ) : null}

      {/* Week 4 §3.6 — 체크포인트 학습 질문 회고 (R4·R8·R12) */}
      {LEARNING_CHECKPOINT_ROUNDS.some((r) => {
        const ref = reportRoundReflections[r];
        return ref && (Number.isInteger(ref.selected) || (ref.open ?? '').trim().length > 0);
      }) ? (
        <details className="reflection-timeline" open>
          <summary>
            <strong>체크포인트 학습 질문 회고</strong>
            <span className="reflection-timeline-count">
              {LEARNING_CHECKPOINT_ROUNDS.filter((r) => {
                const ref = reportRoundReflections[r];
                return ref && (Number.isInteger(ref.selected) || (ref.open ?? '').trim().length > 0);
              }).length}건
            </span>
          </summary>
          <div className="reflection-timeline-list">
            {LEARNING_CHECKPOINT_ROUNDS.map((r) => {
              const ref = reportRoundReflections[r];
              if (!ref || (!Number.isInteger(ref.selected) && !(ref.open ?? '').trim())) return null;
              return (
                <div key={`reflection-${r}`} className="reflection-timeline-item">
                  <ReflectionPrompt
                    round={r}
                    reflection={ref}
                    onReflectionChange={() => {}}
                    readOnly
                  />
                </div>
              );
            })}
          </div>
          <p className="reflection-timeline-help">
            체크포인트 라운드(R4·R8·R12)에서 답한 학습 질문을 다시 봅니다. 명목/실질, 수요견인 인플레이션, 장기 자산 배분 회고 순서로 정리되어 있어요.
          </p>
        </details>
      ) : null}

      <div className="reflection-grid print-hide">
        <label>
          잘한 점
          <textarea value={reportReflection.good} onChange={(event) => onReflectionChange('good', event.target.value)} disabled={Boolean(submission)} />
        </label>
        <label>
          부족한 점
          <textarea value={reportReflection.improve} onChange={(event) => onReflectionChange('improve', event.target.value)} disabled={Boolean(submission)} />
        </label>
        <label>
          다음에는 어떻게 할 것인가
          <textarea value={reportReflection.next} onChange={(event) => onReflectionChange('next', event.target.value)} disabled={Boolean(submission)} />
        </label>
      </div>

      {/* 출력용 라운드별 메모 (print) */}
      {Object.keys(reportRoundNotes).filter((k) => (reportRoundNotes[k] ?? '').trim().length > 0).length > 0 ? (
        <div className="report-section print-only">
          <h3>라운드별 메모</h3>
          {sortedRoundLogs.map((log) => {
            const note = reportRoundNotes[log.round];
            if (!note || !note.trim()) return null;
            return (
              <p key={`print-note-${log.round}`}><strong>R{log.round}</strong> {note}</p>
            );
          })}
        </div>
      ) : null}

      <div className="report-section print-only">
        <h3>나의 투자 분석</h3>
        <p><strong>잘한 점</strong> {reportReflection.good || '작성 전'}</p>
        <p><strong>부족한 점</strong> {reportReflection.improve || '작성 전'}</p>
        <p><strong>다음에는 어떻게 할 것인가</strong> {reportReflection.next || '작성 전'}</p>
      </div>

      <div className="submission-box final-submit-box print-hide">
        <div>
          <span>최종 보고서 제출</span>
          <strong>{submission ? '제출이 완료되었습니다.' : '작성한 회고와 투자 기록을 제출합니다.'}</strong>
          <p>제출 후에는 교사 대시보드의 최종 제출 현황에 반영됩니다.</p>
        </div>
        <button className="command primary" type="button" onClick={onSubmitReport} disabled={Boolean(submission)}>
          {submission ? '제출 완료' : '최종 제출하기'}
        </button>
      </div>
    </section>
  );
}

const macroGuideItems = {
  baseRate: {
    title: '기준금리',
    summary: '중앙은행이 경제 전체의 돈값을 조절하기 위해 정하는 대표 금리입니다.',
    up: '오르면 예금은 매력적이지만, 대출 부담이 커져 부동산과 성장주는 부담을 받을 수 있습니다.',
    down: '내리면 돈을 빌리기 쉬워져 투자와 소비가 늘고, 부동산과 성장주 기대가 커질 수 있습니다.',
    examples: ['은행주', '부동산지수', '성장주', '예금'],
  },
  depositRate: {
    title: '예금금리',
    summary: '은행에 돈을 맡겼을 때 받을 수 있는 이자율입니다.',
    up: '오르면 안정적으로 이자를 받으려는 사람이 늘어 주식보다 예금을 선호할 수 있습니다.',
    down: '내리면 예금 매력이 줄어 일부 자금이 주식, ETF, 부동산으로 이동할 수 있습니다.',
    examples: ['현금 관리', '안전자산', '주식 수요', '위험자산'],
  },
  propertyIndex: {
    title: '부동산지수',
    summary: '부동산 시장의 평균적인 가격 흐름을 보여주는 지표입니다.',
    up: '오르면 건설, 은행, 인프라 관련 기대가 함께 좋아질 수 있습니다.',
    down: '내리면 대출 부실 우려와 소비 위축 우려가 커져 관련 업종이 부담을 받을 수 있습니다.',
    examples: ['건설/인프라', '은행', '소비심리', '대출'],
  },
  exchangeRate: {
    title: '원/달러 환율',
    summary: '1달러를 사기 위해 필요한 원화 가격입니다. 환율이 오르면 원화 가치가 약해졌다는 뜻입니다.',
    up: '오르면 수출 기업과 미국 자산 환산가치는 유리할 수 있지만, 항공·식품처럼 달러 비용이 큰 산업은 부담을 받을 수 있습니다.',
    down: '내리면 수입 비용 부담은 줄지만, 수출 기업의 원화 환산 매출 기대는 약해질 수 있습니다.',
    examples: ['해외 ETF', '항공', '식품', '수출주'],
  },
  unemploymentRate: {
    title: '실업률',
    summary: '일할 의사가 있지만 일자리를 얻지 못한 사람의 비율입니다. 경기의 체온계처럼 소비와 기업 실적 기대에 영향을 줍니다.',
    up: '오르면 소비가 줄고 여행, 콘텐츠, 건설 같은 경기민감 업종은 부담을 받을 수 있습니다. 안전자산 선호는 커질 수 있습니다.',
    down: '내리면 소비와 고용이 좋아졌다는 신호로 해석되어 경기민감 업종과 주식시장 심리가 개선될 수 있습니다.',
    examples: ['항공', '콘텐츠', '건설', '미국 국채'],
  },
  // Week 4 §2.2 — 물가지수 (인플레이션) 가이드
  priceIndex: {
    title: '물가지수',
    summary: '게임 시작 시점(1.000)을 기준으로 한 누적 인플레이션입니다. 매 분기(라운드) 종료 시점에 기본 1% + α 만큼 누적되며, 연 환산 약 4%로 한국의 고물가기와 비슷한 수준입니다.',
    up: '오르면 화폐가치가 떨어져 명목수익률보다 실질수익률이 작아집니다. 다 같이 돈을 많이 벌수록 물가가 더 빨리 오를 수 있습니다(수요견인).',
    down: '내리면 화폐가치가 회복되지만, 게임에서는 최소 0.3%/분기까지만 떨어지고 디플레이션은 일어나지 않습니다.',
    examples: ['실질수익률', '명목수익률', '수요견인', '구매력'],
  },
};

function MacroGuide({ baseRate, depositRate, propertyIndex, exchangeRate, unemploymentRate, priceIndex }) {
  const [selectedGuide, setSelectedGuide] = useState('baseRate');
  const item = macroGuideItems[selectedGuide];
  const cumulativeInflationPct = priceIndex != null ? ((priceIndex - 1) * 100).toFixed(1) : '0.0';
  const currentValue = {
    baseRate: `${baseRate.toFixed(1)}%`,
    depositRate: `${depositRate.toFixed(1)}%`,
    propertyIndex: propertyIndex ? formatWon(propertyIndex) : '-',
    exchangeRate: `${exchangeRate.toLocaleString('ko-KR')}원`,
    unemploymentRate: `${unemploymentRate.toFixed(1)}%`,
    // Week 4 §2.2 — 물가지수 표시: 1.025 (+2.5%) 형태
    priceIndex: priceIndex != null ? `${priceIndex.toFixed(3)} (+${cumulativeInflationPct}%)` : '1.000 (+0.0%)',
  }[selectedGuide];

  return (
    <section className="macro-guide" aria-label="경제 지표 설명">
      <div className="panel-heading">
        <Landmark size={20} aria-hidden="true" />
        <h2>지표 설명</h2>
      </div>
      <div className="macro-guide-tabs" role="tablist" aria-label="지표 선택">
        {Object.entries(macroGuideItems).map(([key, guide]) => (
          <button className={selectedGuide === key ? 'active' : ''} type="button" key={key} onClick={() => setSelectedGuide(key)}>
            {guide.title}
          </button>
        ))}
      </div>
      <article className="macro-guide-card">
        <div>
          <strong>{item.title}</strong>
          <span>{currentValue}</span>
        </div>
        <p>{item.summary}</p>
        <div className="macro-effects">
          <p><b>오르면</b>{item.up}</p>
          <p><b>내리면</b>{item.down}</p>
        </div>
        <div className="impact-chips">
          {item.examples.map((example) => (
            <span key={example}>{example}</span>
          ))}
        </div>
      </article>
    </section>
  );
}

function AssetLearningPanel({ asset }) {
  if (!asset) return null;
  let profile;
  const productDetail = getProductLearningDetail(asset);
  try {
    profile = getAssetProfile(asset);
  } catch {
    return (
      <section className="asset-learning-panel" aria-label="자산 분석">
        <p style={{ padding: '12px', color: '#64748b', fontSize: '13px' }}>자산 정보를 불러올 수 없습니다.</p>
      </section>
    );
  }
  if (!profile || !profile.signals) {
    return (
      <section className="asset-learning-panel" aria-label="자산 분석">
        <p style={{ padding: '12px', color: '#64748b', fontSize: '13px' }}>자산 정보를 불러올 수 없습니다.</p>
      </section>
    );
  }
  // Week 4 §2.4 — 배당 성향을 주식 티어 라벨(성장주 / 안정주 / 고배당주)로 노출.
  //   - 주식: dividendTier → 성장주 / 안정주 / 고배당주
  //   - 채권: 라운드마다 쿠폰 이자가 들어오므로 '이자 지급'으로 별도 라벨
  //   - 그 외(ETF·외환·선물·부동산): '배당 없음'
  let dividendTendency;
  if (asset.type === 'stock' && asset.dividendTier) {
    dividendTendency = { growth: '성장주', stable: '안정주', highYield: '고배당주' }[asset.dividendTier] || '성장주';
  } else if (asset.type === 'bond') {
    dividendTendency = '이자 지급';
  } else {
    dividendTendency = '배당 없음';
  }
  const signalEntries = asset.type === 'stock'
    ? [
        ['안정성', profile.signals.stability],
        ['성장성', profile.signals.growth],
        ['변동성', profile.signals.volatility],
        ['배당 성향', dividendTendency],
      ]
    : [
        ['안정성', profile.signals.stability],
        ['시장 민감도', productDetail?.marketSensitivity ?? '보통'],
        ['변동성', profile.signals.volatility],
        ['현금흐름', asset.type === 'bond' ? '이자 지급' : '없음'],
      ];
  const checklist = productDetail?.checklist ?? [
    '이 기업은 어떤 나라와 산업에 연결되어 있나?',
    '부채비율, 현금보유, 원자재 의존도 중 무엇이 눈에 띄나?',
    '지금 공개된 이슈가 실제 이벤트가 아니어도 기대감만으로 움직일 수 있나?',
    '전 재산을 넣었을 때 상장폐지나 급락을 버틸 수 있나?',
  ];

  // Week 4 §2.2 — 종목 설명에 배당/이자 안내를 별도 박스로 노출 (CSS 누락 환경에서도 보이도록 inline-style)
  let incomeNote = null;
  if (asset.type === 'stock' && asset.dividendTier) {
    const tierLabel = { growth: '성장주', stable: '안정주', highYield: '고배당주' }[asset.dividendTier];
    if (asset.dividendTier === 'growth') {
      incomeNote = `배당 성향: ${tierLabel}. 3·6·9·11라운드 종료 시점에도 배당 지급이 없고, 수익은 가격 변동(자본이득)만으로 발생합니다.`;
    } else {
      incomeNote = `배당 성향: ${tierLabel}. 3·6·9·11라운드 마감 때 보유한 수량을 기준으로 배당이 지급되며, 주가는 1주당 배당금의 50%만큼 배당락이 적용됩니다.`;
    }
  } else if (asset.type === 'bond' && asset.couponRate) {
    const coupon = Math.round(asset.faceValue * asset.couponRate);
    incomeNote = `게임 규칙: 라운드마다 액면가 ${formatWon(asset.faceValue)} 기준 단리 ${(asset.couponRate * 100).toFixed(1)}% 이자가 지급됩니다 (1주 보유 시 매 라운드 +${formatWon(coupon)}).`;
  } else if (asset.type !== 'stock' && asset.type !== 'bond') {
    incomeNote = '게임 규칙: 이 상품에는 배당·이자를 지급하지 않으며, 수익은 가격 변동만으로 결정됩니다. 실제 상품에는 분배금·보수·만기 등 추가 조건이 있을 수 있습니다.';
  }

  return (
    <section className="asset-learning-panel" aria-label={`${asset.name} 분석`}>
      <div className="panel-heading split">
        <div>
          {asset.type === 'stock' ? <Building2 size={20} aria-hidden="true" /> : <ChartNoAxesCombined size={20} aria-hidden="true" />}
          <h2>{asset.type === 'stock' ? '기업 분석' : '상품 분석'}</h2>
        </div>
        <span className="limit-pill">{assetTypeLabels[asset.type] ?? asset.type}</span>
      </div>

      <article className="asset-story">
        <div>
          <strong>{asset.name}</strong>
          <span>{asset.country} · {asset.sector}</span>
          {/* Week 3 H — 기업 정보에 배당 티어 노출 */}
          {asset.type === 'stock' && asset.dividendTier ? (
            <span
              className={`dividend-tier-badge tier-${asset.dividendTier}`}
              title="3·6·9·11라운드 마감 보유 수량 기준 배당 지급, 배당락 50%"
              style={{ marginTop: 4 }}
            >
              배당: {DIVIDEND_TIER_LABELS[asset.dividendTier]}
            </span>
          ) : null}
          {asset.type === 'bond' && asset.couponRate ? (
            <span
              className="dividend-tier-badge tier-stable"
              title="라운드마다 액면가 기준 단리 이자 지급"
              style={{ marginTop: 4 }}
            >
              쿠폰: 라운드당 {(asset.couponRate * 100).toFixed(1)}%
            </span>
          ) : null}
          {/* Week 4 §2.1 — 배당/이자 없는 자산(외환·ETF·선물·부동산ETF) 침묵 방지 */}
          {asset.type !== 'stock' && asset.type !== 'bond' ? (
            <span
              className="dividend-tier-badge tier-growth"
              title="이 자산은 배당·이자가 없습니다. 수익은 가격 변동(자본이득)만으로 발생합니다."
              style={{ marginTop: 4 }}
            >
              배당 없음 · 가격 변동만
            </span>
          ) : null}
        </div>
        <p>{profile.story}</p>
        {incomeNote ? (
          <p
            className="asset-income-note"
            style={{
              marginTop: 8,
              padding: '10px 12px',
              borderLeft: '4px solid #2563eb',
              background: '#eff6ff',
              color: '#1e3a8a',
              fontSize: 13,
              lineHeight: 1.55,
              borderRadius: 4,
              fontWeight: 500,
            }}
          >
            {incomeNote}
          </p>
        ) : null}
      </article>

      {productDetail ? (
        <div className="product-mechanics-grid" aria-label={`${asset.name} 상품 구조`}> 
          <article>
            <strong>무엇을 사는 상품인가</strong>
            <p>{productDetail.structure}</p>
          </article>
          <article>
            <strong>수익과 손실의 원천</strong>
            <p>{productDetail.returnSource}</p>
          </article>
          <article>
            <strong>가장 중요한 위험</strong>
            <p>{productDetail.keyRisk}</p>
          </article>
          <article>
            <strong>게임에서 단순화한 부분</strong>
            <p>{productDetail.simulationRule}</p>
          </article>
        </div>
      ) : null}

      <div className="metric-grid" aria-label={`${asset.name} 간단 재무표`}>
        {profile.metrics.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className="signal-grid" aria-label={`${asset.name} 재무 신호`}>
        {signalEntries.map(([label, value]) => {
          // 배당 성향은 위험 신호가 아니라 정보이므로 hot/cool 색 강조를 적용하지 않는다.
          const isDividend = label === '배당 성향' || label === '현금흐름';
          const tone = isDividend
            ? ''
            : (value === '높음' || value === '매우 높음' ? 'hot' : value === '낮음' ? 'cool' : '');
          return (
            <div className={`signal ${tone}`} key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          );
        })}
      </div>

      <div className="risk-tag-list" aria-label={`${asset.name} 위험 태그`}>
        {profile.riskTags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      <div className="sensitivity-list">
        <strong>변동 가능성이 커지는 이슈</strong>
        <div>
          {profile.sensitivity.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>

      <div className="precheck-list">
        <strong>투자 전 체크</strong>
        {checklist.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>

      <p className="student-prompt">{profile.prompt}</p>
    </section>
  );
}

function AppHeader({ setView, hostAuthenticated, studentEntryAllowed }) {
  return (
    <header className="topbar">
      <button
        className="brand"
        type="button"
        onClick={() => setView(studentEntryAllowed ? 'student' : hostAuthenticated ? 'host' : 'host-login')}
        aria-label={studentEntryAllowed ? '학생 입장 화면으로 이동' : '교사 화면으로 이동'}
      >
        <ChartNoAxesCombined size={26} aria-hidden="true" />
        <span>
          통장에 1억이 찍혔다.
          <small>한 해 동안의 자산 일기</small>
        </span>
      </button>

    </header>
  );
}

function AppToast({ toast, onDismiss }) {
  if (!toast) return null;
  const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? CircleAlert : BellRing;
  return (
    <div
      className={`app-toast ${toast.tone ?? 'info'}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
    >
      <Icon size={22} aria-hidden="true" />
      <div>
        <strong>{toast.title}</strong>
        {toast.message ? <span>{toast.message}</span> : null}
      </div>
      <button type="button" onClick={onDismiss} aria-label="알림 닫기">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

function AssetListControls({
  typeFilter,
  onTypeFilterChange,
  sortMode,
  onSortModeChange,
  themeFilter,
  onThemeFilterChange,
  visibleCount,
  compact = false,
}) {
  const typeLabel = getAssetFilterLabel(assetTypeFilterOptions, typeFilter);
  const themeLabel = getAssetFilterLabel(assetThemeOptions, themeFilter);
  const sortLabel = getAssetFilterLabel(assetSortOptions, sortMode);
  return (
    <div className={compact ? 'asset-list-controls compact' : 'asset-list-controls'} aria-label="상품 조회 설정">
      <label>
        종류
        <select value={typeFilter} onChange={(event) => onTypeFilterChange(event.target.value)} aria-label="상품 종류 선택">
          {assetTypeFilterOptions.map((option) => (
            <option value={option.key} key={option.key}>{option.label}</option>
          ))}
        </select>
      </label>
      <label>
        정렬
        <select value={sortMode} onChange={(event) => onSortModeChange(event.target.value)} aria-label="상품 정렬 선택">
          {assetSortOptions.map((option) => (
            <option value={option.key} key={option.key}>{option.label}</option>
          ))}
        </select>
      </label>
      <label>
        테마
        <select value={themeFilter} onChange={(event) => onThemeFilterChange(event.target.value)} aria-label="상품 테마 선택">
          {assetThemeOptions.map((option) => (
            <option value={option.key} key={option.key}>{option.label}</option>
          ))}
        </select>
      </label>
      <p>
        {visibleCount}개 상품 · {typeLabel} · {themeLabel} · {sortLabel}
      </p>
    </div>
  );
}

function HomeView({ setView, roomPin, round, totalRounds, gameStarted, playerCount, baseRate, exchangeRate, unemploymentRate, expiresAt, roomExpired, syncStatus, studentEntryAllowed, onCreateRoom, hostAuthenticated, studentJoined }) {
  return (
    <main className="home-view">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">{totalRounds}번의 월급날 · 시작 자본 1억 원 · 매 라운드 월급 {formatWon(ROUND_SALARY)}</p>
          <h1>통장에 1억이 찍혔다.</h1>
          <p className="hero-subtitle">화성에 갈까, 땅 밑 지하로 갈까?</p>
          <p className="intro">
            매 라운드 새 뉴스가 도착하고 금리·환율·물가가 움직입니다. 사고팔고 맡긴 선택이 차곡차곡 쌓여
            12개월 뒤 당신의 한 해를 결말짓습니다. 오늘의 결정이 이야기의 결말을 만듭니다.
          </p>
          <div className="hero-actions">
            {!studentJoined ? (
              <button className="command primary" type="button" onClick={() => setView(hostAuthenticated ? 'host' : 'host-login')}>
                <School size={20} aria-hidden="true" />
                교사용 대시보드
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ) : null}
            {studentEntryAllowed ? (
              <button className="command secondary" type="button" onClick={() => setView('student')}>
                <LogIn size={20} aria-hidden="true" />
                학생 입장 화면
              </button>
            ) : null}
            {hostAuthenticated ? (
              <button className="command secondary" type="button" onClick={onCreateRoom}>
                <Radio size={20} aria-hidden="true" />
                새 방 생성
              </button>
            ) : null}
          </div>
          <HeroMarketGraphic />
        </div>

        <aside className="projector-preview" aria-label="수업 현황 미리보기">
          <div className="pin-tile">
            <span>ROOM PIN</span>
            <strong>{roomPin}</strong>
          </div>
          <div className="preview-grid">
            <div>
              <Clock3 size={19} aria-hidden="true" />
              <strong>{gameStarted ? round : 0}/{totalRounds}</strong>
              <span>현재 라운드</span>
            </div>
            <div>
              <Users size={19} aria-hidden="true" />
              <strong>{playerCount}/{MAX_PLAYERS_PER_ROOM}</strong>
              <span>접속 인원</span>
            </div>
            <div>
              <Landmark size={19} aria-hidden="true" />
              <strong>{gameStarted ? `${baseRate.toFixed(1)}%` : '0.0%'}</strong>
              <span>기준금리</span>
            </div>
            <div>
              <Globe2 size={19} aria-hidden="true" />
              <strong>{gameStarted ? `${exchangeRate.toLocaleString('ko-KR')}원` : '0원'}</strong>
              <span>원/달러 환율</span>
            </div>
            <div>
              <Activity size={19} aria-hidden="true" />
              <strong>{gameStarted ? `${unemploymentRate.toFixed(1)}%` : '0.0%'}</strong>
              <span>실업률</span>
            </div>
          </div>
          <p className="sync-note">
            {syncStatus}
          </p>
          <JoinQrCard roomPin={roomPin} />
          <RoomExpiryNotice roomPin={roomPin} expiresAt={expiresAt} expired={roomExpired} canCreateRoom={hostAuthenticated} onCreateRoom={onCreateRoom} />
        </aside>
      </section>
    </main>
  );
}

const eventCategoryLabels = {
  all: '전체',
  macro: '경기/고용/물가',
  rate: '금리/환율',
  commodity: '원자재/식량',
  geopolitics: '전쟁/정치',
  bond: '채권/국가',
  tech: '기술/산업',
  property: '부동산/소비',
};

function getEventCategory(event) {
  if (['growth-boom', 'recession-risk', 'jobs-improve', 'unemployment-worse', 'inflation-cool', 'inflation-rebound', 'fx-stabilize', 'fx-volatility'].includes(event.id)) return 'macro';
  if (['rate-up', 'rate-down', 'deposit-special', 'fx-spike', 'us-yield-spike'].includes(event.id)) return 'rate';
  if (['rare', 'oil-supply-shock', 'oil-supply-relief', 'grain-shock', 'grain-relief'].includes(event.id)) return 'commodity';
  if (['war-risk', 'peace-progress', 'election-risk', 'policy-stability'].includes(event.id)) return 'geopolitics';
  if (['us-yield-cooldown', 'em-credit-stress', 'em-credit-relief', 'argentina-reform'].includes(event.id)) return 'bond';
  if (['us-rally', 'korea-export', 'green-subsidy', 'us-regulation', 'drug-breakthrough', 'drug-setback', 'korea-us-chip-tension'].includes(event.id)) return 'tech';
  if (['property-ease', 'property-tighten', 'housing'].includes(event.id)) return 'property';
  return 'all';
}

const eventPresetFilters = [
  { label: '거시경제 수업', category: 'macro' },
  { label: '고변동성', category: 'geopolitics' },
  { label: '채권/환율 수업', category: 'bond' },
  { label: '원자재 수업', category: 'commodity' },
];

const eventConflictGroups = [
  { label: '금리 방향 충돌', sides: [['rate-up'], ['rate-down']] },
  { label: '경기 방향 충돌', sides: [['growth-boom'], ['recession-risk']] },
  { label: '고용 방향 충돌', sides: [['jobs-improve'], ['unemployment-worse']] },
  { label: '물가 방향 충돌', sides: [['inflation-cool'], ['inflation-rebound']] },
  { label: '환율 안정성과 불안 충돌', sides: [['fx-stabilize'], ['fx-volatility', 'fx-spike']] },
  { label: '부동산 정책 방향 충돌', sides: [['property-ease'], ['property-tighten']] },
  { label: '부동산 완화와 금리 긴축 충돌', sides: [['property-ease'], ['rate-up']] },
  { label: '원유 공급 충격과 안정 충돌', sides: [['oil-supply-shock'], ['oil-supply-relief']] },
  { label: '곡물 공급 충격과 안정 충돌', sides: [['grain-shock'], ['grain-relief']] },
  { label: '미국 채권시장 불안과 안정 충돌', sides: [['us-yield-spike'], ['us-yield-cooldown']] },
  { label: '신흥국 채권 불안과 안정 충돌', sides: [['em-credit-stress', 'argentina-reform'], ['em-credit-relief']] },
  { label: '전쟁 위험과 긴장 완화 충돌', sides: [['war-risk'], ['peace-progress']] },
  { label: '정치 불확실성과 정책 안정 충돌', sides: [['election-risk'], ['policy-stability']] },
  { label: '바이오 기대와 차질 충돌', sides: [['drug-breakthrough'], ['drug-setback']] },
  { label: '위험자산 선호와 위험 회피 충돌', sides: [['us-rally', 'peace-progress', 'policy-stability'], ['war-risk', 'election-risk', 'us-regulation']] },
  { label: '수출 호재와 공급망 갈등 충돌', sides: [['korea-export'], ['korea-us-chip-tension']] },
];

function getEventTemplateKey(event) {
  return event.templateId ?? event.id?.split('-')?.[0] ?? event.id;
}

function getConflictWeight(event) {
  const impactValues = Object.values(event.impact ?? {}).map((value) => Math.abs(Number(value) || 0));
  const averageImpact = impactValues.length ? impactValues.reduce((sum, value) => sum + value, 0) / impactValues.length : 0.06;
  return Number(((event.probability ?? DEFAULT_EVENT_PROBABILITY) + averageImpact * 3).toFixed(3));
}

function getConflictOutcomeMap(events) {
  const outcome = {};
  eventConflictGroups.forEach((group) => {
    const sides = group.sides
      .map((eventIds) => events.filter((event) => eventIds.includes(getEventTemplateKey(event))))
      .filter((matched) => matched.length);
    if (sides.length < 2) return;

    const rankedSides = sides
      .map((matchedEvents, index) => ({
        index,
        matchedEvents,
        score: matchedEvents.reduce((sum, event) => sum + getConflictWeight(event), 0),
        eventCount: matchedEvents.length,
        strongestWeight: Math.max(...matchedEvents.map(getConflictWeight)),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.eventCount !== a.eventCount) return b.eventCount - a.eventCount;
        if (b.strongestWeight !== a.strongestWeight) return b.strongestWeight - a.strongestWeight;
        return Math.random() - 0.5;
      });

    const winningSide = rankedSides[0];
    const winnerTitle = winningSide.matchedEvents.map((event) => event.title).join(', ');

    rankedSides.slice(1).forEach((side) => {
      side.matchedEvents.forEach((event) => {
        outcome[event.id] = {
          blocked: true,
          label: group.label,
          winnerTitle,
        };
      });
    });
  });
  return outcome;
}

function pickRandomRoundIssues({ round, now, count = 3 }) {
  return [...scenarioEvents]
    .filter((event) => !event.triggerOnly)
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map((event, index) => {
      const issueOption = event.issueOptions[Math.floor(Math.random() * event.issueOptions.length)];
      return {
        ...buildRegisteredIssue({
          event,
          issueOption,
          issueDraft: '',
          round,
          now: now + index,
          defaultProbability: DEFAULT_EVENT_PROBABILITY,
        }),
        published: true,
      };
    });
}

function HostSetupView({
  roomReady,
  roomPin,
  hostId,
  totalRounds,
  roomMode,
  volatilityMode,
  economicSeed,
  players,
  expiresAt,
  roomExpired,
  syncStatus,
  onCreateRoom,
  onGameStart,
  onRoomModeChange,
  onTotalRoundsChange,
  onVolatilityModeChange,
}) {
  if (!roomReady) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <p className="eyebrow">교사용 방 관리</p>
          <h1>{hostId} 계정의 새 수업을 준비합니다.</h1>
          <p className="help-text">현재 유지 중인 방이 없습니다. 새 방을 만들면 이 계정 전용 PIN과 시장 데이터가 생성됩니다.</p>
          <button className="command primary wide" type="button" onClick={onCreateRoom}>
            <Radio size={19} aria-hidden="true" />
            새 수업 방 만들기
          </button>
          <p className="sync-note">{syncStatus}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="host-layout setup-mode">
      <section className="host-main">
        <div className="section-title">
          <div>
            <p className="eyebrow">교사용 방 세팅</p>
            <h1>수업 시작 전 설정</h1>
          </div>
          <div className="status-pill">
            <Radio size={17} aria-hidden="true" />
            대기 중
          </div>
        </div>

        <section className="room-setup-panel" aria-label="방 설정">
          <div className="setup-header">
            <div>
              <span>교사 계정</span>
              <strong>{hostId || 'geography'}</strong>
            </div>
            <div>
              <span>ROOM PIN</span>
              <strong>{roomPin}</strong>
            </div>
          </div>

          <div className="setup-options-grid">
            <article>
              <div>
                <strong>라운드 버전</strong>
                <span>수업 시간에 맞춰 1년형 또는 3년형으로 진행합니다.</span>
              </div>
              <div className="segmented-control">
                {ROUND_OPTIONS.map((option) => (
                  <button
                    className={totalRounds === option ? 'active' : ''}
                    type="button"
                    key={option}
                    onClick={() => onTotalRoundsChange(option)}
                    disabled={roomExpired}
                  >
                    {option === 4 ? '4라운드 1년형' : '12라운드 3년형'}
                  </button>
                ))}
              </div>
            </article>

            <article>
              <div>
                <strong>투자 방식</strong>
                <span>개인별 판단 또는 모둠 공동 계좌로 수업을 운영합니다.</span>
              </div>
              <div className="segmented-control">
                <button className={roomMode === 'individual' ? 'active' : ''} type="button" onClick={() => onRoomModeChange('individual')} disabled={roomExpired}>
                  개인 투자
                </button>
                <button className={roomMode === 'team' ? 'active' : ''} type="button" onClick={() => onRoomModeChange('team')} disabled={roomExpired}>
                  모둠 투자
                </button>
              </div>
            </article>

            <article>
              <div>
                <strong>시장 변동성</strong>
                <span>이슈가 없을 때 발생하는 패시브 노이즈 폭을 조절합니다. 변동성 학습 모드는 약 1.6배 더 출렁입니다.</span>
              </div>
              <div className="segmented-control">
                <button className={volatilityMode === 'standard' ? 'active' : ''} type="button" onClick={() => onVolatilityModeChange('standard')} disabled={roomExpired}>
                  표준 (±5%)
                </button>
                <button className={volatilityMode === 'volatility' ? 'active' : ''} type="button" onClick={() => onVolatilityModeChange('volatility')} disabled={roomExpired}>
                  변동성 학습 (±8%)
                </button>
              </div>
            </article>
            {economicSeed ? (
              <article className="economic-seed-card">
                <div>
                  <strong>이 방의 경제 체질 시드 <code>#{economicSeed.code}</code></strong>
                  <span>방을 만들 때마다 자동으로 정해지는 4가지 난수입니다. 코드 뒤 1자리는 인플레이션 민감도(시드 D)입니다. 같은 이슈도 방마다 조금씩 다르게 작동합니다.</span>
                </div>
                <div className="seed-grid">
                  <div>
                    <span>초기 기준금리</span>
                    <strong>{economicSeed.economicConstitution.baseRate.toFixed(2)}%</strong>
                  </div>
                  <div>
                    <span>초기 실업률</span>
                    <strong>{economicSeed.economicConstitution.unemploymentRate.toFixed(2)}%</strong>
                  </div>
                  <div>
                    <span>초기 환율</span>
                    <strong>{economicSeed.economicConstitution.exchangeRate}원</strong>
                  </div>
                  <div>
                    <span>이슈 강도</span>
                    <strong>×{economicSeed.issueIntensity.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>트리거 민감도</span>
                    <strong>×{economicSeed.triggerSensitivity.toFixed(2)}</strong>
                  </div>
                  {/* Week 4 §2.2 — 시드 D · 인플레이션 민감도 */}
                  <div title="이 방의 물가는 같은 충격(수요견인·이슈·거시)에 ×N배 더 민감하게 반응합니다.">
                    <span>인플레이션 민감도</span>
                    <strong>×{(economicSeed.inflationSensitivity ?? 1.0).toFixed(2)}</strong>
                  </div>
                </div>
              </article>
            ) : null}
          </div>

          <div className="prestart-stats" aria-label="게임 시작 전 수치">
            <div>
              <span>현재 라운드</span>
              <strong>0/{totalRounds}</strong>
            </div>
            <div>
              <span>초기 자본</span>
              <strong>{formatWon(0)}</strong>
            </div>
            <div>
              <span>기준금리</span>
              <strong>0.0%</strong>
            </div>
            <div>
              <span>참여 학생</span>
              <strong>{players.length}/{MAX_PLAYERS_PER_ROOM}</strong>
            </div>
          </div>

          <div className="setup-actions">
            <button className="command primary" type="button" onClick={onGameStart} disabled={roomExpired}>
              <Play size={19} aria-hidden="true" />
              게임 시작
            </button>
            <button className="command secondary" type="button" onClick={onCreateRoom}>
              <Radio size={19} aria-hidden="true" />
              새 방 생성
            </button>
          </div>
        </section>

        <section className="student-monitor">
          <div className="panel-heading split">
            <div>
              <Users size={22} aria-hidden="true" />
              <h2>접속 학생 현황</h2>
            </div>
            <span className="limit-pill">{players.length}/{MAX_PLAYERS_PER_ROOM}</span>
          </div>
          <div className="setup-student-list">
            {players.length ? (
              players.map((player) => (
                <article key={player.id}>
                  <strong>{getStudentDisplayName(player.studentNumber, player.name)}</strong>
                  <span>
                    {roomMode === 'team' && player.teamKey ? `${teamTemplates.find((team) => team.key === player.teamKey)?.name ?? player.teamKey}` : '개인 계좌 대기'}
                    {' · '}
                    {getPlayerConnectionLabel(player)}
                  </span>
                </article>
              ))
            ) : (
              <p>아직 접속한 학생이 없습니다.</p>
            )}
          </div>
        </section>
      </section>

      <aside className="host-sidebar">
        <JoinQrCard roomPin={roomPin} />
        <RoomExpiryNotice roomPin={roomPin} expiresAt={expiresAt} expired={roomExpired} canCreateRoom onCreateRoom={onCreateRoom} />
        <section className="news-panel">
          <div className="panel-heading">
            <BellRing size={22} aria-hidden="true" />
            <h2>연결 상태</h2>
          </div>
          <p className="sync-note">{syncStatus}</p>
        </section>
      </aside>
    </main>
  );
}

function HostView({
  roomReady,
  roomPin,
  hostId,
  round,
  totalRounds,
  phase,
  roomMode,
  volatilityMode,
  economicSeed,
  gameStarted,
  isPaused,
  assets,
  teamAccounts,
  players,
  rankingPlayers,
  newsFeed,
  baseRate,
  propertyIndex,
  exchangeRate,
  unemploymentRate,
  priceIndex,
  activeStudent,
  expiresAt,
  roomExpired,
  issueDraft,
  currentRoundEvents,
  triggeredEventsByRound,
  activeMacroAlerts,
  macroTimeline,
  macroAlertsByRound,
  pendingMacroAlerts,
  initialSeedSensitivity,
  latestRoundSummary,
  submissions,
  syncStatus,
  gameFinished,
  finalRoundClosed,
  finalReportsDownloaded,
  submittedCount,
  participantCount,
  allSubmissionsComplete,
  canEndGame,
  resetDialogOpen,
  resetPassword,
  resetError,
  onCreateRoom,
  onGameStart,
  onRoomModeChange,
  onTotalRoundsChange,
  onVolatilityModeChange,
  onIssueDraftChange,
  onStartRound,
  onCloseRound,
  onNextRound,
  onTogglePause,
  onEndGame,
  onRequestReset,
  onCancelReset,
  onConfirmReset,
  onResetPasswordChange,
  onRegisterIssue,
  onCancelIssue,
  onClearIssues,
  startIssueChoiceOpen,
  onStartWithoutIssues,
  onStartWithRandomIssues,
  onCloseStartIssueChoice,
  onCloseSubmissions,
  onDownloadSubmissions,
  salaryPaidRounds,
  tradeLogs,
}) {
  const eventLimitReached = currentRoundEvents.length >= MAX_EVENTS_PER_ROUND;
  const canRegisterIssue = gameStarted && phase === 'setup' && !eventLimitReached && !roomExpired;

  // Week 4 §4.9 — 디버그 모드 + 회귀 자동 점검 (호스트 전용)
  const debugMode = useDebugMode();
  const [devRecheckTick, setDevRecheckTick] = useState(0);
  const devChecks = useMemo(() => {
    if (!debugMode) return [];
    return runRegressionChecks({
      round,
      phase,
      gameStarted,
      salaryPaidRounds,
      tradeLogs,
      portfolio: null,
      teamAccounts,
      roomMode,
      assets,
      macroTimeline,
      pendingMacroAlerts,
      activeMacroAlerts,
      macroAlertsByRound,
      economicSeed,
      initialSeedSensitivity,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugMode, devRecheckTick, round, phase, gameStarted, salaryPaidRounds, tradeLogs, macroTimeline, activeMacroAlerts, macroAlertsByRound, economicSeed, initialSeedSensitivity]);
  function handleDevRecheck() { setDevRecheckTick((v) => v + 1); }
  // Week 4 §3.6 — 교사 대시보드에서도 자산 행을 클릭해 기업·자산 분석을 펼쳐 보도록 추가
  const [hostExpandedAssetId, setHostExpandedAssetId] = useState(null);
  const [hostAssetTypeFilter, setHostAssetTypeFilter] = useState('all');
  const [hostAssetSortMode, setHostAssetSortMode] = useState('default');
  const [hostAssetThemeFilter, setHostAssetThemeFilter] = useState('all');
  const [eventCategory, setEventCategory] = useState('all');
  const visibleHostAssets = useMemo(
    () => getVisibleAssets(assets, {
      typeFilter: hostAssetTypeFilter,
      sortMode: hostAssetSortMode,
      themeFilter: hostAssetThemeFilter,
    }),
    [assets, hostAssetSortMode, hostAssetThemeFilter, hostAssetTypeFilter],
  );
  const filteredScenarioEvents = eventCategory === 'all'
    ? scenarioEvents
    : scenarioEvents.filter((event) => getEventCategory(event) === eventCategory);

  if (!gameStarted) {
    return (
      <HostSetupView
        roomReady={roomReady}
        roomPin={roomPin}
        hostId={hostId}
        totalRounds={totalRounds}
        roomMode={roomMode}
        volatilityMode={volatilityMode}
        economicSeed={economicSeed}
        players={players}
        expiresAt={expiresAt}
        roomExpired={roomExpired}
        syncStatus={syncStatus}
        onCreateRoom={onCreateRoom}
        onGameStart={onGameStart}
        onRoomModeChange={onRoomModeChange}
        onTotalRoundsChange={onTotalRoundsChange}
        onVolatilityModeChange={onVolatilityModeChange}
      />
    );
  }

  return (
    <main className="host-layout">
      <section className="host-main">
        <div className="section-title">
          <div>
            <p className="eyebrow">교사용 PC 대시보드</p>
            <h1>방 {roomPin}</h1>
          </div>
          <div className="status-pill">
            <Radio size={17} aria-hidden="true" />
            {isPaused ? '일시 정지' : phaseLabels[phase]}
          </div>
        </div>

        <RoomExpiryNotice roomPin={roomPin} expiresAt={expiresAt} expired={roomExpired} canCreateRoom={phase === 'ended' || roomExpired} onCreateRoom={onCreateRoom} />
        <JoinQrCard roomPin={roomPin} />

        <div className="control-strip">
          <div className="round-meter">
            <span>Round</span>
            <strong>{round}</strong>
            <small>/ {totalRounds} 분기</small>
          </div>
          {phase === 'ended' ? (
            <button className="command primary" type="button" onClick={onCreateRoom}>
              <Radio size={19} aria-hidden="true" />
              새 게임 시작
            </button>
          ) : null}
          <button className="command primary" type="button" onClick={onGameStart} disabled={roomExpired || gameStarted || phase !== 'setup'}>
            <Play size={19} aria-hidden="true" />
            게임 시작
          </button>
          <button className="command primary" type="button" onClick={onStartRound} disabled={roomExpired || !gameStarted || phase !== 'setup'}>
            <Play size={19} aria-hidden="true" />
            라운드 시작
          </button>
          <button className="command secondary" type="button" onClick={onStartWithRandomIssues} disabled={roomExpired || !gameStarted || phase !== 'setup'}>
            <Shuffle size={19} aria-hidden="true" />
            랜덤 이슈 3개로 장 시작
          </button>
          <button className="command primary" type="button" onClick={onCloseRound} disabled={roomExpired || phase !== 'open'}>
            <Activity size={19} aria-hidden="true" />
            장 마감
          </button>
          <button className="command secondary" type="button" onClick={onNextRound} disabled={roomExpired || phase !== 'closed' || round >= totalRounds}>
            <ChevronRight size={19} aria-hidden="true" />
            다음 라운드 준비
          </button>
          <button className="command secondary" type="button" onClick={onTogglePause}>
            {isPaused ? <Play size={19} aria-hidden="true" /> : <Pause size={19} aria-hidden="true" />}
            {isPaused ? '재개' : '일시 정지'}
          </button>
          <button className="command danger" type="button" onClick={onEndGame} disabled={!canEndGame}>
            게임 종료
          </button>
          <button className="command danger" type="button" onClick={onRequestReset}>
            <RotateCcw size={19} aria-hidden="true" />
            초기화
          </button>
        </div>

        <EndGameFlowPanel
          finalRoundClosed={finalRoundClosed}
          submittedCount={submittedCount}
          participantCount={participantCount}
          allSubmissionsComplete={allSubmissionsComplete}
          finalReportsDownloaded={finalReportsDownloaded}
          phase={phase}
        />

        {resetDialogOpen ? (
          <ResetRoomModal
            value={resetPassword}
            error={resetError}
            onChange={onResetPasswordChange}
            onCancel={onCancelReset}
            onConfirm={onConfirmReset}
          />
        ) : null}

        <section className="mode-panel" aria-label="수업 방식 설정">
          <div>
            <strong>수업 방식</strong>
            <span>{phase === 'setup' && !gameStarted ? '게임 시작 전에 변경하는 것을 권장합니다.' : '게임 시작 후에는 수업 중 혼선을 줄이기 위해 유지하세요.'}</span>
          </div>
          <div className="segmented-control">
            <button className={roomMode === 'individual' ? 'active' : ''} type="button" onClick={() => onRoomModeChange('individual')} disabled={phase !== 'setup' || gameStarted}>
              개인 투자
            </button>
            <button className={roomMode === 'team' ? 'active' : ''} type="button" onClick={() => onRoomModeChange('team')} disabled={phase !== 'setup' || gameStarted}>
              모둠 투자
            </button>
          </div>
        </section>

        {startIssueChoiceOpen ? (
          <section className="choice-modal-backdrop" aria-label="이슈 없이 라운드 시작 선택">
            <div className="choice-modal">
              <div>
                <p className="eyebrow">이슈 미선택</p>
                <h2>이슈 선택을 안하시겠습니까?</h2>
                <p>이슈 없이 진행하면 이번 라운드는 생활 소득과 기본 시장 변동만 반영됩니다. 랜덤 이슈를 선택하면 3개 이슈가 자동으로 공개됩니다.</p>
              </div>
              <div className="choice-actions">
                <button className="command secondary" type="button" onClick={onStartWithoutIssues}>
                  이슈 없이 장 시작
                </button>
                <button className="command primary" type="button" onClick={onStartWithRandomIssues}>
                  랜덤 이슈 3개로 장 시작
                </button>
                <button className="command secondary" type="button" onClick={onCloseStartIssueChoice}>
                  돌아가기
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="macro-panel" aria-label="거시 지표">
          <div>
            <Landmark size={20} aria-hidden="true" />
            <span>기준금리</span>
            <strong>{baseRate.toFixed(1)}%</strong>
          </div>
          {/* Week 4 §2.2 — 물가지수 카드 (기준금리 다음 위치) */}
          <div title="게임 시작 시점을 1.000으로 한 누적 인플레이션. 분기당 2% + α 누적, 우상향.">
            <TrendingUp size={20} aria-hidden="true" />
            <span>물가지수</span>
            <strong>{priceIndex.toFixed(3)} <em style={{ fontStyle: 'normal', fontSize: '0.85em', color: '#92400e' }}>(+{((priceIndex - 1) * 100).toFixed(1)}%)</em></strong>
          </div>
          <div>
            <PiggyBank size={20} aria-hidden="true" />
            <span>예금금리</span>
            <strong>{getDepositRate(baseRate).toFixed(1)}%</strong>
          </div>
          <div>
            <Building2 size={20} aria-hidden="true" />
            <span>부동산지수</span>
            <strong>{formatWon(propertyIndex)}</strong>
          </div>
          <div>
            <Globe2 size={20} aria-hidden="true" />
            <span>원/달러 환율</span>
            <strong>{exchangeRate.toLocaleString('ko-KR')}원</strong>
          </div>
          <div>
            <Activity size={20} aria-hidden="true" />
            <span>실업률</span>
            <strong>{unemploymentRate.toFixed(1)}%</strong>
          </div>
        </section>

        <section className="event-panel" aria-labelledby="event-heading">
          <div className="panel-heading split">
            <div>
              <Megaphone size={22} aria-hidden="true" />
              <h2 id="event-heading">라운드 이슈 등록</h2>
            </div>
            <span className={eventLimitReached ? 'limit-pill full' : 'limit-pill'}>
              {currentRoundEvents.length}/{MAX_EVENTS_PER_ROUND}
            </span>
          </div>
          <label className="issue-input">
            교사용 이슈 입력
            <input
              value={issueDraft}
              onChange={(event) => onIssueDraftChange(event.target.value)}
              placeholder="예: 미국 빅테크 실적 발표, 부동산 규제 완화 소문"
              aria-label="교사용 이슈 입력"
              disabled={phase !== 'setup' || roomExpired}
            />
          </label>
          {currentRoundEvents.length >= 3 && !eventLimitReached ? (
            <p className="teacher-hint">이벤트가 많아질수록 원인 분석이 복합적으로 변합니다. 해설 화면에서 상쇄 효과를 함께 다루면 좋습니다.</p>
          ) : null}
          {eventLimitReached ? <p className="teacher-hint warning">이번 라운드 이벤트 한도에 도달했습니다. 다음 라운드에서 다시 선택할 수 있습니다.</p> : null}
          {phase !== 'setup' ? <p className="teacher-hint">장이 진행 중이거나 마감된 뒤에는 새 이슈를 등록할 수 없습니다.</p> : null}
          {!gameStarted ? <p className="teacher-hint warning">게임 시작 전에는 이슈를 등록하지 않습니다. 먼저 학생 입장을 확인한 뒤 게임을 시작하세요.</p> : null}
          {currentRoundEvents.length ? (
            <div className="draft-issue-list" aria-label="선택된 이슈">
              <div className="panel-heading split">
                <div>
                  <Megaphone size={18} aria-hidden="true" />
                  <h3>선택된 이슈</h3>
                </div>
                <button className="command secondary" type="button" onClick={onClearIssues} disabled={phase !== 'setup'}>
                  전체 초기화
                </button>
              </div>
              {currentRoundEvents.map((event) => (
                <article key={event.id}>
                  <div>
                    <strong>{event.title}</strong>
                    <span>{event.detail}</span>
                  </div>
                  <button type="button" onClick={() => onCancelIssue(event.id)} disabled={phase !== 'setup'}>
                    취소
                  </button>
                </article>
              ))}
            </div>
          ) : null}
          <div className="event-filter-bar" aria-label="이슈 카테고리 선택">
            {Object.entries(eventCategoryLabels).map(([key, label]) => (
              <button className={eventCategory === key ? 'active' : ''} type="button" key={key} onClick={() => setEventCategory(key)}>
                {label}
              </button>
            ))}
          </div>
          <div className="event-preset-bar" aria-label="추천 이슈 묶음">
            {eventPresetFilters.map((preset) => (
              <button type="button" key={preset.label} onClick={() => setEventCategory(preset.category)}>
                {preset.label}
              </button>
            ))}
          </div>
          <div className="event-grid">
            {filteredScenarioEvents.map((event) => (
              <article className="event-button" key={event.id}>
                <strong>{event.title}</strong>
                <span>{event.detail}</span>
                <small>{event.principle}</small>
                <div className="issue-options">
                  {event.issueOptions.map((issue) => (
                    <button type="button" key={issue.title} onClick={() => onRegisterIssue(event, issue)} disabled={!canRegisterIssue}>
                      {issue.title}
                    </button>
                  ))}
                  <button type="button" onClick={() => onRegisterIssue(event)} disabled={!canRegisterIssue || !issueDraft.trim()}>
                    직접 입력 등록
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Week 4 §2.4 — 거시 경보(트리거)는 이슈와 분리된 별도 배너로 노출 */}
        <MacroAlertBanner alerts={activeMacroAlerts} />
        <MacroTriggerPanel alertsByRound={macroAlertsByRound} activeAlerts={activeMacroAlerts} />
        <IssueTicker events={currentRoundEvents} phase={phase} />
        {/* Week 3 H — 교사 대시보드: 라운드별 이슈 분석 탭 */}
        <TeacherRoundIssuesPanel
          triggeredEventsByRound={triggeredEventsByRound}
          totalRounds={totalRounds}
          currentRound={round}
        />
        {/* Week 4 §2.2 Phase B — 호스트에도 체크포인트 카드 (학생 평균 기준) */}
        {phase === 'closed' && LEARNING_CHECKPOINT_ROUNDS.includes(round) && players?.length > 0 ? (
          (() => {
            const avgTotalAsset = players.reduce((sum, p) => sum + (p.totalAsset ?? INITIAL_CASH), 0) / players.length;
            const investedPerHead = getInvestedPrincipal({ gameStarted: true, round, phase: 'closed', memberCount: 1 });
            return (
              <InflationCheckpointCard
                round={round}
                totalAsset={avgTotalAsset}
                investedPrincipal={investedPerHead}
                priceIndex={priceIndex}
                aggregateReturn={latestRoundSummary?.aggregateReturn}
              />
            );
          })()
        ) : null}
        <RoundExplanation summary={latestRoundSummary} assets={assets} />
        <CloseDashboard phase={phase} players={rankingPlayers} />
        <TeacherStudentMonitor
          players={players}
          activeStudent={roomMode === 'team' ? buildStudentSnapshot({ id: 'team-mode', name: '모둠 계좌 (대기)', totalAsset: 0, holdings: [] }) : activeStudent}
          assets={assets}
        />
        <TeacherTeamPanel
          roomMode={roomMode}
          teamAccounts={teamAccounts}
          assets={assets}
          players={players}
          gameStarted={gameStarted}
          round={round}
          phase={phase}
        />
        <TeacherSubmissionPanel
          players={players}
          submissions={submissions}
          gameFinished={gameFinished}
          allSubmissionsComplete={allSubmissionsComplete}
          finalReportsDownloaded={finalReportsDownloaded}
          onCloseSubmissions={onCloseSubmissions}
          onDownloadSubmissions={onDownloadSubmissions}
        />

        {/* Week 4 §4.8 — 거시 시계열 라이트 차트 (호스트 전용) */}
        {macroTimeline && macroTimeline.length > 0 ? (
          <MacroTimelineSparklines timeline={macroTimeline} title="거시 시계열" />
        ) : null}

        {/* Week 4 §4.9 — 회귀 자동 점검 DEV 패널 (?debug=1 시에만 노출) */}
        {debugMode ? (
          <DevPanel checks={devChecks} onRecheck={handleDevRecheck} round={round} />
        ) : null}

        <section className="market-board" aria-labelledby="market-heading">
          <div className="panel-heading">
            <Activity size={22} aria-hidden="true" />
            <h2 id="market-heading">전체 자산 시황판</h2>
          </div>
          <AssetListControls
            typeFilter={hostAssetTypeFilter}
            onTypeFilterChange={setHostAssetTypeFilter}
            sortMode={hostAssetSortMode}
            onSortModeChange={setHostAssetSortMode}
            themeFilter={hostAssetThemeFilter}
            onThemeFilterChange={setHostAssetThemeFilter}
            visibleCount={visibleHostAssets.length}
          />
          <div className="stock-table">
            {visibleHostAssets.map((asset) => {
              const change = getChange(asset);
              const expanded = hostExpandedAssetId === asset.id;
              return (
                <div key={asset.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  <article
                    className="stock-row"
                    onClick={() => setHostExpandedAssetId(expanded ? null : asset.id)}
                    style={{
                      cursor: 'pointer',
                      borderBottom: expanded ? '1px solid #2563eb' : undefined,
                    }}
                    aria-expanded={expanded}
                    aria-controls={`host-asset-detail-${asset.id}`}
                  >
                    <div className="stock-name">
                      <span style={{ background: asset.color }} />
                      <div>
                        <strong>{asset.name}</strong>
                        <small>{asset.country} · {assetTypeLabels[asset.type]} · {asset.sector} · {getPrimaryThemeLabel(asset)}</small>
                      </div>
                    </div>
                    <Sparkline history={asset.history} color={asset.color} />
                    <div className="stock-price">
                      <strong>{formatAssetPrice(asset)}</strong>
                      <small className={change >= 0 ? 'up' : 'down'}>{formatPercent(change)}</small>
                    </div>
                  </article>
                  {expanded ? (
                    <div
                      id={`host-asset-detail-${asset.id}`}
                      style={{
                        padding: '12px',
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderTop: 'none',
                        borderRadius: '0 0 8px 8px',
                        marginBottom: 8,
                      }}
                    >
                      <AssetLearningPanel asset={asset} />
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!visibleHostAssets.length ? <p className="empty-note">조건에 맞는 투자 상품이 없습니다.</p> : null}
          </div>
          <p style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
            자산 행을 클릭하면 기업·자산 분석(배당 성향·재무 신호·변동 가능성)을 펼쳐 볼 수 있습니다.
          </p>
        </section>
      </section>

      <aside className="host-sidebar">
        <TeacherRankingPanel players={rankingPlayers} submissions={submissions} activeStudent={activeStudent} gameFinished={gameFinished} />

        <section className="news-panel">
          <div className="panel-heading">
            <BellRing size={22} aria-hidden="true" />
            <h2>송출된 속보</h2>
          </div>
          <div className="news-list">
            {newsFeed.map((news) => (
              <article key={news.id}>
                <span>R{news.round}</span>
                <strong>{news.title}</strong>
                <p>{news.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}

// Week 4 §3.5 사전 작업 — 라운드별 메모 히스토리 (정보보드 탭에서 라운드 무관 항상 열람)
function RoundNoteHistory({ round, phase, gameFinished, gameStarted, roundNotes, roundNoteDrafts, roundNoteSaveStates, onRoundNoteDraftChange, onRoundNoteSave }) {
  if (!gameStarted) return null;
  const canEditCurrent = phase === 'closed' && !gameFinished;
  const rounds = [];
  for (let r = 1; r <= round; r += 1) rounds.push(r);
  if (rounds.length === 0) return null;
  return (
    <section className="round-note-history" aria-label="라운드별 한 줄 메모">
      <header className="round-note-history-head">
        <strong>라운드 메모</strong>
        <span>장 마감 후 작성 · 라운드 상관없이 다시 보기</span>
      </header>
      <ol className="round-note-list">
        {rounds.slice().reverse().map((r) => {
          const note = roundNotes?.[r] ?? '';
          const hasDraft = Object.prototype.hasOwnProperty.call(roundNoteDrafts ?? {}, r);
          const draft = hasDraft ? roundNoteDrafts[r] : note;
          const saveState = roundNoteSaveStates?.[r] ?? null;
          const isCurrent = r === round;
          const isEditableNow = isCurrent && canEditCurrent;
          return (
            <li key={r} className={isCurrent ? 'note-item current' : 'note-item past'}>
              <div className="note-item-head">
                <strong>R{r}</strong>
                {isEditableNow ? (
                  <span className="round-note-meter">{getByteLength(draft)}/100바이트</span>
                ) : null}
              </div>
              {isEditableNow ? (
                <>
                  <textarea
                    className="round-note-input"
                    value={draft}
                    onChange={(event) => onRoundNoteDraftChange(r, event.target.value)}
                    placeholder="이번 라운드 결정 이유, 학습 포인트 (한글 약 33자)"
                    rows={2}
                    aria-label={`${r}라운드 메모 입력`}
                  />
                  <div className="round-note-save-row">
                    <span className={`round-note-save-status ${saveState?.status ?? ''}`}>
                      {saveState?.message ?? (hasDraft ? '저장 전' : note ? '저장됨' : '메모를 입력해주세요')}
                    </span>
                    <button
                      className="command primary"
                      type="button"
                      onClick={() => onRoundNoteSave(r)}
                      disabled={saveState?.status === 'saving' || (!hasDraft && draft === note)}
                    >
                      {saveState?.status === 'saving' ? '저장 중' : '메모 저장'}
                    </button>
                  </div>
                </>
              ) : note ? (
                <p className="note-body">{note}</p>
              ) : (
                <p className="note-body empty">{isCurrent ? '장 마감 후 입력 가능' : '메모 없음'}</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StudentView({
  roomPin,
  round,
  phase,
  roomMode,
  assets,
  newsFeed,
  portfolio,
  cash,
  deposit,
  depositInterestEarned,
  investedPrincipal,
  baseRate,
  propertyIndex,
  exchangeRate,
  unemploymentRate,
  priceIndex,
  demandPullCumulative,
  tradeLogs,
  roundLogs,
  reflection,
  playerCount,
  roomFull,
  currentRoundEvents,
  activeMacroAlerts,
  macroAlertsByRound,
  roundResults,
  latestRoundSummary,
  gameFinished,
  gameStarted,
  submittedReport,
  nickname,
  setNickname,
  studentNumber,
  setStudentNumber,
  studentPasscode,
  setStudentPasscode,
  studentJoinError,
  joined,
  onJoin,
  teamAccounts,
  selectedTeamKey,
  setSelectedTeamKey,
  activeTeam,
  teamTradeAllowed,
  onClaimTeamTrade,
  onReleaseTeamTrade,
  selectedAssetId,
  setSelectedAssetId,
  tradeAmount,
  setTradeAmount,
  depositAmount,
  setDepositAmount,
  onBuy,
  onSell,
  tradePending,
  onDeposit,
  onWithdrawDeposit,
  onSubmitReport,
  onReflectionChange,
  roundNotes,
  roundNoteDrafts,
  roundNoteSaveStates,
  onRoundNoteDraftChange,
  onRoundNoteSave,
  roundReflections,
  onRoundReflectionChange,
  macroTimeline,
}) {
  // Week 4 §3.5 사전 작업 — 정보보드/거래보드 탭 분리 (localStorage에 마지막 선택 탭 저장)
  const [activeTab, setActiveTab] = useState(() => {
    try {
      if (typeof window === 'undefined') return 'info';
      const saved = window.localStorage.getItem('studentDashboardTab');
      return saved === 'trade' ? 'trade' : 'info';
    } catch {
      return 'info';
    }
  });
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('studentDashboardTab', activeTab);
      }
    } catch {
      /* localStorage 비활성 환경 무시 */
    }
  }, [activeTab]);

  const [studentAssetTypeFilter, setStudentAssetTypeFilter] = useState('all');
  const [studentAssetSortMode, setStudentAssetSortMode] = useState('default');
  const [studentAssetThemeFilter, setStudentAssetThemeFilter] = useState('all');
  const visibleStudentAssets = useMemo(
    () => getVisibleAssets(assets, {
      typeFilter: studentAssetTypeFilter,
      sortMode: studentAssetSortMode,
      themeFilter: studentAssetThemeFilter,
    }),
    [assets, studentAssetSortMode, studentAssetThemeFilter, studentAssetTypeFilter],
  );
  function syncSelectedAssetToVisibleList(nextFilters = {}) {
    const nextVisibleAssets = getVisibleAssets(assets, {
      typeFilter: nextFilters.typeFilter ?? studentAssetTypeFilter,
      sortMode: nextFilters.sortMode ?? studentAssetSortMode,
      themeFilter: nextFilters.themeFilter ?? studentAssetThemeFilter,
    });
    if (nextVisibleAssets.length && !nextVisibleAssets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(nextVisibleAssets[0].id);
    }
  }
  function handleStudentAssetTypeFilterChange(value) {
    setStudentAssetTypeFilter(value);
    syncSelectedAssetToVisibleList({ typeFilter: value });
  }
  function handleStudentAssetSortModeChange(value) {
    setStudentAssetSortMode(value);
    syncSelectedAssetToVisibleList({ sortMode: value });
  }
  function handleStudentAssetThemeFilterChange(value) {
    setStudentAssetThemeFilter(value);
    syncSelectedAssetToVisibleList({ themeFilter: value });
  }

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  const holdingsValue = assets.reduce((sum, asset) => sum + (portfolio[asset.id] ?? 0) * asset.price, 0);
  const totalAsset = cash + deposit + holdingsValue;
  const returnRate = gameStarted ? getInvestmentReturnRate(totalAsset, investedPrincipal) : 0;
  const selectedShares = portfolio[selectedAsset.id] ?? 0;
  const selectedHoldingValue = selectedShares * selectedAsset.price;
  const depositRate = getDepositRate(baseRate);
  const nextInterest = deposit * (depositRate / 100 / 4);
  const canTradeStocks = gameStarted && phase === 'open' && !gameFinished;
  const canMoveDeposit = gameStarted && !gameFinished;
  const teamMode = roomMode === 'team';
  const teamTradeLockedByOther = teamMode && activeTeam?.tradeHolder && !teamTradeAllowed;
  const canUseAccount = !teamMode || (teamTradeAllowed && !activeTeam?.bankrupt);
  const tradeDisabledReason = activeTeam?.bankrupt ? '모둠 파산' : teamTradeLockedByOther ? `${activeTeam.tradeHolder} 거래 중` : '거래권 필요';

  if (!joined) {
    return (
      <main className="join-screen">
        <section className="phone-frame join-card">
          <div className="mobile-notch" />
          <p className="eyebrow">학생 입장</p>
          <h1>PIN, 학번, 이름을 입력하세요.</h1>
          <label>
            방 PIN
            <input value={roomPin} readOnly aria-label="방 PIN" />
          </label>
          <div className={roomFull ? 'capacity-note full' : 'capacity-note'}>
            <strong>{playerCount}/{MAX_PLAYERS_PER_ROOM}</strong>
            <span>{roomFull ? '정원이 찼습니다.' : '현재 접속 인원'}</span>
          </div>
          <label>
            학급 번호
            <input value={studentNumber} onChange={(event) => setStudentNumber(event.target.value.replace(/[^\d]/g, '').slice(0, 2))} inputMode="numeric" placeholder="1~40" aria-label="학급 번호" />
          </label>
          <label>
            이름
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="예: 김지민" aria-label="이름" />
          </label>
          <label>
            개인 비밀번호
            <input
              type="password"
              value={studentPasscode}
              onChange={(event) => setStudentPasscode(event.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="숫자 6자리"
              aria-label="개인 비밀번호"
            />
          </label>
          {teamMode ? (
            <div className="team-picker" aria-label="모둠 선택">
              <span>모둠 선택</span>
              <div>
                {teamAccounts.map((team) => (
                  <button
                    className={selectedTeamKey === team.key ? 'active' : ''}
                    type="button"
                    key={team.key}
                    onClick={() => setSelectedTeamKey(team.key)}
                    disabled={team.bankrupt}
                  >
                    {team.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {studentJoinError ? <p className="auth-error">{studentJoinError}</p> : null}
          <button className="command primary wide" type="button" onClick={onJoin} disabled={!nickname.trim() || !studentNumber || !/^[0-9]{6}$/.test(studentPasscode) || roomFull}>
            <LogIn size={19} aria-hidden="true" />
            {roomFull ? '정원 마감' : '입장하기'}
          </button>
          <p className="help-text">같은 학번은 먼저 등록한 이름과 개인 비밀번호가 맞을 때만 재입장할 수 있습니다. 다른 기기에서 접속 중이면 잠시 후 다시 시도하세요.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="student-shell">
      <section className="phone-frame trading-app">
        <div className="mobile-notch" />
        <header className="mobile-header">
          <div>
            <span>Round {round} · {phaseLabels[phase]}</span>
            <strong>{getStudentDisplayName(studentNumber, nickname)}</strong>
          </div>
          <div className="pin-badge">{roomPin}</div>
        </header>

        <section className="breaking-news" aria-label="실시간 속보">
          <BellRing size={18} aria-hidden="true" />
          <div>
            <strong>{newsFeed[0]?.title ?? '대기 중'}</strong>
            <span>{newsFeed[0]?.detail ?? '교사의 첫 뉴스가 오면 여기에 표시됩니다.'}</span>
          </div>
        </section>
        {!gameStarted ? (
          <section className="waiting-panel" aria-label="게임 시작 대기">
            <strong>게임 시작 대기 중</strong>
            <p>교사가 게임 시작을 누르면 초기 자본 {formatWon(INITIAL_CASH)}이 지급되고, 라운드마다 생활 소득 {formatWon(ROUND_SALARY)}을 받습니다.</p>
          </section>
        ) : null}

        {teamMode ? (
          <section className={activeTeam?.bankrupt ? 'team-trade-panel bankrupt' : 'team-trade-panel'} aria-label="모둠 거래권">
            <div>
              <span>공유 계좌</span>
              <strong>{activeTeam?.name ?? '모둠'} · {activeTeam?.bankrupt ? '파산' : teamTradeAllowed ? '거래 가능' : '거래 대기'}</strong>
              <p>
                {activeTeam?.bankrupt
                  ? '2라운드 연속 잔고 문제가 발생해 거래가 중단되었습니다.'
                  : activeTeam?.tradeHolder
                    ? `${activeTeam.tradeHolder} 학생이 거래권을 가지고 있습니다.`
                    : '거래권을 잡은 학생만 한 번 거래할 수 있습니다.'}
              </p>
            </div>
            <div className="team-trade-actions">
              <button className="command primary" type="button" onClick={onClaimTeamTrade} disabled={!gameStarted || gameFinished || activeTeam?.bankrupt || teamTradeAllowed || Boolean(activeTeam?.tradeHolder)}>
                거래권 잡기
              </button>
              <button className="command secondary" type="button" onClick={onReleaseTeamTrade} disabled={!teamTradeAllowed}>
                반납
              </button>
            </div>
          </section>
        ) : null}

        {/* Week 4 §3.5 사전 작업 — 정보보드/거래보드 탭 네비게이션 */}
        {!gameFinished ? (
          <nav className="student-tabbar" role="tablist" aria-label="학생 대시보드 탭">
            <button
              role="tab"
              type="button"
              aria-selected={activeTab === 'info'}
              className={activeTab === 'info' ? 'student-tab active' : 'student-tab'}
              onClick={() => setActiveTab('info')}
            >
              정보보드
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={activeTab === 'trade'}
              className={activeTab === 'trade' ? 'student-tab active' : 'student-tab'}
              onClick={() => setActiveTab('trade')}
            >
              거래보드
            </button>
          </nav>
        ) : null}

        {gameFinished ? (
          <FinalReport
            nickname={getStudentDisplayName(studentNumber, nickname)}
            mode={roomMode}
            teamName={teamMode ? activeTeam?.name : ''}
            cash={cash}
            deposit={deposit}
            depositInterestEarned={depositInterestEarned}
            investedPrincipal={investedPrincipal}
            portfolio={portfolio}
            assets={assets}
            tradeLogs={tradeLogs}
            roundLogs={roundLogs}
            roundResults={roundResults}
            reflection={reflection}
            submission={submittedReport}
            onSubmitReport={onSubmitReport}
            onReflectionChange={onReflectionChange}
            roundNotes={roundNotes}
            roundReflections={roundReflections}
            priceIndex={priceIndex}
            demandPullCumulative={demandPullCumulative}
          />
        ) : null}

        {!gameFinished && activeTab === 'info' ? (
          <>
        {/* Week 4 §2.4 — 거시 경보 배너 */}
        <MacroAlertBanner alerts={activeMacroAlerts} compact />
        <MacroTriggerPanel alertsByRound={macroAlertsByRound} activeAlerts={activeMacroAlerts} compact />
        <IssueTicker events={currentRoundEvents} phase={phase} compact />
        {/* Week 4 §2.2 Phase B — 인플레이션 체크포인트 카드 (R4·R8·R12 종료 시) */}
        {phase === 'closed' && LEARNING_CHECKPOINT_ROUNDS.includes(round) ? (
          <InflationCheckpointCard
            round={round}
            totalAsset={totalAsset}
            investedPrincipal={getInvestedPrincipal({ gameStarted, round, phase: 'closed', memberCount: 1 })}
            priceIndex={priceIndex}
            aggregateReturn={latestRoundSummary?.aggregateReturn}
            compact
            roundReflection={roundReflections?.[round]}
            onRoundReflectionChange={onRoundReflectionChange}
            macroTimeline={macroTimeline}
          />
        ) : null}
        {phase === 'closed' ? <RoundExplanation summary={latestRoundSummary} assets={assets} compact /> : null}
        {/* Week 4 §3.5 사전 작업 — 라운드별 메모 (라운드 무관 항상 열람) */}
        {joined ? (
          <RoundNoteHistory
            round={round}
            phase={phase}
            gameFinished={gameFinished}
            gameStarted={gameStarted}
            roundNotes={roundNotes}
            roundNoteDrafts={roundNoteDrafts}
            roundNoteSaveStates={roundNoteSaveStates}
            onRoundNoteDraftChange={onRoundNoteDraftChange}
            onRoundNoteSave={onRoundNoteSave}
          />
        ) : null}
        <MacroGuide baseRate={baseRate} depositRate={depositRate} propertyIndex={propertyIndex} exchangeRate={exchangeRate} unemploymentRate={unemploymentRate} priceIndex={priceIndex} />

                <section className="deposit-ticket" aria-labelledby="deposit-heading">
          <div>
            <h2 id="deposit-heading">보통예금 (자유입출금)</h2>
            <span>분기 복리 적용 · 다음 라운드 예상 이자 {formatWon(nextInterest)}</span>
          </div>
          <label>
            예금 금액
            <input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} inputMode="numeric" aria-label="예금 금액" />
          </label>
          <div className="quick-actions">
            <button type="button" onClick={() => setDepositAmount(String(Math.floor(cash / 2)))} disabled={!canMoveDeposit}>
              현금 1/2
            </button>
            <button type="button" onClick={() => setDepositAmount(String(cash))} disabled={!canMoveDeposit}>
              현금 전액
            </button>
            <button type="button" onClick={() => setDepositAmount(String(Math.floor(deposit / 2)))} disabled={!canMoveDeposit}>
              예금 1/2
            </button>
            <button type="button" onClick={() => setDepositAmount(String(deposit))} disabled={!canMoveDeposit}>
              예금 전액
            </button>
          </div>
          <div className="trade-actions compact">
            <button className="save" type="button" onClick={onDeposit} disabled={!canMoveDeposit || !canUseAccount}>
              {teamMode && !canUseAccount ? tradeDisabledReason : '예금하기'}
            </button>
            <button className="withdraw" type="button" onClick={onWithdrawDeposit} disabled={!canMoveDeposit || !canUseAccount}>
              {teamMode && !canUseAccount ? tradeDisabledReason : '해지하기'}
            </button>
          </div>
        </section>

                <details className="savings-learning-card collapsible-card" aria-labelledby="savings-learning-heading">
          <summary className="savings-learning-summary">
            <span className="card-toggle-icon" aria-hidden="true">▶</span>
            <span className="card-toggle-label">정기예금 vs 정기적금 — 같은 돈, 다른 이자</span>
            <span className="card-toggle-hint">눌러서 비교 보기</span>
          </summary>
          <header className="savings-learning-header">
            <h2 id="savings-learning-heading" className="sr-only">정기예금 vs 정기적금 비교</h2>
            <p>같은 총 납입금이라도 한 번에 맡기는 정기예금이 더 많은 이자를 받습니다. 직접 비교해 보세요.</p>
          </header>
          {(() => {
            try {
              const totalAmount = 6_000_000;
              const rounds = 6;
              const safeRate = Number.isFinite(baseRate) ? baseRate : 3.0;
              const sim = simulateSavingsComparison(totalAmount, rounds, getDepositRate(safeRate) + 0.6);
              const tdInterest = Number.isFinite(sim.timeDepositInterest) ? sim.timeDepositInterest : 0;
              const raInterest = Number.isFinite(sim.recurringInterest) ? sim.recurringInterest : 0;
              const maxInterest = Math.max(tdInterest, raInterest, 1);
              const tdBarWidth = (tdInterest / maxInterest) * 100;
              const raBarWidth = (raInterest / maxInterest) * 100;
            return (
              <div className="savings-compare-grid">
                <div className="compare-row">
                  <div className="compare-label">정기예금 (목돈 일시예치)</div>
                  <div className="compare-bar-track">
                    <div className="compare-bar td-bar" style={{ width: tdBarWidth + '%' }} />
                  </div>
                  <div className="compare-value">+ {formatWon(sim.timeDepositInterest)}</div>
                </div>
                <div className="compare-row">
                  <div className="compare-label">정기적금 (월 적립식)</div>
                  <div className="compare-bar-track">
                    <div className="compare-bar ra-bar" style={{ width: raBarWidth + '%' }} />
                  </div>
                  <div className="compare-value">+ {formatWon(sim.recurringInterest)}</div>
                </div>
                <p className="compare-explain">
                  <strong>왜 차이가 날까요?</strong> 정기적금은 매 라운드 나눠 납입하므로, 마지막 회차에 넣은 돈은 이자를 거의 받지 못합니다.
                  반면 정기예금은 처음부터 모든 돈이 이자를 받아요. 같은 {formatWon(totalAmount)}, {rounds}라운드 기준으로
                  <strong> {formatWon(sim.diff)} </strong>만큼 정기예금이 더 받습니다.
                </p>
                <p className="compare-explain compare-extra">
                  <strong>그럼 왜 적금을 들까요?</strong> 한 번에 큰 돈이 없을 때 매달 조금씩 저축 습관을 들이는 도구입니다.
                  "이자 최대화"가 아니라 "저축 훈련"이 적금의 본래 목적이에요.
                </p>
              </div>
            );
            } catch {
              return (
                <p style={{ padding: '12px', color: '#64748b', fontSize: '13px' }}>
                  비교 학습 정보를 불러올 수 없습니다.
                </p>
              );
            }
          })()}
        </details>

                <details className="passive-move-notice collapsible-card" aria-label="시장 불확실성 안내">
          <summary className="noise-summary">
            <span className="noise-icon" aria-hidden="true">?</span>
            <span className="noise-label">이슈가 없는데 왜 가격이 움직일까?</span>
            <span className="card-toggle-hint">눌러서 설명 보기</span>
          </summary>
          <div className="noise-body">
            <p>
              <strong>실제 시장도 뉴스가 없어도 가격은 항상 조금씩 움직입니다.</strong>
              수많은 투자자가 각자의 판단으로 매수·매도를 하기 때문이죠. 이 작은 움직임을
              <em> 시장의 불확실성</em>이라고 부릅니다.
            </p>
            <p>
              자산마다 흔들리는 폭은 다릅니다.
              <strong> 우량주와 채권처럼 거래량이 많거나 안전한 자산</strong>은 비교적 덜 흔들리고,
              <strong> 중소형주처럼 거래량이 적은 자산</strong>은 더 크게 출렁입니다.
              외환·원자재도 시장 상황에 따라 항상 조금씩 변합니다.
            </p>
            <p className="noise-tip">
              <strong>학습 포인트</strong> 단기 변동에 흔들리지 말고
              <em> 이슈와 함께 움직이는 큰 흐름</em>을 보세요.
              불확실성은 사라지지 않습니다. 다만 분산투자로 충격을 줄일 수 있습니다.
            </p>
          </div>
        </details>

        
          </>
        ) : null}

        {!gameFinished && activeTab === 'trade' ? (
          <>
        <section className="asset-panel">
          <div>
            <span>총 보유 자산</span>
            <strong>{formatWon(totalAsset)}</strong>
          </div>
          <em className={returnRate >= 0 ? 'up' : 'down'}>{formatPercent(returnRate)}</em>
        </section>

                <div className="wallet-grid">
          <div>
            <Wallet size={18} aria-hidden="true" />
            <span>현금</span>
            <strong>{formatWon(cash)}</strong>
          </div>
          <div>
            <BadgePercent size={18} aria-hidden="true" />
            <span>투자 평가금</span>
            <strong>{formatWon(holdingsValue)}</strong>
          </div>
          <div>
            <PiggyBank size={18} aria-hidden="true" />
            <span>예금</span>
            <strong>{formatWon(deposit)}</strong>
          </div>
          <div>
            <Landmark size={18} aria-hidden="true" />
            <span>예금금리</span>
            <strong>{depositRate.toFixed(1)}%</strong>
          </div>
        </div>

                <HoldingsDashboard
          portfolio={portfolio}
          assets={assets}
          onSelectAsset={setSelectedAssetId}
          onSetTradeAmount={setTradeAmount}
        />

                <PortfolioDonut cash={cash} deposit={deposit} portfolio={portfolio} assets={assets} />

                <section className="mobile-stock-list" aria-label="투자 상품 목록">
          <AssetListControls
            typeFilter={studentAssetTypeFilter}
            onTypeFilterChange={handleStudentAssetTypeFilterChange}
            sortMode={studentAssetSortMode}
            onSortModeChange={handleStudentAssetSortModeChange}
            themeFilter={studentAssetThemeFilter}
            onThemeFilterChange={handleStudentAssetThemeFilterChange}
            visibleCount={visibleStudentAssets.length}
            compact
          />
          {visibleStudentAssets.map((asset) => {
            const change = getChange(asset);
            return (
              <button className={selectedAssetId === asset.id ? 'selected' : ''} type="button" key={asset.id} onClick={() => setSelectedAssetId(asset.id)}>
                <span style={{ background: asset.color }} />
                <strong>{asset.name}</strong>
                <small>{asset.country} · {getPrimaryThemeLabel(asset)}</small>
                <small>{formatAssetPrice(asset)}</small>
                <em className={change >= 0 ? 'up' : 'down'}>{formatPercent(change)}</em>
              </button>
            );
          })}
          {!visibleStudentAssets.length ? <p className="empty-note">조건에 맞는 투자 상품이 없습니다.</p> : null}
        </section>

                <AssetLearningPanel asset={selectedAsset} />

                <section className="trade-ticket" aria-labelledby="trade-heading">
          <div className="ticket-head">
            <div>
              <h2 id="trade-heading">{selectedAsset.name}</h2>
              <span>{selectedAsset.country} · {assetTypeLabels[selectedAsset.type]} · {selectedAsset.sector} · 보유 {selectedShares.toLocaleString('ko-KR')}주</span>
              {selectedAsset.type === 'bond' && selectedAsset.couponRate ? (
                <span className="bond-coupon-note">
                  라운드당 단리 이자 {(selectedAsset.couponRate * 100).toFixed(1)}% · 액면가 {formatWon(selectedAsset.faceValue)} 기준
                  (1주 보유 시 매 라운드 +{formatWon(Math.round(selectedAsset.faceValue * selectedAsset.couponRate))})
                </span>
              ) : null}
              {selectedAsset.type === 'stock' && selectedAsset.dividendTier ? (
                <span className={`dividend-tier-badge tier-${selectedAsset.dividendTier}`} title="3·6·9·11라운드 마감 보유 수량 기준 배당 지급, 배당락 50%">
                  배당: {DIVIDEND_TIER_LABELS[selectedAsset.dividendTier]}
                </span>
              ) : null}
              {/* Week 4 §2.1 — 배당/이자 없는 자산 침묵 방지 */}
              {selectedAsset.type !== 'stock' && selectedAsset.type !== 'bond' ? (
                <span
                  className="dividend-tier-badge tier-growth"
                  title="이 자산은 배당·이자가 없습니다. 수익은 가격 변동(자본이득)만으로 발생합니다."
                >
                  배당 없음 · 가격 변동만
                </span>
              ) : null}
            </div>
            <Sparkline history={selectedAsset.history} color={selectedAsset.color} />
          </div>

          {/* Week 4 §2.3 — 거래 티켓 헤더 직하단에 이 종목의 배당/이자/없음 안내를 큰 박스로 항상 노출
              퍼센트 수치는 학생에게 노출하지 않고 성향만 표시 */}
          {(() => {
            let line = null;
            if (selectedAsset.type === 'stock' && selectedAsset.dividendTier) {
              const tierLabel = { growth: '성장주', stable: '안정주', highYield: '고배당주' }[selectedAsset.dividendTier];
              if (selectedAsset.dividendTier === 'growth') {
                line = `이 종목은 ${tierLabel} — 3·6·9·11라운드에도 배당이 없습니다. 수익은 가격 변동(자본이득)만으로 발생.`;
              } else {
                line = `이 종목은 ${tierLabel} — 3·6·9·11라운드 마감 때 보유한 수량으로 배당이 지급되며, 주가는 1주당 배당금의 50%만큼 내려갑니다.`;
              }
            } else if (selectedAsset.type === 'bond' && selectedAsset.couponRate) {
              const coupon = Math.round(selectedAsset.faceValue * selectedAsset.couponRate);
              line = `이 종목은 채권 — 매 라운드 액면가 ${formatWon(selectedAsset.faceValue)} 기준 단리 ${(selectedAsset.couponRate * 100).toFixed(1)}% 이자가 자동 입금 (1주당 +${formatWon(coupon)}/라운드).`;
            } else if (selectedAsset.type !== 'stock' && selectedAsset.type !== 'bond') {
              line = '이 종목은 배당·이자 없음 — 수익은 오로지 가격 변동(자본이득)만으로 결정됩니다.';
            }
            if (!line) return null;
            return (
              <div
                role="note"
                style={{
                  margin: '8px 0 4px',
                  padding: '10px 12px',
                  borderLeft: '4px solid #2563eb',
                  background: '#eff6ff',
                  color: '#1e3a8a',
                  fontSize: 13,
                  lineHeight: 1.55,
                  borderRadius: 4,
                  fontWeight: 500,
                }}
              >
                {line}
              </div>
            );
          })()}

          {/* Week 2 E — 다음 배당 라운드 안내 배너 */}
          {(() => {
            const nextDividendRound = DIVIDEND_ROUNDS.find((r) => r >= round);
            if (!nextDividendRound || gameFinished) return null;
            const isToday = nextDividendRound === round;
            const distance = nextDividendRound - round;
            return (
              <div className={`dividend-banner${isToday ? ' is-today' : ''}`} role="note">
                <span className="dividend-banner-icon" aria-hidden="true">{isToday ? '!' : '＄'}</span>
                <span className="dividend-banner-text">
                  {isToday ? (
                    <>
                      <strong>이번 라운드가 배당 지급일</strong>입니다. 장 마감 때 보유한 수량으로 배당이 입금되며, 1주당 배당금의 50%만큼 배당락도 함께 적용됩니다.
                    </>
                  ) : (
                    <>
                      다음 배당까지 <strong>{distance}라운드</strong> 남았습니다. {nextDividendRound}라운드 마감 때 보유한 주식이 배당 대상입니다.
                    </>
                  )}
                </span>
              </div>
            );
          })()}

          <label>
            주문 금액
            <input
              value={tradeAmount}
              onChange={(event) => setTradeAmount(event.target.value)}
              inputMode="numeric"
              aria-label="주문 금액"
            />
          </label>

          <div className="quick-actions">
            <button type="button" onClick={() => setTradeAmount(String(Math.floor(cash / 2)))}>
              현금 1/2
            </button>
            <button type="button" onClick={() => setTradeAmount(String(cash))}>
              현금 전액
            </button>
            <button type="button" onClick={() => setTradeAmount(String(Math.floor(selectedHoldingValue / 2)))}>
              보유 1/2
            </button>
            <button type="button" onClick={() => setTradeAmount(String(selectedHoldingValue))}>
              보유 전량
            </button>
          </div>

          <div className="trade-actions">
            <button className="buy" type="button" onClick={onBuy} disabled={!canTradeStocks || selectedAsset.delisted || !canUseAccount || tradePending}>
              {tradePending ? '처리 중' : gameFinished ? '종료' : phase !== 'open' ? '장 시작 대기' : selectedAsset.delisted ? '거래중단' : teamMode && !canUseAccount ? tradeDisabledReason : '매수'}
            </button>
            <button className="sell" type="button" onClick={onSell} disabled={!canTradeStocks || selectedAsset.delisted || !canUseAccount || tradePending}>
              {tradePending ? '처리 중' : phase !== 'open' && !gameFinished ? '장 시작 대기' : teamMode && !canUseAccount ? tradeDisabledReason : '매도'}
            </button>
          </div>
        </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

export function App() {
  const [initialAssetBundle] = useState(createInitialAssetBundle);
  const [triggerCooldowns, setTriggerCooldowns] = useState({});
  // Week 4 §2.4 — 트리거 채널을 이슈와 분리. pendingMacroAlerts(다음 라운드 대기) / activeMacroAlerts(이번 라운드 활성)
  const [pendingMacroAlerts, setPendingMacroAlerts] = useState([]);
  const [activeMacroAlerts, setActiveMacroAlerts] = useState([]);
  const [macroAlertsByRound, setMacroAlertsByRound] = useState({});
  const [view, setView] = useState(getInitialView);
  const [studentEntryAllowed] = useState(getInitialStudentEntryAllowed);
  const [hostAuthenticated, setHostAuthenticated] = useState(false);
  const [hostId, setHostId] = useState('');
  const [hostLogin, setHostLogin] = useState({ id: '', password: '' });
  const [hostLoginError, setHostLoginError] = useState('');
  const [roomPin, setRoomPin] = useState(getInitialRoomPin);
  const [roomReady, setRoomReady] = useState(false);
  const [roomCreatedAt, setRoomCreatedAt] = useState(() => Date.now());
  const [roomExpired, setRoomExpired] = useState(false);
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(DEFAULT_TOTAL_ROUNDS);
  const [phase, setPhase] = useState('setup');
  const [roomMode, setRoomMode] = useState('individual');
  // Week 1 M — 패시브 노이즈 모드: 'standard'(±5%) | 'volatility'(±8%)
  const [volatilityMode, setVolatilityMode] = useState('standard');
  // Week 2 K — 방 생성 시 부여되는 3가지 난수 시드 (게임마다 약간씩 다른 경제 조건)
  const [economicSeed, setEconomicSeed] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [baseRate, setBaseRate] = useState(INITIAL_BASE_RATE);
  const [propertyIndex, setPropertyIndex] = useState(initialAssetBundle.propertyIndex);
  const [exchangeRate, setExchangeRate] = useState(INITIAL_EXCHANGE_RATE);
  const [unemploymentRate, setUnemploymentRate] = useState(INITIAL_UNEMPLOYMENT_RATE);
  // Week 4 §2.2 — 물가지수 시스템 (분기당 2% 기본 + 수요견인/이슈/거시 α × 시드 D)
  const [priceIndex, setPriceIndex] = useState(INITIAL_PRICE_INDEX);
  // Week 4 §4.8 — 거시 시계열 차트용 라운드별 스냅샷
  const [macroTimeline, setMacroTimeline] = useState([]);
  // Week 4 §4.9 — 시드 D 일관성 검사용 초기값 보관
  const [initialSeedSensitivity, setInitialSeedSensitivity] = useState(null);
  const [previousAggregateReturn, setPreviousAggregateReturn] = useState(0);
  // Week 4 §2.2 Phase C — 누적 수요견인 인플레이션 (최종 보고서 KPI용)
  //   라운드별 demandPullInflation을 누적해 "전체 인플레이션 중 학생들 수익 때문에 발생한 비중" 계산.
  const [demandPullCumulative, setDemandPullCumulative] = useState(0);
  const [assets, setAssets] = useState(initialAssetBundle.assets);
  const [openMacroContext, setOpenMacroContext] = useState(null);
  const [triggeredEventsByRound, setTriggeredEventsByRound] = useState({});
  const [roundResults, setRoundResults] = useState([]);
  const [latestRoundSummary, setLatestRoundSummary] = useState(null);
  const [issueDraft, setIssueDraft] = useState('');
  const [startIssueChoiceOpen, setStartIssueChoiceOpen] = useState(false);
  const [newsFeed, setNewsFeed] = useState([
    { id: 'opening', round: 1, title: '수업 대기', detail: '교사가 게임 시작을 누르면 초기 자본 1억 원이 지급됩니다.' },
  ]);
  const [players, setPlayers] = useState([]);
  const [nickname, setNickname] = useState('지민');
  const [studentNumber, setStudentNumber] = useState('1');
  const [studentPasscode, setStudentPasscode] = useState('');
  const [studentJoinError, setStudentJoinError] = useState('');
  const [studentPasscodeHash, setStudentPasscodeHash] = useState('');
  const [studentSessionToken, setStudentSessionToken] = useState('');
  const [joined, setJoined] = useState(false);
  const [cash, setCash] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [depositPrincipal, setDepositPrincipal] = useState(0);
  const [depositInterestEarned, setDepositInterestEarned] = useState(0);
  const [initialCapitalGranted, setInitialCapitalGranted] = useState(false);
  const [portfolio, setPortfolio] = useState({});
  const [lastDividendRound, setLastDividendRound] = useState(0);
  const [teamAccounts, setTeamAccounts] = useState(createDefaultTeamAccounts);
  const [selectedTeamKey, setSelectedTeamKey] = useState(teamTemplates[0].key);
  const [selectedAssetId, setSelectedAssetId] = useState(initialTradableAssets[0].id);
  const [tradeAmount, setTradeAmount] = useState('10000000');
  const [depositAmount, setDepositAmount] = useState('10000000');
  const [tradeLogs, setTradeLogs] = useState([]);
  const [roundLogs, setRoundLogs] = useState([]);
  const [salaryPaidRounds, setSalaryPaidRounds] = useState([]);
  const [reflection, setReflection] = useState({ good: '', improve: '', next: '' });
  // Week 3 G — 라운드별 한 줄 메모 (UTF-8 100바이트 제한, 한글 약 33자)
  const [roundNotes, setRoundNotes] = useState({});
  const [roundNoteDrafts, setRoundNoteDrafts] = useState({});
  const [roundNoteSaveStates, setRoundNoteSaveStates] = useState({});
  // Week 4 §3.6 — 체크포인트 라운드별 학습 질문 응답 ({ 4:{selected,open}, 8:{...}, 12:{...} })
  const [roundReflections, setRoundReflections] = useState({});
  const [submissions, setSubmissions] = useState([]);
  const [studentStates, setStudentStates] = useState([]);
  const [finalReportsDownloaded, setFinalReportsDownloaded] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [remoteRoomId, setRemoteRoomId] = useState(null);
  const [syncStatus, setSyncStatus] = useState(supabaseConfigured ? '실시간 수업 연결 준비 중' : '로컬 연습 모드');
  const [toast, setToast] = useState(null);
  const [tradePending, setTradePending] = useState(false);
  const remoteRefreshTimer = useRef(null);
  const studentStateSaveTimer = useRef(null);
  const toastTimerRef = useRef(null);
  const shownToastIdsRef = useRef(new Set());
  const remotePhaseRef = useRef({ initialized: false, roomId: '', round: 1, phase: 'setup' });
  const tradeLockRef = useRef(false);
  const tradeUnlockTimerRef = useRef(null);

  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  const showToast = useCallback(({ id = '', title, message = '', tone = 'info', duration = 3600 }) => {
    if (id && shownToastIdsRef.current.has(id)) return;
    if (id) shownToastIdsRef.current.add(id);
    window.clearTimeout(toastTimerRef.current);
    setToast({ id: id || `${Date.now()}-${title}`, title, message, tone });
    toastTimerRef.current = window.setTimeout(() => setToast(null), duration);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(toastTimerRef.current);
    window.clearTimeout(tradeUnlockTimerRef.current);
  }, []);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? assets[0],
    [selectedAssetId, assets],
  );
  const currentRoundEvents = triggeredEventsByRound[round] ?? [];
  const publicCurrentRoundEvents = currentRoundEvents.filter((event) => event.published);
  const expiresAt = roomCreatedAt + ROOM_TTL_MS;
  const gameFinished = phase === 'ended' || (round === totalRounds && phase === 'closed');
  const teamMode = roomMode === 'team';
  const activeTeam = cleanTeamTradeLock(teamAccounts.find((team) => team.key === selectedTeamKey) ?? teamAccounts[0]);
  const studentNameLabel = getStudentDisplayName(studentNumber, nickname.trim());
  const teamTradeAllowed = teamMode ? isTeamTradeLockActive(activeTeam, studentNameLabel) : true;
  const teamParticipantRows = teamMode ? getTeamParticipantRows(teamAccounts, assets, players, gameStarted, round, phase) : [];
  const displayedPlayers = teamMode ? teamParticipantRows : players;
  const { playerCount, roomFull } = getRoomCapacityState({
    basePlayerCount: joined ? players.filter((player) => String(player.studentNumber) !== String(studentNumber)).length : players.length,
    joined,
    maxPlayers: MAX_PLAYERS_PER_ROOM,
  });
  const effectiveCash = gameStarted ? (teamMode ? activeTeam.cash : cash) : 0;
  const effectiveDeposit = gameStarted ? (teamMode ? activeTeam.deposit : deposit) : 0;
  const effectiveDepositInterestEarned = teamMode ? activeTeam.depositInterestEarned : depositInterestEarned;
  const effectivePortfolio = gameStarted ? (teamMode ? activeTeam.portfolio : portfolio) : EMPTY_PORTFOLIO;
  const studentDisplayName = teamMode && joined ? `${activeTeam.name} · ${studentNameLabel}` : studentNameLabel;
  const reportNickname = studentNameLabel;
  const studentHoldingsValue = getPortfolioValue(effectivePortfolio, assets);
  const studentTotalAsset = effectiveCash + effectiveDeposit + studentHoldingsValue;
  const activeTeamMemberCount = teamMode ? players.filter((player) => player.teamKey === selectedTeamKey).length : 1;
  // 개인 모드는 학생 단말이 직접 추적하는 salaryPaidRounds로 원금을 계산해
  //   급여가 실제로 cash에 들어온 시점과 원금이 늘어나는 시점을 정확히 일치시킨다.
  // 팀 모드는 교사 측이 라운드 시작 핸들러에서 팀 cash와 phase를 동시에 업데이트하므로 기존 추정값을 사용.
  const investedPrincipal = getInvestedPrincipal({
    gameStarted,
    round,
    phase,
    memberCount: activeTeamMemberCount,
    salaryPaidRounds: teamMode ? null : salaryPaidRounds,
  });
  const submittedReport = submissions.find((submission) => submission.nickname === reportNickname);
  const activeStudent = buildStudentSnapshot({
    id: teamMode ? activeTeam.key : 'active-student',
    name: joined ? studentDisplayName : `${nickname || '학생'} (대기)`,
    totalAsset: studentTotalAsset,
    holdings: getHoldingRows(effectivePortfolio, assets).map(({ asset, shares }) => `${asset.name} ${shares.toLocaleString('ko-KR')}주`),
    returnRate: getInvestmentReturnRate(studentTotalAsset, investedPrincipal),
    cashLikeAsset: effectiveCash + effectiveDeposit,
    investmentAsset: studentHoldingsValue,
    investedPrincipal,
  });
  const submittedCount = players.length
    ? players.filter((player) => submissions.some((submission) => submissionMatchesPlayer(submission, player))).length
    : submissions.length;
  const participantCount = players.length || submissions.length;
  const finalRoundClosed = round === totalRounds && phase === 'closed';
  const allSubmissionsComplete = participantCount > 0 && submittedCount === participantCount;
  const canEndGame = finalRoundClosed && allSubmissionsComplete && finalReportsDownloaded;

  const applyRemoteRoomBundle = useCallback((bundle) => {
    if (!bundle?.room) return;
    const remoteRound = bundle.room.current_round;
    const groupedEvents = groupEventsByRound(bundle.events);
    const remoteCurrentEvents = groupedEvents[remoteRound] ?? [];
    const resolvedCurrentEvents = remoteCurrentEvents.filter((event) => event.resolved);
    const createdAt = new Date(bundle.room.created_at).getTime();
    const isExpired = new Date(bundle.room.expires_at).getTime() <= Date.now() || bundle.room.phase === 'expired';
    const nextPhase = isExpired ? 'expired' : bundle.room.phase;
    const previousRemoteState = remotePhaseRef.current;
    if (previousRemoteState.initialized && previousRemoteState.roomId === bundle.room.id) {
      const transitionId = `${bundle.room.id}:${remoteRound}:${nextPhase}`;
      if (nextPhase === 'open' && (previousRemoteState.phase !== 'open' || previousRemoteState.round !== remoteRound)) {
        showToast({
          id: transitionId,
          title: `${remoteRound}라운드가 시작되었습니다.`,
          message: '공개된 이슈를 확인하고 투자 판단을 시작하세요.',
          tone: 'info',
        });
      }
      if (nextPhase === 'closed' && previousRemoteState.phase === 'open') {
        const finalRound = Number(bundle.room.total_rounds ?? DEFAULT_TOTAL_ROUNDS) === Number(remoteRound);
        showToast({
          id: transitionId,
          title: `${remoteRound}라운드가 종료되었습니다.`,
          message: finalRound ? '최종 자기평가를 작성해주세요.' : '라운드 메모를 작성해주세요.',
          tone: 'success',
          duration: 5000,
        });
      }
    }
    remotePhaseRef.current = { initialized: true, roomId: bundle.room.id, round: remoteRound, phase: nextPhase };

    setRemoteRoomId(bundle.room.id);
    setRoomReady(true);
    setRoomPin(bundle.room.pin);
    setHostId((current) => current || bundle.room.host_id || '');
    setRoomCreatedAt(createdAt);
    setRoomExpired(isExpired);
    setRound(remoteRound);
    setTotalRounds(Number(bundle.room.total_rounds ?? DEFAULT_TOTAL_ROUNDS));
    setPhase(nextPhase);
    setRoomMode(bundle.room.mode ?? 'individual');
    setGameStarted(Boolean(bundle.room.game_started));
    setFinalReportsDownloaded(Boolean(bundle.room.final_reports_downloaded));
    setIsPaused(bundle.room.is_paused);
    setBaseRate(Number(bundle.room.base_rate));
    setPropertyIndex(Number(bundle.room.property_index ?? getInitialPropertyIndexFromAssets(bundle.assets)));
    setExchangeRate(Number(bundle.room.exchange_rate ?? INITIAL_EXCHANGE_RATE));
    setUnemploymentRate(Number(bundle.room.unemployment_rate ?? INITIAL_UNEMPLOYMENT_RATE));
    setPriceIndex(Number(bundle.room.price_index ?? INITIAL_PRICE_INDEX));
    setDemandPullCumulative(Number(bundle.room.demand_pull_cumulative ?? 0));
    setTriggerCooldowns(bundle.room.trigger_cooldowns ?? {});
    setPendingMacroAlerts(bundle.room.pending_macro_alerts ?? []);
    setActiveMacroAlerts(bundle.room.active_macro_alerts ?? []);
    if (bundle.room.economic_seed && Object.keys(bundle.room.economic_seed).length) setEconomicSeed(bundle.room.economic_seed);
    setOpenMacroContext(bundle.room.open_macro_context && Object.keys(bundle.room.open_macro_context).length ? bundle.room.open_macro_context : null);
    if (bundle.assets.length) setAssets(bundle.assets);
    setTriggeredEventsByRound(groupedEvents);
    const remoteRoundResults = bundle.roundResults ?? [];
    const latestResult = [...remoteRoundResults].sort((a, b) => b.round - a.round)[0] ?? null;
    setRoundResults(remoteRoundResults);
    setPreviousAggregateReturn(Number(latestResult?.aggregateReturn ?? 0));
    setMacroTimeline(remoteRoundResults.map((result) => ({
      round: result.round,
      baseRate: result.macroMove?.nextBaseRate,
      propertyIndex: result.macroMove?.nextPropertyIndex,
      exchangeRate: result.macroMove?.nextExchangeRate,
      unemploymentRate: result.macroMove?.nextUnemploymentRate,
      priceIndex: result.priceIndex,
      aggregateReturn: result.aggregateReturn,
      demandPullDelta: result.demandPullDelta,
      hasMacroAlert: Boolean(result.macroAlerts?.length),
    })));
    setMacroAlertsByRound(Object.fromEntries(remoteRoundResults.filter((result) => result.macroAlerts?.length).map((result) => [result.round, result.macroAlerts])));
    setLatestRoundSummary(latestResult ? {
      round: latestResult.round,
      events: latestResult.events,
      macroAlerts: latestResult.macroAlerts,
      macroMove: latestResult.macroMove,
      delistedAssets: latestResult.delistedAssets,
      priceIndex: latestResult.priceIndex,
      aggregateReturn: latestResult.aggregateReturn,
    } : (resolvedCurrentEvents.length ? { round: remoteRound, events: resolvedCurrentEvents, macroAlerts: [], delistedAssets: [] } : null));
    setPlayers(bundle.players);
    if (bundle.teams?.length) setTeamAccounts(bundle.teams);
    setStudentStates(bundle.studentStates ?? []);
    setSyncStatus('실시간 수업 연결 중');
  }, [showToast]);

  const refreshRemoteRoom = useCallback(async (roomId = remoteRoomId) => {
    if (!supabaseConfigured || !roomId) return;
    const [bundle, remoteSubmissions] = await Promise.all([
      fetchRemoteRoomById(roomId),
      fetchRemoteSubmissions(roomId),
    ]);
    if (bundle) applyRemoteRoomBundle(bundle);
    setSubmissions(remoteSubmissions);
  }, [applyRemoteRoomBundle, remoteRoomId]);

  useEffect(() => {
    const checkExpiry = () => {
      if (Date.now() >= expiresAt) {
        setRoomExpired(true);
        setPhase('expired');
        setIsPaused(true);
      }
    };
    checkExpiry();
    const timer = window.setInterval(checkExpiry, 60_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    if (!studentEntryAllowed || !supabaseConfigured || !/^[0-9]{6}$/.test(roomPin)) return undefined;
    let cancelled = false;

    fetchRemoteRoomByPin(roomPin)
      .then(async (bundle) => {
        if (cancelled || !bundle) return;
        applyRemoteRoomBundle(bundle);
        const remoteSubmissions = await fetchRemoteSubmissions(bundle.room.id);
        if (!cancelled) setSubmissions(remoteSubmissions);
      })
      .catch((error) => {
        if (!cancelled) setSyncStatus(`수업 연결 불러오기 실패: ${error.message}`);
      });

    return () => {
      cancelled = true;
    };
  }, [applyRemoteRoomBundle, roomPin, studentEntryAllowed]);

  useEffect(() => {
    if (!supabaseConfigured || !remoteRoomId) return undefined;

    const unsubscribe = subscribeRemoteRoom(remoteRoomId, () => {
      window.clearTimeout(remoteRefreshTimer.current);
      remoteRefreshTimer.current = window.setTimeout(() => {
        refreshRemoteRoom(remoteRoomId).catch((error) => setSyncStatus(`수업 연결 동기화 실패: ${error.message}`));
      }, 150);
    });

    return () => {
      window.clearTimeout(remoteRefreshTimer.current);
      unsubscribe();
    };
  }, [refreshRemoteRoom, remoteRoomId]);

  useEffect(() => {
    if (!supabaseConfigured || !remoteRoomId || !joined || !nickname.trim()) return;
    const remotePlayer = {
      name: nickname.trim(),
      studentNumber,
      passcodeHash: studentPasscodeHash,
      sessionToken: studentSessionToken,
      lastSeenAt: Date.now(),
      teamKey: teamMode ? selectedTeamKey : '',
      cash: effectiveCash,
      deposit: effectiveDeposit,
      totalAsset: studentTotalAsset,
      returnRate: getInvestmentReturnRate(studentTotalAsset, investedPrincipal),
    };
    upsertRemotePlayer(remoteRoomId, remotePlayer).catch((error) => setSyncStatus(`학생 정보 저장 실패: ${error.message}`));
  }, [effectiveCash, effectiveDeposit, investedPrincipal, joined, nickname, remoteRoomId, selectedTeamKey, studentNumber, studentPasscodeHash, studentSessionToken, studentTotalAsset, teamMode]);

  useEffect(() => {
    if (!joined || !studentSessionToken || !nickname.trim()) return undefined;

    const updateHeartbeat = () => {
      const lastSeenAt = Date.now();
      setPlayers((current) =>
        current.map((player) =>
          Number(player.studentNumber) === Number(studentNumber)
            ? { ...player, sessionToken: studentSessionToken, lastSeenAt }
            : player,
        ),
      );

      if (supabaseConfigured && remoteRoomId) {
        upsertRemotePlayer(remoteRoomId, {
          name: nickname.trim(),
          studentNumber,
          passcodeHash: studentPasscodeHash,
          sessionToken: studentSessionToken,
          lastSeenAt,
          teamKey: teamMode ? selectedTeamKey : '',
          cash: effectiveCash,
          deposit: effectiveDeposit,
          totalAsset: studentTotalAsset,
          returnRate: getInvestmentReturnRate(studentTotalAsset, investedPrincipal),
        }).catch((error) => setSyncStatus(`접속 상태 저장 실패: ${error.message}`));
      }
    };

    updateHeartbeat();
    const timer = window.setInterval(updateHeartbeat, PLAYER_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [effectiveCash, effectiveDeposit, investedPrincipal, joined, nickname, remoteRoomId, selectedTeamKey, studentNumber, studentPasscodeHash, studentSessionToken, studentTotalAsset, teamMode]);

  useEffect(() => {
    if (!supabaseConfigured || !remoteRoomId || !joined || !studentPasscodeHash || !nickname.trim()) return undefined;
    const nextState = {
      studentNumber: Number(studentNumber),
      nickname: nickname.trim(),
      passcodeHash: studentPasscodeHash,
      teamKey: teamMode ? selectedTeamKey : '',
      cash: effectiveCash,
      deposit: effectiveDeposit,
      depositPrincipal: teamMode ? 0 : depositPrincipal,
      depositInterestEarned: effectiveDepositInterestEarned,
      portfolio: effectivePortfolio,
      lastDividendRound: teamMode ? activeTeam.lastDividendRound ?? 0 : lastDividendRound,
      tradeLogs,
      roundLogs,
      reflection,
      roundNotes, // Week 3 G — 라운드별 메모 영속화
      roundReflections, // Week 4 §3.6 — 체크포인트 학습 질문 응답 영속화
      salaryPaidRounds,
      initialCapitalGranted: teamMode ? gameStarted : initialCapitalGranted,
      updatedAt: Date.now(),
    };

    const cachedPendingState = {
      ...nextState,
      _roomRound: round,
      _roomPhase: phase,
      _pendingRemoteSave: true,
    };
    cacheStudentState(remoteRoomId || roomPin, studentNumber, cachedPendingState);

    window.clearTimeout(studentStateSaveTimer.current);
    studentStateSaveTimer.current = window.setTimeout(() => {
      upsertRemoteStudentState(remoteRoomId, nextState)
        .then((savedState) => {
          if (savedState) {
            rememberStudentState(savedState);
            cacheStudentState(remoteRoomId || roomPin, studentNumber, {
              ...savedState,
              _roomRound: round,
              _roomPhase: phase,
              _pendingRemoteSave: false,
            });
          }
        })
        .catch((error) => setSyncStatus(`학생 계좌 저장 실패: ${error.message}`));
    }, 100);

    return () => window.clearTimeout(studentStateSaveTimer.current);
  }, [activeTeam.lastDividendRound, depositPrincipal, effectiveCash, effectiveDeposit, effectiveDepositInterestEarned, effectivePortfolio, gameStarted, initialCapitalGranted, joined, lastDividendRound, nickname, phase, reflection, remoteRoomId, roomPin, round, roundLogs, roundNotes, roundReflections, salaryPaidRounds, selectedTeamKey, studentNumber, studentPasscodeHash, teamMode, tradeLogs]);

  useEffect(() => {
    if (!joined || !studentNumber) return;
    cacheRoundNoteDrafts(remoteRoomId || roomPin, studentNumber, roundNoteDrafts);
  }, [joined, remoteRoomId, roomPin, roundNoteDrafts, studentNumber]);

  useEffect(() => {
    if (!joined || teamMode || phase !== 'closed') return;
    const remoteState = studentStates.find((state) => Number(state.studentNumber) === Number(studentNumber));
    if (!remoteState) return;

    const hasNewDividend = Number(remoteState.lastDividendRound ?? 0) > lastDividendRound;
    const hasNewRoundLog = (remoteState.roundLogs ?? []).some(
      (remoteLog) => !roundLogs.some((localLog) => Number(localLog.round) === Number(remoteLog.round)),
    );
    const hasRemoteLearningData = Object.keys(remoteState.roundNotes ?? {}).length > Object.keys(roundNotes ?? {}).length
      || Object.keys(remoteState.roundReflections ?? {}).length > Object.keys(roundReflections ?? {}).length;
    if (!hasNewDividend && !hasNewRoundLog && !hasRemoteLearningData) return;
    const timer = window.setTimeout(() => {
      if (hasNewDividend) {
        setCash(Number(remoteState.cash ?? 0));
        setPortfolio(remoteState.portfolio ?? {});
        setTradeLogs(remoteState.tradeLogs ?? []);
        setLastDividendRound(Number(remoteState.lastDividendRound ?? 0));
      }
      if (hasNewRoundLog) setRoundLogs(remoteState.roundLogs ?? []);
      setRoundNotes((current) => ({ ...(remoteState.roundNotes ?? {}), ...current }));
      setRoundReflections((current) => ({ ...(remoteState.roundReflections ?? {}), ...current }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [joined, lastDividendRound, phase, roundLogs, roundNotes, roundReflections, studentNumber, studentStates, teamMode]);

  useEffect(() => {
    // Week 3 H — 생활소득 신뢰성 패치
    if (!gameStarted || !joined || teamMode || phase !== 'open') return;
    if (salaryPaidRounds.includes(round)) return;
    const timer = window.setTimeout(() => {
      setSalaryPaidRounds((current) => (current.includes(round) ? current : [...current, round]));
      setCash((current) => current + ROUND_SALARY);
      setTradeLogs((current) => {
        if (current.some((log) => log.round === round && log.type === '월급')) return current;
        return [
          buildTradeLog({
            round,
            type: '월급',
            detail: `${round}라운드 생활 소득 +${formatWon(ROUND_SALARY)}`,
            sequence: current.length,
            now: Date.now(),
          }),
          ...current,
        ];
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [gameStarted, joined, phase, round, salaryPaidRounds, teamMode]);

  useEffect(() => {
    if (!gameStarted || !joined || teamMode || initialCapitalGranted) return;
    const timer = window.setTimeout(() => {
      setCash((current) => (current > 0 ? current : INITIAL_CASH));
      setInitialCapitalGranted(true);
      setTradeLogs((current) => {
        if (current.some((log) => log.type === '초기 자본')) return current;
        return [
          buildTradeLog({
            round,
            type: '초기 자본',
            detail: `게임 시작 초기 자본 +${formatWon(INITIAL_CASH)}`,
            sequence: current.length,
            now: Date.now(),
          }),
          ...current,
        ];
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [gameStarted, initialCapitalGranted, joined, round, teamMode]);

  function pushNews(title, detail, targetRound = round) {
    setNewsFeed((current) => [{ id: `${Date.now()}-${title}`, round: targetRound, title, detail }, ...current].slice(0, 6));
  }

  async function handleHostLogin(event) {
    event.preventDefault();
    const authorizedHostId = getAuthorizedHostId(hostLogin.id, hostLogin.password);
    if (authorizedHostId) {
      setHostId(authorizedHostId);
      setHostAuthenticated(true);
      setHostLoginError('');
      setView('host');
      setRoomReady(false);
      setRemoteRoomId(null);
      setRoomPin('');

      if (!supabaseConfigured) {
        setSyncStatus('로컬 연습 모드 · 새 수업 방을 만들어 주세요.');
        return;
      }

      setSyncStatus(`${authorizedHostId} 계정의 수업 방을 확인하는 중입니다.`);
      try {
        const bundle = await fetchRemoteActiveRoomByHostId(authorizedHostId);
        if (bundle) {
          applyRemoteRoomBundle(bundle);
          setSubmissions(await fetchRemoteSubmissions(bundle.room.id));
          setSyncStatus(`${authorizedHostId} 계정의 기존 방을 불러왔습니다.`);
        } else {
          setSyncStatus(`${authorizedHostId} 계정에 유지 중인 방이 없습니다.`);
        }
      } catch (error) {
        setSyncStatus(`교사 방 확인 실패: ${error.message}`);
      }
      return;
    }
    setHostLoginError('아이디 또는 비밀번호가 맞지 않습니다.');
  }

  function addTradeLog(type, detail) {
    setTradeLogs((current) => [
      buildTradeLog({
        round,
        type,
        detail,
        sequence: current.length,
        now: Date.now(),
      }),
      ...current,
    ]);
  }

  function rememberStudentState(nextState) {
    if (!nextState?.studentNumber) return;
    setStudentStates((current) => [
      ...current.filter((state) => Number(state.studentNumber) !== Number(nextState.studentNumber)),
      nextState,
    ].sort((a, b) => Number(a.studentNumber ?? 99) - Number(b.studentNumber ?? 99)));
  }

  function restoreStudentState(savedState) {
    if (!savedState) return false;
    setCash(savedState.cash ?? 0);
    setDeposit(savedState.deposit ?? 0);
    setDepositPrincipal(savedState.depositPrincipal ?? 0);
    setDepositInterestEarned(savedState.depositInterestEarned ?? 0);
    setPortfolio(savedState.portfolio ?? {});
    setLastDividendRound(Number(savedState.lastDividendRound ?? 0));
    setTradeLogs(savedState.tradeLogs ?? []);
    setRoundLogs(savedState.roundLogs ?? []);
    setSalaryPaidRounds(savedState.salaryPaidRounds ?? []);
    setReflection({ good: '', improve: '', next: '', ...(savedState.reflection ?? {}) });
    // Week 3 G — 라운드별 메모 복원
    setRoundNotes(savedState.roundNotes ?? {});
    setRoundReflections(savedState.roundReflections ?? {});
    setInitialCapitalGranted(Boolean(savedState.initialCapitalGranted));
    if (teamMode && savedState.teamKey) setSelectedTeamKey(savedState.teamKey);
    rememberStudentState(savedState);
    return true;
  }

  function syncTeamAccount(nextTeam) {
    if (!remoteRoomId) return;
    upsertRemoteTeamAccount(remoteRoomId, nextTeam).catch((error) => setSyncStatus(`모둠 계좌 저장 실패: ${error.message}`));
  }

  function updateActiveTeamAccount(updater, { sync = true } = {}) {
    setTeamAccounts((current) =>
      current.map((team) => {
        if (team.key !== selectedTeamKey) return cleanTeamTradeLock(team);
        const nextTeam = updater(cleanTeamTradeLock(team));
        if (sync) window.setTimeout(() => syncTeamAccount(nextTeam), 0);
        return nextTeam;
      }),
    );
  }

  function releaseTeamTradeLock(team) {
    return teamMode ? { ...team, tradeHolder: null, tradeHolderExpiresAt: null } : team;
  }

  function canUseTeamAccount() {
    return !teamMode || (activeTeam && !activeTeam.bankrupt && teamTradeAllowed);
  }

  function handleClaimTeamTrade() {
    if (!teamMode || !gameStarted || gameFinished || !joined || !nickname.trim() || activeTeam.bankrupt) return;
    updateActiveTeamAccount((team) => ({
      ...team,
      tradeHolder: studentNameLabel,
      tradeHolderExpiresAt: Date.now() + TEAM_TRADE_LOCK_MS,
    }));
  }

  function handleReleaseTeamTrade() {
    if (!teamMode || !teamTradeAllowed) return;
    updateActiveTeamAccount((team) => ({ ...team, tradeHolder: null, tradeHolderExpiresAt: null }));
  }

  async function handleRoomModeChange(nextMode) {
    if (phase !== 'setup' || gameStarted) return;
    setRoomMode(nextMode);
    const nextTeams = teamAccounts.length ? teamAccounts : createDefaultTeamAccounts();
    if (!teamAccounts.length) setTeamAccounts(nextTeams);
    if (remoteRoomId) {
      try {
        await Promise.all([
          updateRemoteRoom(remoteRoomId, { mode: nextMode }),
          upsertRemoteTeamAccounts(remoteRoomId, nextTeams),
        ]);
      } catch (error) {
        setSyncStatus(`수업 방식 저장 실패: ${error.message}`);
      }
    }
  }

  async function handleTotalRoundsChange(nextTotalRounds) {
    if (phase !== 'setup' || gameStarted || !ROUND_OPTIONS.includes(nextTotalRounds)) return;
    setTotalRounds(nextTotalRounds);
    if (remoteRoomId) {
      try {
        await updateRemoteRoom(remoteRoomId, { total_rounds: nextTotalRounds });
      } catch (error) {
        setSyncStatus(`라운드 설정 저장 실패: ${error.message}`);
      }
    }
  }

  function handleReflectionChange(key, value) {
    setReflection((current) => ({ ...current, [key]: value }));
  }

  // Week 3 G — 입력 중에는 로컬 초안으로 유지하고 저장 버튼에서 서버에 확정한다.
  function handleRoundNoteDraftChange(roundNumber, value) {
    const clamped = clampToByteLength(value, 100);
    setRoundNoteDrafts((current) => ({ ...current, [roundNumber]: clamped }));
    setRoundNoteSaveStates((current) => ({ ...current, [roundNumber]: { status: 'editing', message: '저장 전' } }));
  }

  async function handleRoundNoteSave(roundNumber) {
    if (!joined || phase !== 'closed' || gameFinished || Number(roundNumber) !== Number(round)) return;
    const note = clampToByteLength(roundNoteDrafts[roundNumber] ?? roundNotes[roundNumber] ?? '', 100);
    const nextRoundNotes = { ...roundNotes, [roundNumber]: note };
    setRoundNoteSaveStates((current) => ({ ...current, [roundNumber]: { status: 'saving', message: '저장 중' } }));

    const nextState = {
      studentNumber: Number(studentNumber),
      nickname: nickname.trim(),
      passcodeHash: studentPasscodeHash,
      teamKey: teamMode ? selectedTeamKey : '',
      cash: effectiveCash,
      deposit: effectiveDeposit,
      depositPrincipal: teamMode ? 0 : depositPrincipal,
      depositInterestEarned: effectiveDepositInterestEarned,
      portfolio: effectivePortfolio,
      lastDividendRound: teamMode ? activeTeam.lastDividendRound ?? 0 : lastDividendRound,
      tradeLogs,
      roundLogs,
      reflection,
      roundNotes: nextRoundNotes,
      roundReflections,
      salaryPaidRounds,
      initialCapitalGranted: teamMode ? gameStarted : initialCapitalGranted,
      updatedAt: Date.now(),
    };

    try {
      if (supabaseConfigured && remoteRoomId) {
        const savedState = await upsertRemoteStudentState(remoteRoomId, nextState);
        if (savedState) rememberStudentState(savedState);
      }
      setRoundNotes(nextRoundNotes);
      setRoundNoteDrafts((current) => {
        const next = { ...current };
        delete next[roundNumber];
        return next;
      });
      const savedAt = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      setRoundNoteSaveStates((current) => ({ ...current, [roundNumber]: { status: 'saved', message: `${savedAt} 저장됨` } }));
      showToast({ title: `${roundNumber}라운드 메모가 저장되었습니다.`, tone: 'success' });
    } catch (error) {
      setRoundNoteSaveStates((current) => ({ ...current, [roundNumber]: { status: 'error', message: '저장 실패 · 다시 시도' } }));
      showToast({ title: '메모 저장에 실패했습니다.', message: error.message, tone: 'error', duration: 5000 });
    }
  }

  // Week 4 §3.6 — 체크포인트 학습 질문 응답 변경
  function handleRoundReflectionChange(roundNumber, payload) {
    setRoundReflections((current) => ({ ...current, [roundNumber]: { ...(current[roundNumber] || {}), ...payload } }));
  }

  async function handleStudentJoin() {
    const trimmedName = nickname.trim();
    const parsedNumber = Number(studentNumber);
    const normalizedPasscode = studentPasscode.trim();
    if (!Number.isInteger(parsedNumber) || parsedNumber < 1 || parsedNumber > MAX_PLAYERS_PER_ROOM) {
      setStudentJoinError(`학번은 1부터 ${MAX_PLAYERS_PER_ROOM} 사이의 숫자로 입력하세요.`);
      return;
    }
    if (!trimmedName) {
      setStudentJoinError('이름을 입력하세요.');
      return;
    }
    if (!/^[0-9]{6}$/.test(normalizedPasscode)) {
      setStudentJoinError('개인 비밀번호는 숫자 6자리로 입력하세요.');
      return;
    }

    try {
      let joinRoomId = remoteRoomId;
      let joinPlayers = players;
      let joinRoomMode = teamMode;
      let joinGameStarted = gameStarted;
      let joinRound = round;
      let joinPhase = phase;

      if (supabaseConfigured) {
        const latestBundle = await fetchRemoteRoomByPin(roomPin);
        if (!latestBundle?.room) {
          setStudentJoinError('해당 PIN의 수업 방을 찾을 수 없습니다. 교사에게 PIN을 확인하세요.');
          return;
        }
        applyRemoteRoomBundle(latestBundle);
        joinRoomId = latestBundle.room.id;
        joinPlayers = latestBundle.players ?? [];
        joinRoomMode = (latestBundle.room.mode ?? 'individual') === 'team';
        joinGameStarted = Boolean(latestBundle.room.game_started);
        joinRound = Number(latestBundle.room.current_round ?? round);
        joinPhase = latestBundle.room.phase ?? phase;
      }

      const passcodeHash = hashStudentPasscode(roomPin, parsedNumber, normalizedPasscode);
      const storedSessionToken = getStoredStudentSessionToken(roomPin, parsedNumber);
      const nextSessionToken = storedSessionToken || createStudentSessionToken();
      const existingPlayer = joinPlayers.find((player) => Number(player.studentNumber) === parsedNumber);
      if (existingPlayer && existingPlayer.passcodeHash !== passcodeHash) {
        setStudentJoinError('이미 사용 중인 학번입니다. 이름과 개인 비밀번호를 확인하세요.');
        return;
      }
      if (existingPlayer && hasActiveDifferentSession(existingPlayer, nextSessionToken)) {
        setStudentJoinError('해당 학번은 다른 기기에서 접속 중입니다. 기존 화면을 닫고 잠시 후 다시 시도하세요.');
        return;
      }
      if (!existingPlayer && joinPlayers.length >= MAX_PLAYERS_PER_ROOM) {
        setStudentJoinError('정원이 찼습니다.');
        return;
      }

      const resolvedName = existingPlayer?.name || trimmedName;
      const resolvedTeamKey = joinRoomMode ? (existingPlayer?.teamKey || selectedTeamKey) : '';
      const nextPlayer = {
        id: existingPlayer?.id ?? `local-${parsedNumber}`,
        name: resolvedName,
        studentNumber: parsedNumber,
        passcodeHash,
        sessionToken: nextSessionToken,
        lastSeenAt: Date.now(),
        teamKey: resolvedTeamKey,
        cash: joinGameStarted && !joinRoomMode ? INITIAL_CASH : effectiveCash,
        deposit: joinGameStarted ? effectiveDeposit : 0,
        totalAsset: joinGameStarted && !joinRoomMode ? INITIAL_CASH : studentTotalAsset,
        returnRate: 0,
        holdings: [],
      };

      const savedPlayer = joinRoomId
        ? await registerRemotePlayer(joinRoomId, nextPlayer)
        : null;
      const playerToStore = savedPlayer ?? nextPlayer;
      const remoteSavedState = joinRoomId
        ? await fetchRemoteStudentState(joinRoomId, parsedNumber)
        : studentStates.find((state) => Number(state.studentNumber) === parsedNumber);
      const cachedState = loadCachedStudentState(joinRoomId || roomPin, parsedNumber);
      if (remoteSavedState?.passcodeHash && remoteSavedState.passcodeHash !== passcodeHash) {
        setStudentJoinError('저장된 계좌의 개인 비밀번호가 일치하지 않습니다.');
        return;
      }
      const validCachedState = cachedState && (!cachedState.passcodeHash || cachedState.passcodeHash === passcodeHash)
        ? cachedState
        : null;
      const canRestorePendingCache = Boolean(
        validCachedState?._pendingRemoteSave
          && Number(validCachedState._roomRound) === joinRound
          && joinPhase === 'open',
      );
      const savedState = canRestorePendingCache
        ? validCachedState
        : remoteSavedState ?? validCachedState;
      setPlayers((current) => [
        ...current.filter((player) => Number(player.studentNumber) !== parsedNumber),
        playerToStore,
      ].sort((a, b) => Number(a.studentNumber ?? 99) - Number(b.studentNumber ?? 99)));
      setStudentPasscodeHash(passcodeHash);
      setStudentSessionToken(playerToStore.sessionToken ?? nextSessionToken);
      storeStudentSessionToken(roomPin, parsedNumber, playerToStore.sessionToken ?? nextSessionToken);
      setStudentNumber(String(parsedNumber));
      setNickname(playerToStore.name ?? resolvedName);
      const restored = savedState ? restoreStudentState({ ...savedState, passcodeHash }) : false;
      setRoundNoteDrafts(loadRoundNoteDrafts(joinRoomId || roomPin, parsedNumber));
      setRoundNoteSaveStates({});
      if (joinRoomMode && playerToStore.teamKey) setSelectedTeamKey(playerToStore.teamKey);
      if (!restored && joinGameStarted && !joinRoomMode) {
        setCash((current) => (current > 0 ? current : INITIAL_CASH));
        setInitialCapitalGranted(true);
      }
      setStudentJoinError('');
      setJoined(true);
    } catch (error) {
      setStudentJoinError(error.message);
    }
  }

  async function handleGameStart() {
    if (roomExpired || gameStarted || phase !== 'setup') return;
    const fundedTeams = fundTeamAccounts(teamAccounts.length ? teamAccounts : createDefaultTeamAccounts());
    setGameStarted(true);
    setFinalReportsDownloaded(false);
    setCash(INITIAL_CASH);
    setInitialCapitalGranted(true);
    setDeposit(0);
    setDepositPrincipal(0);
    setDepositInterestEarned(0);
    setPortfolio({});
    // Week 4 §2.2 — 게임 시작 시 물가 시스템 리셋
    setPriceIndex(INITIAL_PRICE_INDEX);
    setPreviousAggregateReturn(0);
    setDemandPullCumulative(0);
    setMacroTimeline([]); // Week 4 §4.8
    setTeamAccounts(fundedTeams);
    setPlayers((current) =>
      current.map((player) => ({
        ...player,
        cash: INITIAL_CASH,
        deposit: 0,
        totalAsset: INITIAL_CASH,
        returnRate: 0,
      })),
    );
    pushNews('게임 시작', '모든 개인 또는 모둠 계좌에 초기 자본 1억 원이 지급되었습니다.');
    if (remoteRoomId) {
      try {
        await Promise.all([
          updateRemoteRoom(remoteRoomId, {
            game_started: true,
            final_reports_downloaded: false,
            price_index: INITIAL_PRICE_INDEX,
            demand_pull_cumulative: 0,
            trigger_cooldowns: {},
            pending_macro_alerts: [],
            active_macro_alerts: [],
          }),
          upsertRemoteTeamAccounts(remoteRoomId, fundedTeams),
          ...players.map((player) =>
            upsertRemotePlayer(remoteRoomId, {
              ...player,
              cash: INITIAL_CASH,
              deposit: 0,
              totalAsset: INITIAL_CASH,
              returnRate: 0,
            }),
          ),
        ]);
      } catch (error) {
        setSyncStatus(`게임 시작 저장 실패: ${error.message}`);
      }
    }
  }

  async function handleCancelIssue(issueId) {
    if (phase !== 'setup') return;
    const targetIssue = currentRoundEvents.find((event) => event.id === issueId);
    setTriggeredEventsByRound((current) => ({
      ...current,
      [round]: (current[round] ?? []).filter((event) => event.id !== issueId),
    }));
    if (remoteRoomId && targetIssue) {
      try {
        await deleteRemoteIssue(remoteRoomId, targetIssue);
      } catch (error) {
        setSyncStatus(`이슈 취소 실패: ${error.message}`);
      }
    }
  }

  async function handleClearIssues() {
    if (phase !== 'setup' || !currentRoundEvents.length) return;
    setTriggeredEventsByRound((current) => ({ ...current, [round]: [] }));
    if (remoteRoomId) {
      try {
        await deleteRemoteRoundDraftIssues(remoteRoomId, round);
      } catch (error) {
        setSyncStatus(`이슈 초기화 실패: ${error.message}`);
      }
    }
  }

  async function applyFreshRoom({ nextPin, statusMessage = '새 수업 방 저장 중' }) {
    const now = Date.now();
    const selectedTotalRounds = totalRounds;
    const selectedRoomMode = roomMode;
    // Week 2 K — 방 생성 시점에 3가지 난수 시드 생성 (모든 방에 적용)
    const nextEconomicSeed = createEconomicSeed();
    const nextAssets = createRandomizedAssets();
    const nextPropertyIndex = getInitialPropertyIndexFromAssets(nextAssets);
    const nextTeams = createDefaultTeamAccounts();
    const nextRoom = buildNewRoomState({
      pin: nextPin,
      now,
      // Week 2 K — 시드값으로 초기 기준금리 조정 (3.0~4.5)
      initialBaseRate: nextEconomicSeed.economicConstitution.baseRate,
      initialPropertyIndex: nextPropertyIndex,
      assets: nextAssets,
      players: [],
      initialCash: 0,
      initialAssetId: initialTradableAssets[0].id,
    });

    setRoomPin(nextRoom.roomPin);
    setRoomReady(true);
    setRoomCreatedAt(nextRoom.roomCreatedAt);
    setRoomExpired(nextRoom.roomExpired);
    setRound(nextRoom.round);
    setTotalRounds(selectedTotalRounds);
    setPhase(nextRoom.phase);
    setRoomMode(selectedRoomMode);
    setGameStarted(false);
    setIsPaused(nextRoom.isPaused);
    setBaseRate(nextRoom.baseRate);
    setPropertyIndex(nextRoom.propertyIndex);
    // Week 2 K — 시드 기반 초기 환율/실업률 적용
    setExchangeRate(nextEconomicSeed.economicConstitution.exchangeRate);
    setUnemploymentRate(nextEconomicSeed.economicConstitution.unemploymentRate);
    setEconomicSeed(nextEconomicSeed);
    setInitialSeedSensitivity(nextEconomicSeed?.inflationSensitivity ?? null); // Week 4 §4.9
    setAssets(nextRoom.assets);
    setOpenMacroContext(null);
    setTriggeredEventsByRound(nextRoom.triggeredEventsByRound);
    setRoundResults([]);
    // Week 4 §2.4 — 거시 경보 채널 초기화
    setPendingMacroAlerts([]);
    setActiveMacroAlerts([]);
    setMacroAlertsByRound({});
    // Week 4 §2.2 — 물가 시스템 초기화 (방 새로 시작/재초기화 시)
    setPriceIndex(INITIAL_PRICE_INDEX);
    setPreviousAggregateReturn(0);
    setDemandPullCumulative(0);
    setMacroTimeline([]); // Week 4 §4.8
    setLatestRoundSummary(nextRoom.latestRoundSummary);
    setIssueDraft(nextRoom.issueDraft);
    setStartIssueChoiceOpen(false);
    setNewsFeed(nextRoom.newsFeed);
    setPlayers(nextRoom.players);
    setJoined(false);
    setStudentJoinError('');
    setStudentPasscode('');
    setStudentPasscodeHash('');
    setStudentSessionToken('');
    setCash(nextRoom.cash);
    setDeposit(nextRoom.deposit);
    setDepositPrincipal(0);
    setDepositInterestEarned(0);
    setInitialCapitalGranted(false);
    setPortfolio(nextRoom.portfolio);
    setLastDividendRound(0);
    setTeamAccounts(nextTeams);
    setSelectedTeamKey(teamTemplates[0].key);
    setSelectedAssetId(nextRoom.selectedAssetId);
    setTradeAmount(nextRoom.tradeAmount);
    setDepositAmount(nextRoom.depositAmount);
    setTradeLogs(nextRoom.tradeLogs);
    setRoundLogs(nextRoom.roundLogs);
    setSalaryPaidRounds([]);
    setReflection(nextRoom.reflection);
    // Week 3 G — 라운드별 메모 초기화
    setRoundNotes({});
    setRoundNoteDrafts({});
    setRoundNoteSaveStates({});
    // Week 4 §3.6 — 체크포인트 학습 질문 응답 초기화
    setRoundReflections({});
    setSubmissions([]);
    setStudentStates([]);
    setFinalReportsDownloaded(false);
    setResetDialogOpen(false);
    setResetPassword('');
    setResetError('');
    setRemoteRoomId(null);
    remotePhaseRef.current = { initialized: false, roomId: '', round: 1, phase: 'setup' };
    shownToastIdsRef.current.clear();

    if (!supabaseConfigured) return;
    setSyncStatus(statusMessage);
    try {
      const bundle = await createRemoteRoom({
        pin: nextPin,
        now,
        hostId: hostId || 'geography',
        totalRounds: selectedTotalRounds,
        // Week 4 §4.10 — 시드 기반 거시지표(기준금리/환율/실업률)를 supabase에도 저장해
        //   학생 단말이 join할 때 기본값이 아닌 시드값을 받도록 한다.
        baseRate: nextEconomicSeed.economicConstitution.baseRate,
        propertyIndex: nextPropertyIndex,
        exchangeRate: nextEconomicSeed.economicConstitution.exchangeRate,
        unemploymentRate: nextEconomicSeed.economicConstitution.unemploymentRate,
        economicSeed: nextEconomicSeed,
        assets: nextAssets,
        mode: selectedRoomMode,
        teams: selectedRoomMode === 'team' ? nextTeams : [],
      });
      if (bundle) {
        applyRemoteRoomBundle(bundle);
        // Week 4 §4.10 — bundle 적용 시 supabase에서 누락된 필드(특히 dividendTier)나
        //   기본값으로 덮어쓰기된 거시지표가 있을 수 있으므로 시드 기반 로컬값으로 다시 복원.
        setBaseRate(nextEconomicSeed.economicConstitution.baseRate);
        setExchangeRate(nextEconomicSeed.economicConstitution.exchangeRate);
        setUnemploymentRate(nextEconomicSeed.economicConstitution.unemploymentRate);
        setAssets(nextAssets); // dividendTier·dividendRate 포함된 로컬 자산으로 복원
        setEconomicSeed(nextEconomicSeed);
      }
    } catch (error) {
      setRoomReady(false);
      setRoomPin('');
      setSyncStatus(`수업 방 생성 실패: ${error.message}`);
    }
  }

  async function createNewRoom() {
    if (!hostAuthenticated) {
      setView('host-login');
      return;
    }

    const nextPin = String(Math.floor(100000 + Math.random() * 900000));
    await applyFreshRoom({ nextPin, statusMessage: '새 수업 방 저장 중' });
  }

  function handleRequestReset() {
    setResetPassword('');
    setResetError('');
    setResetDialogOpen(true);
  }

  function handleCancelReset() {
    setResetDialogOpen(false);
    setResetPassword('');
    setResetError('');
  }

  async function handleConfirmReset(event) {
    event.preventDefault();
    if (resetPassword !== HOST_PASSWORD) {
      setResetError('초기화 암호가 맞지 않습니다.');
      return;
    }
    await applyFreshRoom({ nextPin: roomPin, statusMessage: '현재 방 초기화 중' });
    setSyncStatus(supabaseConfigured ? '현재 방이 초기화되었습니다.' : '로컬 방이 초기화되었습니다.');
  }

  async function handleNextRound() {
    if (roomExpired || round >= totalRounds) return;
    const nextRound = Math.min(round + 1, totalRounds);
    setRound(nextRound);
    setPhase('setup');
    setIssueDraft('');
    pushNews(`${nextRound}라운드 준비`, '교사가 새 이슈를 등록할 수 있습니다.', nextRound);
    if (remoteRoomId) {
      try {
        await updateRemoteRoom(remoteRoomId, { current_round: nextRound, phase: 'setup' });
      } catch (error) {
        setSyncStatus(`라운드 이동 저장 실패: ${error.message}`);
      }
    }
  }

  async function handleRegisterIssue(event, issueOption = null) {
    if (roomExpired || !gameStarted || currentRoundEvents.length >= MAX_EVENTS_PER_ROUND) return;

    const registeredEvent = buildRegisteredIssue({
      event,
      issueOption,
      issueDraft,
      round,
      now: Date.now(),
      defaultProbability: DEFAULT_EVENT_PROBABILITY,
    });
    registeredEvent.published = false;

    setTriggeredEventsByRound((current) => ({
      ...current,
      [round]: [...(current[round] ?? []), registeredEvent],
    }));
    setIssueDraft('');

    if (remoteRoomId) {
      try {
        const savedIssue = await insertRemoteIssue(remoteRoomId, registeredEvent, round);
        if (savedIssue) {
          setTriggeredEventsByRound((current) => ({
            ...current,
            [round]: (current[round] ?? []).map((item) => (item.id === registeredEvent.id ? savedIssue : item)),
          }));
        }
      } catch (error) {
        setSyncStatus(`이슈 저장 실패: ${error.message}`);
      }
    }
  }

  async function handleStartRound(startMode = 'normal') {
    if (roomExpired || !gameStarted || phase !== 'setup') return;
    if (!currentRoundEvents.length && startMode === 'normal') {
      setStartIssueChoiceOpen(true);
      return;
    }
    // Week 4 §2.4 — 트리거 먼저 활성화 (이슈와 시점·채널 분리)
    //   라운드 시작 시점에 pendingMacroAlerts → activeMacroAlerts 로 이동.
    //   이슈 슬롯(IssueTicker)에 트리거가 섞이지 않도록 publishedEvents 와 완전히 별도 채널로 관리.
    const activatedAlerts = pendingMacroAlerts ?? [];
    setActiveMacroAlerts(activatedAlerts);
    if (activatedAlerts.length > 0) {
      setMacroAlertsByRound((current) => ({ ...current, [round]: activatedAlerts }));
    }
    if ((pendingMacroAlerts ?? []).length > 0) setPendingMacroAlerts([]);

    let publishedEvents = currentRoundEvents.map((event) => ({ ...event, published: true }));
    if (startMode === 'random') {
      publishedEvents = pickRandomRoundIssues({ round, now: Date.now(), count: 3 });
    } else if (startMode === 'none') {
      publishedEvents = [];
    }
    const nextPrincipal = getInvestedPrincipal({ gameStarted: true, round, phase: 'open' });
    const salariedPlayers = players.map((player) => ({
      ...player,
      cash: (player.cash ?? 0) + ROUND_SALARY,
      totalAsset: (player.totalAsset ?? 0) + ROUND_SALARY,
      returnRate: getInvestmentReturnRate((player.totalAsset ?? INITIAL_CASH) + ROUND_SALARY, nextPrincipal),
    }));
    const salariedTeams = payTeamRoundSalary(teamAccounts, players);
    const previewConflictOutcomeMap = getConflictOutcomeMap(publishedEvents);
    const previewMacroImpact = combineEventMacroImpacts(
      [
        ...publishedEvents
          .filter((event) => !previewConflictOutcomeMap[event.id]?.blocked)
          .map((event) => ({ ...event, didApply: true })),
        // Week 4 §2.4 — 활성 거시 경보(트리거)의 매크로 임팩트도 동시에 반영
        ...activatedAlerts.map((alert) => ({ ...alert, didApply: true })),
      ],
    );
    const previewMacroMove = createMacroMove({
      baseRate,
      propertyIndex,
      exchangeRate,
      unemploymentRate,
      eventMacroImpact: previewMacroImpact,
    });
    const nextOpenMacroContext = {
      round,
      startBaseRate: baseRate,
      startPropertyIndex: propertyIndex,
      startExchangeRate: exchangeRate,
      startUnemploymentRate: unemploymentRate,
      randomMacroImpact: previewMacroMove.randomMacroImpact,
    };
    setTriggeredEventsByRound((current) => ({
      ...current,
      [round]: publishedEvents,
    }));
    setStartIssueChoiceOpen(false);
    setBaseRate(previewMacroMove.nextBaseRate);
    setPropertyIndex(previewMacroMove.nextPropertyIndex);
    setExchangeRate(previewMacroMove.nextExchangeRate);
    setUnemploymentRate(previewMacroMove.nextUnemploymentRate);
    setOpenMacroContext(nextOpenMacroContext);
    if (teamMode) {
      setTeamAccounts(salariedTeams);
    } else {
      setPlayers(salariedPlayers);
    }
    setPhase('open');
    const startNewsDetail = publishedEvents.length
      ? `${publishedEvents.length}개 이슈가 공개되었습니다. 생활 소득 ${formatWon(ROUND_SALARY)}이 지급되고 거시 지표가 먼저 움직였습니다.`
      : `선택 이슈 없이 장이 시작되었습니다. 생활 소득 ${formatWon(ROUND_SALARY)}과 기본 거시 변수만 먼저 반영됩니다.`;
    pushNews(`${round}라운드 장 시작`, startNewsDetail);
    showToast({
      id: `${remoteRoomId || `local-${roomPin}`}:${round}:open`,
      title: `${round}라운드가 시작되었습니다.`,
      message: '공개된 이슈를 확인하고 투자 판단을 시작하세요.',
      tone: 'info',
    });
    if (remoteRoomId) {
      try {
        const remoteUpdates = [
          updateRemoteRoom(remoteRoomId, {
            phase: 'open',
            base_rate: previewMacroMove.nextBaseRate,
            property_index: previewMacroMove.nextPropertyIndex,
            exchange_rate: previewMacroMove.nextExchangeRate,
            unemployment_rate: previewMacroMove.nextUnemploymentRate,
            open_macro_context: nextOpenMacroContext,
            active_macro_alerts: activatedAlerts,
            pending_macro_alerts: [],
            trigger_cooldowns: triggerCooldowns,
          }),
        ];
        if (startMode === 'random') {
          remoteUpdates.push(...publishedEvents.map((event) => insertRemoteIssue(remoteRoomId, event, round)));
        } else if (publishedEvents.length) {
          remoteUpdates.push(updateRemoteIssues(remoteRoomId, publishedEvents, round));
        }
        if (teamMode) {
          remoteUpdates.push(upsertRemoteTeamAccounts(remoteRoomId, salariedTeams));
        } else {
          remoteUpdates.push(...salariedPlayers.map((player) => upsertRemotePlayer(remoteRoomId, player)));
        }
        await Promise.all(remoteUpdates);
      } catch (error) {
        setSyncStatus(`라운드 시작 저장 실패: ${error.message}`);
      }
    }
  }

  async function handleCloseRound() {
    if (roomExpired || phase !== 'open') return;

    let latestStudentStates = studentStates;
    if (remoteRoomId) {
      try {
        latestStudentStates = await fetchRemoteStudentStates(remoteRoomId);
        setStudentStates(latestStudentStates);
      } catch (error) {
        setSyncStatus(`학생 계좌 확인 실패: ${error.message}`);
      }
    }

    const eventsForResolution = currentRoundEvents.filter((event) => event.published);
    const conflictOutcomeMap = getConflictOutcomeMap(eventsForResolution);
    const initialResolvedEvents = eventsForResolution.map((event) => {
      const conflictOutcome = conflictOutcomeMap[event.id];
      const didApply = conflictOutcome?.blocked ? false : Math.random() < (event.probability ?? DEFAULT_EVENT_PROBABILITY);
      const outcomeType = didApply
        ? (Math.random() < EXPECTATION_WITHIN_SUCCESS_PROBABILITY ? 'expectation' : 'event')
        : 'failed';
      return {
        ...event,
        resolved: true,
        didApply,
        outcomeType,
        conflictLabel: conflictOutcome?.label,
        conflictWinnerTitle: conflictOutcome?.winnerTitle,
        expectationTitle: `${event.title} 실제 발표 전 기대감 선반영`,
        expectationDetail: '실제 이벤트가 확정되지는 않았지만, 투자자들이 가능성을 먼저 반영하면서 가격이 움직였습니다.',
        failureTitle: conflictOutcome && !didApply ? `${event.title} 상충 이슈로 영향 제한` : event.failureTitle,
        failureDetail: conflictOutcome && !didApply
          ? `${conflictOutcome.label} 상황에서 '${conflictOutcome.winnerTitle}' 쪽 경향성이 더 강하게 확인되어 이 이슈는 가격에 반영되지 않았습니다.`
          : event.failureDetail,
      };
    });

    // Week 3 H — 반전 효과(reverse): 무산된 이슈 중 40% 확률, 라운드당 최대 1개
    // 상충(conflict)으로 이미 막힌 이슈는 별도 사유가 있으므로 반전 후보에서 제외
    const REVERSE_PROBABILITY = 0.4;
    const REVERSE_FACTOR = -0.5;
    let reverseRemaining = 1;
    const reverseAdjustedEvents = initialResolvedEvents.map((event) => {
      if (event.didApply) return event;
      if (event.conflictLabel) return event;
      if (reverseRemaining <= 0) return event;
      if (Math.random() >= REVERSE_PROBABILITY) return event;
      reverseRemaining -= 1;
      return {
        ...event,
        outcomeType: 'reverse',
        reverseFactor: REVERSE_FACTOR,
        reverseTitle: `${event.title} 무산, 반대 흐름 부각`,
        reverseDetail: `예상되던 이슈가 무산되면서, 시장 참여자들이 반대 방향 시나리오에 무게를 두기 시작했습니다. (영향 강도 ${Math.abs(REVERSE_FACTOR) * 100}%)`,
      };
    });

    const appliedEventTypeCounts = getAppliedEventTypeCounts(reverseAdjustedEvents);
    const resolvedEvents = reverseAdjustedEvents.map((event) => {
      const repeatedCount = appliedEventTypeCounts[getEventKey(event)] ?? 0;
      const repeatedVolatility = event.didApply && repeatedCount >= 2;
      const isReverse = event.outcomeType === 'reverse';
      let resolvedImpact = {};
      if (event.didApply) {
        resolvedImpact = repeatedVolatility
          ? normalizeRepeatedEventImpact(event.impact, repeatedCount, assets)
          : normalizeEventImpact(event.impact, assets);
      } else if (isReverse) {
        const base = normalizeEventImpact(event.impact, assets);
        const factor = event.reverseFactor ?? -0.5;
        resolvedImpact = Object.fromEntries(
          Object.entries(base).map(([assetId, value]) => [assetId, Number((value * factor).toFixed(3))]),
        );
      }
      return {
        ...event,
        repeatedVolatility,
        repeatedCount,
        resolvedImpact,
      };
    });

    const resolvedMacroAlerts = (activeMacroAlerts ?? []).map((alert) => ({
      ...alert,
      resolved: true,
      didApply: true,
      triggered: true,
      outcomeType: 'macroAlert',
      resolvedImpact: normalizeEventImpact(alert.impact ?? {}, assets),
    }));
    const allResolvedEvents = [...resolvedEvents, ...resolvedMacroAlerts];
    setTriggeredEventsByRound((current) => ({
      ...current,
      [round]: resolvedEvents,
    }));

    // Week 2 K — 방 생성 시 부여된 이슈 강도 시드 적용 (모든 이슈 impact에 곱연산)
    const issueIntensity = economicSeed?.issueIntensity ?? 1;
    const rawEventImpact = applySizeFactor(combineResolvedImpacts(allResolvedEvents), assets);
    const eventImpact = Object.fromEntries(
      Object.entries(rawEventImpact).map(([assetId, value]) => [assetId, value * issueIntensity]),
    );
    const rawEventMacroImpact = combineEventMacroImpacts(allResolvedEvents);
    const eventMacroImpact = Object.fromEntries(
      Object.entries(rawEventMacroImpact).map(([key, value]) => [key, value * issueIntensity]),
    );
    const macroBaseline = openMacroContext?.round === round
      ? openMacroContext
      : {
          round,
          startBaseRate: baseRate,
          startPropertyIndex: propertyIndex,
          startExchangeRate: exchangeRate,
          startUnemploymentRate: unemploymentRate,
          randomMacroImpact: null,
        };
    const macroMove = createMacroMove({
      baseRate: macroBaseline.startBaseRate,
      propertyIndex: macroBaseline.startPropertyIndex,
      exchangeRate: macroBaseline.startExchangeRate,
      unemploymentRate: macroBaseline.startUnemploymentRate,
      eventMacroImpact,
      randomMacroImpact: macroBaseline.randomMacroImpact,
    });
    const nextBaseRate = macroMove.nextBaseRate;
    const financialImpact = getFinancialImpactMap(assets, macroMove, allResolvedEvents);
    const combinedImpact = combineImpacts(eventImpact, macroMove.assetImpact, financialImpact);
    const directNegativeCounts = allResolvedEvents.reduce((acc, event) => {
      if (!event.didApply) return acc;
      Object.entries(event.impact ?? {}).forEach(([assetId, value]) => {
        const asset = assets.find((item) => item.id === assetId);
        if (asset?.type === 'stock' && value <= STRONG_NEGATIVE_IMPACT) {
          acc[assetId] = (acc[assetId] ?? 0) + 1;
        }
      });
      return acc;
    }, {});
    const negativeStreakByAsset = Object.fromEntries(
      assets.map((asset) => {
        const stressCount = directNegativeCounts[asset.id] ?? 0;
        return [asset.id, stressCount >= 2 ? (asset.negativeStreak ?? 0) + 1 : 0];
      }),
    );

    setBaseRate(nextBaseRate);
    setPropertyIndex(macroMove.nextPropertyIndex);
    setExchangeRate(macroMove.nextExchangeRate);
    setUnemploymentRate(macroMove.nextUnemploymentRate);
    setOpenMacroContext(null);

    // ── 거시지표 트리거 감지: 임계점 돌파 시 다음 라운드 이슈로 자동 발동 ──
    // Week 2 K — 시드 기반 트리거 민감도 적용 (1보다 크면 더 빨리 발동)
    const triggerSensitivity = economicSeed?.triggerSensitivity ?? 1;
    const macroTriggerSnapshot = {
      baseRate: nextBaseRate,
      propertyIndex: macroMove.nextPropertyIndex,
      exchangeRate: macroMove.nextExchangeRate,
      unemploymentRate: macroMove.nextUnemploymentRate,
    };
    const triggerResult = detectMacroTriggers(
      applyTriggerSensitivity(
        macroTriggerSnapshot,
        triggerSensitivity,
      ),
      triggerCooldowns,
    );
    setTriggerCooldowns(triggerResult.nextCooldowns);
    let nextPendingMacroAlerts = [];
    // Week 4 §2.4 — 트리거 결과는 이슈 슬롯이 아닌 거시 경보 채널로 보낸다 (다음 라운드 시작 시 활성화)
    if (triggerResult.fired.length > 0) {
      nextPendingMacroAlerts = triggerResult.fired
        .map((id) => scenarioEvents.find((event) => event.id === id))
        .filter(Boolean)
        .map((event) => {
          const issueOption = event.issueOptions[Math.floor(Math.random() * event.issueOptions.length)];
          const triggerDefinition = MACRO_TRIGGERS.find((item) => item.id === event.id);
          const observedValue = triggerDefinition ? macroTriggerSnapshot[triggerDefinition.valueKey] : null;
          return {
            ...event,
            ...issueOption,
            uniqueId: `${event.id}-macroAlert-${Date.now()}`,
            triggered: true,
            outcomeType: 'macroAlert',
            triggerReason: triggerDefinition
              ? `${triggerDefinition.metric} ${Number(observedValue).toLocaleString('ko-KR')}${triggerDefinition.unit} · 발동 기준 ${triggerDefinition.threshold}`
              : event.detail,
          };
        });
    }
    setPendingMacroAlerts(nextPendingMacroAlerts);


    const delistedAssets = round >= DELISTING_START_ROUND
      ? assets
          .filter((asset) => asset.type === 'stock' && !asset.delisted && (negativeStreakByAsset[asset.id] ?? 0) >= 2)
          .filter(() => Math.random() < DELISTING_PROBABILITY)
          .map((asset) => ({ id: asset.id, name: asset.name }))
      : [];

    const nextAssets = moveAssetsLocally(assets, combinedImpact, delistedAssets.map((asset) => asset.id), round, macroMove, negativeStreakByAsset, volatilityMode);
    const depositInterest = Math.round(deposit * (getDepositRate(nextBaseRate) / 100 / 4));
    const nextDeposit = deposit + depositInterest;
    // 팀 모드: 팀별 채권 이자 로그를 수집하기 위한 컨테이너
    const teamBondInterestLogs = [];
    const nextTeamAccounts = teamAccounts.map((team) => {
      const cleanTeam = cleanTeamTradeLock(team);
      if (cleanTeam.bankrupt) return cleanTeam;
      const teamDepositInterest = Math.round(cleanTeam.deposit * (getDepositRate(nextBaseRate) / 100 / 4));
      const nextTeamDeposit = cleanTeam.deposit + teamDepositInterest;
      // 채권 라운드별 단리 이자 (팀 모드) - 가격 변동 후 자산 정의 기준
      const teamBondResult = computeBondInterest(cleanTeam.portfolio, nextAssets);
      const teamBondInterest = teamBondResult.totalInterest;
      const nextTeamCash = cleanTeam.cash + teamBondInterest;
      if (teamBondInterest > 0) {
        teamBondInterestLogs.push({ teamKey: cleanTeam.key, teamName: cleanTeam.name, breakdown: teamBondResult.breakdown });
      }
      const nextTeamHoldingsValue = getPortfolioValue(cleanTeam.portfolio, nextAssets);
      const nextTeamTotalAsset = nextTeamCash + nextTeamDeposit + nextTeamHoldingsValue;
      const nextNegativeRounds = nextTeamCash < 0 || nextTeamCash + nextTeamDeposit < 0 || nextTeamTotalAsset < 0 ? (cleanTeam.negativeRounds ?? 0) + 1 : 0;
      const bankrupt = nextNegativeRounds >= 2;
      return {
        ...cleanTeam,
        cash: bankrupt ? 0 : nextTeamCash,
        deposit: bankrupt ? 0 : nextTeamDeposit,
        depositInterestEarned: bankrupt ? cleanTeam.depositInterestEarned : cleanTeam.depositInterestEarned + teamDepositInterest,
        portfolio: bankrupt ? {} : cleanTeam.portfolio,
        tradeHolder: null,
        tradeHolderExpiresAt: null,
        negativeRounds: nextNegativeRounds,
        bankrupt,
      };
    });

    setAssets(nextAssets);
    setDeposit(nextDeposit);
    setTeamAccounts(nextTeamAccounts);
    const bankruptedTeams = nextTeamAccounts
      .filter((team) => team.bankrupt && !teamAccounts.find((item) => item.key === team.key)?.bankrupt)
      .map((team) => team.name);
    if (depositInterest > 0) {
      setDepositInterestEarned((current) => current + depositInterest);
      addTradeLog('예금 이자', `${round}라운드 분기 복리 이자 +${formatWon(depositInterest)}`);
    }
    // 채권 라운드별 단리 이자 (솔로 모드)
    if (!teamMode) {
      const soloBondResult = computeBondInterest(portfolio, nextAssets);
      if (soloBondResult.totalInterest > 0) {
        setCash((current) => current + soloBondResult.totalInterest);
        for (const entry of soloBondResult.breakdown) {
          addTradeLog(
            '채권 이자',
            `${round}라운드 ${entry.name} ${entry.shares}주 액면가 기준 단리 +${formatWon(entry.interest)} (쿠폰 ${(entry.rate * 100).toFixed(1)}%)`,
          );
        }
      }
    } else {
      // 팀 모드: 본인이 속한 팀의 채권 이자 로그만 표시
      const myTeamLog = teamBondInterestLogs.find((entry) => entry.teamKey === selectedTeamKey);
      if (myTeamLog) {
        for (const entry of myTeamLog.breakdown) {
          addTradeLog(
            '채권 이자',
            `${round}라운드 ${entry.name} ${entry.shares}주 액면가 기준 단리 +${formatWon(entry.interest)} (쿠폰 ${(entry.rate * 100).toFixed(1)}%)`,
          );
        }
      }
    }

    // 지정 배당일의 장 마감 보유 수량으로 정산한다.
    const isDividendRound = DIVIDEND_ROUNDS.includes(round);
    const mergedExDividend = {};
    const dividendBreakdown = [];
    let localDividendAmount = 0;
    let nextStudentStatesAfterDividend = teamMode ? latestStudentStates : latestStudentStates.map((state) => {
      const currentPortfolio = state.portfolio ?? {};
      const alreadyPaid = Number(state.lastDividendRound ?? 0) === round;
      const payout = alreadyPaid
        ? { totalDividend: 0, exDividendByAsset: {}, breakdown: [] }
        : computeDividendPayout(currentPortfolio, nextAssets, round);
      const dividendLogs = buildDividendLogs(payout.breakdown, round, state.tradeLogs ?? []);
      mergeExDividendDrops(mergedExDividend, payout.exDividendByAsset);
      return {
        ...state,
        cash: Number(state.cash ?? 0) + payout.totalDividend,
        lastDividendRound: isDividendRound ? round : Number(state.lastDividendRound ?? 0),
        tradeLogs: [...dividendLogs, ...(state.tradeLogs ?? [])],
        updatedAt: Date.now(),
      };
    });

    const nextTeamAccountsAfterDividend = nextTeamAccounts.map((team) => {
      const currentPortfolio = team.portfolio ?? {};
      const alreadyPaid = Number(team.lastDividendRound ?? 0) === round;
      const payout = team.bankrupt || alreadyPaid
        ? { totalDividend: 0, exDividendByAsset: {}, breakdown: [] }
        : computeDividendPayout(currentPortfolio, nextAssets, round);
      mergeExDividendDrops(mergedExDividend, payout.exDividendByAsset);
      if (team.key === selectedTeamKey) dividendBreakdown.push(...payout.breakdown);
      return {
        ...team,
        cash: Number(team.cash ?? 0) + payout.totalDividend,
        lastDividendRound: isDividendRound ? round : Number(team.lastDividendRound ?? 0),
      };
    });

    if (teamMode && dividendBreakdown.length) {
      const teamDividendLogs = buildDividendLogs(dividendBreakdown, round, tradeLogs);
      setTradeLogs((current) => [...teamDividendLogs, ...current]);
    }

    // 로컬 개인 연습 또는 현재 접속 학생 화면도 즉시 같은 결과를 반영한다.
    if (!teamMode && joined) {
      const localPayout = lastDividendRound === round
        ? { totalDividend: 0, exDividendByAsset: {}, breakdown: [] }
        : computeDividendPayout(portfolio, nextAssets, round);
      const localDividendLogs = buildDividendLogs(localPayout.breakdown, round, tradeLogs);
      localDividendAmount = localPayout.totalDividend;
      mergeExDividendDrops(mergedExDividend, localPayout.exDividendByAsset);
      dividendBreakdown.push(...localPayout.breakdown);
      if (isDividendRound) setLastDividendRound(round);
      if (localPayout.totalDividend > 0) setCash((current) => current + localPayout.totalDividend);
      if (localDividendLogs.length) setTradeLogs((current) => [...localDividendLogs, ...current]);

      if (remoteRoomId && !nextStudentStatesAfterDividend.some((state) => Number(state.studentNumber) === Number(studentNumber))) {
        nextStudentStatesAfterDividend = [
          ...nextStudentStatesAfterDividend,
          {
            studentNumber: Number(studentNumber),
            nickname: nickname.trim(),
            passcodeHash: studentPasscodeHash,
            teamKey: '',
            cash: cash + localPayout.totalDividend,
            deposit,
            depositPrincipal,
            depositInterestEarned,
            portfolio: { ...portfolio },
            lastDividendRound: isDividendRound ? round : lastDividendRound,
            tradeLogs: [...localDividendLogs, ...tradeLogs],
            roundLogs,
            roundNotes,
            roundReflections,
            reflection,
            salaryPaidRounds,
            initialCapitalGranted,
            updatedAt: Date.now(),
          },
        ];
      }
    }

    const nextAssetsAfterDividend = applyExDividendDrop(nextAssets, mergedExDividend);
    setAssets(nextAssetsAfterDividend);
    setStudentStates(nextStudentStatesAfterDividend);
    setTeamAccounts(nextTeamAccountsAfterDividend);

    // ── Week 4 §2.2: 물가지수(인플레이션) 갱신 — 라운드 N 종료 시점 ──
    //   분기당 기본 1% + α (수요견인 / 이슈 / 거시) × 시드 D
    //   "다 같이 돈을 많이 벌면 물가가 더 빨리 오른다"는 수요견인 메커니즘.
    let nextPriceIndexValue = priceIndex;
    let aggregateReturnForRound = previousAggregateReturn;
    let demandPullDeltaForRound;
    let nextDemandPullCumulativeValue;
    {
      const memberCount = teamMode
        ? Math.max(1, players.length)
        : Math.max(1, (players ?? []).length);
      // 누적 원금: INITIAL_CASH + ROUND_SALARY × (생활소득 지급 횟수)
      const investedPerHead = getInvestedPrincipal({ gameStarted: true, round, phase: 'closed' });
      const aggregatePrincipal = investedPerHead * memberCount;
      // 총 자산: 라운드 종료 시점 가격(nextAssets) 기준 — 솔로는 players.totalAsset, 팀은 cash+deposit+포트폴리오
      const aggregateNetWorth = teamMode
        ? nextTeamAccountsAfterDividend.reduce((sum, team) => sum + getTotalAsset({
            cash: team.cash ?? 0,
            deposit: team.deposit ?? 0,
            portfolio: team.portfolio ?? {},
            assets: nextAssetsAfterDividend,
          }), 0)
        : (players ?? []).reduce((sum, p) => sum + (p.totalAsset ?? INITIAL_CASH), 0);
      aggregateReturnForRound = aggregatePrincipal > 0
        ? (aggregateNetWorth / aggregatePrincipal) - 1
        : 0;
      const aggregateReturnDelta = aggregateReturnForRound - (previousAggregateReturn ?? 0);
      // 수요견인: 직전 대비 +5% 수익 → +0.5%p 추가 인플레, 손실 라운드에서는 0으로 클램프
      const demandPullInflation = Math.max(0, aggregateReturnDelta) * DEMAND_PULL_COEF;

      // 이슈 영향 (실제 발생한 inflation-cool / inflation-rebound 만)
      const issueInflationDelta = resolvedEvents.reduce((sum, ev) => {
        if (!ev.didApply) return sum;
        if (ev.id === 'inflation-cool')    return sum - 0.003;
        if (ev.id === 'inflation-rebound') return sum + 0.008;
        return sum;
      }, 0);

      // 거시 영향: 저금리(돈 풀림) / 고환율(수입물가) / 저실업률(임금상승)
      const macroInflationDelta =
          (nextBaseRate < 1.0 ? 0.002 : 0)
        + (nextBaseRate > 7.0 ? -0.001 : 0)
        + (macroMove.nextExchangeRate > 1500 ? 0.002 : 0)
        + (macroMove.nextUnemploymentRate < 2.5 ? 0.003 : 0);

      const seedD = economicSeed?.inflationSensitivity ?? 1.0;
      const rawInflation = BASE_INFLATION_RATE + demandPullInflation + issueInflationDelta + macroInflationDelta;
      const totalRoundInflation = Math.max(MIN_INFLATION_FLOOR, rawInflation * seedD);
      nextPriceIndexValue = priceIndex * (1 + totalRoundInflation);
      setPriceIndex(nextPriceIndexValue);
      setPreviousAggregateReturn(aggregateReturnForRound);
      // Phase C — 라운드별 수요견인 인플레이션 누적 (시드 D 적용 후 실제 기여분)
      //   기본 인플레가 floor에 의해 끌어올려진 경우, 수요견인분도 그 비율만큼 잘려나가게 정확히 산정.
      const demandPullEffective = totalRoundInflation > 0 && rawInflation > 0
        ? totalRoundInflation * (demandPullInflation * seedD / (rawInflation * seedD))
        : 0;
      demandPullDeltaForRound = demandPullEffective;
      nextDemandPullCumulativeValue = demandPullCumulative + demandPullEffective;
      setDemandPullCumulative(nextDemandPullCumulativeValue);
    }

    const roundResult = {
      round,
      events: resolvedEvents,
      macroAlerts: resolvedMacroAlerts,
      delistedAssets,
      macroMove,
      priceIndex: nextPriceIndexValue,
      aggregateReturn: aggregateReturnForRound,
      demandPullDelta: demandPullDeltaForRound,
      demandPullCumulative: nextDemandPullCumulativeValue,
    };
    setRoundResults((current) => [
      ...current.filter((result) => Number(result.round) !== Number(round)),
      roundResult,
    ].sort((a, b) => a.round - b.round));
    setLatestRoundSummary({ ...roundResult });
    // Week 4 §4.8 — 거시 시계열에 이번 라운드 스냅샷 추가
    {
      const demandPullDeltaSnap = demandPullDeltaForRound;
      const hasMacroAlertSnap = Array.isArray(activeMacroAlerts) && activeMacroAlerts.length > 0;
      setMacroTimeline((current) => [
        ...current.filter((point) => point.round !== round),
        {
          round,
          baseRate: nextBaseRate,
          propertyIndex: macroMove.nextPropertyIndex,
          exchangeRate: macroMove.nextExchangeRate,
          unemploymentRate: macroMove.nextUnemploymentRate,
          priceIndex: nextPriceIndexValue,
          aggregateReturn: aggregateReturnForRound,
          demandPullDelta: demandPullDeltaSnap,
          hasMacroAlert: hasMacroAlertSnap,
        },
      ].sort((a, b) => a.round - b.round));
    }
    setPhase('closed');
    const selectedTeamAfterRound = nextTeamAccountsAfterDividend.find((team) => team.key === selectedTeamKey) ?? activeTeam;
    const localBondInterest = teamMode ? 0 : computeBondInterest(portfolio, nextAssets).totalInterest;
    const logCash = teamMode ? selectedTeamAfterRound.cash : cash + localBondInterest + localDividendAmount;
    const logDeposit = teamMode ? selectedTeamAfterRound.deposit : nextDeposit;
    const logPortfolio = teamMode ? selectedTeamAfterRound.portfolio : portfolio;
    // Week 2 E — 라운드 로그는 배당락 적용 후 자산 가격 기준으로 산정
    const assetsForLog = nextAssetsAfterDividend ?? nextAssets;
    const buildAccountRoundLog = ({ accountCash, accountDeposit, accountPortfolio }) => buildRoundLog({
        round,
        now: Date.now(),
        totalAsset: getTotalAsset({ cash: accountCash, deposit: accountDeposit, portfolio: accountPortfolio, assets: assetsForLog }),
        holdings: getHoldingSummary(accountPortfolio, assetsForLog),
        events: resolvedEvents.map((event) => `${event.title}: ${getResultLabel(event, false)}`).join(' / '),
        eventAnalysis: resolvedEvents,
        macroAlerts: resolvedMacroAlerts,
        macroMove,
        delistedAssets,
        priceIndex: nextPriceIndexValue,
      });
    const localRoundLog = buildAccountRoundLog({ accountCash: logCash, accountDeposit: logDeposit, accountPortfolio: logPortfolio });
    setRoundLogs((current) => [
      localRoundLog,
      ...current.filter((item) => item.round !== round),
    ].sort((a, b) => a.round - b.round));
    nextStudentStatesAfterDividend = nextStudentStatesAfterDividend.map((state) => {
      const account = teamMode
        ? nextTeamAccountsAfterDividend.find((team) => team.key === state.teamKey)
        : state;
      if (!account) return state;
      const accountRoundLog = buildAccountRoundLog({
        accountCash: Number(account.cash ?? 0),
        accountDeposit: Number(account.deposit ?? 0),
        accountPortfolio: account.portfolio ?? {},
      });
      return {
        ...state,
        roundLogs: [
          accountRoundLog,
          ...(state.roundLogs ?? []).filter((item) => Number(item.round) !== Number(round)),
        ].sort((a, b) => a.round - b.round),
        updatedAt: Date.now(),
      };
    });
    setStudentStates(nextStudentStatesAfterDividend);
    const failedEvents = resolvedEvents.filter((event) => !event.didApply);
    if (bankruptedTeams.length) {
      pushNews('모둠 파산 발생', `${bankruptedTeams.join(', ')} 계좌가 2라운드 연속 잔고 문제로 파산 처리되었습니다.`);
    } else if (delistedAssets.length) {
      pushNews('상장폐지 발생', `${delistedAssets.map((asset) => asset.name).join(', ')} 거래가 중단되었습니다. 한 종목 집중 투자의 위험이 현실화됐습니다.`);
    } else if (failedEvents.length) {
      pushNews(failedEvents[0].failureTitle, failedEvents[0].failureDetail);
    } else if (resolvedEvents.some((event) => event.outcomeType === 'expectation')) {
      const expectationEvent = resolvedEvents.find((event) => event.outcomeType === 'expectation');
      pushNews(expectationEvent.expectationTitle, expectationEvent.expectationDetail);
    } else {
      pushNews(`${round}라운드 장 마감`, '등록된 이슈가 실제 이벤트로 확인되어 장 마감 가격에 반영되었습니다.');
    }
    const studentStateByNumber = new Map(
      nextStudentStatesAfterDividend.map((state) => [Number(state.studentNumber), state]),
    );
    const nextPlayersAfterDividend = players.map((player) => {
      const state = !teamMode ? studentStateByNumber.get(Number(player.studentNumber)) : null;
      const totalAsset = state
        ? getTotalAsset({
            cash: state.cash ?? 0,
            deposit: state.deposit ?? 0,
            portfolio: state.portfolio ?? {},
            assets: nextAssetsAfterDividend,
          })
        : player.totalAsset ?? Math.round(INITIAL_CASH * (1 + (player.returnRate ?? 0) / 100));
      return {
        ...player,
        cash: state ? state.cash : player.cash,
        deposit: state ? state.deposit : player.deposit,
        totalAsset,
        returnRate: getInvestmentReturnRate(
          totalAsset,
          getInvestedPrincipal({ gameStarted: true, round, phase: 'closed' }),
        ),
      };
    });
    setPlayers(nextPlayersAfterDividend);
    showToast({
      id: `${remoteRoomId || `local-${roomPin}`}:${round}:closed`,
      title: `${round}라운드가 종료되었습니다.`,
      message: round === totalRounds ? '최종 자기평가를 작성해주세요.' : '라운드 메모를 작성해주세요.',
      tone: 'success',
      duration: 5000,
    });

    if (remoteRoomId) {
      try {
        await Promise.all([
          updateRemoteRoom(remoteRoomId, {
            phase: 'closed',
            base_rate: nextBaseRate,
            property_index: macroMove.nextPropertyIndex,
            exchange_rate: macroMove.nextExchangeRate,
            unemployment_rate: macroMove.nextUnemploymentRate,
            price_index: nextPriceIndexValue,
            demand_pull_cumulative: nextDemandPullCumulativeValue,
            open_macro_context: {},
            trigger_cooldowns: triggerResult.nextCooldowns,
            pending_macro_alerts: nextPendingMacroAlerts,
            active_macro_alerts: resolvedMacroAlerts,
          }),
          upsertRemoteRoundResult(remoteRoomId, roundResult),
          upsertRemoteAssets(remoteRoomId, nextAssetsAfterDividend),
          updateRemoteIssues(remoteRoomId, resolvedEvents, round),
          upsertRemoteTeamAccounts(remoteRoomId, nextTeamAccountsAfterDividend),
          ...nextStudentStatesAfterDividend.map((state) => upsertRemoteStudentState(remoteRoomId, state)),
          ...nextPlayersAfterDividend.map((player) => upsertRemotePlayer(remoteRoomId, player)),
        ]);
      } catch (error) {
        setSyncStatus(`장 마감 저장 실패: ${error.message}`);
      }
    }
  }

  async function handleEndGame() {
    if (!canEndGame) return;
    setIsPaused(true);
    setPhase('ended');
    pushNews('게임 종료', '최종 수익률을 확인하고 자산 배분 판단을 회고합니다.');
    if (remoteRoomId) {
      try {
        await updateRemoteRoom(remoteRoomId, { phase: 'ended', is_paused: true });
      } catch (error) {
        setSyncStatus(`게임 종료 저장 실패: ${error.message}`);
      }
    }
  }

  function parseAmount(value) {
    return Number(String(value).replaceAll(',', '').replace(/[^\d]/g, '')) || 0;
  }

  function buildTeacherClosedSubmission(player, states = studentStates) {
    const nicknameLabel = getStudentDisplayName(player.studentNumber, player.name);
    const savedState = states.find((state) => Number(state.studentNumber) === Number(player.studentNumber));
    const team = teamMode && player.teamKey ? teamAccounts.find((item) => item.key === player.teamKey) : null;
    const teamMemberCount = team ? players.filter((item) => item.teamKey === team.key).length : 1;
    const reportCash = team ? team.cash : (savedState?.cash ?? player.cash ?? 0);
    const reportDeposit = team ? team.deposit : (savedState?.deposit ?? player.deposit ?? 0);
    const reportDepositInterest = team ? team.depositInterestEarned : (savedState?.depositInterestEarned ?? 0);
    const reportPortfolio = team ? team.portfolio : (savedState?.portfolio ?? {});
    const reportInvestedPrincipal = getInvestedPrincipal({
      gameStarted: true,
      round,
      phase: 'closed',
      memberCount: Math.max(1, teamMemberCount),
    });
    const report = buildFinalSubmissionReport({
      nickname: nicknameLabel,
      studentNumber: player.studentNumber,
      mode: roomMode,
      teamKey: team?.key ?? '',
      teamName: team?.name ?? '',
      submissionMethod: 'teacher-close',
      cash: reportCash,
      deposit: reportDeposit,
      depositInterestEarned: reportDepositInterest,
      investedPrincipal: reportInvestedPrincipal,
      portfolio: reportPortfolio,
      assets,
      tradeLogs: savedState?.tradeLogs ?? [],
      roundLogs: savedState?.roundLogs ?? [],
      roundResults,
      roundNotes: savedState?.roundNotes ?? {},
      roundReflections: savedState?.roundReflections ?? {},
      reflection: savedState?.reflection ?? {
        good: '',
        improve: '',
        next: '교사 제출 마감으로 현재 저장 상태가 자동 제출되었습니다.',
      },
      // Week 4 §2.2 Phase C — 인플레이션 KPI 전달
      priceIndex,
      demandPullCumulative,
    });

    if (!savedState && !team && player.totalAsset && player.totalAsset > report.totalAsset) {
      const cashLikeAsset = reportCash + reportDeposit;
      const investmentAsset = Math.max(0, player.totalAsset - cashLikeAsset);
      return {
        ...report,
        totalAsset: player.totalAsset,
        cashLikeAsset,
        investmentAsset,
        returnRate: getInvestmentReturnRate(player.totalAsset, reportInvestedPrincipal),
        investorType: getInvestorType({
          cashLikeAsset,
          holdingsValue: investmentAsset,
          portfolioRows: [],
          totalAsset: player.totalAsset,
        }),
      };
    }

    return report;
  }

  async function handleSubmitReport() {
    if (!gameFinished || !joined || submittedReport) return;
    const report = buildFinalSubmissionReport({
      nickname: reportNickname,
      studentNumber: Number(studentNumber),
      mode: roomMode,
      teamKey: teamMode ? activeTeam.key : '',
      teamName: teamMode ? activeTeam.name : '',
      submissionMethod: 'student',
      cash: effectiveCash,
      deposit: effectiveDeposit,
      depositInterestEarned: effectiveDepositInterestEarned,
      investedPrincipal,
      portfolio: effectivePortfolio,
      assets,
      tradeLogs,
      roundLogs,
      roundResults,
      roundNotes,
      roundReflections,
      reflection,
      // Week 4 §2.2 Phase C — 인플레이션 KPI 전달
      priceIndex,
      demandPullCumulative,
    });

    setSubmissions((current) => [report, ...current.filter((item) => item.nickname !== report.nickname)]);
    if (remoteRoomId) {
      try {
        const savedReport = await upsertRemoteSubmission(remoteRoomId, report);
        if (savedReport) {
          setSubmissions((current) => [savedReport, ...current.filter((item) => item.nickname !== savedReport.nickname)]);
        }
      } catch (error) {
        setSyncStatus(`최종 제출 저장 실패: ${error.message}`);
      }
    }
  }

  async function handleCloseSubmissions() {
    if (!gameFinished || allSubmissionsComplete) return;
    let latestStates = studentStates;
    let latestSubmissions = submissions;
    if (remoteRoomId) {
      try {
        [latestStates, latestSubmissions] = await Promise.all([
          fetchRemoteStudentStates(remoteRoomId),
          fetchRemoteSubmissions(remoteRoomId),
        ]);
        setStudentStates(latestStates);
        setSubmissions(latestSubmissions);
      } catch (error) {
        setSyncStatus(`최종 제출 상태 불러오기 실패: ${error.message}`);
      }
    }

    const missingPlayers = players.filter(
      (player) => !latestSubmissions.some((submission) => submissionMatchesPlayer(submission, player)),
    );
    const autoReports = missingPlayers.map((player) => buildTeacherClosedSubmission(player, latestStates));
    if (!autoReports.length) {
      setSubmissions(latestSubmissions);
      return;
    }

    const mergedReports = [
      ...autoReports,
      ...latestSubmissions.filter(
        (submission) => !autoReports.some((report) => reportsMatchParticipant(submission, report)),
      ),
    ];

    setSubmissions(mergedReports);
    setFinalReportsDownloaded(false);
    pushNews('제출 마감', `${autoReports.length}명의 미제출 보고서가 현재 저장 상태로 자동 제출되었습니다.`);

    if (remoteRoomId) {
      try {
        const savedReports = await Promise.all(autoReports.map((report) => upsertRemoteSubmission(remoteRoomId, report)));
        setSubmissions([
          ...savedReports.filter(Boolean),
          ...mergedReports.filter(
            (submission) => !savedReports.some((report) => report && reportsMatchParticipant(submission, report)),
          ),
        ]);
        await updateRemoteRoom(remoteRoomId, { final_reports_downloaded: false });
      } catch (error) {
        setSyncStatus(`제출 마감 저장 실패: ${error.message}`);
      }
    }
  }

  function handleDownloadSubmissions() {
    if (!gameFinished || !allSubmissionsComplete) return;
    const rows = [
      ['순위', '학번', '이름', '제출방식', '투자방식', '모둠', '총자산', '투입원금', '현금성자산', '투자평가금', '예금이자수익', '수익률', '물가지수', '투자성향', '보유자산', '라운드이슈분석', '거시트리거', '라운드메모', '체크포인트답변', '잘한점', '부족한점', '다음계획'],
      ...[...submissions].sort((a, b) => b.totalAsset - a.totalAsset).map((submission, index) => [
        index + 1,
        submission.studentNumber ?? '',
        submission.nickname,
        submission.submissionMethod === 'teacher-close' ? '교사 마감 제출' : '학생 직접 제출',
        submission.mode === 'team' ? '모둠 투자' : '개인 투자',
        submission.teamName ?? '',
        submission.totalAsset,
        submission.investedPrincipal ?? INITIAL_CASH,
        submission.cashLikeAsset,
        submission.investmentAsset,
        submission.depositInterestEarned ?? 0,
        `${submission.returnRate.toFixed(1)}%`,
        Number(submission.priceIndex ?? priceIndex).toFixed(3),
        submission.investorType,
        submission.portfolio?.map((item) => `${item.name} ${item.shares}주 ${Math.round((item.ratio ?? 0) * 100)}%`).join(' / ') ?? '',
        (submission.roundResults ?? []).map((result) => `R${result.round}: ${(result.events ?? []).map((event) => `${event.title}(${getResultLabel(event, false)})`).join(', ') || '선택 이슈 없음'}`).join(' / '),
        (submission.roundResults ?? []).flatMap((result) => (result.macroAlerts ?? []).map((alert) => `R${result.round}: ${alert.title}`)).join(' / '),
        formatRoundNotesForExport(submission.roundNotes),
        formatCheckpointReflectionsForExport(submission.roundReflections),
        submission.reflection?.good ?? '',
        submission.reflection?.improve ?? '',
        submission.reflection?.next ?? '',
      ]),
    ];
    downloadCsv(`market-class-${roomPin}-final-reports.csv`, rows);
    setFinalReportsDownloaded(true);
    if (remoteRoomId) {
      updateRemoteRoom(remoteRoomId, { final_reports_downloaded: true }).catch((error) => setSyncStatus(`다운로드 상태 저장 실패: ${error.message}`));
    }
  }

  function beginTradeProcessing() {
    if (tradeLockRef.current) {
      showToast({ title: '거래 처리 중입니다.', message: '잠시 후 다시 시도해주세요.', tone: 'info', duration: 1800 });
      return false;
    }
    tradeLockRef.current = true;
    setTradePending(true);
    return true;
  }

  function finishTradeProcessing() {
    window.clearTimeout(tradeUnlockTimerRef.current);
    tradeUnlockTimerRef.current = window.setTimeout(() => {
      tradeLockRef.current = false;
      setTradePending(false);
    }, 600);
  }

  function handleBuy() {
    if (roomExpired || gameFinished || phase !== 'open' || selectedAsset.delisted || selectedAsset.price <= 0) return;
    if (!canUseTeamAccount()) return;
    const sourceCash = teamMode ? activeTeam.cash : cash;
    const amount = Math.min(parseAmount(tradeAmount), sourceCash);
    // Week 1 B — 수수료를 포함한 최대 주식수 계산: shares × price × (1 + fee) ≤ amount
    const maxShares = Math.floor(amount / (selectedAsset.price * (1 + TRADE_FEE_RATE)));
    const shares = Math.max(0, maxShares);
    if (shares <= 0) {
      showToast({ title: '매수할 수 없습니다.', message: '주문 금액과 보유 현금을 확인해주세요.', tone: 'error' });
      return;
    }
    if (!beginTradeProcessing()) return;
    const principal = shares * selectedAsset.price;
    const fee = Math.round(principal * TRADE_FEE_RATE);
    const cost = principal + fee;
    try {
      if (teamMode) {
        updateActiveTeamAccount((team) =>
          releaseTeamTradeLock({
            ...team,
            cash: team.cash - cost,
            portfolio: { ...team.portfolio, [selectedAsset.id]: (team.portfolio[selectedAsset.id] ?? 0) + shares },
          }),
        );
      } else {
        setCash((current) => current - cost);
        setPortfolio((current) => ({ ...current, [selectedAsset.id]: (current[selectedAsset.id] ?? 0) + shares }));
      }
      addTradeLog('매수', `${selectedAsset.name} ${shares.toLocaleString('ko-KR')}주 · ${formatWon(principal)} (수수료 ${formatWon(fee)})`);
      showToast({
        title: `${selectedAsset.name} 매수 완료`,
        message: `${shares.toLocaleString('ko-KR')}주 · 결제 ${formatWon(cost)} (수수료 ${formatWon(fee)})`,
        tone: 'success',
      });
    } catch (error) {
      showToast({ title: '매수 처리에 실패했습니다.', message: error.message, tone: 'error' });
    } finally {
      finishTradeProcessing();
    }
  }

  function handleSell() {
    if (roomExpired || gameFinished || phase !== 'open' || selectedAsset.delisted || selectedAsset.price <= 0) return;
    if (!canUseTeamAccount()) return;
    const amount = parseAmount(tradeAmount);
    const sourcePortfolio = teamMode ? activeTeam.portfolio : portfolio;
    const owned = sourcePortfolio[selectedAsset.id] ?? 0;
    const shares = Math.min(owned, Math.floor(amount / selectedAsset.price));
    if (shares <= 0) {
      showToast({ title: '매도할 수 없습니다.', message: '주문 금액과 보유 수량을 확인해주세요.', tone: 'error' });
      return;
    }
    if (!beginTradeProcessing()) return;
    // Week 1 B — 매도: 거래 수수료 + 증권거래세 차감
    const principal = shares * selectedAsset.price;
    const fee = Math.round(principal * TRADE_FEE_RATE);
    const tax = Math.round(principal * TRADE_TAX_RATE);
    const revenue = principal - fee - tax;
    try {
      if (teamMode) {
        updateActiveTeamAccount((team) =>
          releaseTeamTradeLock({
            ...team,
            cash: team.cash + revenue,
            portfolio: { ...team.portfolio, [selectedAsset.id]: owned - shares },
          }),
        );
      } else {
        setCash((current) => current + revenue);
        setPortfolio((current) => ({ ...current, [selectedAsset.id]: owned - shares }));
      }
      addTradeLog('매도', `${selectedAsset.name} ${shares.toLocaleString('ko-KR')}주 · ${formatWon(revenue)} (수수료 ${formatWon(fee)} · 거래세 ${formatWon(tax)})`);
      showToast({
        title: `${selectedAsset.name} 매도 완료`,
        message: `${shares.toLocaleString('ko-KR')}주 · 입금 ${formatWon(revenue)} (수수료·세금 ${formatWon(fee + tax)})`,
        tone: 'success',
      });
    } catch (error) {
      showToast({ title: '매도 처리에 실패했습니다.', message: error.message, tone: 'error' });
    } finally {
      finishTradeProcessing();
    }
  }

  function handleDeposit() {
    if (roomExpired || gameFinished) return;
    if (!canUseTeamAccount()) return;
    const sourceCash = teamMode ? activeTeam.cash : cash;
    const amount = Math.min(parseAmount(depositAmount), sourceCash);
    if (amount <= 0) {
      showToast({ title: '예금할 수 없습니다.', message: '입력 금액과 보유 현금을 확인해주세요.', tone: 'error' });
      return;
    }
    if (teamMode) {
      updateActiveTeamAccount((team) =>
        releaseTeamTradeLock({
          ...team,
          cash: team.cash - amount,
          deposit: team.deposit + amount,
        }),
      );
    } else {
      setCash((current) => current - amount);
      setDeposit((current) => current + amount);
      setDepositPrincipal((current) => current + amount);
    }
    addTradeLog('예금', `${formatWon(amount)} 예치`);
    showToast({ title: '예금 완료', message: `${formatWon(amount)}을 예금으로 옮겼습니다.`, tone: 'success' });
  }

  function handleWithdrawDeposit() {
    if (roomExpired || gameFinished) return;
    if (!canUseTeamAccount()) return;
    const sourceDeposit = teamMode ? activeTeam.deposit : deposit;
    const amount = Math.min(parseAmount(depositAmount), sourceDeposit);
    if (amount <= 0) {
      showToast({ title: '예금 해지할 수 없습니다.', message: '입력 금액과 예금 잔액을 확인해주세요.', tone: 'error' });
      return;
    }
    if (teamMode) {
      updateActiveTeamAccount((team) =>
        releaseTeamTradeLock({
          ...team,
          cash: team.cash + amount,
          deposit: team.deposit - amount,
        }),
      );
    } else {
      const withdrawRatio = deposit > 0 ? amount / deposit : 0;
      const principalReduction = Math.min(depositPrincipal, Math.round(depositPrincipal * withdrawRatio));
      const interestReduction = Math.min(depositInterestEarned, Math.max(0, amount - principalReduction));
      setDeposit((current) => current - amount);
      setDepositPrincipal((current) => Math.max(0, current - principalReduction));
      setDepositInterestEarned((current) => Math.max(0, current - interestReduction));
      setCash((current) => current + amount);
    }
    addTradeLog('예금 해지', `${formatWon(amount)} 인출`);
    showToast({ title: '예금 해지 완료', message: `${formatWon(amount)}을 현금으로 옮겼습니다.`, tone: 'success' });
  }

  return (
    <div className="app-shell">
      <AppHeader setView={setView} hostAuthenticated={hostAuthenticated} studentEntryAllowed={studentEntryAllowed} />
      {view === 'home' ? (
        <HomeView
          setView={setView}
          roomPin={roomPin}
          round={round}
          totalRounds={totalRounds}
          gameStarted={gameStarted}
          playerCount={playerCount}
          baseRate={baseRate}
          exchangeRate={exchangeRate}
          unemploymentRate={unemploymentRate}
          expiresAt={expiresAt}
          roomExpired={roomExpired}
          syncStatus={syncStatus}
          studentEntryAllowed={studentEntryAllowed}
          onCreateRoom={createNewRoom}
          hostAuthenticated={hostAuthenticated}
          studentJoined={joined}
        />
      ) : null}
      {view === 'host-login' && !joined ? (
        <HostLoginView login={hostLogin} error={hostLoginError} onLoginChange={setHostLogin} onSubmit={handleHostLogin} />
      ) : null}
      {view === 'host' && hostAuthenticated && !joined ? (
        <HostView
          roomReady={roomReady}
          roomPin={roomPin}
          hostId={hostId}
          round={round}
          totalRounds={totalRounds}
          phase={phase}
          roomMode={roomMode}
          volatilityMode={volatilityMode}
          economicSeed={economicSeed}
          gameStarted={gameStarted}
          isPaused={isPaused}
          assets={assets}
          teamAccounts={teamAccounts}
          players={players}
          rankingPlayers={displayedPlayers}
          newsFeed={newsFeed}
          baseRate={baseRate}
          propertyIndex={propertyIndex}
          exchangeRate={exchangeRate}
          unemploymentRate={unemploymentRate}
          priceIndex={priceIndex}
          activeStudent={activeStudent}
          expiresAt={expiresAt}
          roomExpired={roomExpired}
          issueDraft={issueDraft}
          currentRoundEvents={currentRoundEvents}
          triggeredEventsByRound={triggeredEventsByRound}
          activeMacroAlerts={activeMacroAlerts}
          macroTimeline={macroTimeline}
          macroAlertsByRound={macroAlertsByRound}
          pendingMacroAlerts={pendingMacroAlerts}
          initialSeedSensitivity={initialSeedSensitivity}
          latestRoundSummary={latestRoundSummary}
          submissions={submissions}
          syncStatus={syncStatus}
          gameFinished={gameFinished}
          finalRoundClosed={finalRoundClosed}
          finalReportsDownloaded={finalReportsDownloaded}
          submittedCount={submittedCount}
          participantCount={participantCount}
          allSubmissionsComplete={allSubmissionsComplete}
          canEndGame={canEndGame}
          resetDialogOpen={resetDialogOpen}
          resetPassword={resetPassword}
          resetError={resetError}
          onCreateRoom={createNewRoom}
          onGameStart={handleGameStart}
          onRoomModeChange={handleRoomModeChange}
          onTotalRoundsChange={handleTotalRoundsChange}
          onVolatilityModeChange={setVolatilityMode}
          onIssueDraftChange={setIssueDraft}
          onStartRound={handleStartRound}
          onCloseRound={handleCloseRound}
          onNextRound={handleNextRound}
          onTogglePause={async () => {
            const nextPaused = !isPaused;
            setIsPaused(nextPaused);
            if (remoteRoomId) {
              try {
                await updateRemoteRoom(remoteRoomId, { is_paused: nextPaused });
              } catch (error) {
                setSyncStatus(`일시정지 저장 실패: ${error.message}`);
              }
            }
          }}
          onEndGame={handleEndGame}
          onRequestReset={handleRequestReset}
          onCancelReset={handleCancelReset}
          onConfirmReset={handleConfirmReset}
          onResetPasswordChange={setResetPassword}
          onRegisterIssue={handleRegisterIssue}
          onCancelIssue={handleCancelIssue}
          onClearIssues={handleClearIssues}
          startIssueChoiceOpen={startIssueChoiceOpen}
          onStartWithoutIssues={() => handleStartRound('none')}
          onStartWithRandomIssues={() => handleStartRound('random')}
          onCloseStartIssueChoice={() => setStartIssueChoiceOpen(false)}
          onCloseSubmissions={handleCloseSubmissions}
          onDownloadSubmissions={handleDownloadSubmissions}
          salaryPaidRounds={salaryPaidRounds}
          tradeLogs={tradeLogs}
        />
      ) : null}
      {view === 'host' && !hostAuthenticated && !joined ? (
        <HostLoginView login={hostLogin} error={hostLoginError} onLoginChange={setHostLogin} onSubmit={handleHostLogin} />
      ) : null}
      {view === 'student' ? (
        <StudentView
          roomPin={roomPin}
          round={round}
          phase={phase}
          roomMode={roomMode}
          assets={assets}
          newsFeed={newsFeed}
          portfolio={effectivePortfolio}
          cash={effectiveCash}
          deposit={effectiveDeposit}
          depositInterestEarned={effectiveDepositInterestEarned}
          investedPrincipal={investedPrincipal}
          baseRate={baseRate}
          propertyIndex={propertyIndex}
          exchangeRate={exchangeRate}
          unemploymentRate={unemploymentRate}
          priceIndex={priceIndex}
          demandPullCumulative={demandPullCumulative}
          tradeLogs={tradeLogs}
          roundLogs={roundLogs}
          reflection={reflection}
          playerCount={playerCount}
          roomFull={roomFull}
          currentRoundEvents={publicCurrentRoundEvents}
          activeMacroAlerts={activeMacroAlerts}
          macroAlertsByRound={macroAlertsByRound}
          roundResults={roundResults}
          macroTimeline={macroTimeline}
          latestRoundSummary={latestRoundSummary}
          gameFinished={gameFinished}
          gameStarted={gameStarted}
          submittedReport={submittedReport}
          nickname={nickname}
          setNickname={setNickname}
          studentNumber={studentNumber}
          setStudentNumber={setStudentNumber}
          studentPasscode={studentPasscode}
          setStudentPasscode={setStudentPasscode}
          studentJoinError={studentJoinError}
          joined={joined}
          onJoin={handleStudentJoin}
          teamAccounts={teamAccounts}
          selectedTeamKey={selectedTeamKey}
          setSelectedTeamKey={setSelectedTeamKey}
          activeTeam={activeTeam}
          teamTradeAllowed={teamTradeAllowed}
          onClaimTeamTrade={handleClaimTeamTrade}
          onReleaseTeamTrade={handleReleaseTeamTrade}
          selectedAssetId={selectedAssetId}
          setSelectedAssetId={setSelectedAssetId}
          tradeAmount={tradeAmount}
          setTradeAmount={setTradeAmount}
          depositAmount={depositAmount}
          setDepositAmount={setDepositAmount}
          onBuy={handleBuy}
          onSell={handleSell}
          tradePending={tradePending}
          onDeposit={handleDeposit}
          onWithdrawDeposit={handleWithdrawDeposit}
          onSubmitReport={handleSubmitReport}
          onReflectionChange={handleReflectionChange}
          roundNotes={roundNotes}
          roundNoteDrafts={roundNoteDrafts}
          roundNoteSaveStates={roundNoteSaveStates}
          onRoundNoteDraftChange={handleRoundNoteDraftChange}
          onRoundNoteSave={handleRoundNoteSave}
          roundReflections={roundReflections}
          onRoundReflectionChange={handleRoundReflectionChange}
        />
      ) : null}
      <AppToast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
