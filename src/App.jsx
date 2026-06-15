import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BadgePercent,
  BellRing,
  Building2,
  ChartNoAxesCombined,
  ChevronRight,
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
  School,
  Smartphone,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  buildNewRoomState,
  buildRegisteredIssue,
  buildRoundLog,
  buildStudentSnapshot,
  buildTradeLog,
  classroomRoles,
  getRoomCapacityState,
} from './lib/classroomStore.js';
import { supabaseConfigured } from './lib/supabaseClient.js';
import {
  createRemoteRoom,
  fetchRemoteSubmissions,
  fetchRemoteRoomById,
  fetchRemoteRoomByPin,
  groupEventsByRound,
  insertRemoteIssue,
  subscribeRemoteRoom,
  updateRemoteIssues,
  updateRemoteRoom,
  upsertRemoteAssets,
  upsertRemotePlayer,
  upsertRemoteTeamAccount,
  upsertRemoteTeamAccounts,
  upsertRemoteSubmission,
} from './lib/supabaseRoomStore.js';

const INITIAL_CASH = 100_000_000;
const TOTAL_ROUNDS = 12;
const MAX_PLAYERS_PER_ROOM = 40;
const INITIAL_BASE_RATE = 3.5;
const MAX_EVENTS_PER_ROUND = 5;
const DEFAULT_EVENT_PROBABILITY = 0.75;
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
const INITIAL_EXCHANGE_RATE = 1350;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const HOST_CREDENTIALS = {
  id: 'geography',
  password: '72727272',
};
const TEAM_TRADE_LOCK_MS = 60_000;
const teamTemplates = Array.from({ length: 8 }, (_, index) => ({
  key: `team-${index + 1}`,
  name: `${index + 1}모둠`,
}));

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
  { id: 'oilFut', type: 'futures', country: '글로벌', name: '글로벌 원유 선물', sector: '에너지 원자재', priceOptions: [71_000, 88_000, 104_000], color: '#92400e' },
  { id: 'grainFut', type: 'futures', country: '글로벌', name: '글로벌 곡물 선물', sector: '식량 원자재', priceOptions: [31_000, 45_000, 59_000], color: '#ca8a04' },
  { id: 'usBond', type: 'bond', country: '미국', name: '미국 10년 국채', sector: '선진국 국채', priceOptions: [91_000, 100_000, 108_000], color: '#334155' },
  { id: 'argBond', type: 'bond', country: '아르헨티나', name: '아르헨티나 국채', sector: '고위험 신흥국 국채', priceOptions: [24_000, 36_000, 52_000], color: '#be123c' },
];

function createRandomizedAssets() {
  return initialTradableAssets.map((asset) => {
    const price = asset.priceOptions[Math.floor(Math.random() * asset.priceOptions.length)];
    return {
      ...asset,
      price,
      history: [price, price, price],
    };
  });
}

const assetTypeLabels = {
  stock: '주식',
  etf: 'ETF',
  property: '부동산',
  futures: '선물',
  bond: '채권',
};

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
    impact: { oilFut: 0.18, oil: 0.1, air: -0.12, food: -0.04, grainFut: 0.03, usBond: 0.02 },
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
    impact: { grainFut: 0.2, food: -0.11, argBond: 0.04, usBond: 0.02, kospi: -0.02 },
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
    impact: { usBond: -0.12, sp500: -0.06, core: -0.07, enter: -0.05, argBond: -0.08, bank: 0.04 },
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
    impact: { argBond: -0.22, usBond: 0.08, sp500: -0.03, kospi: -0.04, bank: -0.03 },
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
    impact: { oilFut: 0.18, oil: 0.12, air: -0.15, usBond: 0.08, sp500: -0.06, kospi: -0.05, grainFut: 0.06 },
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
    impact: { kospi: -0.08, bank: -0.06, infra: -0.06, realty: -0.04, argBond: -0.08, usBond: 0.04 },
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
  return `${origin}/?view=student&pin=${roomPin}&entry=qr`;
}

function getInitialRoomPin() {
  if (typeof window === 'undefined') return '428915';
  const pinFromUrl = new URLSearchParams(window.location.search).get('pin');
  return pinFromUrl && /^[0-9]{6}$/.test(pinFromUrl) ? pinFromUrl : '428915';
}

