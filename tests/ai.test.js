// AI 추천 테스트(PRD 9.3~9.6, Phase 4): 저장된 응답 샘플로 검증·병합·합의·좌표 보정을 확인합니다(실제 호출 없음). npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  historySummary, exclusions, buildMessages, validateResult, parseContent, estimateTokens, costUSD, condKey, defaultConditions, SCHEMA,
} from '../js/ai/prompt.js';
import { mergeResults, checkCoords, normName, distKm, recKey } from '../js/ai/merge.js';
import { MODELS } from '../js/ai/config.js';
import { emptyState, mergeStates } from '../js/backup.js';

const countries = JSON.parse(readFileSync('data/countries.ko.json', 'utf8'));
const TODAY = '2026-10-16';
const NAMES = { 'city:1857910': '교토', 'city:1853909': '오사카', 'city:2735943': '포르투', 'kr-sido:50': '제주특별자치도', 'country:268': '조지아' };
const nameOf = id => NAMES[id] ?? id;
const trip = (id, start, end, stops, extra = {}) => ({ id, start, end, datePrecision: 'day', stops: stops.map(placeId => ({ placeId })), ...extra });

const state = {
  ...emptyState(),
  places: {
    'city:1857910': { countryId: '392', name_ko: '교토', note: '비밀 메모' },
    'city:1853909': { countryId: '392', name_ko: '오사카' },
    'city:2735943': { countryId: '620', name_ko: '포르투' },
  },
  trips: [
    trip('a', '2025-10-03', '2025-10-08', ['city:1857910', 'city:1853909'], { rating: 5, companion: 'family', title: '엄마랑 교토', note: '개인 메모' }),
    trip('b', '2024-05-01', '2024-05-10', ['city:2735943'], { rating: 4, companion: 'friends' }),
    trip('c', '2026-04-11', '2026-04-14', ['kr-sido:50'], { rating: 3, companion: 'family' }),
  ],
  wishlist: [{ id: 'w', placeId: 'country:268', label: '트빌리시' }],
  aiExcluded: [{ key: 'IS:reykjavik', name: '레이캬비크', iso2: 'IS' }],
};

test('이력 요약: 방문국·대륙·별점 4점 이상·최근 패턴·위시, 메모와 여행 제목은 넣지 않음', () => {
  const s = historySummary(state, countries, nameOf, TODAY);
  assert.match(s, /방문한 나라\(3곳\): 일본, 포르투갈, 대한민국|방문한 나라\(3곳\)/);
  assert.match(s, /대륙 분포: 아시아 2, 유럽 1/);
  assert.match(s, /교토·오사카\(★5, 2025년 10월\)/);
  assert.match(s, /포르투\(★4, 2024년 5월\)/);
  assert.ok(!s.includes('제주특별자치도(★3'), '별점 3점 여행은 빼야 함');
  assert.match(s, /다녀온 국내 시도\(1\/17\): 제주특별자치도/);
  assert.match(s, /최근 3년 여행 패턴: 3회/);
  assert.match(s, /동행 가족 2, 친구 1/);
  assert.match(s, /위시리스트.*트빌리시/);
  for (const secret of ['비밀 메모', '개인 메모', '엄마랑']) assert.ok(!s.includes(secret), `${secret}이(가) 들어가면 안 됨`);
});

test('제외 목록: 안 가 본 나라만이면 방문국 + 제외한 추천지, 국내 범위에서는 방문국 제외 안 함', () => {
  const cond = { ...defaultConditions(TODAY), onlyNew: true };
  const ex = exclusions(state, countries, cond, TODAY);
  assert.ok(ex.includes('레이캬비크'));
  assert.ok(ex.includes('일본(나라 전체)'));
  assert.deepEqual(exclusions(state, countries, { ...cond, scope: 'korea' }, TODAY), ['레이캬비크']);
  const msgs = buildMessages(cond, { summary: 'S', excluded: ex });
  assert.equal(msgs.length, 2);
  assert.match(msgs[1].content, /추천하지 말 곳\n레이캬비크/);
  assert.match(msgs[1].content, /아직 가 본 적 없는 나라만/);
});

test('조건 키: 관심사 순서가 달라도 같은 조건', () => {
  const a = defaultConditions(TODAY);
  assert.equal(condKey({ ...a, interests: ['음식', '사진'] }), condKey({ ...a, interests: ['사진', '음식'] }));
  assert.notEqual(condKey(a), condKey({ ...a, days: 8 }));
  assert.equal(defaultConditions(TODAY).month, '2027-01');
});

test('출력 스키마: strict 모드라 모든 속성이 required', () => {
  const item = SCHEMA.schema.properties.recommendations.items;
  assert.deepEqual(Object.keys(item.properties).sort(), [...item.required].sort());
});

