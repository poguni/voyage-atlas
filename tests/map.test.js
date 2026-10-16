// 지도 확장 테스트(PRD F1-9~F1-11, Phase 5d): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visitCount, sigunguKey, visitedCities, lastVisitYear, mainCompanion, yearBuckets } from '../js/stats.js';
import { emptyState } from '../js/backup.js';

const TODAY = '2026-10-16';
const S = (patch = {}) => ({ ...emptyState(), ...patch });
const trip = (id, start, stops, extra = {}) => ({ id, start, end: start, datePrecision: 'day', stops: stops.map(placeId => ({ placeId })), ...extra });
const gangneung = { 'kr-sigungu:51150': { name_ko: '강릉시', countryId: '410', sido: '51', status: 'visited' } };

test('시군구를 방문함으로 표시하면 그 시도와 대한민국도 방문(F2-8)', () => {
  const s = S({ places: gangneung });
  assert.equal(visitCount(s, 'kr-sido:51', TODAY), 1);
  assert.equal(visitCount(s, 'country:410', TODAY), 1);
  assert.equal(visitCount(s, 'kr-sido:11', TODAY), 0);
});

test('시군구 코드: 일반 시 안의 구는 시 하나로, 자치구는 그대로', () => {
  assert.deepEqual(sigunguKey('41111', '수원시장안구'), { code: '41110', name: '수원시' });
  assert.deepEqual(sigunguKey('41192', '부천시원미구'), { code: '41190', name: '부천시' });
  assert.deepEqual(sigunguKey('11140', '중구'), { code: '11140', name: '중구' });
  // 데이터의 시군구 경계 256개 → 장소 230곳(data/cities.json과 같은 코드)
  const topo = JSON.parse(readFileSync('data/korea-sigungu.json', 'utf8'));
  const keys = new Set(topo.objects.sigungu.geometries.map(g => sigunguKey(g.properties.code, g.properties.name).code));
  const cities = JSON.parse(readFileSync('data/cities.json', 'utf8'));
  assert.deepEqual([...keys].sort(), cities.sigungu.rows.map(r => r[0]).sort());
});

test('지도 핀: 다녀온 도시만(미래 여행·경유는 빼기)', () => {
  const s = S({
    places: { ...gangneung, 'city:1': { countryId: '392' }, 'city:2': { countryId: '392', status: 'transit' }, 'city:3': { countryId: '250' } },
    trips: [trip('a', '2019-05-01', ['city:1']), trip('b', '2023-05-01', ['city:1']), trip('f', '2027-01-01', ['city:3'])],
  });
  assert.deepEqual(visitedCities(s, 'city', TODAY), [{ placeId: 'city:1', count: 2 }]);
  assert.deepEqual(visitedCities(s, 'kr-sigungu', TODAY), [{ placeId: 'kr-sigungu:51150', count: 1 }]);
});

test('색칠 기준: 마지막 방문 연도와 주된 동행', () => {
  const s = S({
    places: { 'city:1': { countryId: '392' }, 'country:250': { status: 'visited' } },
    trips: [
      trip('a', '2016-05-01', ['city:1'], { companion: 'family' }),
      trip('b', '2019-05-01', ['country:392'], { companion: 'friends' }),
      trip('c', '2022-05-01', ['city:1'], { companion: 'friends' }),
      trip('d', '2024-05-01', ['country:392'], { companion: 'family' }),
      trip('f', '2027-01-01', ['country:392'], { companion: 'solo' }),
    ],
  });
  assert.equal(lastVisitYear(s, 'country:392', TODAY), 2024);   // 미래 여행 제외, 도시 여행 포함
  assert.equal(lastVisitYear(s, 'city:1', TODAY), 2022);
  assert.equal(lastVisitYear(s, 'country:250', TODAY), null);   // 날짜 없는 표시
  assert.equal(mainCompanion(s, 'country:392', TODAY), 'family'); // 가족 2 · 친구 2 → 최근(2024) 가족
  assert.equal(mainCompanion(s, 'city:1', TODAY), 'friends');
  assert.equal(mainCompanion(s, 'country:250', TODAY), null);
});

test('연도 구간: 5개 이하면 해마다, 넘으면 5등분', () => {
  assert.deepEqual(yearBuckets([2022, 2019, 2022]), [{ from: 2019, to: 2019 }, { from: 2022, to: 2022 }]);
  const b = yearBuckets([2010, 2012, 2015, 2018, 2021, 2024]);
  assert.equal(b.length, 5);
  assert.equal(b[0].from, 2010);
  assert.equal(b.at(-1).to, 2024);
  for (let i = 1; i < b.length; i++) assert.equal(b[i].from, b[i - 1].to + 1);
});