function getInitialView() {
  if (typeof window === 'undefined') return 'home';
  const params = new URLSearchParams(window.location.search);
  return params.get('view') === 'student' && params.get('entry') === 'qr' ? 'student' : 'home';
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

function getHoldingSummary(portfolio, assets) {
  const rows = getHoldingRows(portfolio, assets);
  return rows.length
    ? rows.map(({ asset, shares }) => `${asset.name} ${shares.toLocaleString('ko-KR')}주`).join(', ')
    : '보유 종목 없음';
}

function getPassiveMarketMove() {
  return Number(((Math.random() * 2 - 1) * PASSIVE_MARKET_MOVE).toFixed(3));
}

function normalizeEventImpact(impact = {}, minimumImpact = MIN_EVENT_IMPACT) {
  return Object.fromEntries(
    Object.entries(impact).map(([assetId, value]) => {
      if (value === 0) return [assetId, 0];
      const direction = value > 0 ? 1 : -1;
      const adjustedValue = direction * Math.max(Math.abs(value), minimumImpact);
      return [assetId, Number(adjustedValue.toFixed(3))];
    }),
  );
}

function getRepeatedImpactFloor(count) {
  if (count >= 4) return MIN_EXTREME_EVENT_IMPACT;
  if (count >= 3) return MIN_TRIPLE_EVENT_IMPACT;
  return MIN_REPEATED_EVENT_IMPACT;
}

function normalizeRepeatedEventImpact(impact = {}, repeatedCount = 2) {
  const repeatedFloor = getRepeatedImpactFloor(repeatedCount);
  return Object.fromEntries(
    Object.entries(impact).map(([assetId, value]) => {
      if (value === 0) return [assetId, 0];
      const direction = value > 0 ? 1 : -1;
      const absoluteImpact = Math.abs(value);
      const isDirectAsset = absoluteImpact >= DIRECT_REPEATED_IMPACT_THRESHOLD;
      const adjustedValue = isDirectAsset
        ? Math.max(absoluteImpact, repeatedFloor)
        : Math.min(
            Math.max(absoluteImpact, MIN_INDIRECT_REPEATED_EVENT_IMPACT),
            MAX_INDIRECT_REPEATED_EVENT_IMPACT,
          );
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
  'rate-up': { baseRateDelta: 0.5, propertyMove: -0.04, exchangeMove: 0.01 },
  'rate-down': { baseRateDelta: -0.5, propertyMove: 0.04, exchangeMove: -0.01 },
  'deposit-special': { baseRateDelta: 0.2, propertyMove: -0.02, exchangeMove: 0 },
  'property-ease': { baseRateDelta: 0, propertyMove: 0.06, exchangeMove: 0 },
  'us-rally': { baseRateDelta: 0, propertyMove: 0.01, exchangeMove: -0.015 },
  'korea-export': { baseRateDelta: 0, propertyMove: 0.01, exchangeMove: -0.01 },
  rare: { baseRateDelta: 0, propertyMove: -0.01, exchangeMove: 0.02 },
  housing: { baseRateDelta: 0, propertyMove: 0.04, exchangeMove: 0 },
  'us-regulation': { baseRateDelta: 0, propertyMove: -0.01, exchangeMove: 0.01 },
  'fx-spike': { baseRateDelta: 0, propertyMove: -0.01, exchangeMove: 0.06 },
  'korea-us-chip-tension': { baseRateDelta: 0, propertyMove: -0.01, exchangeMove: 0.02 },
  'oil-supply-shock': { baseRateDelta: 0.1, propertyMove: -0.01, exchangeMove: 0.025 },
  'grain-shock': { baseRateDelta: 0.1, propertyMove: -0.005, exchangeMove: 0.015 },
  'us-yield-spike': { baseRateDelta: 0.3, propertyMove: -0.03, exchangeMove: 0.03 },
  'em-credit-stress': { baseRateDelta: 0, propertyMove: -0.02, exchangeMove: 0.035 },
  'war-risk': { baseRateDelta: 0.1, propertyMove: -0.025, exchangeMove: 0.04 },
  'election-risk': { baseRateDelta: 0.05, propertyMove: -0.025, exchangeMove: 0.025 },
  'argentina-reform': { baseRateDelta: 0, propertyMove: -0.01, exchangeMove: 0.025 },
};

function combineEventMacroImpacts(events) {
  return events.reduce(
    (acc, event) => {
      if (!event.didApply) return acc;
      const impact = event.macroImpact ?? eventMacroImpacts[getEventKey(event)] ?? {};
      return {
        baseRateDelta: acc.baseRateDelta + (impact.baseRateDelta ?? 0),
        propertyMove: acc.propertyMove + (impact.propertyMove ?? 0),
        exchangeMove: acc.exchangeMove + (impact.exchangeMove ?? 0),
      };
    },
    { baseRateDelta: 0, propertyMove: 0, exchangeMove: 0 },
  );
}

function combineResolvedImpacts(events) {
  const groupedImpacts = events.reduce((groups, event) => {
    if (!event.didApply) return groups;
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

function getRandomMacroDelta(max, decimals = 2) {
  return Number(((Math.random() * 2 - 1) * max).toFixed(decimals));
}

function createMacroMove({ baseRate, propertyIndex, exchangeRate, eventMacroImpact = {} }) {
  const randomBaseRateDelta = getRandomMacroDelta(0.2, 2);
  const randomPropertyMove = getRandomMacroDelta(0.03, 3);
  const randomExchangeMove = getRandomMacroDelta(0.04, 3);
  const baseRateDelta = Number((randomBaseRateDelta + (eventMacroImpact.baseRateDelta ?? 0)).toFixed(2));
  const propertyMove = Number((randomPropertyMove + (eventMacroImpact.propertyMove ?? 0)).toFixed(3));
  const exchangeMove = Number((randomExchangeMove + (eventMacroImpact.exchangeMove ?? 0)).toFixed(3));
  const nextBaseRate = Math.max(0, Number((baseRate + baseRateDelta).toFixed(2)));
  const nextPropertyIndex = Math.max(80, Math.round(propertyIndex * (1 + propertyMove)));
  const nextExchangeRate = Math.max(900, Math.round(exchangeRate * (1 + exchangeMove)));
  const assetImpact = {
    bank: baseRateDelta > 0 ? 0.03 : -0.03,
    neo: baseRateDelta > 0 ? -0.03 : 0.03,
    enter: baseRateDelta > 0 ? -0.03 : 0.03,
    realty: propertyMove * 0.8 + (baseRateDelta > 0 ? -0.03 : 0.03),
    infra: propertyMove * 0.5,
    sp500: exchangeMove * 0.8,
    kospi: exchangeMove > 0 ? 0.03 : -0.02,
    air: exchangeMove > 0 ? -0.04 : 0.03,
    food: exchangeMove > 0 ? -0.03 : 0.02,
    usBond: baseRateDelta > 0 ? -0.03 : 0.03,
    argBond: exchangeMove > 0 ? -0.04 : 0.02,
  };

  return {
    baseRateDelta,
    propertyMove,
    exchangeMove,
    nextBaseRate,
    nextPropertyIndex,
    nextExchangeRate,
    assetImpact,
    eventMacroImpact,
    randomMacroImpact: {
      baseRateDelta: randomBaseRateDelta,
      propertyMove: randomPropertyMove,
      exchangeMove: randomExchangeMove,
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

function getAssetProfile(asset) {
  return assetLearningProfiles[asset.id] ?? {
    story: `${asset.name}은 ${asset.sector} 흐름을 단순화한 가상 자산입니다. 가격만 보지 말고 어떤 이슈에서 변동 가능성이 커지는지 함께 확인해보세요.`,
    metrics: [['자산 유형', assetTypeLabels[asset.type] ?? asset.type], ['국가', asset.country], ['분야', asset.sector], ['현재가', formatAssetPrice(asset)]],
    signals: { stability: '보통', growth: '보통', volatility: '보통' },
    riskTags: ['이슈민감', '분산투자필요'],
    sensitivity: ['금리 변화', '정책 변화', '시장 심리'],
    prompt: '이 자산은 어떤 뉴스에서 변동 가능성이 커질까요?',
  };
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
    'oil-supply-shock': '산유국 감산 = 원유 공급 기대 변화',
    'grain-shock': '곡물 공급 충격 = 식품 원가와 물가 불확실성 증가',
    'us-yield-spike': '미국 국채금리 급등 = 글로벌 돈값 상승',
    'em-credit-stress': '신흥국 신용위험 = 높은 이자 뒤의 상환 위험 부각',
    'war-risk': '지정학적 긴장 = 공급망과 안전자산 선호 변화',
    'election-risk': '정치 불확실성 = 정책 방향 예측 어려움',
    'argentina-reform': '개혁안 충돌 = 국가 신용위험 확대',
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
    'oil-supply-shock': ['원유 공급 우려', '에너지 비용 기대 변화', '유가 민감 산업 변동성 확대'],
    'grain-shock': ['곡물 공급 우려', '식품 원가·물가 부담', '식량 민감 자산 변동성 확대'],
    'us-yield-spike': ['미국 금리 상승', '채권 가격·할인율 부담', '성장자산·고위험채 변동성 확대'],
    'em-credit-stress': ['상환 위험 부각', '위험자산 회피', '고위험 채권 부담·안전자산 선호'],
    'war-risk': ['군사 긴장 확대', '원자재·물류 불안', '안전자산 선호와 위험자산 부담'],
    'election-risk': ['정책 방향 불확실', '투자 심리 위축', '정책 민감 업종 변동성 확대'],
    'argentina-reform': ['재정 개혁 불확실', '통화·신용위험 확대', '고위험 국채 부담'],
  };

  return chains[getEventKey(event)] ?? ['뉴스 발생', '기대 변화', '가격 변동'];
}

function getFinancialLinks(event) {
  const links = {
    'rate-up': ['부채비율', '금리 민감도', '현금보유', '대출 의존도'],
    'rate-down': ['성장성', '금리 민감도', '투자 계획', '부동산 지수'],
    'deposit-special': ['예금금리', '안정성', '현금흐름', '위험자산 선호'],
    'property-ease': ['대출 의존도', '부동산 민감도', '수주 기대', '가계부채'],
    'us-rally': ['국가노출', '성장성', '기술주 비중', '환율노출'],
    'korea-export': ['수출비중', '환율노출', '제조업 경기', '매출 성장'],
    rare: ['원자재 의존도', '공급망', 'R&D 비중', '재고 부담'],
    housing: ['수주잔고', '부채비율', '원자재 의존도', '정책 민감도'],
    'us-regulation': ['국가노출', '규제 민감도', 'R&D 비중', '플랫폼 의존도'],
    'fx-spike': ['수출비중', '환율노출', '해외 비용', '달러 부채'],
    'korea-us-chip-tension': ['국가노출', '공급망', '수출규제', '반도체 의존도'],
    'war-risk': ['안전자산 선호', '물류비', '유류비', '공급망'],
    'election-risk': ['정책 민감도', '규제 위험', '국가 부채', '환율'],
    'argentina-reform': ['국가 신용등급', '통화가치', '재정적자', 'IMF 협상'],
  };

  return event.financialLinks ?? links[getEventKey(event)] ?? ['부채비율', '현금보유', '원자재 의존도', '국가노출'];
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
        {summary.macroMove && !compact ? (
          <article className="macro-summary">
            <div className="explain-head">
              <strong>거시 지표 변화</strong>
              <b className="result-badge expectation">시장 환경 변화</b>
              <span>선택된 이슈와 라운드별 시장 흐름이 함께 반영되어 금리, 부동산, 환율이 움직였습니다.</span>
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
        {summary.events.map((event, index) => {
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
              {event.repeatedVolatility ? (
                <p className="volatility-note">
                  <strong>동일 유형 이슈 반복 적용</strong>
                  <span>같은 유형의 이슈가 {event.repeatedCount ?? 2}회 실제로 반영되어 시장 변동성이 단계적으로 확대되었습니다.</span>
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

function createDefaultTeamAccounts() {
  return teamTemplates.map((team) => ({
    ...team,
    cash: INITIAL_CASH,
    deposit: 0,
    depositInterestEarned: 0,
    portfolio: {},
    tradeHolder: null,
    tradeHolderExpiresAt: null,
    negativeRounds: 0,
    bankrupt: false,
  }));
}

function isTeamTradeLockActive(team, nickname) {
  return Boolean(
    team?.tradeHolder
      && team.tradeHolder === nickname.trim()
      && team.tradeHolderExpiresAt
      && team.tradeHolderExpiresAt > Date.now(),
  );
}

function cleanTeamTradeLock(team) {
  if (!team?.tradeHolderExpiresAt || team.tradeHolderExpiresAt > Date.now()) return team;
  return { ...team, tradeHolder: null, tradeHolderExpiresAt: null };
}

function getTeamParticipantRows(teamAccounts, assets) {
  return teamAccounts.map((team) => {
    const cleanTeam = cleanTeamTradeLock(team);
    const holdingsValue = getPortfolioValue(cleanTeam.portfolio, assets);
    const totalAsset = cleanTeam.cash + cleanTeam.deposit + holdingsValue;
    return {
      id: cleanTeam.key,
      name: cleanTeam.name,
      cash: cleanTeam.cash,
      deposit: cleanTeam.deposit,
      totalAsset,
      returnRate: ((totalAsset - INITIAL_CASH) / INITIAL_CASH) * 100,
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

function buildFinalSubmissionReport({ nickname, cash, deposit, depositInterestEarned = 0, portfolio, assets, tradeLogs, roundLogs, reflection }) {
  const portfolioRows = getHoldingRows(portfolio, assets);
  const investmentAsset = portfolioRows.reduce((sum, row) => sum + row.value, 0);
  const cashLikeAsset = cash + deposit;
  const totalAsset = cashLikeAsset + investmentAsset;
  const returnRate = ((totalAsset - INITIAL_CASH) / INITIAL_CASH) * 100;
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

  return {
    nickname,
    totalAsset,
    cash,
    deposit,
    depositInterestEarned,
    cashLikeAsset,
    investmentAsset,
    returnRate,
    investorType,
    portfolio: portfolioReport,
    tradeLogs,
    roundLogs,
    reflection,
    submittedAt: Date.now(),
  };
}

function escapeCsv(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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

function TeacherSubmissionPanel({ players, activeStudent, submissions, gameFinished, onDownloadSubmissions }) {
  const activeStudentName = activeStudent.name.includes('(대기)') ? '' : activeStudent.name;
  const participantNames = [...new Set([activeStudentName, ...players.map((player) => player.name)].filter(Boolean))];
  const submittedNames = new Set(submissions.map((submission) => submission.nickname));
  const submittedRows = [...submissions].sort((a, b) => b.totalAsset - a.totalAsset);
  const missingNames = participantNames.filter((name) => !submittedNames.has(name));

  return (
    <section className="submission-panel" aria-label="최종 제출 현황">
      <div className="panel-heading split">
        <div>
          <Download size={22} aria-hidden="true" />
          <h2>최종 제출 현황</h2>
        </div>
        <span className="limit-pill">{submittedRows.length}/{participantNames.length}</span>
      </div>
      {!gameFinished ? <p className="empty-note">최종 라운드 종료 후 학생 제출과 다운로드를 사용할 수 있습니다.</p> : null}
      <div className="submission-actions">
        <button className="command secondary" type="button" onClick={() => window.print()} disabled={!gameFinished || !submittedRows.length}>
          보고서 인쇄
        </button>
        <button className="command primary" type="button" onClick={onDownloadSubmissions} disabled={!gameFinished || !submittedRows.length}>
          CSV 다운로드
        </button>
      </div>
      <div className="submission-list">
        {submittedRows.map((submission, index) => (
          <article key={submission.nickname}>
            <span>{index + 1}위</span>
            <strong>{submission.nickname}</strong>
            <em>{submission.investorType}</em>
            <small>{formatWon(submission.totalAsset)} · {formatPercent(submission.returnRate)}</small>
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
        cashLikeAsset: activeStudent.totalAsset,
        investmentAsset: 0,
        returnRate: ((activeStudent.totalAsset - INITIAL_CASH) / INITIAL_CASH) * 100,
        investorType: '제출 전',
      }];
  const submittedRows = submissions.length
    ? submissions
    : [
        ...activeStudentRows,
        ...players.map((player) => ({
          nickname: player.name,
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
  cash,
  deposit,
  depositInterestEarned,
  portfolio,
  assets,
  tradeLogs,
  roundLogs,
  reflection,
  submission,
  onSubmitReport,
  onReflectionChange,
}) {
  const holdingsValue = getPortfolioValue(portfolio, assets);
  const totalAsset = cash + deposit + holdingsValue;
  const returnRate = ((totalAsset - INITIAL_CASH) / INITIAL_CASH) * 100;
  const investorType = submission?.investorType ?? buildFinalSubmissionReport({ nickname, cash, deposit, depositInterestEarned, portfolio, assets, tradeLogs, roundLogs, reflection }).investorType;

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
          <span>현금성 자산</span>
          <strong>{formatWon(cash + deposit)}</strong>
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
        <button className="command primary print-hide" type="button" onClick={onSubmitReport} disabled={Boolean(submission)}>
          {submission ? '제출 완료' : '최종 제출하기'}
        </button>
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
  exchangeRate: {
    title: '원/달러 환율',
    summary: '1달러를 사기 위해 필요한 원화 가격입니다. 환율이 오르면 원화 가치가 약해졌다는 뜻입니다.',
    up: '오르면 수출 기업과 미국 자산 환산가치는 유리할 수 있지만, 항공·식품처럼 달러 비용이 큰 산업은 부담을 받을 수 있습니다.',
    down: '내리면 수입 비용 부담은 줄지만, 수출 기업의 원화 환산 매출 기대는 약해질 수 있습니다.',
    examples: ['해외 ETF', '항공', '식품', '수출주'],
  },
};

function MacroGuide({ baseRate, depositRate, propertyAsset, exchangeRate }) {
  const [selectedGuide, setSelectedGuide] = useState('baseRate');
  const item = macroGuideItems[selectedGuide];
  const currentValue = {
    baseRate: `${baseRate.toFixed(1)}%`,
    depositRate: `${depositRate.toFixed(1)}%`,
    propertyIndex: propertyAsset ? formatWon(propertyAsset.price) : '-',
    exchangeRate: `${exchangeRate.toLocaleString('ko-KR')}원`,
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
  const profile = getAssetProfile(asset);
  const signalEntries = [
    ['안정성', profile.signals.stability],
    ['성장성', profile.signals.growth],
    ['변동성', profile.signals.volatility],
  ];
  const checklist = [
    '이 자산은 어떤 나라와 산업에 연결되어 있나?',
    '부채비율, 현금보유, 원자재 의존도 중 무엇이 눈에 띄나?',
    '지금 공개된 이슈가 실제 이벤트가 아니어도 기대감만으로 움직일 수 있나?',
    '전 재산을 넣었을 때 상장폐지나 급락을 버틸 수 있나?',
  ];

  return (
    <section className="asset-learning-panel" aria-label={`${asset.name} 분석`}>
      <div className="panel-heading split">
        <div>
          <Building2 size={20} aria-hidden="true" />
          <h2>기업·자산 분석</h2>
        </div>
        <span className="limit-pill">{assetTypeLabels[asset.type] ?? asset.type}</span>
      </div>

      <article className="asset-story">
        <div>
          <strong>{asset.name}</strong>
          <span>{asset.country} · {asset.sector}</span>
        </div>
        <p>{profile.story}</p>
      </article>

      <div className="metric-grid" aria-label={`${asset.name} 간단 재무표`}>
        {profile.metrics.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className="signal-grid" aria-label={`${asset.name} 재무 신호`}>
        {signalEntries.map(([label, value]) => (
          <div className={`signal ${value === '높음' || value === '매우 높음' ? 'hot' : value === '낮음' ? 'cool' : ''}`} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
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

function AppHeader({ view, setView, hostAuthenticated, studentEntryAllowed }) {
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
        <button className={view === 'host' || view === 'host-login' ? 'active' : ''} type="button" data-role={classroomRoles.host} onClick={() => setView(hostAuthenticated ? 'host' : 'host-login')}>
          <School size={18} aria-hidden="true" />
          교사
        </button>
        {studentEntryAllowed || view === 'student' ? (
          <button className={view === 'student' ? 'active' : ''} type="button" data-role={classroomRoles.student} onClick={() => setView('student')}>
            <Smartphone size={18} aria-hidden="true" />
            학생
          </button>
        ) : null}
      </nav>
    </header>
  );
}

function HomeView({ setView, roomPin, round, playerCount, baseRate, exchangeRate, expiresAt, roomExpired, syncStatus, studentEntryAllowed, onCreateRoom, hostAuthenticated }) {
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
              <Globe2 size={19} aria-hidden="true" />
              <strong>{exchangeRate.toLocaleString('ko-KR')}원</strong>
              <span>원/달러 환율</span>
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
  rate: '금리/환율',
  commodity: '원자재/식량',
  geopolitics: '전쟁/정치',
  bond: '채권/국가',
  tech: '기술/수출',
  property: '부동산/소비',
};

function getEventCategory(event) {
  if (['rate-up', 'rate-down', 'deposit-special', 'fx-spike', 'us-yield-spike'].includes(event.id)) return 'rate';
  if (['rare', 'oil-supply-shock', 'grain-shock'].includes(event.id)) return 'commodity';
  if (['war-risk', 'election-risk'].includes(event.id)) return 'geopolitics';
  if (['em-credit-stress', 'argentina-reform'].includes(event.id)) return 'bond';
  if (['us-rally', 'korea-export', 'us-regulation', 'korea-us-chip-tension'].includes(event.id)) return 'tech';
  if (['property-ease', 'housing'].includes(event.id)) return 'property';
  return 'all';
}

const eventPresetFilters = [
  { label: '고변동성', category: 'geopolitics' },
  { label: '채권/환율 수업', category: 'bond' },
  { label: '원자재 수업', category: 'commodity' },
];

function HostView({
  roomPin,
  round,
  phase,
  roomMode,
  isPaused,
  assets,
  players,
  newsFeed,
  baseRate,
  exchangeRate,
  activeStudent,
  expiresAt,
  roomExpired,
  issueDraft,
  currentRoundEvents,
  latestRoundSummary,
  submissions,
  gameFinished,
  onCreateRoom,
  onRoomModeChange,
  onIssueDraftChange,
  onStartRound,
  onCloseRound,
  onNextRound,
  onTogglePause,
  onEndGame,
  onRegisterIssue,
  onDownloadSubmissions,
}) {
  const propertyAsset = assets.find((asset) => asset.type === 'property');
  const eventLimitReached = currentRoundEvents.length >= MAX_EVENTS_PER_ROUND;
  const canRegisterIssue = phase === 'setup' && !eventLimitReached && !roomExpired;
  const [eventCategory, setEventCategory] = useState('all');
  const filteredScenarioEvents = eventCategory === 'all'
    ? scenarioEvents
    : scenarioEvents.filter((event) => getEventCategory(event) === eventCategory);

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

        <RoomExpiryNotice roomPin={roomPin} expiresAt={expiresAt} expired={roomExpired} canCreateRoom onCreateRoom={onCreateRoom} />
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

        <section className="mode-panel" aria-label="수업 방식 설정">
          <div>
            <strong>수업 방식</strong>
            <span>{phase === 'setup' ? '라운드 준비 중에만 변경할 수 있습니다.' : '라운드 진행 중에는 변경할 수 없습니다.'}</span>
          </div>
          <div className="segmented-control">
            <button className={roomMode === 'individual' ? 'active' : ''} type="button" onClick={() => onRoomModeChange('individual')} disabled={phase !== 'setup'}>
              개인 투자
            </button>
            <button className={roomMode === 'team' ? 'active' : ''} type="button" onClick={() => onRoomModeChange('team')} disabled={phase !== 'setup'}>
              모둠 투자
            </button>
          </div>
        </section>

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
            <span>원/달러 환율</span>
            <strong>{exchangeRate.toLocaleString('ko-KR')}원</strong>
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

        <IssueTicker events={currentRoundEvents} phase={phase} />
        <RoundExplanation summary={latestRoundSummary} assets={assets} />
        <CloseDashboard phase={phase} players={players} />
        <TeacherStudentMonitor
          players={players}
          activeStudent={roomMode === 'team' ? buildStudentSnapshot({ id: 'team-mode', name: '모둠 계좌 (대기)', totalAsset: 0, holdings: [] }) : activeStudent}
          assets={assets}
        />
        <TeacherSubmissionPanel
          players={players}
          activeStudent={roomMode === 'team' ? buildStudentSnapshot({ id: 'team-mode', name: '모둠 계좌 (대기)', totalAsset: 0, holdings: [] }) : activeStudent}
          submissions={submissions}
          gameFinished={gameFinished}
          onDownloadSubmissions={onDownloadSubmissions}
        />

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
        <TeacherRankingPanel players={players} submissions={submissions} activeStudent={activeStudent} gameFinished={gameFinished} />

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
  roomMode,
  assets,
  newsFeed,
  portfolio,
  cash,
  deposit,
  depositInterestEarned,
  baseRate,
  exchangeRate,
  tradeLogs,
  roundLogs,
  reflection,
  playerCount,
  roomFull,
  currentRoundEvents,
  latestRoundSummary,
  gameFinished,
  submittedReport,
  nickname,
  setNickname,
  joined,
  setJoined,
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
  onDeposit,
  onWithdrawDeposit,
  onSubmitReport,
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
  const canTradeStocks = phase === 'open' && !gameFinished;
  const canMoveDeposit = !gameFinished;
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
              <button className="command primary" type="button" onClick={onClaimTeamTrade} disabled={activeTeam?.bankrupt || teamTradeAllowed || Boolean(activeTeam?.tradeHolder)}>
                거래권 잡기
              </button>
              <button className="command secondary" type="button" onClick={onReleaseTeamTrade} disabled={!teamTradeAllowed}>
                반납
              </button>
            </div>
          </section>
        ) : null}

        <IssueTicker events={currentRoundEvents} phase={phase} compact />
        {phase === 'closed' ? <RoundExplanation summary={latestRoundSummary} assets={assets} compact /> : null}
        {gameFinished ? (
          <FinalReport
            nickname={nickname}
            cash={cash}
            deposit={deposit}
            depositInterestEarned={depositInterestEarned}
            portfolio={portfolio}
            assets={assets}
            tradeLogs={tradeLogs}
            roundLogs={roundLogs}
            reflection={reflection}
            submission={submittedReport}
            onSubmitReport={onSubmitReport}
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

        <PortfolioDonut cash={cash} deposit={deposit} portfolio={portfolio} assets={assets} />

        <MacroGuide baseRate={baseRate} depositRate={depositRate} propertyAsset={propertyAsset} exchangeRate={exchangeRate} />

        <section className="deposit-ticket" aria-labelledby="deposit-heading">
          <div>
            <h2 id="deposit-heading">예금 계좌</h2>
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

        <AssetLearningPanel asset={selectedAsset} />

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
            <button className="buy" type="button" onClick={onBuy} disabled={!canTradeStocks || selectedAsset.delisted || !canUseAccount}>
              {gameFinished ? '종료' : phase !== 'open' ? '장 시작 대기' : selectedAsset.delisted ? '거래중단' : teamMode && !canUseAccount ? tradeDisabledReason : '매수'}
            </button>
            <button className="sell" type="button" onClick={onSell} disabled={!canTradeStocks || selectedAsset.delisted || !canUseAccount}>
              {phase !== 'open' && !gameFinished ? '장 시작 대기' : teamMode && !canUseAccount ? tradeDisabledReason : '매도'}
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}

export function App() {
  const [view, setView] = useState(getInitialView);
  const [studentEntryAllowed] = useState(getInitialStudentEntryAllowed);
  const [hostAuthenticated, setHostAuthenticated] = useState(false);
  const [hostLogin, setHostLogin] = useState({ id: '', password: '' });
  const [hostLoginError, setHostLoginError] = useState('');
  const [roomPin, setRoomPin] = useState(getInitialRoomPin);
  const [roomCreatedAt, setRoomCreatedAt] = useState(() => Date.now());
  const [roomExpired, setRoomExpired] = useState(false);
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState('setup');
  const [roomMode, setRoomMode] = useState('individual');
  const [isPaused, setIsPaused] = useState(false);
  const [baseRate, setBaseRate] = useState(INITIAL_BASE_RATE);
  const [exchangeRate, setExchangeRate] = useState(INITIAL_EXCHANGE_RATE);
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
  const [depositPrincipal, setDepositPrincipal] = useState(0);
  const [depositInterestEarned, setDepositInterestEarned] = useState(0);
  const [portfolio, setPortfolio] = useState({});
  const [teamAccounts, setTeamAccounts] = useState(createDefaultTeamAccounts);
  const [selectedTeamKey, setSelectedTeamKey] = useState(teamTemplates[0].key);
  const [selectedAssetId, setSelectedAssetId] = useState(initialTradableAssets[0].id);
  const [tradeAmount, setTradeAmount] = useState('10000000');
  const [depositAmount, setDepositAmount] = useState('10000000');
  const [tradeLogs, setTradeLogs] = useState([]);
  const [roundLogs, setRoundLogs] = useState([]);
  const [reflection, setReflection] = useState({ good: '', improve: '', next: '' });
  const [submissions, setSubmissions] = useState([]);
  const [remoteRoomId, setRemoteRoomId] = useState(null);
  const [syncStatus, setSyncStatus] = useState(supabaseConfigured ? '실시간 수업 연결 준비 중' : '로컬 연습 모드');
  const remoteRefreshTimer = useRef(null);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? assets[0],
    [selectedAssetId, assets],
  );
  const currentRoundEvents = triggeredEventsByRound[round] ?? [];
  const expiresAt = roomCreatedAt + ROOM_TTL_MS;
  const gameFinished = phase === 'ended' || (round === TOTAL_ROUNDS && phase === 'closed');
  const teamMode = roomMode === 'team';
  const activeTeam = cleanTeamTradeLock(teamAccounts.find((team) => team.key === selectedTeamKey) ?? teamAccounts[0]);
  const teamTradeAllowed = teamMode ? isTeamTradeLockActive(activeTeam, nickname) : true;
  const teamParticipantRows = teamMode ? getTeamParticipantRows(teamAccounts, assets) : [];
  const displayedPlayers = teamMode ? teamParticipantRows : players;
  const { playerCount, roomFull } = getRoomCapacityState({
    basePlayerCount: joined ? players.filter((player) => player.name !== nickname).length : players.length,
    joined,
    maxPlayers: MAX_PLAYERS_PER_ROOM,
  });
  const effectiveCash = teamMode ? activeTeam.cash : cash;
  const effectiveDeposit = teamMode ? activeTeam.deposit : deposit;
  const effectiveDepositInterestEarned = teamMode ? activeTeam.depositInterestEarned : depositInterestEarned;
  const effectivePortfolio = teamMode ? activeTeam.portfolio : portfolio;
  const studentDisplayName = teamMode && joined ? `${activeTeam.name} · ${nickname}` : nickname;
  const reportNickname = teamMode ? activeTeam.name : nickname.trim();
  const studentHoldingsValue = getPortfolioValue(effectivePortfolio, assets);
  const studentTotalAsset = effectiveCash + effectiveDeposit + studentHoldingsValue;
  const submittedReport = submissions.find((submission) => submission.nickname === reportNickname);
  const activeStudent = buildStudentSnapshot({
    id: teamMode ? activeTeam.key : 'active-student',
    name: joined ? studentDisplayName : `${nickname || '학생'} (대기)`,
    totalAsset: studentTotalAsset,
    holdings: getHoldingRows(effectivePortfolio, assets).map(({ asset, shares }) => `${asset.name} ${shares.toLocaleString('ko-KR')}주`),
  });

  const applyRemoteRoomBundle = useCallback((bundle) => {
    if (!bundle?.room) return;
    const remoteRound = bundle.room.current_round;
    const groupedEvents = groupEventsByRound(bundle.events);
    const remoteCurrentEvents = groupedEvents[remoteRound] ?? [];
    const resolvedCurrentEvents = remoteCurrentEvents.filter((event) => event.resolved);
    const createdAt = new Date(bundle.room.created_at).getTime();
    const isExpired = new Date(bundle.room.expires_at).getTime() <= Date.now() || bundle.room.phase === 'expired';

    setRemoteRoomId(bundle.room.id);
    setRoomPin(bundle.room.pin);
    setRoomCreatedAt(createdAt);
    setRoomExpired(isExpired);
    setRound(remoteRound);
    setPhase(isExpired ? 'expired' : bundle.room.phase);
    setRoomMode(bundle.room.mode ?? 'individual');
    setIsPaused(bundle.room.is_paused);
    setBaseRate(Number(bundle.room.base_rate));
    setExchangeRate(Number(bundle.room.exchange_rate ?? INITIAL_EXCHANGE_RATE));
    if (bundle.assets.length) setAssets(bundle.assets);
    setTriggeredEventsByRound(groupedEvents);
    setLatestRoundSummary(resolvedCurrentEvents.length ? { round: remoteRound, events: resolvedCurrentEvents, delistedAssets: [] } : null);
    setPlayers(bundle.players);
    if (bundle.teams?.length) setTeamAccounts(bundle.teams);
    setSyncStatus('실시간 수업 연결 중');
  }, []);

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
    if (!supabaseConfigured || !/^[0-9]{6}$/.test(roomPin)) return undefined;
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
  }, [applyRemoteRoomBundle, roomPin]);

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
      cash: effectiveCash,
      deposit: effectiveDeposit,
      totalAsset: studentTotalAsset,
      returnRate: ((studentTotalAsset - INITIAL_CASH) / INITIAL_CASH) * 100,
    };
    upsertRemotePlayer(remoteRoomId, remotePlayer).catch((error) => setSyncStatus(`학생 정보 저장 실패: ${error.message}`));
  }, [effectiveCash, effectiveDeposit, joined, nickname, remoteRoomId, studentTotalAsset]);

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
    if (!teamMode || !joined || !nickname.trim() || activeTeam.bankrupt) return;
    updateActiveTeamAccount((team) => ({
      ...team,
      tradeHolder: nickname.trim(),
      tradeHolderExpiresAt: Date.now() + TEAM_TRADE_LOCK_MS,
    }));
  }

  function handleReleaseTeamTrade() {
    if (!teamMode || !teamTradeAllowed) return;
    updateActiveTeamAccount((team) => ({ ...team, tradeHolder: null, tradeHolderExpiresAt: null }));
  }

  async function handleRoomModeChange(nextMode) {
    if (phase !== 'setup') return;
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

  function handleReflectionChange(key, value) {
    setReflection((current) => ({ ...current, [key]: value }));
  }

  async function createNewRoom() {
    if (!hostAuthenticated) {
      setView('host-login');
      return;
    }

    const nextPin = String(Math.floor(100000 + Math.random() * 900000));
    const now = Date.now();
    const nextAssets = createRandomizedAssets();
    const nextTeams = createDefaultTeamAccounts();
    const nextRoom = buildNewRoomState({
      pin: nextPin,
      now,
      initialBaseRate: INITIAL_BASE_RATE,
      assets: nextAssets,
      players: supabaseConfigured ? [] : mockPlayers,
      initialCash: INITIAL_CASH,
      initialAssetId: initialTradableAssets[0].id,
    });

    setRoomPin(nextRoom.roomPin);
    setRoomCreatedAt(nextRoom.roomCreatedAt);
    setRoomExpired(nextRoom.roomExpired);
    setRound(nextRoom.round);
    setPhase(nextRoom.phase);
    setRoomMode(roomMode);
    setIsPaused(nextRoom.isPaused);
    setBaseRate(nextRoom.baseRate);
    setExchangeRate(INITIAL_EXCHANGE_RATE);
    setAssets(nextRoom.assets);
    setTriggeredEventsByRound(nextRoom.triggeredEventsByRound);
    setLatestRoundSummary(nextRoom.latestRoundSummary);
    setIssueDraft(nextRoom.issueDraft);
    setNewsFeed(nextRoom.newsFeed);
    setPlayers(nextRoom.players);
    setCash(nextRoom.cash);
    setDeposit(nextRoom.deposit);
    setDepositPrincipal(0);
    setDepositInterestEarned(0);
    setPortfolio(nextRoom.portfolio);
    setTeamAccounts(nextTeams);
    setSelectedTeamKey(teamTemplates[0].key);
    setSelectedAssetId(nextRoom.selectedAssetId);
    setTradeAmount(nextRoom.tradeAmount);
    setDepositAmount(nextRoom.depositAmount);
    setTradeLogs(nextRoom.tradeLogs);
    setRoundLogs(nextRoom.roundLogs);
    setReflection(nextRoom.reflection);
    setSubmissions([]);

    if (!supabaseConfigured) return;
    setSyncStatus('새 수업 방 저장 중');
    try {
      const bundle = await createRemoteRoom({
        pin: nextPin,
        now,
        baseRate: INITIAL_BASE_RATE,
        exchangeRate: INITIAL_EXCHANGE_RATE,
        assets: nextAssets,
        mode: roomMode,
        teams: roomMode === 'team' ? nextTeams : [],
      });
      if (bundle) applyRemoteRoomBundle(bundle);
    } catch (error) {
      setSyncStatus(`수업 방 생성 실패: ${error.message}`);
    }
  }

  async function handleNextRound() {
    if (roomExpired || round >= TOTAL_ROUNDS) return;
    const nextRound = Math.min(round + 1, TOTAL_ROUNDS);
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
    if (roomExpired || currentRoundEvents.length >= MAX_EVENTS_PER_ROUND) return;

    const registeredEvent = buildRegisteredIssue({
      event,
      issueOption,
      issueDraft,
      round,
      now: Date.now(),
      defaultProbability: DEFAULT_EVENT_PROBABILITY,
    });

    setTriggeredEventsByRound((current) => ({
      ...current,
      [round]: [...(current[round] ?? []), registeredEvent],
    }));
    setIssueDraft('');

    if (remoteRoomId) {
      try {
        await insertRemoteIssue(remoteRoomId, registeredEvent, round);
      } catch (error) {
        setSyncStatus(`이슈 저장 실패: ${error.message}`);
      }
    }
  }

  async function handleStartRound() {
    if (roomExpired || !currentRoundEvents.length || phase !== 'setup') return;
    setPhase('open');
    pushNews(`${round}라운드 이슈 공개`, `${currentRoundEvents.length}개 이슈가 공개되었습니다. 가격은 장 마감 후 반영됩니다.`);
    if (remoteRoomId) {
      try {
        await updateRemoteRoom(remoteRoomId, { phase: 'open' });
      } catch (error) {
        setSyncStatus(`라운드 시작 저장 실패: ${error.message}`);
      }
    }
  }

  async function handleCloseRound() {
    if (roomExpired || phase !== 'open') return;

    const initialResolvedEvents = currentRoundEvents.map((event) => {
      const didApply = Math.random() < (event.probability ?? DEFAULT_EVENT_PROBABILITY);
      const outcomeType = didApply ? (Math.random() < 0.7 ? 'event' : 'expectation') : 'failed';
      return {
        ...event,
        resolved: true,
        didApply,
        outcomeType,
        expectationTitle: `${event.title} 실제 발표 전 기대감 선반영`,
        expectationDetail: '실제 이벤트가 확정되지는 않았지만, 투자자들이 가능성을 먼저 반영하면서 가격이 움직였습니다.',
      };
    });

    const appliedEventTypeCounts = getAppliedEventTypeCounts(initialResolvedEvents);
    const resolvedEvents = initialResolvedEvents.map((event) => {
      const repeatedCount = appliedEventTypeCounts[getEventKey(event)] ?? 0;
      const repeatedVolatility = event.didApply && repeatedCount >= 2;
      return {
        ...event,
        repeatedVolatility,
        repeatedCount,
        resolvedImpact: event.didApply
          ? repeatedVolatility
            ? normalizeRepeatedEventImpact(event.impact, repeatedCount)
            : normalizeEventImpact(event.impact, MIN_EVENT_IMPACT)
          : {},
      };
    });

    const eventImpact = combineResolvedImpacts(resolvedEvents);
    const eventMacroImpact = combineEventMacroImpacts(resolvedEvents);
    const propertyAsset = assets.find((asset) => asset.type === 'property');
    const macroMove = createMacroMove({
      baseRate,
      propertyIndex: propertyAsset?.price ?? 250_000,
      exchangeRate,
      eventMacroImpact,
    });
    const nextBaseRate = macroMove.nextBaseRate;
    const combinedImpact = combineImpacts(eventImpact, macroMove.assetImpact);

    setBaseRate(nextBaseRate);
    setExchangeRate(macroMove.nextExchangeRate);

    const delistedAssets = round >= DELISTING_START_ROUND
      ? assets
          .filter((asset) => asset.type === 'stock' && !asset.delisted && (combinedImpact[asset.id] ?? 0) <= STRONG_NEGATIVE_IMPACT)
          .filter(() => Math.random() < DELISTING_PROBABILITY)
          .map((asset) => ({ id: asset.id, name: asset.name }))
      : [];

    const nextAssets = moveAssetsLocally(assets, combinedImpact, delistedAssets.map((asset) => asset.id), round);
    const depositInterest = Math.round(deposit * (getDepositRate(nextBaseRate) / 100 / 4));
    const nextDeposit = deposit + depositInterest;
    const nextTeamAccounts = teamAccounts.map((team) => {
      const cleanTeam = cleanTeamTradeLock(team);
      if (cleanTeam.bankrupt) return cleanTeam;
      const teamDepositInterest = Math.round(cleanTeam.deposit * (getDepositRate(nextBaseRate) / 100 / 4));
      const nextTeamDeposit = cleanTeam.deposit + teamDepositInterest;
      const nextNegativeRounds = cleanTeam.cash < 0 || cleanTeam.cash + nextTeamDeposit < 0 ? (cleanTeam.negativeRounds ?? 0) + 1 : 0;
      const bankrupt = nextNegativeRounds >= 2;
      return {
        ...cleanTeam,
        cash: bankrupt ? 0 : cleanTeam.cash,
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
    if (depositInterest > 0) {
      setDepositInterestEarned((current) => current + depositInterest);
      addTradeLog('예금 이자', `${round}라운드 분기 복리 이자 +${formatWon(depositInterest)}`);
    }
    setLatestRoundSummary({ round, events: resolvedEvents, delistedAssets, macroMove });
    setPhase('closed');
    setRoundLogs((current) => [
      buildRoundLog({
        round,
        now: Date.now(),
        totalAsset: getTotalAsset({ cash, deposit: nextDeposit, portfolio, assets: nextAssets }),
        holdings: getHoldingSummary(portfolio, nextAssets),
        events: resolvedEvents.map((event) => `${event.title}: ${getResultLabel(event, false)}`).join(' / '),
      }),
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

    if (remoteRoomId) {
      try {
        await Promise.all([
          updateRemoteRoom(remoteRoomId, {
            phase: 'closed',
            base_rate: nextBaseRate,
            exchange_rate: macroMove.nextExchangeRate,
          }),
          upsertRemoteAssets(remoteRoomId, nextAssets),
          updateRemoteIssues(remoteRoomId, resolvedEvents, round),
          upsertRemoteTeamAccounts(remoteRoomId, nextTeamAccounts),
        ]);
      } catch (error) {
        setSyncStatus(`장 마감 저장 실패: ${error.message}`);
      }
    }
  }

  async function handleEndGame() {
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

  async function handleSubmitReport() {
    if (!gameFinished || !joined || submittedReport) return;
    const report = buildFinalSubmissionReport({
      nickname: reportNickname,
      cash: effectiveCash,
      deposit: effectiveDeposit,
      depositInterestEarned: effectiveDepositInterestEarned,
      portfolio: effectivePortfolio,
      assets,
      tradeLogs,
      roundLogs,
      reflection,
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

  function handleDownloadSubmissions() {
    const rows = [
      ['순위', '이름', '총자산', '현금성자산', '투자평가금', '예금이자수익', '수익률', '투자성향', '보유자산', '잘한점', '부족한점', '다음계획'],
      ...[...submissions].sort((a, b) => b.totalAsset - a.totalAsset).map((submission, index) => [
        index + 1,
        submission.nickname,
        submission.totalAsset,
        submission.cashLikeAsset,
        submission.investmentAsset,
        submission.depositInterestEarned ?? 0,
        `${submission.returnRate.toFixed(1)}%`,
        submission.investorType,
        submission.portfolio?.map((item) => `${item.name} ${item.shares}주 ${Math.round((item.ratio ?? 0) * 100)}%`).join(' / ') ?? '',
        submission.reflection?.good ?? '',
        submission.reflection?.improve ?? '',
        submission.reflection?.next ?? '',
      ]),
    ];
    downloadCsv(`market-class-${roomPin}-final-reports.csv`, rows);
  }

  function handleBuy() {
    if (roomExpired || gameFinished || phase !== 'open' || selectedAsset.delisted || selectedAsset.price <= 0) return;
    if (!canUseTeamAccount()) return;
    const sourceCash = teamMode ? activeTeam.cash : cash;
    const amount = Math.min(parseAmount(tradeAmount), sourceCash);
    const shares = Math.floor(amount / selectedAsset.price);
    if (shares <= 0) return;
    const cost = shares * selectedAsset.price;
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
    addTradeLog('매수', `${selectedAsset.name} ${shares.toLocaleString('ko-KR')}주 · ${formatWon(cost)}`);
  }

  function handleSell() {
    if (roomExpired || gameFinished || phase !== 'open' || selectedAsset.delisted || selectedAsset.price <= 0) return;
    if (!canUseTeamAccount()) return;
    const amount = parseAmount(tradeAmount);
    const sourcePortfolio = teamMode ? activeTeam.portfolio : portfolio;
    const owned = sourcePortfolio[selectedAsset.id] ?? 0;
    const shares = Math.min(owned, Math.floor(amount / selectedAsset.price));
    if (shares <= 0) return;
    const revenue = shares * selectedAsset.price;
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
    addTradeLog('매도', `${selectedAsset.name} ${shares.toLocaleString('ko-KR')}주 · ${formatWon(revenue)}`);
  }

  function handleDeposit() {
    if (roomExpired || gameFinished) return;
    if (!canUseTeamAccount()) return;
    const sourceCash = teamMode ? activeTeam.cash : cash;
    const amount = Math.min(parseAmount(depositAmount), sourceCash);
    if (amount <= 0) return;
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
  }

  function handleWithdrawDeposit() {
    if (roomExpired || gameFinished) return;
    if (!canUseTeamAccount()) return;
    const sourceDeposit = teamMode ? activeTeam.deposit : deposit;
    const amount = Math.min(parseAmount(depositAmount), sourceDeposit);
    if (amount <= 0) return;
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
  }

  return (
    <div className="app-shell">
      <AppHeader view={view} setView={setView} hostAuthenticated={hostAuthenticated} studentEntryAllowed={studentEntryAllowed} />
      {view === 'home' ? (
        <HomeView
          setView={setView}
          roomPin={roomPin}
          round={round}
          playerCount={playerCount}
          baseRate={baseRate}
          exchangeRate={exchangeRate}
          expiresAt={expiresAt}
          roomExpired={roomExpired}
          syncStatus={syncStatus}
          studentEntryAllowed={studentEntryAllowed}
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
          roomMode={roomMode}
          isPaused={isPaused}
          assets={assets}
          players={displayedPlayers}
          newsFeed={newsFeed}
          baseRate={baseRate}
          exchangeRate={exchangeRate}
          activeStudent={activeStudent}
          expiresAt={expiresAt}
          roomExpired={roomExpired}
          issueDraft={issueDraft}
          currentRoundEvents={currentRoundEvents}
          latestRoundSummary={latestRoundSummary}
          submissions={submissions}
          gameFinished={gameFinished}
          onCreateRoom={createNewRoom}
          onRoomModeChange={handleRoomModeChange}
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
          onRegisterIssue={handleRegisterIssue}
          onDownloadSubmissions={handleDownloadSubmissions}
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
          roomMode={roomMode}
          assets={assets}
          newsFeed={newsFeed}
          portfolio={effectivePortfolio}
          cash={effectiveCash}
          deposit={effectiveDeposit}
          depositInterestEarned={effectiveDepositInterestEarned}
          baseRate={baseRate}
          exchangeRate={exchangeRate}
          tradeLogs={tradeLogs}
          roundLogs={roundLogs}
          reflection={reflection}
          playerCount={playerCount}
          roomFull={roomFull}
          currentRoundEvents={currentRoundEvents}
          latestRoundSummary={latestRoundSummary}
          gameFinished={gameFinished}
          submittedReport={submittedReport}
          nickname={nickname}
          setNickname={setNickname}
          joined={joined}
          setJoined={setJoined}
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
          onDeposit={handleDeposit}
          onWithdrawDeposit={handleWithdrawDeposit}
          onSubmitReport={handleSubmitReport}
          onReflectionChange={handleReflectionChange}
        />
      ) : null}
    </div>
  );
}
