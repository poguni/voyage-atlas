// 방문·통계 계산 테스트: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  visitCount, placeStatus, countryStats, koreaStats, nextGoal, levelClass, isWished, tripIncludes,
} from '../js/stats.js';
import { emptyState, migrate, toBackup, parseBackup, mergeStates } from '../js/backup.js';

const countries = JSON.parse(readFileSync('data/countries.ko.json', 'utf8'));
const S = (patch = {}) => ({ ...emptyState(), ...patch });
const visited = { status: 'visited' };

test('방문 횟수: 단순 표시만 있으면 1회, 없으면 0회', () => {
  const s = S({ places: { 'country:392': visited } });
  assert.equal(visitCount(s, 'country:392'), 1);
  assert.equal(visitCount(s, 'country:250'), 0);
});

test('방문 횟수: 여행 기록이 생기면 단순 표시는 흡수(단순 표시 + 여행 2개 = 2회)', () => {
  const trip = id => ({ id, stops: [{ placeId: 'country:392' }] });
  const s = S({ places: { 'country:392': visited }, trips: [trip('t1'), trip('t2')] });
  assert.equal(visitCount(s, 'country:392'), 2);
});

test('방문 횟수: 국가 안의 도시가 들어간 여행도 그 국가의 방문으로 셈', () => {
  const s = S({ places: { 'city:1': { status: 'visited', countryId: '392' } }, trips: [{ id: 't', stops: [{ placeId: 'city:1' }] }] });
  assert.ok(tripIncludes(s.trips[0], 'country:392', s.places));
  assert.equal(visitCount(s, 'country:392'), 1);
});

test('대한민국: 시도를 하나라도 방문하면 대한민국도 방문 국가', () => {
  const s = S({ places: { 'kr-sido:50': visited } });
  assert.equal(visitCount(s, 'country:410'), 1);
  assert.equal(countryStats(s, countries).visited, 1);
});

test('경유: 기본은 통계에서 빼고, 설정을 켜면 포함', () => {
  const s = S({ places: { 'country:784': { status: 'transit' } } });
  assert.equal(placeStatus(s, 'country:784'), 'transit');
  assert.equal(countryStats(s, countries).visited, 0);
  assert.equal(countryStats(s, countries, { includeTransit: true }).visited, 1);
});

test('국가 통계: 지역(대만)은 국가 수에 넣지 않고 따로 셈, 대륙별 집계', () => {
  const s = S({ places: { 'country:392': visited, 'country:250': visited, 'country:158': visited } });
  const st = countryStats(s, countries);
  assert.equal(st.visited, 2);
  assert.equal(st.regions, 1);
  assert.equal(st.total, 195);
  assert.deepEqual(st.byCont.AS, { visited: 1, total: 47 });
  assert.deepEqual(st.byCont.EU, { visited: 1, total: 45 });
  assert.ok(Math.abs(st.pct - 2 / 195 * 100) < 1e-9);
});

test('한국 통계: 17칸 중 방문 수와 많이 간 순서', () => {
  const s = S({
    places: { 'kr-sido:11': visited, 'kr-sido:29': visited, 'kr-sido:50': visited },
    trips: [{ id: 'a', stops: [{ placeId: 'kr-sido:50' }] }, { id: 'b', stops: [{ placeId: 'kr-sido:50' }] }],
  });
  const k = koreaStats(s);
  assert.equal(k.total, 17);
  assert.equal(k.visited, 3);
  assert.deepEqual(k.ranking[0], { code: '50', count: 2 });
});

test('다음 목표와 방문 단계', () => {
  assert.equal(nextGoal(0), 5);
  assert.equal(nextGoal(19), 20);
  assert.equal(nextGoal(20), 30);
  assert.equal(nextGoal(100), null);
  assert.deepEqual([1, 2, 3, 4, 7].map(levelClass), ['lv1', 'lv2', 'lv3', 'lv4', 'lv4']);
});

test('위시: 달성(doneAt)한 항목은 위시로 보지 않음', () => {
  const s = S({ wishlist: [{ placeId: 'country:268' }, { placeId: 'country:352', doneAt: '2026-10-01' }] });
  assert.ok(isWished(s, 'country:268'));
  assert.ok(!isWished(s, 'country:352'));
});

// ---------- 백업·복원 ----------
test('마이그레이션: 옛 강원(42)·전북(45) 코드를 새 코드(51·52)로 바꿈', () => {
  const s = migrate({ places: { 'kr-sido:42': visited, 'kr-sido:45': visited }, wishlist: [{ placeId: 'kr-sido:42' }] });
  assert.deepEqual(Object.keys(s.places).sort(), ['kr-sido:51', 'kr-sido:52']);
  assert.equal(s.wishlist[0].placeId, 'kr-sido:51');
  assert.equal(s.schemaVersion, 1);
});

test('백업 → 복원 왕복 시 데이터가 같음', () => {
  const s = S({ places: { 'country:392': { status: 'visited', updatedAt: '2026-10-15T00:00:00Z' } }, wishlist: [{ placeId: 'country:268' }] });
  const back = parseBackup(JSON.stringify(toBackup(s)));
  assert.deepEqual(back, s);
});

test('백업 파일이 아니면 알기 쉬운 오류', () => {
  assert.throws(() => parseBackup('not json'), /JSON/);
  assert.throws(() => parseBackup('{"hello":1}'), /백업 파일이 아니에요/);
});

test('합치기: 장소는 최근에 바뀐 쪽, 위시는 합집합', () => {
  const a = S({ places: { 'country:392': { status: 'transit', updatedAt: '2026-01-01' }, 'country:250': visited }, wishlist: [{ placeId: 'country:268' }] });
  const b = S({ places: { 'country:392': { status: 'visited', updatedAt: '2026-05-01' }, 'country:380': visited }, wishlist: [{ placeId: 'country:352' }] });
  const m = mergeStates(a, b);
  assert.equal(m.places['country:392'].status, 'visited');
  assert.deepEqual(Object.keys(m.places).sort(), ['country:250', 'country:380', 'country:392']);
  assert.equal(m.wishlist.length, 2);
});
