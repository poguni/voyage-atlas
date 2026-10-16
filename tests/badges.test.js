// 마일스톤·배지 테스트(PRD F5, Phase 5a): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BADGES, evaluate, metrics, replayDates, newlyEarned, nextGoals, vaultOrder, headline } from '../js/badges.js';
import { emptyState } from '../js/backup.js';

const countries = JSON.parse(readFileSync('data/countries.ko.json', 'utf8'));
const TODAY = '2026-10-16';
const S = (patch = {}) => ({ ...emptyState(), ...patch });
const trip = (id, start, stops) => ({ id, start, end: start, datePrecision: 'day', stops: stops.map(placeId => ({ placeId })) });
const visited = ids => Object.fromEntries(ids.map(id => [`country:${id}`, { status: 'visited' }]));
const by = list => Object.fromEntries(list.map(b => [b.id, b]));

test('배지 13개: 첫 해외여행, 5·10·20·30·50·100개국, 2~6대륙, 시도 완주', () => {
  assert.equal(BADGES.length, 13);
  assert.deepEqual(BADGES.map(b => b.icon), ['1st', '5', '10', '20', '30', '50', '100', '2대륙', '3대륙', '4대륙', '5대륙', '6대륙', '17']);
});

test('대한민국만 방문하면 첫 해외여행은 아직, 나라 1개는 셈', () => {
  const s = S({ places: { 'kr-sido:50': { status: 'visited' } } });
  const m = metrics(s, countries, { today: TODAY });
  assert.equal(m.first, 0);
  assert.equal(m.countries, 1);
  assert.equal(m.korea, 1);
});

test('달성과 진행률: 5개국 달성, 10개국은 진행 중, 대만(지역)은 나라 수에서 제외', () => {
  // 일본, 프랑스, 이탈리아, 미국, 호주 + 대만(158, 지역)
  const s = S({ places: visited(['392', '250', '380', '840', '036', '158']) });
  const b = by(evaluate(s, countries, { today: TODAY }));
  assert.equal(b['first-abroad'].earned, true);
  assert.equal(b['countries-5'].earned, true);
  assert.equal(b['countries-10'].earned, false);
  assert.equal(b['countries-10'].progress, 0.5);
  assert.equal(b['continents-4'].earned, true);   // 아시아·유럽·북아메리카·오세아니아
  assert.equal(b['continents-5'].earned, false);
});

test('달성 날짜: 날짜 있는 여행을 차례로 쌓아 처음 달성한 여행의 시작일', () => {
  const s = S({
    places: { 'city:1': { countryId: '392' } },
    trips: [
      trip('c', '2020-01-10', ['country:840', 'country:124']),       // 미국·캐나다 → 일본·프랑스·한국 포함 5개국, 3대륙
      trip('a', '2016-08-01', ['city:1']),                           // 일본 → 첫 해외
      trip('b', '2018-04-05', ['country:250', 'kr-sido:11']),        // 프랑스·한국 → 2대륙
      trip('d', '2023-03-01', ['country:036']),                      // 호주 → 4대륙
      trip('f', '2027-01-01', ['country:076']),                      // 미래 여행은 빼기
    ],
  });
  const d = replayDates(s, countries, TODAY);
  assert.equal(d['first-abroad'], '2016-08-01');
  assert.equal(d['continents-2'], '2018-04-05');
  assert.equal(d['continents-3'], '2020-01-10');
  assert.equal(d['countries-5'], '2020-01-10');
  assert.equal(d['continents-4'], '2023-03-01');
  assert.equal(d['continents-5'], undefined);
});

test('달성 날짜: 날짜 없는 방문 표시는 먼저 다녀온 것으로 보고, 여행이 마지막 대륙을 채우면 그 여행 날짜', () => {
  const s = S({
    places: visited(['392', '250', '840', '036']),                  // 아시아·유럽·북아메리카·오세아니아(날짜 없음)
    trips: [trip('br', '2019-07-01', ['country:076'])],              // 브라질 → 다섯 대륙
  });
  const d = replayDates(s, countries, TODAY);
  assert.equal(d['continents-5'], '2019-07-01');
  assert.equal(d['countries-5'], '2019-07-01');
  assert.equal(d['continents-4'], undefined);                       // 표시만으로 이미 달성 → 날짜 모름(오늘로 기록)
});

test('새로 달성: 이미 기록된 배지는 빼고, 여행 날짜가 없으면 오늘', () => {
  const s = S({ places: visited(['392', '250', '380', '840', '036']), achievements: { 'first-abroad': '2016-08-01' } });
  const { list, dates } = newlyEarned(s, countries, { today: TODAY });
  assert.ok(!list.some(b => b.id === 'first-abroad'));
  assert.deepEqual(Object.keys(dates).sort(), ['continents-2', 'continents-3', 'continents-4', 'countries-5']);
  assert.equal(dates['countries-5'], TODAY);
  assert.equal(headline(list).id, 'countries-5');      // 나라 배지를 가장 크게 축하
});

test('다음 목표 제안: 가까운 것부터, 대륙이 2곳 이하로 남으면 이름으로', () => {
  // 9개국(10개국까지 1개국) + 다섯 대륙(남아메리카만 남음)
  const s = S({ places: visited(['392', '250', '380', '840', '036', '818', '124', '484', '410']) });
  const g = nextGoals(s, countries, { today: TODAY });
  assert.equal(g[0].text, '1개국만 더 가면 10개국 달성!');
  assert.ok(g.some(x => x.text === '남아메리카만 남았어요'));
  assert.ok(g.some(x => x.text === '국내 시도 17곳이 남았어요'));
});

test('보관함 순서: 달성(날짜순) → 잠김(진행률 순)', () => {
  const list = [
    { id: 'a', earned: true, date: '2020-01-01', progress: 1 }, { id: 'b', earned: false, progress: 0.2 },
    { id: 'c', earned: true, date: '2018-01-01', progress: 1 }, { id: 'd', earned: false, progress: 0.9 },
  ];
  assert.deepEqual(vaultOrder(list).map(b => b.id), ['c', 'a', 'd', 'b']);
});
