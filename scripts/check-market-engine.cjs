const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const generate = require('@babel/generator').default;

const source = fs.readFileSync(path.resolve(__dirname, '../src/App.jsx'), 'utf8');
const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });

const requiredVariables = new Set([
  'REPEATED_EVENT_MULTIPLIERS',
  'SIZE_ISSUE_MULT',
  'scenarioEvents',
  'eventNewsroomDetails',
  'eventMacroImpacts',
  'eventConflictGroups',
]);
const requiredFunctions = new Set([
  'clampNumber',
  'getQuarterlyEventCap',
  'normalizeEventImpact',
  'getRepeatedImpactMultiplier',
  'normalizeRepeatedEventImpact',
  'applySizeFactor',
  'getScaledMacroImpact',
  'createMacroMove',
  'combineImpacts',
  'getDirectlyAffectedAssetIds',
  'excludeDirectAssetMacroImpact',
  'limitFinancialImpactAgainstDirect',
  'getEventTemplateKey',
  'getConflictWeight',
  'getConflictOutcomeMap',
]);

const selectedNodes = ast.program.body.filter((node) => {
  if (node.type === 'FunctionDeclaration') return requiredFunctions.has(node.id?.name);
  if (node.type !== 'VariableDeclaration') return false;
  return node.declarations.some((declaration) => requiredVariables.has(declaration.id?.name));
});

const selectedNames = new Set();
selectedNodes.forEach((node) => {
  if (node.type === 'FunctionDeclaration') selectedNames.add(node.id.name);
  node.declarations?.forEach((declaration) => selectedNames.add(declaration.id?.name));
});
for (const name of [...requiredVariables, ...requiredFunctions]) {
  assert(selectedNames.has(name), `시장 엔진 선언을 찾지 못했습니다: ${name}`);
}

const generatedSource = selectedNodes.map((node) => generate(node).code).join('\n');
const exportedNames = [...requiredVariables, ...requiredFunctions];
const engine = Function(`${generatedSource}\nreturn { ${exportedNames.join(', ')} };`)();

