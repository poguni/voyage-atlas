// 방문·통계 계산 순수 함수(DOM·D3 없이 Node 테스트 가능, PRD 10.3절)
// state: { places: { [placeId]: { status } }, trips: [...], wishlist: [...] }
// 장소 ID: country:<ISO 숫자 또는 x-ID>, kr-sido:<17칸 코드>, (Phase 2) city:<GeoNames ID>
import { distKm } from './ai/merge.js';

export const KOREA = '410';
export const KR_SIDO = ['11', '26', '27', '28', '29', '30', '31', '36', '41', '43', '44', '46', '47', '48', '50', '51', '52'];
export const GOALS = [5, 10, 20, 30, 50, 100];          // HUD 다음 목표(DESIGN.md 8장 01)
export const COUNTRY_TOTAL = 195;                        // UN 193 + 옵서버 2
const CONTS = ['AS', 'EU', 'AF', 'NA', 'SA', 'OC'];

export const countryId = id => `country:${id}`;
export const sidoId = code => `kr-sido:${code}`;
export const isCountry = placeId => placeId.startsWith('country:');
export const isSido = placeId => placeId.startsWith('kr-sido:');

// 장소가 속한 국가 ID(ISO 숫자)
export function countryOf(placeId, places = {}) {
  if (isCountry(placeId)) return placeId.slice(8);
  if (placeId.startsWith('kr-')) return KOREA;
  return places[placeId]?.countryId ?? null;
}

// 장소가 속한 한국 시도 코드
export function sidoOf(placeId, places = {}) {
  if (isSido(placeId)) return placeId.slice(8);
  return places[placeId]?.sido ?? null;
}

// 여행이 이 장소를 포함하는지: 경유지가 그 장소이거나, 그 국가·시도 안의 장소이면 포함
export function tripIncludes(trip, placeId, places = {}) {
  return (trip.stops ?? []).some(s => {
    if (s.placeId === placeId) return true;
    if (isCountry(placeId)) return countryOf(s.placeId, places) === placeId.slice(8);
    if (isSido(placeId)) return sidoOf(s.placeId, places) === placeId.slice(8);
    return false;
  });
}

// ---------- 날짜 ----------
const pad = n => String(n).padStart(2, '0');
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toUTC = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +(s.slice(8, 10) || 1));
const DAY = 864e5;
const fromUTC = t => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

// 여행이 이미 시작했는지(미래 여행은 아직 '방문'이 아님). 날짜 미상 여행은 지난 여행으로 봅니다.
// 'YYYY-MM'(연·월만)도 문자열 비교로 처리됩니다: '2026-10' <= '2026-10-15'
export const tripStarted = (trip, today = todayStr()) => !trip.start || trip.start <= today;
export const isUpcoming = (trip, today = todayStr()) => !tripStarted(trip, today);

// 여행 일수(종료일 − 시작일 + 1). 날짜가 일 단위가 아니면 null
export function tripDays(trip) {
  if (trip.datePrecision !== 'day' || !trip.start) return null;
  return Math.round((toUTC(trip.end || trip.start) - toUTC(trip.start)) / DAY) + 1;
}

// 목표 날짜까지 남은 날(D-day). 'YYYY-MM'은 그달 1일 기준
export const dday = (target, today = todayStr()) => (target ? Math.round((toUTC(target) - toUTC(today)) / DAY) : null);

// 방문 횟수 = 이 장소가 들어간(이미 시작한) 여행 수. 여행이 없으면 '방문함' 단순 표시(또는 그 안의 방문 장소)는 1회.
// 여행 기록이 생기면 단순 표시는 그 기록에 흡수됩니다(PRD v0.3).
export function visitCount(state, placeId, today = todayStr()) {
  const places = state.places ?? {};
  const trips = (state.trips ?? []).filter(t => tripStarted(t, today) && tripIncludes(t, placeId, places)).length;
  if (trips > 0) return trips;
  if (places[placeId]?.status === 'visited') return 1;
  // 국가 안의 시도·도시를 방문했으면 국가도 방문(F2-8). 대한민국도 방문 국가로 셉니다.
  if (isCountry(placeId)) {
    const c = placeId.slice(8);
    const inside = Object.entries(places).some(([id, p]) => id !== placeId && p.status === 'visited' && countryOf(id, places) === c);
    if (inside) return 1;
  }
  // 시군구를 방문했으면 그 시도도 방문(F2-8)
  if (isSido(placeId)) {
    const code = placeId.slice(8);
    if (Object.entries(places).some(([id, p]) => id !== placeId && p.status === 'visited' && sidoOf(id, places) === code)) return 1;
  }
  return 0;
}

