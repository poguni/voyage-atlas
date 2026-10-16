// 마일스톤·배지(순수 함수, PRD F5-1·F5-3·F5-4). 달성 여부는 늘 지금 기록에서 계산하고,
// 달성 날짜는 state.achievements({ 배지 ID: 'YYYY-MM-DD' })에 남깁니다(PRD 10.2).
import {
  countryStats, koreaStats, visitCount, countryId, countryOf, sidoOf, tripStarted, KOREA, KR_SIDO, GOALS, todayStr,
} from './stats.js';
import { CONT, CONT_ORDER } from './data.js';

const CONT_WORDS = { 2: '두', 3: '세', 4: '네', 5: '다섯', 6: '여섯' };

// kind: first(첫 해외여행) | countries | continents | korea
export const BADGES = [
  { id: 'first-abroad', kind: 'first', target: 1, icon: '1st', title: '첫 해외여행', cheer: '첫 해외여행을 떠났어요!' },
  ...GOALS.map(n => ({ id: `countries-${n}`, kind: 'countries', target: n, icon: String(n), title: `${n}개국` })),
  ...[2, 3, 4, 5, 6].map(n => ({ id: `continents-${n}`, kind: 'continents', target: n, icon: `${n}대륙`, title: `${CONT_WORDS[n]} 대륙` })),
  { id: 'korea-17', kind: 'korea', target: KR_SIDO.length, icon: '17', title: '시도 완주', cheer: '17개 시도를 모두 밟았어요!' },
];

// 지금 기록의 수치: { first, countries, continents, korea, missingConts, pct }
export function metrics(state, countries, { includeTransit = false, today = todayStr() } = {}) {
  const cs = countryStats(state, countries, { includeTransit });
  const first = countries.some(c => c.id !== KOREA && visitCount(state, countryId(c.id), today) > 0) ? 1 : 0;
  const conts = CONT_ORDER.filter(k => cs.byCont[k].visited);
  return {
    first, countries: cs.visited, continents: conts.length, korea: koreaStats(state).visited,
    missingConts: CONT_ORDER.filter(k => !cs.byCont[k].visited).map(k => CONT[k]), pct: cs.pct,
  };
}

/** 배지 목록: [{ ...badge, value, earned, progress(0~1), date }] */
export function evaluate(state, countries, opts = {}) {
  const m = metrics(state, countries, opts);
  const dates = state.achievements ?? {};
  return BADGES.map(b => {
    const value = m[b.kind];
    return { ...b, value, earned: value >= b.target, progress: Math.min(1, value / b.target), date: dates[b.id] ?? null };
  });
}

/**
 * 날짜가 있는 여행을 차례로 다시 쌓아 배지마다 처음 달성한 여행의 시작일을 찾습니다.
 * 날짜 없는 '방문함' 표시는 모든 여행보다 먼저 다녀온 것으로 봅니다. 표시만으로 이미 달성한 배지는 날짜를 정하지 않습니다.
 * @returns { 배지 ID: 'YYYY-MM-DD' | 'YYYY-MM' }
 */
export function replayDates(state, countries, today = todayStr()) {
  const places = state.places ?? {};
  const byId = new Map(countries.map(c => [c.id, c]));
  const trips = (state.trips ?? []).filter(t => t.start && tripStarted(t, today)).sort((a, b) => a.start.localeCompare(b.start));
  const seen = new Set(), sido = new Set(), out = {};
  const add = placeId => {
    const c = countryOf(placeId, places);
    if (c) seen.add(c);
    const sd = sidoOf(placeId, places);
    if (sd) sido.add(sd);
  };
  const reached = () => {
    const counted = [...seen].map(id => byId.get(id)).filter(c => c && c.status !== 'region');
    const m = { first: [...seen].some(id => id !== KOREA) ? 1 : 0, countries: counted.length, continents: new Set(counted.map(c => c.cont)).size, korea: sido.size };
    return BADGES.filter(b => m[b.kind] >= b.target).map(b => b.id);
  };
  for (const [id, p] of Object.entries(places)) if (p.status === 'visited') add(id);
  const before = new Set(reached());
  for (const t of trips) {
    (t.stops ?? []).forEach(s => add(s.placeId));
    for (const id of reached()) if (!out[id] && !before.has(id)) out[id] = t.start;
  }
  return out;
}

// 이번에 새로 달성한 배지(아직 achievements에 없는 것)와 기록할 날짜
export function newlyEarned(state, countries, opts = {}) {
  const list = evaluate(state, countries, opts).filter(b => b.earned && !b.date);
  if (!list.length) return { list, dates: {} };
  const replay = replayDates(state, countries, opts.today);
  const today = opts.today ?? todayStr();
  return { list, dates: Object.fromEntries(list.map(b => [b.id, replay[b.id] ?? today])) };
}

// 다음 목표 제안(F5-4): 가까운 순서로 문장 몇 개
export function nextGoals(state, countries, opts = {}) {
  const m = metrics(state, countries, opts);
  const goals = [];
  const nextCountry = GOALS.find(g => g > m.countries);
  if (nextCountry) goals.push({ left: (nextCountry - m.countries) / nextCountry, text: `${nextCountry - m.countries}개국만 더 가면 ${nextCountry}개국 달성!`, short: `${nextCountry}개국까지 ${nextCountry - m.countries}개국` });
  if (m.missingConts.length && m.continents >= 4) goals.push({ left: m.missingConts.length / 6, text: `${m.missingConts.join('·')}만 남았어요`, short: `${m.missingConts.join('·')}만 남음` });
  else if (m.missingConts.length) goals.push({ left: 1 / 6, text: `${m.continents + 1}번째 대륙을 밟아 보세요`, short: `${m.continents + 1}번째 대륙` });
  if (m.korea < KR_SIDO.length) goals.push({ left: (KR_SIDO.length - m.korea) / KR_SIDO.length, text: `국내 시도 ${KR_SIDO.length - m.korea}곳이 남았어요`, short: `시도 ${KR_SIDO.length - m.korea}곳` });
  return goals.sort((a, b) => a.left - b.left);
}

// 배지 보관함 순서: 달성한 배지(날짜순) → 잠긴 배지(진행률 높은 순)
export function vaultOrder(list) {
  const earned = list.filter(b => b.earned).sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9'));
  const locked = list.filter(b => !b.earned).sort((a, b) => b.progress - a.progress);
  return [...earned, ...locked];
}

// 한 번에 여러 개를 달성하면 가장 큰 배지를 축하(배지 목록의 뒤쪽 = 더 큰 목표, 종류 우선순위: 나라 > 대륙 > 한국 > 첫 해외)
const RANK = { countries: 4, continents: 3, korea: 2, first: 1 };
export const headline = list => [...list].sort((a, b) => RANK[b.kind] - RANK[a.kind] || b.target - a.target)[0];