function near(actual, expected, label) {
  assert(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} !== ${expected}`);
}

const mockAssets = [
  { id: 'core', type: 'stock', size: 'large' },
  { id: 'bio', type: 'stock', size: 'small' },
];

const normalizedSeven = engine.applySizeFactor(engine.normalizeEventImpact({ core: 0.07, bio: 0.07 }, mockAssets), mockAssets);
const normalizedEight = engine.applySizeFactor(engine.normalizeEventImpact({ core: 0.08, bio: 0.08 }, mockAssets), mockAssets);
near(normalizedSeven.core, 0.056, '대형주 7%');
near(normalizedEight.core, 0.064, '대형주 8%');
near(normalizedSeven.bio, 0.098, '중소형주 7%');
near(normalizedEight.bio, 0.112, '중소형주 8%');

near(engine.normalizeRepeatedEventImpact({ core: 0.12 }, 2, mockAssets).core, 0.192, '반복 2회');
near(engine.normalizeRepeatedEventImpact({ core: 0.12 }, 3, mockAssets).core, 0.264, '반복 3회');

function macroFor(baseRateDelta) {
  return engine.createMacroMove({
    baseRate: 3.5,
    propertyIndex: 250000,
    exchangeRate: 1350,
    unemploymentRate: 3.5,
    eventMacroImpact: { baseRateDelta, propertyMove: 0, exchangeMove: 0, unemploymentDelta: 0 },
    randomMacroImpact: { baseRateDelta: 0, propertyMove: 0, exchangeMove: 0, unemploymentDelta: 0 },
  });
}
near(macroFor(0.05).assetImpact.core, -0.003, '금리 +0.05%p 기술주 영향');
near(macroFor(0.5).assetImpact.core, -0.03, '금리 +0.50%p 기술주 영향');

const conflictEvents = [
  { id: 'test-rate-up', templateId: 'rate-up', title: '금리 인상', impact: { bank: 0.08 } },
  { id: 'test-rate-down', templateId: 'rate-down', title: '금리 인하', impact: { bank: -0.04 } },
  { id: 'test-property-ease', templateId: 'property-ease', title: '부동산 완화', impact: { realty: 0.09 } },
];
const conflictOutcome = engine.getConflictOutcomeMap(conflictEvents);
assert.equal(['test-rate-up', 'test-rate-down'].filter((id) => conflictOutcome[id]?.blocked).length, 1, '금리 양쪽이 함께 차단되면 안 됩니다.');
assert.equal(conflictOutcome['test-rate-up'].blocked, false, '상충 승자 정보가 기록되어야 합니다.');
assert.equal(conflictOutcome['test-property-ease'], undefined, '동시 발생 가능한 부동산 완화는 금리 카드와 상충 처리하지 않습니다.');

const conflictMemberships = new Map();
for (const group of engine.eventConflictGroups) {
  for (const side of group.sides) {
    for (const eventId of side) {
      conflictMemberships.set(eventId, [...(conflictMemberships.get(eventId) ?? []), group.label]);
    }
  }
}
assert.deepEqual([...conflictMemberships].filter(([, labels]) => labels.length > 1), [], '상충 그룹이 겹치면 안 됩니다.');

const directAssetIds = engine.getDirectlyAffectedAssetIds([
  { didApply: true, outcomeType: 'event', resolvedImpact: { core: 0.08 } },
]);
assert.deepEqual(engine.excludeDirectAssetMacroImpact({ core: -0.03, air: -0.04 }, directAssetIds), { air: -0.04 });
near(engine.limitFinancialImpactAgainstDirect({ core: -0.04 }, { core: 0.08 }, directAssetIds).core, -0.028, '직접 종목 재무 영향 제한');

const eventMap = Object.fromEntries(engine.scenarioEvents.map((event) => [event.id, event]));
assert(!eventMap['korea-export'].impact.core && !eventMap['korea-export'].impact.dogemars, '한국 수출 카드가 미국 반도체 기업을 직접 움직이면 안 됩니다.');
assert(!eventMap.rare.impact.oil, '희토류 카드가 정유사를 직접 상승시키면 안 됩니다.');
assert(!eventMap['us-regulation'].impact.medi, '미국 기술 규제가 헬스케어 종목을 직접 움직이면 안 됩니다.');
assert(!eventMap['fx-intervention'].impact.argBond, '한국 외환시장 개입이 아르헨티나 국채를 직접 움직이면 안 됩니다.');
assert.equal(engine.eventMacroImpacts['deposit-special'].baseRateDelta, 0, '예금 특판이 기준금리를 변경하면 안 됩니다.');
assert.equal(Math.sign(engine.eventMacroImpacts['rate-up'].exchangeMove), Math.sign(eventMap['rate-up'].impact.usdKrw), '금리 인상 카드 안의 환율 방향이 일치해야 합니다.');
assert.equal(Math.sign(engine.eventMacroImpacts['rate-down'].exchangeMove), Math.sign(eventMap['rate-down'].impact.usdKrw), '금리 인하 카드 안의 환율 방향이 일치해야 합니다.');

const missingNewsroomDetails = engine.scenarioEvents
  .filter((event) => !engine.eventNewsroomDetails[event.id])
  .map((event) => event.id);
assert.deepEqual(missingNewsroomDetails, [], '모든 시장·거시 이슈에 카드별 뉴스 취재 노트가 있어야 합니다.');
for (const event of engine.scenarioEvents) {
  const newsroom = engine.eventNewsroomDetails[event.id];
  for (const field of ['dateline', 'scene', 'quote', 'watch']) {
    const minimumLength = field === 'dateline' ? 4 : 10;
    assert(String(newsroom[field] ?? '').trim().length >= minimumLength, `${event.id} 뉴스의 ${field} 설명이 너무 짧습니다.`);
  }
}

console.log(`시장 엔진 회귀 점검 통과: 계산·상충·카드 연결·뉴스 취재 노트 ${engine.scenarioEvents.length}개`);