// 시군구 장소 코드: 일반 시 안의 구('수원시장안구' 41111)는 시 하나('수원시' 41110)로 합칩니다(tools/build-cities.mjs와 같은 규칙).
export function sigunguKey(code, name) {
  const m = /^(.+시)(.+구)$/.exec(name);
  return m ? { code: `${code.slice(0, 4)}0`, name: m[1] } : { code, name };
}

export const isWished = (state, placeId) => (state.wishlist ?? []).some(w => w.placeId === placeId && !w.doneAt);

// 지도 표시 상태: visited | transit | none
export function placeStatus(state, placeId) {
  if (visitCount(state, placeId) > 0) return 'visited';
  if (state.places?.[placeId]?.status === 'transit') return 'transit';
  return 'none';
}

// 방문 횟수 → 오로라 단계 클래스(DESIGN.md 7.2)
export const levelClass = n => (n >= 4 ? 'lv4' : `lv${n}`);

// 국가 통계: countries는 data/countries.ko.json 배열
export function countryStats(state, countries, { includeTransit = false } = {}) {
  const counted = c => {
    const st = placeStatus(state, countryId(c.id));
    return st === 'visited' || (includeTransit && st === 'transit');
  };
  const byCont = Object.fromEntries(CONTS.map(k => [k, { visited: 0, total: 0 }]));
  let visited = 0, regions = 0;
  for (const c of countries) {
    const hit = counted(c);
    if (c.status === 'region') { if (hit) regions++; continue; }
    byCont[c.cont].total++;
    if (hit) { visited++; byCont[c.cont].visited++; }
  }
  return { visited, total: COUNTRY_TOTAL, pct: visited / COUNTRY_TOTAL * 100, regions, byCont };
}