// ---------- 저장된 응답 샘플 ----------
const rec = (name_ko, name_en, iso2, lat, lon, extra = {}) => ({
  name_ko, name_en, country_iso2: iso2, type: 'city', lat, lon, reason: `${name_ko} 추천 이유`, linked_history: [], best_months: [5, 9],
  flight_hours_from_origin: 10, budget_level: '중', photo_spots: ['노을'], tags: ['사진'], confidence: 'high', ...extra,
});
const claude = { recommendations: [rec('트빌리시', 'Tbilisi', 'GE', 41.7151, 44.8271), rec('포르투', 'Porto', 'PT', 41.15, -8.61), rec('교토', 'Kyoto', 'JP', 35.01, 135.77), rec('바쿠', 'Baku', 'AZ', 40.41, 49.87), rec('알마티', 'Almaty', 'KZ', 43.24, 76.89)] };
const gpt = { recommendations: [rec('트빌리시', 'Tbilisi City', 'GE', 41.72, 44.79, { best_months: [6] }), rec('교토시', 'Kyōto', 'JP', 35.0, 135.76), rec('루앙프라방', 'Luang Prabang', 'LA', 19.88, 102.13), rec('바투미', 'Batumi', 'GE', 41.64, 41.63), rec('알마티', 'Almaty', 'KZ', 43.25, 76.92, { flight_hours_from_origin: 6 })] };
const gemini = { recommendations: [rec('티빌리시', 'Tbilisi', 'GE', 41.69, 44.80), rec('교토', 'Kyoto', 'JP', 35.02, 135.76), rec('잘못된 곳', 'Bad', 'XX1', 0, 0), rec('달랏', 'Da Lat', 'VN', 11.94, 108.45)] };

test('응답 검증: 울타리 붙은 JSON도 읽고, 잘못된 항목은 빼며 이유를 남김', () => {
  assert.deepEqual(parseContent('```json\n{"a":1}\n```'), { a: 1 });
  const ok = validateResult(gemini);
  assert.equal(ok.recs.length, 3);
  assert.deepEqual(ok.errors, []);
  const bad = validateResult({ recommendations: [rec('x', 'x', 'GE', 200, 0)] });
  assert.equal(bad.recs.length, 0);
  assert.match(bad.errors[0], /lat/);
  assert.deepEqual(validateResult({}).errors, ['recommendations 배열이 없습니다.']);
});

test('병합: 이름 표기가 달라도(교토시·Kyōto) 50km 이내 같은 곳, 합의 3/3·2/3·1/3 순', () => {
  const results = [['claude', claude], ['gpt', gpt], ['gemini', gemini]].map(([model, r]) => ({ model, recs: validateResult(r).recs }));
  const groups = mergeResults(results);
  const by = Object.fromEntries(groups.map(g => [g.name_ko, g]));
  assert.deepEqual(by['트빌리시'].models, ['claude', 'gpt', 'gemini']);
  assert.deepEqual(by['교토'].models, ['claude', 'gpt', 'gemini']);
  assert.deepEqual(by['알마티'].models, ['claude', 'gpt']);
  assert.equal(by['알마티'].hours, 8);                         // 10과 6의 평균
  assert.deepEqual(by['트빌리시'].months, [5, 6, 9]);
  assert.ok(by['바투미'] && by['바투미'].models.length === 1);  // 같은 나라라도 300km 떨어진 곳은 따로
  assert.deepEqual(groups.map(g => g.models.length), [3, 3, 2, 1, 1, 1, 1, 1]);
  assert.equal(groups[0].name_ko, '트빌리시');                  // 같은 합의면 앞 순위
});

test('제외한 추천지는 결과에서 빠짐', () => {
  const results = [{ model: 'claude', recs: validateResult(claude).recs }];
  const groups = mergeResults(results, { excluded: new Set(['GE:tbilisi']) });
  assert.ok(!groups.some(g => g.name_ko === '트빌리시'));
  assert.equal(recKey(validateResult(claude).recs[0]), 'GE:tbilisi');
});

test('좌표 검증: 나라 경계 밖이면 나라 중심으로 옮기고 확인 필요 표시', () => {
  const r = validateResult({ recommendations: [rec('트빌리시', 'Tbilisi', 'GE', 10, 10)] }).recs[0];
  const fixed = checkCoords(r, () => false, () => [43.5, 42.3]);
  assert.deepEqual(fixed.ll, [43.5, 42.3]);
  assert.equal(fixed.needsCheck, true);
  assert.equal(checkCoords(r, () => true, () => null).needsCheck, false);
  assert.equal(checkCoords(r, () => null, () => null).needsCheck, false);   // 경계 데이터가 없으면 그대로
});

test('이름 정규화·거리', () => {
  assert.equal(normName('Kyōto City'), normName('kyoto'));
  assert.equal(normName('교토시'), '교토');
  assert.ok(Math.abs(distKm([126.98, 37.57], [129.08, 35.18]) - 325) < 10);   // 서울-부산 약 325km
});

test('비용 추정: 한글 1글자 ≈ 1토큰, 단가는 100만 토큰당', () => {
  assert.equal(estimateTokens('abcd가나'), 3);
  const claudePrice = MODELS[0].price;
  assert.equal(costUSD(claudePrice, 2000, 2000), 0.024);
});

test('백업 합치기에 제외 목록 포함', () => {
  const a = { ...emptyState(), aiExcluded: [{ key: 'A' }] }, b = { ...emptyState(), aiExcluded: [{ key: 'A' }, { key: 'B' }] };
  assert.deepEqual(mergeStates(a, b).aiExcluded.map(x => x.key), ['A', 'B']);
});
