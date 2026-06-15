import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgePercent,
  BellRing,
  Building2,
  ChartNoAxesCombined,
  ChevronRight,
  Clock3,
  Globe2,
  Landmark,
  LogIn,
  Megaphone,
  Pause,
  PiggyBank,
  Play,
  Radio,
  School,
  Smartphone,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabaseConfigured } from './lib/supabaseClient.js';

const INITIAL_CASH = 100_000_000;
const TOTAL_ROUNDS = 12;
const MAX_PLAYERS_PER_ROOM = 40;
const INITIAL_BASE_RATE = 3.5;
const MAX_EVENTS_PER_ROUND = 5;
const DEFAULT_EVENT_PROBABILITY = 0.75;
const DELISTING_START_ROUND = 9;
const DELISTING_PROBABILITY = 0.2;
const STRONG_NEGATIVE_IMPACT = -0.07;
const MIN_EVENT_IMPACT = 0.1;
const PASSIVE_MARKET_MOVE = 0.05;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const HOST_CREDENTIALS = {
  id: 'geography',
  password: '72727272',
};

const phaseLabels = {
  setup: '라운드 준비',
  open: '장 진행 중',
  closed: '장 마감',
  ended: '게임 종료',
  expired: '방 만료',
};

const initialTradableAssets = [
  { id: 'neo', type: 'stock', country: '한국', name: '네오모빌리티', sector: '전기차/자율주행', priceOptions: [86_000, 126_000, 168_000], color: '#2563eb' },
  { id: 'core', type: 'stock', country: '미국', name: '코어실리콘', sector: '반도체', priceOptions: [312_000, 482_000, 548_000], color: '#7c3aed' },
  { id: 'eco', type: 'stock', country: '한국', name: '에코에너지', sector: '재생에너지', priceOptions: [48_000, 74_000, 96_000], color: '#059669' },
  { id: 'oil', type: 'stock', country: '한국', name: '글로벌오일', sector: '정유/원자재', priceOptions: [63_000, 93_000, 118_000], color: '#b45309' },
  { id: 'enter', type: 'stock', country: '미국', name: '유니버스엔터', sector: '미디어/콘텐츠', priceOptions: [38_000, 58_000, 82_000], color: '#db2777' },
  { id: 'food', type: 'stock', country: '한국', name: '미래푸드', sector: '식품/바이오소재', priceOptions: [18_500, 31_500, 46_000], color: '#16a34a' },
  { id: 'air', type: 'stock', country: '한국', name: '스카이항공', sector: '항공/여행', priceOptions: [9_800, 18_200, 27_500], color: '#0891b2' },
  { id: 'bank', type: 'stock', country: '한국', name: '대한은행', sector: '금융', priceOptions: [37_000, 51_000, 68_000], color: '#475569' },
  { id: 'medi', type: 'stock', country: '미국', name: '메디케어', sector: '헬스케어', priceOptions: [142_000, 211_000, 286_000], color: '#0d9488' },
  { id: 'infra', type: 'stock', country: '한국', name: '한빛인프라', sector: '건설/인프라', priceOptions: [5_400, 8_700, 13_800], color: '#ea580c' },
  { id: 'sp500', type: 'etf', country: '미국', name: 'S&P 500 ETF', sector: '미국 대표지수', priceOptions: [48_000, 62_000, 76_000], color: '#1d4ed8' },
  { id: 'kospi', type: 'etf', country: '한국', name: 'KOSPI 200 ETF', sector: '한국 대표지수', priceOptions: [27_500, 34_500, 42_000], color: '#0f766e' },
  { id: 'realty', type: 'property', country: '한국', name: '도시부동산지수', sector: '주거/상업 부동산', priceOptions: [180_000, 250_000, 320_000], color: '#a16207' },
];

function createRandomizedAssets() {
  return initialTradableAssets.map((asset) => {
    const price = asset.priceOptions[Math.floor(Math.random() * asset.priceOptions.length)];
    return {
      ...asset,
      price,
      history: [Math.round(price * 0.96), Math.round(price * 0.985), price],
    };
  });
}

const assetTypeLabels = {
  stock: '주식',
  etf: 'ETF',
  property: '부동산',
};

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
    impact: { bank: 0.08, infra: -0.07, air: -0.05, enter: -0.04, neo: -0.03, realty: -0.08, kospi: -0.03, sp500: -0.02 },
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
    impact: { realty: 0.09, infra: 0.05, neo: 0.04, enter: 0.04, bank: -0.04, kospi: 0.04, sp500: 0.03 },
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
    impact: { bank: 0.05, enter: -0.02, neo: -0.02, realty: -0.03 },
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
    impact: { realty: 0.12, infra: 0.05, bank: 0.03, kospi: 0.02 },
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
    impact: { sp500: 0.1, core: 0.04, kospi: 0.02 },
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
    impact: { kospi: 0.09, core: 0.06, neo: 0.03, bank: 0.02 },
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
    impact: { core: -0.11, neo: -0.08, eco: -0.04, oil: 0.04, kospi: -0.03 },
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
    impact: { infra: 0.16, realty: 0.06, core: 0.05, bank: 0.03, eco: 0.02 },
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
    impact: { core: -0.1, enter: -0.08, medi: -0.07, sp500: -0.05, kospi: 0.01 },
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
    impact: { neo: 0.04, core: 0.03, kospi: 0.03, sp500: 0.04, air: -0.08, food: -0.03 },
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
    impact: { core: -0.12, kospi: -0.05, neo: -0.04, sp500: -0.03 },
  },
];