// 한국 시도 통계(17칸)
export function koreaStats(state) {
  const ranking = KR_SIDO
    .map(code => ({ code, count: visitCount(state, sidoId(code)) }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  return { visited: ranking.length, total: KR_SIDO.length, ranking };
}

export const nextGoal = n => GOALS.find(g => g > n) ?? null;

// ---------- 여행(Trip) 통계 ----------
// 국내 여행 = 모든 경유지가 대한민국 안(PRD 10.3)
export const isDomestic = (trip, places = {}) =>
  (trip.stops ?? []).length > 0 && trip.stops.every(s => countryOf(s.placeId, places) === KOREA);

export const tripYear = trip => (trip.start ? +trip.start.slice(0, 4) : null);

// 여행 날짜들을 합집합으로 모아 일수를 셉니다(겹친 출장·여행은 하루로 한 번만).
// year를 주면 그해 날짜만. 연·월만 있거나 날짜 미상인 여행은 unknownTrips로 따로 셉니다.
export function daysSummary(state, { today = todayStr(), year = null } = {}) {
  const places = state.places ?? {};
  const all = new Set(), overseas = new Set(), domestic = new Set();
  let unknownTrips = 0;
  for (const t of state.trips ?? []) {
    if (!tripStarted(t, today)) continue;
    if (t.datePrecision !== 'day' || !t.start) {
      if (year == null || tripYear(t) === year) unknownTrips++;
      continue;
    }
    const target = isDomestic(t, places) ? domestic : overseas;
    for (let d = toUTC(t.start), end = toUTC(t.end || t.start); d <= end; d += DAY) {
      const key = fromUTC(d);
      if (year != null && +key.slice(0, 4) !== year) continue;
      all.add(key); target.add(key);
    }
  }
  return { total: all.size, overseas: overseas.size, domestic: domestic.size, unknownTrips };
}

// 연도별 여행 일수 [{ year, days }] (오래된 해부터). 연말을 넘는 여행은 해마다 나눠 셉니다.
export function daysByYear(state, today = todayStr()) {
  const years = new Set();
  for (const t of state.trips ?? []) {
    if (!tripStarted(t, today) || t.datePrecision !== 'day' || !t.start) continue;
    for (let y = tripYear(t), last = +(t.end || t.start).slice(0, 4); y <= last; y++) years.add(y);
  }
  return [...years].sort().map(year => ({ year, days: daysSummary(state, { today, year }).total }));
}

// 여행이 있는 해(최근 해부터)
export const tripYears = (state, today = todayStr()) =>
  [...new Set((state.trips ?? []).filter(t => tripStarted(t, today) && t.start).map(tripYear))].sort((a, b) => b - a);

// 특정 해 여행으로 방문한 국가 ID 목록(통계 화면의 연도 보기)
export function countriesInYear(state, year, today = todayStr()) {
  const set = new Set();
  for (const t of state.trips ?? []) {
    if (!tripStarted(t, today) || tripYear(t) !== year) continue;
    for (const s of t.stops ?? []) { const c = countryOf(s.placeId, state.places); if (c) set.add(c); }
  }
  return [...set];
}

// 가장 많이 간 나라 [{ id, count, cities: [이름] }]
export function countryRanking(state, countries, { limit = 5, today = todayStr() } = {}) {
  const places = state.places ?? {};
  const rows = [];
  for (const c of countries) {
    const count = visitCount(state, countryId(c.id), today);
    if (!count) continue;
    const cities = new Set();
    for (const t of state.trips ?? []) {
      if (!tripStarted(t, today)) continue;
      for (const s of t.stops ?? []) {
        if (s.placeId.startsWith('country:') || countryOf(s.placeId, places) !== c.id) continue;
        const p = places[s.placeId];
        const name = p?.name_ko || p?.name_en;
        if (name) cities.add(name);
      }
    }
    rows.push({ id: c.id, count, cities: [...cities] });
  }
  return rows.sort((a, b) => b.count - a.count || b.cities.length - a.cities.length).slice(0, limit);
}

export const COMPANIONS = { solo: '혼자', family: '가족', friends: '친구', partner: '연인', business: '출장' };

// 기록으로 본 나: 가장 긴 여행, 가장 자주 떠난 달, 가장 많은 동행, 위시 달성, 첫 해외여행 이후 햇수
export function recordFacts(state, today = todayStr()) {
  const places = state.places ?? {};
  const trips = (state.trips ?? []).filter(t => tripStarted(t, today));
  let longest = null;
  for (const t of trips) { const d = tripDays(t); if (d && (!longest || d > longest.days)) longest = { trip: t, days: d }; }
  const months = {};
  for (const t of trips) if (t.start && t.start.length >= 7) { const m = +t.start.slice(5, 7); months[m] = (months[m] ?? 0) + 1; }
  const topMonthEntry = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
  const comp = {};
  for (const t of trips) if (t.companion) comp[t.companion] = (comp[t.companion] ?? 0) + 1;
  const topComp = Object.entries(comp).sort((a, b) => b[1] - a[1])[0];
  const wish = state.wishlist ?? [];
  const firstOverseas = trips.filter(t => t.start && !isDomestic(t, places)).map(t => t.start).sort()[0];
  return {
    longest,
    topMonth: topMonthEntry ? { month: +topMonthEntry[0], count: topMonthEntry[1] } : null,
    companion: topComp ? { type: topComp[0], pct: Math.round(topComp[1] / trips.length * 100) } : null,
    wish: { done: wish.filter(w => w.doneAt).length, total: wish.length },
    yearsSinceFirstOverseas: firstOverseas ? +today.slice(0, 4) - +firstOverseas.slice(0, 4) : null,
    firstOverseasYear: firstOverseas ? +firstOverseas.slice(0, 4) : null,
  };
}

// 한 장소의 방문 기록(이 장소가 들어간 여행, 최근 것부터)과 첫·최근 방문
export function placeVisits(state, placeId, today = todayStr()) {
  const trips = (state.trips ?? []).filter(t => tripStarted(t, today) && tripIncludes(t, placeId, state.places))
    .sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
  const dated = trips.filter(t => t.start).map(t => t.start).sort();
  return { trips, first: dated[0] ?? null, last: dated.at(-1) ?? null };
}

// ---------- 통계 확장(F4-6~F4-8) ----------
export const EARTH_KM = 40075;   // 적도 둘레(지구 한 바퀴)

const startedIn = (state, today, year) =>
  (state.trips ?? []).filter(t => tripStarted(t, today) && (year == null || tripYear(t) === year));

// 여행 한 번의 이동 거리: 홈 공항 → 경유지 순서 → 홈 공항의 대권 거리 합(PRD 10.3). 좌표를 모르는 경유지는 건너뜀
export function tripDistanceKm(trip, home, llOf) {
  const pts = (trip.stops ?? []).map(s => llOf(s.placeId)).filter(Boolean);
  if (!pts.length) return 0;
  const seq = [home, ...pts, home];
  let km = 0;
  for (let i = 1; i < seq.length; i++) km += distKm(seq[i - 1], seq[i]);
  return km;
}

/**
 * 이동 거리 합계(F4-7): { km, laps(지구 몇 바퀴), trips(거리를 잰 여행 수), overseasPlaces(다녀온 해외 경유지 수) }
 * @param home  홈 공항 [경도, 위도]
 * @param llOf  placeId → [경도, 위도] | null
 */
export function distanceSummary(state, { home, llOf, today = todayStr(), year = null }) {
  const places = state.places ?? {};
  let km = 0, trips = 0;
  const overseas = new Set();
  for (const t of startedIn(state, today, year)) {
    const d = tripDistanceKm(t, home, llOf);
    if (d) { km += d; trips++; }
    for (const s of t.stops ?? []) if (countryOf(s.placeId, places) !== KOREA) overseas.add(s.placeId);
  }
  return { km, laps: km / EARTH_KM, trips, overseasPlaces: overseas.size };
}

// 월별 여행 빈도(F4-6): 1~12월에 떠난 여행 수(출발 월을 아는 여행만)
export function monthlyTrips(state, { today = todayStr(), year = null } = {}) {
  const out = Array(12).fill(0);
  for (const t of startedIn(state, today, year)) if (t.start && t.start.length >= 7) out[+t.start.slice(5, 7) - 1]++;
  return out;
}

// 동행 유형별 비율(F4-8): [{ type(COMPANIONS 키 | 'none'), count, pct }] 많은 순, 기록 없음은 맨 뒤
export function companionShare(state, { today = todayStr(), year = null } = {}) {
  const trips = startedIn(state, today, year);
  const n = {};
  for (const t of trips) { const k = COMPANIONS[t.companion] ? t.companion : 'none'; n[k] = (n[k] ?? 0) + 1; }
  const pct = c => Math.round(c / trips.length * 100);
  const rows = Object.keys(COMPANIONS).filter(k => n[k]).map(type => ({ type, count: n[type], pct: pct(n[type]) })).sort((a, b) => b.count - a.count);
  if (n.none) rows.push({ type: 'none', count: n.none, pct: pct(n.none) });
  return rows;
}

// ---------- 지도 확장(F1-10·F1-11) ----------
// 방문한 도시·시군구(지도 핀): [{ placeId, count }]. kind: 'city' | 'kr-sigungu'
export function visitedCities(state, kind, today = todayStr()) {
  const ids = new Set();
  for (const t of state.trips ?? []) if (tripStarted(t, today)) for (const s of t.stops ?? []) if (s.placeId.startsWith(`${kind}:`)) ids.add(s.placeId);
  for (const [id, p] of Object.entries(state.places ?? {})) if (p.status === 'visited' && id.startsWith(`${kind}:`)) ids.add(id);
  return [...ids].map(placeId => ({ placeId, count: visitCount(state, placeId, today) })).filter(c => c.count > 0);
}

const placeTrips = (state, placeId, today) =>
  (state.trips ?? []).filter(t => tripStarted(t, today) && tripIncludes(t, placeId, state.places ?? {}));

// 마지막 방문 연도(날짜 있는 여행 기준). 날짜 없는 방문 표시뿐이면 null
export function lastVisitYear(state, placeId, today = todayStr()) {
  const ys = placeTrips(state, placeId, today).filter(t => t.start).map(tripYear);
  return ys.length ? Math.max(...ys) : null;
}

// 가장 많이 함께한 동행 유형(같으면 최근 여행의 동행). 기록이 없으면 null
export function mainCompanion(state, placeId, today = todayStr()) {
  const trips = placeTrips(state, placeId, today).filter(t => t.companion).sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
  const n = {};
  for (const t of trips) n[t.companion] = (n[t.companion] ?? 0) + 1;
  return trips.map(t => t.companion).sort((a, b) => n[b] - n[a])[0] ?? null;   // 안정 정렬이라 같은 수면 최근 것
}

// 연도 색 구간(최대 5칸, 오래된 것부터): 해가 5개 이하면 해마다 한 칸, 넘으면 기간을 5등분
export function yearBuckets(years) {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  if (ys.length <= 5) return ys.map(y => ({ from: y, to: y }));
  const min = ys[0], span = ys.at(-1) - min + 1;
  const out = [];
  for (let i = 0; i < 5; i++) {
    const from = min + Math.ceil(span * i / 5), to = min + Math.ceil(span * (i + 1) / 5) - 1;
    if (to >= from) out.push({ from, to });
  }
  return out;
}

// ---------- 전체 연대기 재생(F3-5) ----------
// 재생할 연도: 날짜 있는 지난 여행의 첫 해 ~ 올해. 여행이 없으면 빈 배열
export function timelapseYears(state, today = todayStr()) {
  const ys = (state.trips ?? []).filter(t => t.start && tripStarted(t, today)).map(tripYear);
  if (!ys.length) return [];
  const out = [];
  for (let y = Math.min(...ys), last = +today.slice(0, 4); y <= last; y++) out.push(y);
  return out;
}

// 그해 말까지 다녀온 여행만 남긴 기록. 날짜 없는 방문 표시·여행은 마지막(final) 장면에서만 보입니다.
export function stateUntil(state, year, { final = false, today = todayStr() } = {}) {
  if (final) return state;
  const places = Object.fromEntries(Object.entries(state.places ?? {}).map(([id, p]) => {
    const { status: _s, quickMarked: _q, ...rest } = p;
    return [id, rest];
  }));
  const trips = (state.trips ?? []).filter(t => t.start && tripStarted(t, today) && tripYear(t) <= year);
  return { ...state, places, trips };
}
