// 여행 통계 테스트(PRD 10.3, Phase 2): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tripDays, daysSummary, daysByYear, isDomestic, visitCount, countryRanking, recordFacts, placeVisits,
  dday, tripStarted, countriesInYear, tripYears,
} from '../js/stats.js';
import { emptyState } from '../js/backup.js';

const countries = JSON.parse(readFileSync('data/countries.ko.json', 'utf8'));
const TODAY = '2026-10-15';
const S = (patch = {}) => ({ ...emptyState(), ...patch });
const trip = (id, start, end, stops, extra = {}) => ({ id, start, end, datePrecision: 'day', stops: stops.map(placeId => ({ placeId })), ...extra });
const kyoto = { 'city:1857910': { countryId: '392', name_ko: '교토' }, 'city:1853909': { countryId: '392', name_ko: '오사카' } };

test('여행 일수: 종료일 − 시작일 + 1, 날짜가 일 단위가 아니면 null', () => {
  assert.equal(tripDays(trip('a', '2025-10-03', '2025-10-08', [])), 6);
  assert.equal(tripDays(trip('a', '2025-10-03', '2025-10-03', [])), 1);
  assert.equal(tripDays({ start: '2019-05', end: '2019-05', datePrecision: 'month' }), null);
});

test('여행 일수 합계: 겹치는 날짜(출장 + 여행)는 한 번만 셈', () => {
  const s = S({ trips: [trip('a', '2025-10-01', '2025-10-05', ['country:392']), trip('b', '2025-10-04', '2025-10-08', ['country:392'])] });
  assert.equal(daysSummary(s, { today: TODAY }).total, 8);
});

test('해외·국내 구분과 날짜 미상 여행 분리', () => {
  const s = S({
    trips: [
      trip('jeju', '2026-04-11', '2026-04-14', ['kr-sido:50']),
      trip('jp', '2025-10-03', '2025-10-08', ['country:392']),
      { id: 'old', start: '2010-08', end: '2010-08', datePrecision: 'month', stops: [{ placeId: 'country:250' }] },
      { id: 'nodate', datePrecision: 'unknown', stops: [{ placeId: 'country:380' }] },
    ],
  });
  assert.ok(isDomestic(s.trips[0], s.places));
  assert.ok(!isDomestic(s.trips[1], s.places));
  assert.deepEqual(daysSummary(s, { today: TODAY }), { total: 10, overseas: 6, domestic: 4, unknownTrips: 2 });
});

test('연말을 넘는 여행은 연도별로 나눠 셈', () => {
  const s = S({ trips: [trip('a', '2024-12-30', '2025-01-02', ['country:392'])] });
  assert.deepEqual(daysByYear(s, TODAY), [{ year: 2024, days: 2 }, { year: 2025, days: 2 }]);
});

test('미래 여행(예정)은 방문 횟수·일수에 넣지 않음', () => {
  const s = S({ trips: [trip('a', '2027-01-21', '2027-01-25', ['country:392'])] });
  assert.ok(!tripStarted(s.trips[0], TODAY));
  assert.equal(visitCount(s, 'country:392', TODAY), 0);
  assert.equal(daysSummary(s, { today: TODAY }).total, 0);
});

test('도시가 들어간 여행: 국가 방문 횟수와 많이 간 나라 순위(도시 이름 포함)', () => {
  const s = S({
    places: kyoto,
    trips: [trip('a', '2025-10-03', '2025-10-08', ['city:1857910', 'city:1853909']), trip('b', '2023-02-09', '2023-02-13', ['country:392']), trip('c', '2024-05-03', '2024-05-17', ['country:250'])],
  });
  assert.equal(visitCount(s, 'country:392', TODAY), 2);
  const r = countryRanking(s, countries, { today: TODAY });
  assert.equal(r[0].id, '392');
  assert.equal(r[0].count, 2);
  assert.deepEqual(r[0].cities.sort(), ['오사카', '교토'].sort());
  assert.equal(r[1].id, '250');
});

test('기록으로 본 나: 가장 긴 여행, 자주 떠난 달, 동행 비율, 첫 해외여행 이후', () => {
  const s = S({
    trips: [
      trip('a', '2016-08-01', '2016-08-05', ['country:392'], { companion: 'family' }),
      trip('b', '2024-05-03', '2024-05-17', ['country:276'], { companion: 'family' }),
      trip('c', '2025-10-03', '2025-10-08', ['country:392'], { companion: 'friends' }),
      trip('d', '2015-10-03', '2015-10-04', ['kr-sido:50'], { companion: 'solo' }),
    ],
    wishlist: [{ placeId: 'country:268', doneAt: '2026-01-01' }, { placeId: 'country:352' }],
  });
  const f = recordFacts(s, TODAY);
  assert.equal(f.longest.trip.id, 'b');
  assert.equal(f.longest.days, 15);
  assert.deepEqual(f.topMonth, { month: 10, count: 2 });
  assert.deepEqual(f.companion, { type: 'family', pct: 50 });
  assert.deepEqual(f.wish, { done: 1, total: 2 });
  assert.equal(f.firstOverseasYear, 2016);   // 2015 제주는 국내라 제외
  assert.equal(f.yearsSinceFirstOverseas, 10);
});

test('장소의 방문 기록: 최근 여행부터, 첫·최근 방문일', () => {
  const s = S({ trips: [trip('a', '2016-08-01', '2016-08-05', ['country:392']), trip('b', '2025-10-03', '2025-10-08', ['country:392'])] });
  const v = placeVisits(s, 'country:392', TODAY);
  assert.deepEqual(v.trips.map(t => t.id), ['b', 'a']);
  assert.equal(v.first, '2016-08-01');
  assert.equal(v.last, '2025-10-03');
});

test('연도 보기: 그해 방문국과 여행이 있는 해 목록', () => {
  const s = S({ trips: [trip('a', '2025-10-03', '2025-10-08', ['country:392', 'country:410']), trip('b', '2024-05-03', '2024-05-17', ['country:250'])] });
  assert.deepEqual(countriesInYear(s, 2025, TODAY).sort(), ['392', '410']);
  assert.deepEqual(tripYears(s, TODAY), [2025, 2024]);
});

test('D-day: 날짜와 연·월 목표', () => {
  assert.equal(dday('2027-01-21', '2026-10-15'), 98);
  assert.equal(dday('2026-10-15', '2026-10-15'), 0);
  assert.equal(dday('2026-11', '2026-10-15'), 17);
  assert.equal(dday(null, '2026-10-15'), null);
});
