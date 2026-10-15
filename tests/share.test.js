// 공유 포스터 내용·배치 테스트(PRD F8, Phase 3): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { worldModel, koreaModel, posterLayout, dateRange, parseSize, SIZES, EXPORT_SCALE } from '../js/share/model.js';
import { emptyState } from '../js/backup.js';

const countries = JSON.parse(readFileSync('data/countries.ko.json', 'utf8'));
const topo = JSON.parse(readFileSync('data/korea-sido.json', 'utf8'));
const sido = topo.objects.sido.geometries.map(g => ({ ...g.properties, ll: [127, 36] }));
const TODAY = '2026-10-15';
const S = (patch = {}) => ({ ...emptyState(), ...patch });
const trip = (id, start, end, stops) => ({ id, start, end, datePrecision: 'day', stops: stops.map(placeId => ({ placeId })) });

const state = S({
  places: { 'country:620': { status: 'visited' }, 'city:1857910': { countryId: '392', name_ko: '교토', lat: 35.02, lon: 135.75 } },
  trips: [
    trip('jp1', '2016-08-01', '2016-08-05', ['city:1857910']),
    trip('jp2', '2025-10-03', '2025-10-08', ['country:392']),
    trip('jeju', '2026-04-11', '2026-04-14', ['kr-sido:50']),
    trip('future', '2027-01-10', '2027-01-12', ['country:250']),
  ],
  wishlist: [
    { id: 'w1', placeId: 'country:268' },                       // 조지아(별)
    { id: 'w2', placeId: 'country:392' },                       // 이미 방문 → 별 없음
    { id: 'w3', placeId: 'kr-sido:51' },                        // 강원(한국 포스터에만)
    { id: 'w4', placeId: 'country:724', doneAt: '2026-01-01' }, // 이룬 꿈 → 별 없음
  ],
});

test('월드 포스터: 방문국 수, 방문 단계, 대륙 막대, 요약', () => {
  const m = worldModel(state, countries, { today: TODAY });
  assert.equal(m.big, '3');                                  // 일본·포르투갈·대한민국(제주 여행)
  assert.equal(m.levels.get('392'), 2);                      // 일본 여행 2번
  assert.equal(m.levels.get('620'), 1);                      // 포르투갈 단순 표시
  assert.ok(!m.levels.has('250'));                           // 미래 여행(프랑스)은 아직 방문 아님
  assert.equal(m.rows.length, 6);
  assert.deepEqual(m.rows.map(r => r.label), ['아시아', '유럽', '아프리카', '북아메리카', '남아메리카', '오세아니아']);
  assert.equal(m.summary, '여행 3회 · 15일 · 2개 대륙');
  assert.deepEqual(m.stars.map(w => w.placeId), ['country:268']);
  assert.ok(m.stars[0].ll.length === 2);
});

test('대한민국 포스터: 정복률, 시도 칩 17개(제주 방문), 국내 여행 요약, 한국 위시 별', () => {
  const m = koreaModel(state, sido, { today: TODAY });
  assert.equal(m.big, '1');
  assert.equal(m.bigLabel, '/ 17 시도 · 정복률 6%');
  assert.equal(m.chips.length, 17);
  assert.deepEqual(m.chips.filter(c => c.level).map(c => c.placeId), ['kr-sido:50']);
  assert.equal(m.summary, '국내 여행 1회 · 4일');
  assert.equal(m.dates, '2026. 4 — 2026. 10');
  assert.deepEqual(m.stars.map(w => w.placeId), ['kr-sido:51']);
});

test('빈 기록에서도 포스터를 만들 수 있음', () => {
  const w = worldModel(S(), countries, { today: TODAY });
  assert.equal(w.big, '0');
  assert.equal(w.summary, '0개 대륙');
  assert.equal(w.dates, null);
  const k = koreaModel(S(), sido, { today: TODAY });
  assert.equal(k.summary, '남은 시도 17곳');
});

test('날짜 범위: 첫 여행 ~ 이번 달, 미래 여행 제외', () => {
  assert.equal(dateRange(state.trips, TODAY), '2016. 8 — 2026. 10');
  assert.equal(dateRange([trip('f', '2027-01-01', '2027-01-02', [])], TODAY), null);
});

test('배치: 4가지 크기 모두 지도·글이 포스터 안에 있고 겹치지 않음', () => {
  for (const [size] of SIZES) {
    const [W, H] = parseSize(size);
    for (const nums of [true, false]) {
      const L = posterLayout(W, H, { nums });
      const [[x0, y0], [x1, y1]] = L.mapBox;
      // 세로는 제목 아래, 가로는 제목·숫자 오른쪽
      const clear = L.land ? x0 >= L.tx + L.titleMaxW : y0 > L.titleY;
      assert.ok(clear && x0 >= 0 && x1 <= W && y1 <= H, `${size} 지도 상자`);
      assert.ok(y1 - y0 > H * 0.2 && x1 - x0 > W * 0.4, `${size} 지도가 너무 작음`);
      if (!nums) continue;
      if (!L.land) assert.ok(L.big.y - L.big.size * 0.75 > y1, `${size} 큰 숫자가 지도와 겹침`);
      const lastRow = L.rows.y + Math.ceil(6 / L.rows.cols - 1) * L.rows.rowH + 20 * L.s;
      assert.ok(lastRow < L.summaryY - 26 * L.s, `${size} 막대가 요약과 겹침`);
      const chipRows = Math.ceil(17 / L.rows.chipCols);
      assert.ok(L.rows.y - 26 * L.s + chipRows * (L.rows.rowH) < L.summaryY - 20 * L.s, `${size} 시도 칩이 요약과 겹침`);
    }
  }
});

test('저장 크기는 2배 해상도', () => {
  assert.equal(EXPORT_SCALE, 2);
  assert.deepEqual(parseSize('1080x1350').map(v => v * EXPORT_SCALE), [2160, 2700]);
});