const mockPlayers = [
  { id: 'p1', name: '민준', returnRate: 12.8, cash: 14_200_000 },
  { id: 'p2', name: '서연', returnRate: 8.4, cash: 23_800_000 },
  { id: 'p3', name: '지후', returnRate: 5.1, cash: 31_600_000 },
  { id: 'p4', name: '하은', returnRate: -1.7, cash: 48_300_000 },
  { id: 'p5', name: '도윤', returnRate: -4.2, cash: 55_900_000 },
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
  return `${origin}/?view=student&pin=${roomPin}`;
}

function getInitialRoomPin() {
  if (typeof window === 'undefined') return '428915';
  const pinFromUrl = new URLSearchParams(window.location.search).get('pin');
  return pinFromUrl && /^[0-9]{6}$/.test(pinFromUrl) ? pinFromUrl : '428915';
}

function getInitialView() {
  if (typeof window === 'undefined') return 'home';
  return new URLSearchParams(window.location.search).get('view') === 'student' ? 'student' : 'home';
}

function getPortfolioValue(portfolio, assets) {
  return assets.reduce((sum, asset) => sum + (portfolio[asset.id] ?? 0) * asset.price, 0);
}

function getTotalAsset({ cash, deposit, portfolio, assets }) {
  return cash + deposit + getPortfolioValue(portfolio, assets);
}

function getHoldingSummary(portfolio, assets) {
  const rows = getHoldingRows(portfolio, assets);
  return rows.length
    ? rows.map(({ asset, shares }) => `${asset.name} ${shares.toLocaleString('ko-KR')}주`).join(', ')
    : '보유 종목 없음';
}

function getPassiveMarketMove() {
  return Number(((Math.random() * 2 - 1) * PASSIVE_MARKET_MOVE).toFixed(3));
}

function normalizeEventImpact(impact = {}) {
  return Object.fromEntries(
    Object.entries(impact).map(([assetId, value]) => {
      if (value === 0) return [assetId, 0];
      const direction = value > 0 ? 1 : -1;
      const adjustedValue = direction * Math.max(Math.abs(value), MIN_EVENT_IMPACT);
      return [assetId, Number(adjustedValue.toFixed(3))];
    }),
  );
}

function moveAssetsLocally(currentAssets, modifier = {}, delistedIds = [], roundNumber = 1) {
  return currentAssets.map((asset) => {
    if (asset.delisted) return asset;
    if (delistedIds.includes(asset.id)) {
      return {
        ...asset,
        delisted: true,
        delistedRound: roundNumber,
        price: 0,
        history: [...asset.history, 0].slice(-13),
      };
    }
    const eventImpact = modifier[asset.id] ?? 0;
    const marketMove = getPassiveMarketMove();
    const nextPrice = Math.max(1000, Math.round((asset.price * (1 + marketMove + eventImpact)) / 100) * 100);
    return {
      ...asset,
      price: nextPrice,
      history: [...asset.history, nextPrice].slice(-13),
    };
  });
}

function getChange(asset) {
  const before = asset.history.at(-2) ?? asset.price;
  if (!before) return 0;
  return ((asset.price - before) / before) * 100;
}

function getDepositRate(baseRate) {
  return Math.max(0.5, baseRate + 0.8);
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
    'property-ease': '부동산 규제 완화 = 집이나 건물을 사기 쉬워짐',
    'us-rally': '미국 증시 강세 = 글로벌 투자 분위기 개선',
    'korea-export': '한국 수출 호조 = 국내 기업 실적 기대 증가',
    rare: '희토류 통제 = 핵심 원재료 공급 불안',
    housing: '인프라 예산 확대 = 정부가 관련 산업에 돈을 더 씀',
    'us-regulation': '미국 기술 규제 = 미국 기업 성장 부담',
    'fx-spike': '환율 급등 = 수출입 기업의 손익 변화',
    'korea-us-chip-tension': '국가 간 반도체 갈등 = 공급망 불확실성 증가',
  };

  return explanations[getEventKey(event)] ?? '뉴스가 투자자의 기대를 바꾸면 가격도 움직일 수 있습니다.';
}

function getCausalChain(event) {
  const chains = {
    'rate-up': ['이자가 오름', '대출 부담 증가', '부동산·성장주 부담'],
    'rate-down': ['이자가 내려감', '투자·소비 기대 증가', '부동산·성장주 선호'],
    'deposit-special': ['예금 이자 증가', '안전자산 선호', '위험자산 수요 둔화'],
    'property-ease': ['규제 부담 감소', '거래 기대 증가', '부동산·건설주 선호'],
    'us-rally': ['미국 대형주 기대 증가', '글로벌 투자심리 개선', '미국 ETF 상승 압력'],
    'korea-export': ['수출 증가', '기업 매출 기대 증가', 'KOSPI·제조업 상승 압력'],
    rare: ['원재료 공급 불안', '생산 비용 증가', '제조업 하락 압력'],
    housing: ['정부 투자 확대', '수주 기대 증가', '인프라·부동산 상승 압력'],
    'us-regulation': ['미국 규제 강화', '비용·성장 부담', '미국 기술주 하락 압력'],
    'fx-spike': ['달러 강세', '수출입 손익 변화', '업종별 주가 차별화'],
    'korea-us-chip-tension': ['정책 갈등', '수출·보조금 불확실', '반도체주 하락 압력'],
  };

  return chains[getEventKey(event)] ?? ['뉴스 발생', '기대 변화', '가격 변동'];
}

function getResultLabel(event, compact) {
  if (event.outcomeType === 'event') return compact ? '뉴스가 가격을 움직였어요' : '실제 이벤트 발생';
  if (event.outcomeType === 'expectation') return compact ? '기대감이 가격을 움직였어요' : '이슈 기대감 반영';
  if (event.outcomeType === 'failed') return compact ? '뉴스가 실패했어요' : '이슈 실패';
  return event.didApply ? '영향 반영' : '영향 미반영';
}

