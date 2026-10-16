// 통계 확장 테스트(PRD F4-6~F4-8, Phase 5e): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripDistanceKm, distanceSummary, monthlyTrips, companionShare, EARTH_KM } from '../js/stats.js';
import { emptyState } from '../js/backup.js';

const TODAY = '2026-10-16';
const S = (patch = {}) => ({ ...emptyState(), ...patch });
const trip = (id, start, stops, extra = {}) => ({ id, start, end: start, datePrecision: 'day', stops: stops.map(placeId => ({ placeId })), ...extra });
const ICN = [126.45, 37.46];
const LL = { 'city:tokyo': [139.69, 35.69], 'city:paris': [2.35, 48.85], 'kr-sigungu:26350': [129.16, 35.17] };
const llOf = id => LL[id] ?? null;

test('이동 거리: 홈 공항 → 경유지 순서 → 홈 공항, 좌표 모르는 곳은 건너뜀', () => {
  const t = trip('a', '2024-01-01', ['city:tokyo', 'city:unknown']);
  const km = tripDistanceKm(t, ICN, llOf);
  assert.ok(km > 2300 && km < 2600, `인천↔도쿄 왕복 약 2,450km: ${km}`);
  assert.equal(tripDistanceKm(trip('b', '2024-01-01', ['city:unknown']), ICN, llOf), 0);
});

test('이동 거리 합계: 미래 여행 제외, 연도별, 지구 바퀴 환산', () => {
  const s = S({
    places: { 'kr-sigungu:26350': { countryId: '410', sido: '26' } },
    trips: [
      trip('a', '2019-04-01', ['city:tokyo']),
      trip('b', '2022-06-01', ['city:paris', 'city:tokyo']),
      trip('c', '2025-08-01', ['kr-sigungu:26350']),
      trip('f', '2027-01-01', ['city:paris']),
    ],
  });
  const all = distanceSummary(s, { home: ICN, llOf, today: TODAY });
  assert.equal(all.trips, 3);
  assert.equal(all.overseasPlaces, 2);                 // 도쿄·파리(해운대는 국내)
  assert.ok(Math.abs(all.laps - all.km / EARTH_KM) < 1e-9);
  const y2022 = distanceSummary(s, { home: ICN, llOf, today: TODAY, year: 2022 });
  assert.equal(y2022.trips, 1);
  assert.ok(y2022.km > 18000 && y2022.km < 20000, `인천→파리→도쿄→인천: ${y2022.km}`);
});

test('월별 빈도와 동행 비율: 출발 월 기준, 기록 없음은 맨 뒤', () => {
  const s = S({
    trips: [
      trip('a', '2019-10-01', ['city:tokyo'], { companion: 'family' }),
      trip('b', '2022-10-05', ['city:paris'], { companion: 'family' }),
      { id: 'c', start: '2023-05', datePrecision: 'month', stops: [], companion: 'solo' },
      trip('d', '2024-01-01', ['city:tokyo']),
      { id: 'e', stops: [] },                              // 날짜 미상: 월별에서 제외
    ],
  });
  const m = monthlyTrips(s, { today: TODAY });
  assert.equal(m[9], 2);
  assert.equal(m[4], 1);
  assert.equal(m[0], 1);
  assert.equal(m.reduce((a, b) => a + b), 4);
  assert.deepEqual(monthlyTrips(s, { today: TODAY, year: 2022 })[9], 1);
  assert.deepEqual(companionShare(s, { today: TODAY }), [
    { type: 'family', count: 2, pct: 40 }, { type: 'solo', count: 1, pct: 20 }, { type: 'none', count: 2, pct: 40 },
  ]);
});
