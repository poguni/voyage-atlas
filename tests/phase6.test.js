// Phase 6 테스트: 트립픽 JSON(F9-6, F6-8), 위시 보드(F8-6), 사진 썸네일 크기(F2-10): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tripPickExport, excludeLine } from '../js/trippick.js';
import { wishModel, posterLayout, parseSize, SIZES, WISH_LABELS } from '../js/share/model.js';
import { fitSize } from '../js/thumb.js';
import { emptyState } from '../js/backup.js';
import { KR_SIDO } from '../js/stats.js';

const countries = JSON.parse(readFileSync('data/countries.ko.json', 'utf8'));
const TODAY = '2026-10-17';
const NAMES = {
  'country:392': ['일본', 'Japan', [138, 36]], 'country:250': ['프랑스', 'France', [2, 46]], 'country:410': ['대한민국', 'South Korea', [127.8, 36.4]],
  'country:268': ['조지아', 'Georgia', [43.5, 42.3]], 'city:1857910': ['교토', 'Kyoto', [135.75, 35.02]], 'city:611717': ['트빌리시', 'Tbilisi', [44.8, 41.7]],
  'kr-sido:50': ['제주특별자치도', null, [126.5, 33.4]], 'kr-sido:51': ['강원특별자치도', null, [128.3, 37.7]], 'country:352': ['아이슬란드', 'Iceland', [-18.6, 64.9]],
};
const infoOf = id => (NAMES[id] ? { name: NAMES[id][0], en: NAMES[id][1], ll: NAMES[id][2] } : null);
const trip = (id, start, stops) => ({ id, start, end: start, datePrecision: 'day', stops: stops.map(placeId => ({ placeId })) });

const state = {
  ...emptyState(),
  places: {
    'city:1857910': { countryId: '392', name_ko: '교토' },
    'city:611717': { countryId: '268', name_ko: '트빌리시', lat: 41.7, lon: 44.8 },
    'country:250': { status: 'visited' },
  },
  trips: [trip('a', '2019-04-01', ['city:1857910']), trip('b', '2025-08-01', ['kr-sido:50']), trip('f', '2027-01-01', ['country:352'])],
  wishlist: [
    { id: 'w1', placeId: 'city:611717', priority: 'nextyear', targetMonth: '2027-05', reason: '노을 사진', budgetKRW: 2500000, order: 2 },
    { id: 'w2', placeId: 'kr-sido:51', priority: 'someday', order: 1 },
    { id: 'w3', placeId: 'country:352', priority: 'confirmed', targetMonth: '2027-01', order: 3 },
    { id: 'w4', placeId: 'country:392', doneAt: '2019-04-05' },
  ],
};

test('트립픽 JSON: 다녀온 나라·시도·도시, 위시 → 후보, 제외 조건 문장', () => {
  const out = tripPickExport(state, { countries, sidoCodes: KR_SIDO, infoOf, homeAirport: 'ICN', today: TODAY, now: new Date('2026-10-17T00:00:00Z') });
  assert.equal(out.app, 'voyage-atlas');
  assert.equal(out.kind, 'trippick');
  assert.deepEqual(out.visited.countries.map(c => c.iso2), ['KR', 'JP', 'FR']);    // 가나다순, 미래 아이슬란드 제외
  assert.deepEqual(out.visited.countries[1], { iso2: 'JP', iso3: 'JPN', name_ko: '일본', name_en: 'Japan', region: false, visits: 1, lastVisit: '2019-04-01' });
  assert.deepEqual(out.visited.koreaSido.map(s => s.code), ['50']);
  assert.deepEqual(out.visited.cities.map(c => [c.name_ko, c.country_iso2]), [['교토', 'JP']]);
  assert.equal(out.candidates.length, 3);                                           // 이룬 꿈(일본)은 빠짐
  assert.deepEqual(out.candidates[0], { name: '트빌리시', tripType: 'overseas', country: '조지아', region: null, code: null, note: '노을 사진 · 목표 2027. 5 · 내년 · 1인 예산 250만 원', targetMonth: '2027-05' });
  assert.deepEqual(out.candidates[1], { name: '강원특별자치도', tripType: 'domestic', country: null, region: '강원특별자치도', code: null, note: '언젠가', targetMonth: null });
  assert.equal(out.excludeText.overseas, '이미 가 본 나라: 일본, 프랑스');            // 대한민국은 해외 제외 조건에 넣지 않음
  assert.equal(out.excludeText.domestic, '이미 가 본 시도: 제주특별자치도');
});

test('제외 조건 문장은 200자 안에서 앞쪽부터, 넘치면 "외 n곳"', () => {
  const names = Array.from({ length: 80 }, (_, i) => `나라${i + 1}`);
  const line = excludeLine('이미 가 본 나라: ', names);
  assert.ok(line.length <= 200, `${line.length}자`);
  assert.match(line, /^이미 가 본 나라: 나라1, 나라2, .* 외 \d+곳$/);
  assert.equal(excludeLine('x', []), '');
});

test('위시 보드: 우선순위 → 목표 시기 순 번호, 위시 나라 칠하기, 이룬 꿈 수', () => {
  const m = wishModel(state, countries, { infoOf: id => ({ ...infoOf(id), countryName: { 'city:611717': '조지아' }[id] }), today: TODAY });
  assert.equal(m.title, '내가 꿈꾸는 곳');
  assert.deepEqual(m.stars.map(s => s.label), ['1 아이슬란드', '2 트빌리시', '3 강원특별자치도']);   // 확정 → 내년 → 언젠가
  assert.equal(m.big, '3');
  assert.equal(m.bigLabel, '곳 · 이룬 꿈 1');
  assert.deepEqual(m.facts[1], { label: '2. 트빌리시', value: '조지아 · 2027. 5' });
  assert.equal(m.facts[2].value, '언젠가');
  assert.ok(m.wishLands.has('268') && m.wishLands.has('352') && m.wishLands.has('410'));
  assert.equal(m.summary, '위시 3곳 · 2개 대륙 · 달성률 25%');
  assert.equal(m.dates, '2027. 1 — 2027. 5');
  // 별이 많으면 앞의 8개에만 이름
  const many = { ...emptyState(), wishlist: Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, placeId: 'country:392', order: i })) };
  assert.equal(wishModel(many, countries, { infoOf, today: TODAY }).stars.filter(s => s.label).length, WISH_LABELS);
});

test('위시 보드: 모든 크기에서 사실 6줄이 요약과 겹치지 않음', () => {
  for (const [size] of SIZES) {
    const [W, H] = parseSize(size);
    const L = posterLayout(W, H);
    const cols = Math.min(L.rows.cols, 2), last = L.rows.y + (Math.ceil(6 / cols) - 1) * L.rows.rowH + 14 * L.s;
    assert.ok(last < L.summaryY - 26 * L.s, `${size}`);
  }
});

test('사진 썸네일: 긴 변 640px, 작은 사진은 그대로', () => {
  assert.deepEqual(fitSize(4032, 3024), [640, 480]);
  assert.deepEqual(fitSize(3024, 4032), [480, 640]);
  assert.deepEqual(fitSize(500, 300), [500, 300]);
});