function getResultClass(event) {
  if (event.outcomeType === 'event') return 'applied';
  if (event.outcomeType === 'expectation') return 'expectation';
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

function RoundExplanation({ summary, assets, compact = false }) {
  if (!summary?.events?.length) {
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
        {summary.events.map((event, index) => {
          const movers = getEventMovers(event, assets);
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
              {!compact && event.didApply !== false ? (
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
              {event.didApply === false ? (
                <p className="no-impact">
                  <strong>{event.failureTitle}</strong>
                  <span>{event.failureDetail}</span>
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

function TeacherStudentMonitor({ players, activeStudent, assets }) {
  const sampleHoldings = {
    p1: ['core', 'sp500'],
    p2: ['neo', 'kospi'],
    p3: ['bank', 'realty'],
    p4: ['eco', 'food'],
    p5: ['air', 'infra'],
  };

  const monitoredStudents = [
    activeStudent,
    ...players.map((player) => {
      const holdingNames = (sampleHoldings[player.id] ?? []).map((id) => assets.find((asset) => asset.id === id)?.name).filter(Boolean);
      return {
        id: player.id,
        name: player.name,
        totalAsset: Math.round(INITIAL_CASH * (1 + player.returnRate / 100)),
        holdings: holdingNames,
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
              <span>{formatWon(student.totalAsset)}</span>
            </div>
            <p>{student.holdings.length ? student.holdings.join(', ') : '보유 종목 없음'}</p>
          </article>
        ))}
      </div>
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

function RoomExpiryNotice({ roomPin, expiresAt, expired, onCreateRoom }) {
  return (
    <section className={expired ? 'expiry-notice expired' : 'expiry-notice'} aria-label="방 유지 시간">
      <div>
        <strong>{expired ? '방이 자동 폐기되었습니다.' : `방 ${roomPin} 유지 중`}</strong>
        <span>{expired ? '24시간이 지나 새 방 생성이 필요합니다.' : `${formatDateTime(expiresAt)}까지 유지됩니다.`}</span>
      </div>
      <button className="command secondary" type="button" onClick={onCreateRoom}>
        <Radio size={18} aria-hidden="true" />
        새 방 생성
      </button>
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
  cash,
  deposit,
  portfolio,
  assets,
  tradeLogs,
  roundLogs,
  reflection,
  onReflectionChange,
}) {
  const holdingsValue = getPortfolioValue(portfolio, assets);
  const totalAsset = cash + deposit + holdingsValue;
  const returnRate = ((totalAsset - INITIAL_CASH) / INITIAL_CASH) * 100;

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
          <span>최종 자산</span>
          <strong>{formatWon(totalAsset)}</strong>
        </div>
        <div>
          <span>최종 수익률</span>
          <strong className={returnRate >= 0 ? 'up' : 'down'}>{formatPercent(returnRate)}</strong>
        </div>
      </div>

      <div className="report-section">
        <h3>최종 보유 현황</h3>
        <p>{getHoldingSummary(portfolio, assets)}</p>
        <p>현금 {formatWon(cash)} · 예금 {formatWon(deposit)}</p>
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
        {roundLogs.length ? (
          <div className="report-list">
            {roundLogs.map((log) => (
              <article key={log.id}>
                <strong>{log.round}라운드 · {formatWon(log.totalAsset)}</strong>
                <span>{log.events}</span>
                <em>{log.holdings}</em>
              </article>
            ))}
          </div>
        ) : (
          <p>라운드 마감 기록이 아직 없습니다.</p>
        )}
      </div>

      <div className="reflection-grid print-hide">
        <label>
          잘한 점
          <textarea value={reflection.good} onChange={(event) => onReflectionChange('good', event.target.value)} />
        </label>
        <label>
          부족한 점
          <textarea value={reflection.improve} onChange={(event) => onReflectionChange('improve', event.target.value)} />
        </label>
        <label>
          다음에는 어떻게 할 것인가
          <textarea value={reflection.next} onChange={(event) => onReflectionChange('next', event.target.value)} />
        </label>
      </div>

      <div className="report-section print-only">
        <h3>나의 투자 분석</h3>
        <p><strong>잘한 점</strong> {reflection.good || '작성 전'}</p>
        <p><strong>부족한 점</strong> {reflection.improve || '작성 전'}</p>
        <p><strong>다음에는 어떻게 할 것인가</strong> {reflection.next || '작성 전'}</p>
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
};

function MacroGuide({ baseRate, depositRate, propertyAsset }) {
  const [selectedGuide, setSelectedGuide] = useState('baseRate');
  const item = macroGuideItems[selectedGuide];
  const currentValue = {
    baseRate: `${baseRate.toFixed(1)}%`,
    depositRate: `${depositRate.toFixed(1)}%`,
    propertyIndex: propertyAsset ? formatWon(propertyAsset.price) : '-',
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

function AppHeader({ view, setView, hostAuthenticated }) {
  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={() => setView('home')} aria-label="홈으로 이동">
        <ChartNoAxesCombined size={26} aria-hidden="true" />
        <span>
          Market Class
          <small>실시간 자산 투자 수업</small>
        </span>
      </button>

      <nav className="view-switch" aria-label="화면 전환">
        <button className={view === 'host' || view === 'host-login' ? 'active' : ''} type="button" onClick={() => setView(hostAuthenticated ? 'host' : 'host-login')}>
          <School size={18} aria-hidden="true" />
          교사
        </button>
        <button className={view === 'student' ? 'active' : ''} type="button" onClick={() => setView('student')}>
          <Smartphone size={18} aria-hidden="true" />
          학생
        </button>
      </nav>
    </header>
  );
}

function HomeView({ setView, roomPin, round, playerCount, baseRate, expiresAt, roomExpired, onCreateRoom, hostAuthenticated }) {
  return (
    <main className="home-view">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">12라운드 · 1억 원 초기 자본 · 방당 최대 {MAX_PLAYERS_PER_ROOM}명</p>
          <h1>모의 투자 시뮬레이터</h1>
          <p className="hero-subtitle">화성에 갈까, 바닥 밑 지하실로 갈까?</p>
          <p className="intro">
            뉴스와 금리, 예금, ETF, 부동산 지수를 보며 1억 원의 자산을 직접 배분하고 결과를 해석합니다.
          </p>
          <div className="hero-actions">
            <button className="command primary" type="button" onClick={() => setView(hostAuthenticated ? 'host' : 'host-login')}>
              <School size={20} aria-hidden="true" />
              교사용 대시보드
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button className="command secondary" type="button" onClick={() => setView('student')}>
              <LogIn size={20} aria-hidden="true" />
              학생 입장 화면
            </button>
            <button className="command secondary" type="button" onClick={onCreateRoom}>
              <Radio size={20} aria-hidden="true" />
              새 방 생성
            </button>
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
              <strong>{round}/{TOTAL_ROUNDS}</strong>
              <span>현재 라운드</span>
            </div>
            <div>
              <Users size={19} aria-hidden="true" />
              <strong>{playerCount}/{MAX_PLAYERS_PER_ROOM}</strong>
              <span>접속 인원</span>
            </div>
            <div>
              <Landmark size={19} aria-hidden="true" />
              <strong>{baseRate.toFixed(1)}%</strong>
              <span>기준금리</span>
            </div>
            <div>
              <PiggyBank size={19} aria-hidden="true" />
              <strong>{getDepositRate(baseRate).toFixed(1)}%</strong>
              <span>예금금리</span>
            </div>
          </div>
          <p className="sync-note">
            {supabaseConfigured ? 'Supabase 연결 정보가 감지되었습니다.' : '환경변수를 추가하면 Supabase Realtime으로 연결할 수 있습니다.'}
          </p>
          <JoinQrCard roomPin={roomPin} />
          <RoomExpiryNotice roomPin={roomPin} expiresAt={expiresAt} expired={roomExpired} onCreateRoom={onCreateRoom} />
        </aside>
      </section>
    </main>
  );
}

function HostView({
  roomPin,
  round,
  phase,
  isPaused,
  assets,
  players,
  newsFeed,
  baseRate,
  activeStudent,
  expiresAt,
  roomExpired,
  issueDraft,
  currentRoundEvents,
  latestRoundSummary,
  onCreateRoom,
  onIssueDraftChange,
  onStartRound,
  onCloseRound,
  onNextRound,
  onTogglePause,
  onEndGame,
  onRegisterIssue,
}) {
  const propertyAsset = assets.find((asset) => asset.type === 'property');
  const eventLimitReached = currentRoundEvents.length >= MAX_EVENTS_PER_ROUND;
  const canRegisterIssue = phase === 'setup' && !eventLimitReached && !roomExpired;

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

        <RoomExpiryNotice roomPin={roomPin} expiresAt={expiresAt} expired={roomExpired} onCreateRoom={onCreateRoom} />
        <JoinQrCard roomPin={roomPin} />

        <div className="control-strip">
          <div className="round-meter">
            <span>Round</span>
            <strong>{round}</strong>
            <small>/ {TOTAL_ROUNDS} 분기</small>
          </div>
          <button className="command secondary" type="button" onClick={onCreateRoom}>
            <Radio size={19} aria-hidden="true" />
            새 방 생성
          </button>
          <button className="command primary" type="button" onClick={onStartRound} disabled={roomExpired || phase !== 'setup' || currentRoundEvents.length === 0}>
            <Play size={19} aria-hidden="true" />
            라운드 시작
          </button>
          <button className="command primary" type="button" onClick={onCloseRound} disabled={roomExpired || phase !== 'open'}>
            <Activity size={19} aria-hidden="true" />
            장 마감
          </button>
          <button className="command secondary" type="button" onClick={onNextRound} disabled={roomExpired || phase !== 'closed' || round >= TOTAL_ROUNDS}>
            <ChevronRight size={19} aria-hidden="true" />
            다음 라운드 준비
          </button>
          <button className="command secondary" type="button" onClick={onTogglePause}>
            {isPaused ? <Play size={19} aria-hidden="true" /> : <Pause size={19} aria-hidden="true" />}
            {isPaused ? '재개' : '일시 정지'}
          </button>
          <button className="command danger" type="button" onClick={onEndGame}>
            게임 종료
          </button>
        </div>

        <section className="macro-panel" aria-label="거시 지표">
          <div>
            <Landmark size={20} aria-hidden="true" />
            <span>기준금리</span>
            <strong>{baseRate.toFixed(1)}%</strong>
          </div>
          <div>
            <PiggyBank size={20} aria-hidden="true" />
            <span>예금금리</span>
            <strong>{getDepositRate(baseRate).toFixed(1)}%</strong>
          </div>
          <div>
            <Building2 size={20} aria-hidden="true" />
            <span>부동산지수</span>
            <strong>{propertyAsset ? formatWon(propertyAsset.price) : '-'}</strong>
          </div>
          <div>
            <Globe2 size={20} aria-hidden="true" />
            <span>ETF</span>
            <strong>S&P 500 · KOSPI</strong>
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
          <div className="event-grid">
            {scenarioEvents.map((event) => (
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

        <IssueTicker events={currentRoundEvents} phase={phase} />
        <RoundExplanation summary={latestRoundSummary} assets={assets} />
        <CloseDashboard phase={phase} players={players} />
        <TeacherStudentMonitor players={players} activeStudent={activeStudent} assets={assets} />

        <section className="market-board" aria-labelledby="market-heading">
          <div className="panel-heading">
            <Activity size={22} aria-hidden="true" />
            <h2 id="market-heading">전체 자산 시황판</h2>
          </div>
          <div className="stock-table">
            {assets.map((asset) => {
              const change = getChange(asset);
              return (
                <article className="stock-row" key={asset.id}>
                  <div className="stock-name">
                    <span style={{ background: asset.color }} />
                    <div>
                      <strong>{asset.name}</strong>
                      <small>{asset.country} · {assetTypeLabels[asset.type]} · {asset.sector}</small>
                    </div>
                  </div>
                  <Sparkline history={asset.history} color={asset.color} />
                  <div className="stock-price">
                    <strong>{formatAssetPrice(asset)}</strong>
                    <small className={change >= 0 ? 'up' : 'down'}>{formatPercent(change)}</small>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      <aside className="host-sidebar">
        <section className="ranking-panel">
          <div className="panel-heading">
            <Trophy size={22} aria-hidden="true" />
            <h2>실시간 수익률 랭킹</h2>
          </div>
          <ol className="ranking-list">
            {[...players].sort((a, b) => b.returnRate - a.returnRate).map((player, index) => (
              <li key={player.id}>
                <span className="rank">{index + 1}</span>
                <strong>{player.name}</strong>
                {phase === 'closed' ? <em>{index + 1}위</em> : <em className={player.returnRate >= 0 ? 'up' : 'down'}>{formatPercent(player.returnRate)}</em>}
              </li>
            ))}
          </ol>
        </section>

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

function StudentView({
  roomPin,
  round,
  phase,
  assets,
  newsFeed,
  portfolio,
  cash,
  deposit,
  baseRate,
  tradeLogs,
  roundLogs,
  reflection,
  playerCount,
  roomFull,
  currentRoundEvents,
  latestRoundSummary,
  gameFinished,
  nickname,
  setNickname,
  joined,
  setJoined,
  selectedAssetId,
  setSelectedAssetId,
  tradeAmount,
  setTradeAmount,
  depositAmount,
  setDepositAmount,
  onBuy,
  onSell,
  onDeposit,
  onWithdrawDeposit,
  onReflectionChange,
}) {
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  const holdingsValue = assets.reduce((sum, asset) => sum + (portfolio[asset.id] ?? 0) * asset.price, 0);
  const totalAsset = cash + deposit + holdingsValue;
  const returnRate = ((totalAsset - INITIAL_CASH) / INITIAL_CASH) * 100;
  const selectedShares = portfolio[selectedAsset.id] ?? 0;
  const selectedHoldingValue = selectedShares * selectedAsset.price;
  const depositRate = getDepositRate(baseRate);
  const nextInterest = deposit * (depositRate / 100 / 4);
  const propertyAsset = assets.find((asset) => asset.type === 'property');

  if (!joined) {
    return (
      <main className="join-screen">
        <section className="phone-frame join-card">
          <div className="mobile-notch" />
          <p className="eyebrow">학생 입장</p>
          <h1>PIN과 닉네임을 입력하세요.</h1>
          <label>
            방 PIN
            <input value={roomPin} readOnly aria-label="방 PIN" />
          </label>
          <div className={roomFull ? 'capacity-note full' : 'capacity-note'}>
            <strong>{playerCount}/{MAX_PLAYERS_PER_ROOM}</strong>
            <span>{roomFull ? '정원이 찼습니다.' : '현재 접속 인원'}</span>
          </div>
          <label>
            닉네임
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="예: 지민" aria-label="닉네임" />
          </label>
          <button className="command primary wide" type="button" onClick={() => setJoined(true)} disabled={!nickname.trim() || roomFull}>
            <LogIn size={19} aria-hidden="true" />
            {roomFull ? '정원 마감' : '입장하기'}
          </button>
          <p className="help-text">입장 시 가상 투자금 {formatWon(INITIAL_CASH)}이 지급됩니다. 방당 최대 {MAX_PLAYERS_PER_ROOM}명까지 참여할 수 있습니다.</p>
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
            <strong>{nickname}</strong>
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

        <IssueTicker events={currentRoundEvents} phase={phase} compact />
        {phase === 'closed' ? <RoundExplanation summary={latestRoundSummary} assets={assets} compact /> : null}
        {gameFinished ? (
          <FinalReport
            nickname={nickname}
            cash={cash}
            deposit={deposit}
            portfolio={portfolio}
            assets={assets}
            tradeLogs={tradeLogs}
            roundLogs={roundLogs}
            reflection={reflection}
            onReflectionChange={onReflectionChange}
          />
        ) : null}

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

        <MacroGuide baseRate={baseRate} depositRate={depositRate} propertyAsset={propertyAsset} />

        <section className="deposit-ticket" aria-labelledby="deposit-heading">
          <div>
            <h2 id="deposit-heading">예금 계좌</h2>
            <span>다음 라운드 예상 이자 {formatWon(nextInterest)}</span>
          </div>
          <label>
            예금 금액
            <input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} inputMode="numeric" aria-label="예금 금액" />
          </label>
          <div className="trade-actions compact">
            <button className="save" type="button" onClick={onDeposit} disabled={gameFinished}>
              예금하기
            </button>
            <button className="withdraw" type="button" onClick={onWithdrawDeposit} disabled={gameFinished}>
              해지하기
            </button>
          </div>
        </section>

        <section className="mobile-stock-list" aria-label="투자 상품 목록">
          {assets.map((asset) => {
            const change = getChange(asset);
            return (
              <button className={selectedAssetId === asset.id ? 'selected' : ''} type="button" key={asset.id} onClick={() => setSelectedAssetId(asset.id)}>
                <span style={{ background: asset.color }} />
                <strong>{asset.name}</strong>
                <small>{asset.country}</small>
                <small>{formatAssetPrice(asset)}</small>
                <em className={change >= 0 ? 'up' : 'down'}>{formatPercent(change)}</em>
              </button>
            );
          })}
        </section>

        <section className="trade-ticket" aria-labelledby="trade-heading">
          <div className="ticket-head">
            <div>
              <h2 id="trade-heading">{selectedAsset.name}</h2>
              <span>{selectedAsset.country} · {assetTypeLabels[selectedAsset.type]} · {selectedAsset.sector} · 보유 {selectedShares.toLocaleString('ko-KR')}주</span>
            </div>
            <Sparkline history={selectedAsset.history} color={selectedAsset.color} />
          </div>

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
            <button className="buy" type="button" onClick={onBuy} disabled={gameFinished || selectedAsset.delisted}>
              {gameFinished ? '종료' : selectedAsset.delisted ? '거래중단' : '매수'}
            </button>
            <button className="sell" type="button" onClick={onSell} disabled={gameFinished || selectedAsset.delisted}>
              매도
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}

export function App() {
  const [view, setView] = useState(getInitialView);
  const [hostAuthenticated, setHostAuthenticated] = useState(false);
  const [hostLogin, setHostLogin] = useState({ id: '', password: '' });
  const [hostLoginError, setHostLoginError] = useState('');
  const [roomPin, setRoomPin] = useState(getInitialRoomPin);
  const [roomCreatedAt, setRoomCreatedAt] = useState(() => Date.now());
  const [roomExpired, setRoomExpired] = useState(false);
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState('setup');
  const [isPaused, setIsPaused] = useState(false);
  const [baseRate, setBaseRate] = useState(INITIAL_BASE_RATE);
  const [assets, setAssets] = useState(() => createRandomizedAssets());
  const [triggeredEventsByRound, setTriggeredEventsByRound] = useState({});
  const [latestRoundSummary, setLatestRoundSummary] = useState(null);
  const [issueDraft, setIssueDraft] = useState('');
  const [newsFeed, setNewsFeed] = useState([
    { id: 'opening', round: 1, title: '장 시작', detail: '모든 학생에게 초기 자본 1억 원이 지급되었습니다.' },
  ]);
  const [players, setPlayers] = useState(mockPlayers);
  const [nickname, setNickname] = useState('지민');
  const [joined, setJoined] = useState(false);
  const [cash, setCash] = useState(INITIAL_CASH);
  const [deposit, setDeposit] = useState(0);
  const [portfolio, setPortfolio] = useState({});
  const [selectedAssetId, setSelectedAssetId] = useState(initialTradableAssets[0].id);
  const [tradeAmount, setTradeAmount] = useState('10000000');
  const [depositAmount, setDepositAmount] = useState('10000000');
  const [tradeLogs, setTradeLogs] = useState([]);
  const [roundLogs, setRoundLogs] = useState([]);
  const [reflection, setReflection] = useState({ good: '', improve: '', next: '' });

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? assets[0],
    [selectedAssetId, assets],
  );
  const currentRoundEvents = triggeredEventsByRound[round] ?? [];
  const expiresAt = roomCreatedAt + ROOM_TTL_MS;
  const gameFinished = phase === 'ended' || (round === TOTAL_ROUNDS && phase === 'closed');
  const playerCount = players.length + (joined ? 1 : 0);
  const roomFull = !joined && playerCount >= MAX_PLAYERS_PER_ROOM;
  const studentHoldingsValue = getPortfolioValue(portfolio, assets);
  const activeStudent = {
    id: 'active-student',
    name: joined ? nickname : `${nickname || '학생'} (대기)`,
    totalAsset: cash + deposit + studentHoldingsValue,
    holdings: getHoldingRows(portfolio, assets).map(({ asset, shares }) => `${asset.name} ${shares.toLocaleString('ko-KR')}주`),
  };

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

  function pushNews(title, detail, targetRound = round) {
    setNewsFeed((current) => [{ id: `${Date.now()}-${title}`, round: targetRound, title, detail }, ...current].slice(0, 6));
  }

  function handleHostLogin(event) {
    event.preventDefault();
    if (hostLogin.id === HOST_CREDENTIALS.id && hostLogin.password === HOST_CREDENTIALS.password) {
      setHostAuthenticated(true);
      setHostLoginError('');
      setView('host');
      return;
    }
    setHostLoginError('아이디 또는 비밀번호가 맞지 않습니다.');
  }

  function addTradeLog(type, detail) {
    setTradeLogs((current) => [
      {
        id: `${Date.now()}-${type}-${current.length}`,
        round,
        type,
        detail,
      },
      ...current,
    ]);
  }

  function handleReflectionChange(key, value) {
    setReflection((current) => ({ ...current, [key]: value }));
  }

  function createNewRoom() {
    const nextPin = String(Math.floor(100000 + Math.random() * 900000));
    setRoomPin(nextPin);
    setRoomCreatedAt(Date.now());
    setRoomExpired(false);
    setRound(1);
    setPhase('setup');
    setIsPaused(false);
    setBaseRate(INITIAL_BASE_RATE);
    setAssets(createRandomizedAssets());
    setTriggeredEventsByRound({});
    setLatestRoundSummary(null);
    setIssueDraft('');
    setNewsFeed([{ id: `opening-${nextPin}`, round: 1, title: '새 방 생성', detail: '방마다 초기 가격 후보 3개 중 하나가 랜덤으로 배치되었습니다.' }]);
    setPlayers(mockPlayers);
    setCash(INITIAL_CASH);
    setDeposit(0);
    setPortfolio({});
    setSelectedAssetId(initialTradableAssets[0].id);
    setTradeAmount('10000000');
    setDepositAmount('10000000');
    setTradeLogs([]);
    setRoundLogs([]);
    setReflection({ good: '', improve: '', next: '' });
  }

  function handleNextRound() {
    if (roomExpired || round >= TOTAL_ROUNDS) return;
    const nextRound = Math.min(round + 1, TOTAL_ROUNDS);
    setRound(nextRound);
    setPhase('setup');
    setIssueDraft('');
    pushNews(`${nextRound}라운드 준비`, '교사가 새 이슈를 등록할 수 있습니다.', nextRound);
  }

  function handleRegisterIssue(event, issueOption = null) {
    if (roomExpired || currentRoundEvents.length >= MAX_EVENTS_PER_ROUND) return;

    const issueTitle = issueOption?.title ?? (issueDraft.trim() || event.title);
    const registeredEvent = {
      ...event,
      id: `${event.id}-${round}-${Date.now()}`,
      templateId: event.id,
      title: issueTitle,
      detail: issueOption?.detail ?? `${issueTitle} (${event.title} 유형)`,
      failureTitle: issueOption?.failureTitle ?? `${issueTitle} 영향 제한`,
      failureDetail: issueOption?.failureDetail ?? '후속 보도에서 이슈의 실제 영향이 크지 않은 것으로 확인됐습니다.',
      probability: event.probability ?? DEFAULT_EVENT_PROBABILITY,
    };

    setTriggeredEventsByRound((current) => ({
      ...current,
      [round]: [...(current[round] ?? []), registeredEvent],
    }));
    setIssueDraft('');
  }

  function handleStartRound() {
    if (roomExpired || !currentRoundEvents.length || phase !== 'setup') return;
    setPhase('open');
    pushNews(`${round}라운드 이슈 공개`, `${currentRoundEvents.length}개 이슈가 공개되었습니다. 가격은 장 마감 후 반영됩니다.`);
  }

  function handleCloseRound() {
    if (roomExpired || phase !== 'open') return;

    const resolvedEvents = currentRoundEvents.map((event) => {
      const didApply = Math.random() < (event.probability ?? DEFAULT_EVENT_PROBABILITY);
      const outcomeType = didApply ? (Math.random() < 0.7 ? 'event' : 'expectation') : 'failed';
      const adjustedImpact = normalizeEventImpact(event.impact);
      return {
        ...event,
        resolved: true,
        didApply,
        outcomeType,
        resolvedImpact: didApply ? adjustedImpact : {},
        expectationTitle: `${event.title} 실제 발표 전 기대감 선반영`,
        expectationDetail: '실제 이벤트가 확정되지는 않았지만, 투자자들이 가능성을 먼저 반영하면서 가격이 움직였습니다.',
      };
    });

    const combinedImpact = resolvedEvents.reduce((acc, event) => {
      if (!event.didApply) return acc;
      Object.entries(event.resolvedImpact).forEach(([assetId, value]) => {
        acc[assetId] = (acc[assetId] ?? 0) + value;
      });
      return acc;
    }, {});

    const baseRateDelta = resolvedEvents.reduce((sum, event) => sum + (event.outcomeType === 'event' ? event.baseRateDelta ?? 0 : 0), 0);
    if (baseRateDelta) {
      setBaseRate((current) => Math.max(0, Number((current + baseRateDelta).toFixed(1))));
    }

    const delistedAssets = round >= DELISTING_START_ROUND
      ? assets
          .filter((asset) => asset.type === 'stock' && !asset.delisted && (combinedImpact[asset.id] ?? 0) <= STRONG_NEGATIVE_IMPACT)
          .filter(() => Math.random() < DELISTING_PROBABILITY)
          .map((asset) => ({ id: asset.id, name: asset.name }))
      : [];

    const nextAssets = moveAssetsLocally(assets, combinedImpact, delistedAssets.map((asset) => asset.id), round);
    const nextDeposit = Math.round(deposit * (1 + getDepositRate(baseRate + baseRateDelta) / 100 / 4));

    setAssets(nextAssets);
    setDeposit(nextDeposit);
    setLatestRoundSummary({ round, events: resolvedEvents, delistedAssets });
    setPhase('closed');
    setRoundLogs((current) => [
      {
        id: `${round}-${Date.now()}`,
        round,
        totalAsset: getTotalAsset({ cash, deposit: nextDeposit, portfolio, assets: nextAssets }),
        holdings: getHoldingSummary(portfolio, nextAssets),
        events: resolvedEvents.map((event) => `${event.title}: ${getResultLabel(event, false)}`).join(' / '),
      },
      ...current.filter((item) => item.round !== round),
    ].sort((a, b) => a.round - b.round));
    const failedEvents = resolvedEvents.filter((event) => !event.didApply);
    if (delistedAssets.length) {
      pushNews('상장폐지 발생', `${delistedAssets.map((asset) => asset.name).join(', ')} 거래가 중단되었습니다. 한 종목 집중 투자의 위험이 현실화됐습니다.`);
    } else if (failedEvents.length) {
      pushNews(failedEvents[0].failureTitle, failedEvents[0].failureDetail);
    } else if (resolvedEvents.some((event) => event.outcomeType === 'expectation')) {
      const expectationEvent = resolvedEvents.find((event) => event.outcomeType === 'expectation');
      pushNews(expectationEvent.expectationTitle, expectationEvent.expectationDetail);
    } else {
      pushNews(`${round}라운드 장 마감`, '등록된 이슈가 실제 이벤트로 확인되어 장 마감 가격에 반영되었습니다.');
    }
    setPlayers((current) =>
      current.map((player, index) => ({
        ...player,
        returnRate: Number((player.returnRate + ((round + index) % 5 - 1.5) * 1.7).toFixed(1)),
      })),
    );
  }

  function handleEndGame() {
    setIsPaused(true);
    setPhase('ended');
    pushNews('게임 종료', '최종 수익률을 확인하고 자산 배분 판단을 회고합니다.');
  }

  function parseAmount(value) {
    return Number(String(value).replaceAll(',', '').replace(/[^\d]/g, '')) || 0;
  }

  function handleBuy() {
    if (roomExpired || gameFinished || selectedAsset.delisted || selectedAsset.price <= 0) return;
    const amount = Math.min(parseAmount(tradeAmount), cash);
    const shares = Math.floor(amount / selectedAsset.price);
    if (shares <= 0) return;
    const cost = shares * selectedAsset.price;
    setCash((current) => current - cost);
    setPortfolio((current) => ({ ...current, [selectedAsset.id]: (current[selectedAsset.id] ?? 0) + shares }));
    addTradeLog('매수', `${selectedAsset.name} ${shares.toLocaleString('ko-KR')}주 · ${formatWon(cost)}`);
  }

  function handleSell() {
    if (roomExpired || gameFinished || selectedAsset.delisted || selectedAsset.price <= 0) return;
    const amount = parseAmount(tradeAmount);
    const owned = portfolio[selectedAsset.id] ?? 0;
    const shares = Math.min(owned, Math.floor(amount / selectedAsset.price));
    if (shares <= 0) return;
    setCash((current) => current + shares * selectedAsset.price);
    setPortfolio((current) => ({ ...current, [selectedAsset.id]: owned - shares }));
    addTradeLog('매도', `${selectedAsset.name} ${shares.toLocaleString('ko-KR')}주 · ${formatWon(shares * selectedAsset.price)}`);
  }

  function handleDeposit() {
    if (roomExpired || gameFinished) return;
    const amount = Math.min(parseAmount(depositAmount), cash);
    if (amount <= 0) return;
    setCash((current) => current - amount);
    setDeposit((current) => current + amount);
    addTradeLog('예금', `${formatWon(amount)} 예치`);
  }

  function handleWithdrawDeposit() {
    if (roomExpired || gameFinished) return;
    const amount = Math.min(parseAmount(depositAmount), deposit);
    if (amount <= 0) return;
    setDeposit((current) => current - amount);
    setCash((current) => current + amount);
    addTradeLog('예금 해지', `${formatWon(amount)} 인출`);
  }

  return (
    <div className="app-shell">
      <AppHeader view={view} setView={setView} hostAuthenticated={hostAuthenticated} />
      {view === 'home' ? (
        <HomeView
          setView={setView}
          roomPin={roomPin}
          round={round}
          playerCount={playerCount}
          baseRate={baseRate}
          expiresAt={expiresAt}
          roomExpired={roomExpired}
          onCreateRoom={createNewRoom}
          hostAuthenticated={hostAuthenticated}
        />
      ) : null}
      {view === 'host-login' ? (
        <HostLoginView login={hostLogin} error={hostLoginError} onLoginChange={setHostLogin} onSubmit={handleHostLogin} />
      ) : null}
      {view === 'host' && hostAuthenticated ? (
        <HostView
          roomPin={roomPin}
          round={round}
          phase={phase}
          isPaused={isPaused}
          assets={assets}
          players={players}
          newsFeed={newsFeed}
          baseRate={baseRate}
          activeStudent={activeStudent}
          expiresAt={expiresAt}
          roomExpired={roomExpired}
          issueDraft={issueDraft}
          currentRoundEvents={currentRoundEvents}
          latestRoundSummary={latestRoundSummary}
          onCreateRoom={createNewRoom}
          onIssueDraftChange={setIssueDraft}
          onStartRound={handleStartRound}
          onCloseRound={handleCloseRound}
          onNextRound={handleNextRound}
          onTogglePause={() => setIsPaused((current) => !current)}
          onEndGame={handleEndGame}
          onRegisterIssue={handleRegisterIssue}
        />
      ) : null}
      {view === 'host' && !hostAuthenticated ? (
        <HostLoginView login={hostLogin} error={hostLoginError} onLoginChange={setHostLogin} onSubmit={handleHostLogin} />
      ) : null}
      {view === 'student' ? (
        <StudentView
          roomPin={roomPin}
          round={round}
          phase={phase}
          assets={assets}
          newsFeed={newsFeed}
          portfolio={portfolio}
          cash={cash}
          deposit={deposit}
          baseRate={baseRate}
          tradeLogs={tradeLogs}
          roundLogs={roundLogs}
          reflection={reflection}
          playerCount={playerCount}
          roomFull={roomFull}
          currentRoundEvents={currentRoundEvents}
          latestRoundSummary={latestRoundSummary}
          gameFinished={gameFinished}
          nickname={nickname}
          setNickname={setNickname}
          joined={joined}
          setJoined={setJoined}
          selectedAssetId={selectedAssetId}
          setSelectedAssetId={setSelectedAssetId}
          tradeAmount={tradeAmount}
          setTradeAmount={setTradeAmount}
          depositAmount={depositAmount}
          setDepositAmount={setDepositAmount}
          onBuy={handleBuy}
          onSell={handleSell}
          onDeposit={handleDeposit}
          onWithdrawDeposit={handleWithdrawDeposit}
          onReflectionChange={handleReflectionChange}
        />
      ) : null}
    </div>
  );
}
