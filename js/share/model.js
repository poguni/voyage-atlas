// 공유 포스터의 내용(숫자·문구)과 배치 계산(DOM·Canvas 없이 Node 테스트 가능, PRD F8, DESIGN.md 8장 08)
import {
  countryStats, koreaStats, visitCount, countryId, sidoId, KR_SIDO, daysSummary, tripStarted, isDomestic, todayStr,
  tripYear, tripDays, tripIncludes, countryOf, sidoOf, distanceSummary, tripDistanceKm, COMPANIONS, KOREA,
} from '../stats.js';
import { CONT, CONT_ORDER } from '../data.js';
import { fmtRange, fmtStars, fmtDate, WISH_PRIORITY, PRIORITY_ORDER } from '../format.js';

export const SIZES = [['1080x1350', '세로 4:5'], ['1080x1920', '스토리 9:16'], ['1080x1080', '정사각'], ['1920x1080', '가로 16:9'], ['a3', '인쇄 A3']];
export const EXPORT_SCALE = 2;   // 저장 이미지는 2배 해상도(F8-10)
// 인쇄용 A3(F8-7): 297×420mm를 300dpi로 저장(3508×4961px). 배치는 같은 비율의 1240×1754로 계산합니다.
export const A3 = { layout: [1240, 1754], px: [3508, 4961] };
export const parseSize = size => (size === 'a3' ? [...A3.layout] : size.split('x').map(Number));
// 저장 이미지 크기 [가로, 세로](px). A3는 배치 비율과 0.1% 안쪽으로 달라 세로를 자릅니다(1px 미만).
export const exportSize = size => (size === 'a3' ? [...A3.px] : parseSize(size).map(v => v * EXPORT_SCALE));

// 포스터 테마(DESIGN.md 8장 08 표)
export const POSTER_THEMES = {
  night:   { bg0: '#141C45', bg1: '#070B1F', land0: '#8E7646', land1: '#5A4829', edge: 'rgba(246,223,174,.35)', lv: ['#2EC4B6', '#4C8DFF', '#9B5DE5', '#F15BB5'], text: '#F5F1E8', dim: '#B3BAD8', accent: '#E8C98A', track: '#222C5C', wish: '#FFD166', stars: true },
  vintage: { bg0: '#F6EEDD', bg1: '#E7D8BA', land0: '#D6C39A', land1: '#C3AC7E', edge: 'rgba(110,80,30,.4)', lv: ['#0F8F84', '#2F67D8', '#7A3FC4', '#C9348F'], text: '#2B2418', dim: '#5E5240', accent: '#8A6420', track: '#D9CBAE', wish: '#C98A00', stars: false },
  minimal: { bg0: '#FFFFFF', bg1: '#F4F5F8', land0: '#E3E6EE', land1: '#E3E6EE', edge: '#FFFFFF', lv: ['#8FA3C8', '#5C78AE', '#334F86', '#1B2D57'], text: '#111827', dim: '#5B6475', accent: '#1B2D57', track: '#E3E6EE', wish: '#C98A00', stars: false },
};

export const TEMPLATES = {
  world: { title: '나의 여정 지도', eyebrow: 'VOYAGE ATLAS' },
  korea: { title: '대한민국 정복 지도', eyebrow: 'KOREA CONQUEST' },
  year: { title: '올해의 여정', eyebrow: 'YEAR IN TRAVEL' },
  trip: { title: '여행 카드', eyebrow: 'TRAVEL CARD' },
  wish: { title: '내가 꿈꾸는 곳', eyebrow: 'WISH BOARD' },
};

const level = n => Math.min(4, n);
const ym = s => `${s.slice(0, 4)}. ${+s.slice(5, 7) || ''}`.trim();

// 첫 여행 ~ 이번 달(예: "2016. 8 — 2026. 10"). 날짜 있는 여행이 없으면 null
export function dateRange(trips, today = todayStr()) {
  const first = trips.filter(t => tripStarted(t, today) && t.start).map(t => t.start).sort()[0];
  return first ? `${ym(first)} — ${ym(today)}` : null;
}

// 아직 방문 전인 위시(별): [{ placeId, ll }]
function wishStars(state, korea, sidoLL) {
  const out = [];
  for (const w of state.wishlist ?? []) {
    if (w.doneAt || visitCount(state, w.placeId) > 0 || w.placeId.startsWith('kr-') !== korea) continue;
    const p = state.places?.[w.placeId];
    const ll = w.placeId.startsWith('country:') ? null : w.placeId.startsWith('kr-sido:') ? sidoLL(w.placeId) : p?.lat != null ? [p.lon, p.lat] : null;
    out.push({ placeId: w.placeId, ll });
  }
  return out;
}

/** 월드 스크래치 포스터(F8-2): 방문국 수 + 대륙 진행률 */
export function worldModel(state, countries, { today = todayStr(), includeTransit = false } = {}) {
  const cs = countryStats(state, countries, { includeTransit });
  const levels = new Map();
  for (const c of countries) { const n = visitCount(state, countryId(c.id), today); if (n) levels.set(c.id, level(n)); }
  const trips = (state.trips ?? []).filter(t => tripStarted(t, today));
  const days = daysSummary(state, { today }).total;
  const conts = CONT_ORDER.filter(k => cs.byCont[k].visited).length;
  const ll = new Map(countries.map(c => [c.id, c.ll]));
  return {
    kind: 'world',
    levels,
    stars: wishStars(state, false).map(w => ({ ...w, ll: w.ll ?? ll.get(w.placeId.slice(8)) })).filter(w => w.ll),
    big: String(cs.visited),
    bigLabel: `개국 · 세계의 ${cs.pct.toFixed(1)}%`,
    rows: CONT_ORDER.map(k => ({ label: CONT[k], n: cs.byCont[k].visited, total: cs.byCont[k].total })),
    summary: [trips.length && `여행 ${trips.length}회`, days && `${days.toLocaleString('ko-KR')}일`, `${conts}개 대륙`].filter(Boolean).join(' · '),
    dates: dateRange(state.trips ?? [], today),
  };
}

/** 대한민국 정복 지도(F8-3): 시도 17칸 정복률 + 시도 칩 */
export function koreaModel(state, sido, { today = todayStr() } = {}) {
  const ks = koreaStats(state);
  const byCode = new Map(sido.map(p => [p.code, p]));
  const levels = new Map(ks.ranking.map(r => [r.code, level(r.count)]));
  const trips = (state.trips ?? []).filter(t => tripStarted(t, today) && isDomestic(t, state.places));
  const days = daysSummary(state, { today }).domestic;
  const pct = Math.round(ks.visited / ks.total * 100);
  return {
    kind: 'korea',
    levels,
    stars: wishStars(state, true, id => byCode.get(id.slice(8))?.ll).filter(w => w.ll),
    big: String(ks.visited),
    bigLabel: `/ ${ks.total} 시도 · 정복률 ${pct}%`,
    chips: KR_SIDO.map(code => ({ label: byCode.get(code)?.short ?? code, level: levels.get(code) ?? 0, placeId: sidoId(code) })),
    summary: trips.length ? [`국내 여행 ${trips.length}회`, days && `${days.toLocaleString('ko-KR')}일`].filter(Boolean).join(' · ')
      : ks.visited < ks.total ? `남은 시도 ${ks.total - ks.visited}곳` : '17개 시도를 모두 밟았어요',
    dates: dateRange(trips, today),
  };
}

/**
 * 배치(시안 08의 buildPoster 수치를 따름). 세로는 위 글 → 지도 → 큰 숫자·진행 막대 → 요약,
 * 가로(16:9)는 왼쪽 글·숫자, 오른쪽 지도. 정사각은 지도가 너무 작아지지 않게 아래 묶음을 줄입니다.
 */
export function posterLayout(W, H, { nums = true } = {}) {
  const land = W > H, square = W === H;
  const s = Math.min(W, H) / 1080, M = Math.round(Math.min(W, H) * 0.07);
  const topY = land ? M + 90 * s : M + 40 * s;
  const L = {
    W, H, s, M, land,
    align: land ? 'left' : 'center', tx: land ? M : W / 2,
    eyebrowY: topY, titleY: topY + 84 * s,
    titleMaxW: land ? W * 0.42 - M - 40 * s : W - M * 2,
    summaryY: H - M - 30 * s, markY: H - M * 0.5,
  };
  if (land) {
    const by = topY + 330 * s;
    L.mapBox = [[W * 0.42, M], [W - M, H - M]];
    L.big = { y: by, size: 200 * s, labelY: by + 52 * s };
    L.rows = { x: M, y: by + 120 * s, w: W * 0.42 - M * 2 - 40 * s, cols: 1, chipCols: 3, rowH: 44 * s };
  } else {
    const stack = nums ? (square ? 520 : 610) * s : 80 * s;
    const mapTop = topY + 130 * s, mapBottom = H - stack;
    const by = mapBottom + (square ? 130 : 150) * s;
    L.mapBox = [[M * 0.5, mapTop], [W - M * 0.5, mapBottom]];
    L.big = { y: by, size: (square ? 120 : 150) * s, labelY: by + (square ? 44 : 50) * s };
    L.rows = { x: M, y: by + (square ? 100 : 120) * s, w: W - M * 2, cols: square ? 3 : 2, chipCols: square ? 9 : 6, rowH: 54 * s };
  }
  return L;
}

// ---------- 템플릿 ③ 올해의 여정(F8-4) ----------
const fmtLaps = v => (v >= 10 ? Math.round(v).toLocaleString('ko-KR') : v.toFixed(1));
const fmtKm = km => (Math.round(km / 100) * 100).toLocaleString('ko-KR');

// 그해 이전에 이미 다녀온 나라: 그 전에 떠난 여행 + 날짜 없이 '방문함'으로만 표시한 곳(여행보다 먼저 다녀온 것으로 봄)
function countriesBefore(state, year, today) {
  const places = state.places ?? {}, set = new Set();
  const started = (state.trips ?? []).filter(t => tripStarted(t, today));
  for (const t of started) if (t.start && tripYear(t) < year) for (const s of t.stops ?? []) { const c = countryOf(s.placeId, places); if (c) set.add(c); }
  for (const [id, p] of Object.entries(places)) {
    if (p.status !== 'visited' || started.some(t => tripIncludes(t, id, places))) continue;
    const c = countryOf(id, places);
    if (c) set.add(c);
  }
  return set;
}

/**
 * @param infoOf placeId → { name, ll } | null  (도시 이름·좌표)
 * @param home   홈 공항 { code, ll }
 */
export function yearModel(state, countries, { year, today = todayStr(), home, infoOf }) {
  const places = state.places ?? {};
  const byId = new Map(countries.map(c => [c.id, c]));
  const trips = (state.trips ?? []).filter(t => tripStarted(t, today) && tripYear(t) === year);
  const counts = new Map(), dots = new Map();
  for (const t of trips) {
    const seen = new Set();
    for (const s of t.stops ?? []) {
      const c = countryOf(s.placeId, places);
      if (c) seen.add(c);
      if (!s.placeId.startsWith('country:') && !s.placeId.startsWith('kr-sido:')) { const ll = infoOf(s.placeId)?.ll; if (ll) dots.set(s.placeId, ll); }
    }
    for (const c of seen) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const before = countriesBefore(state, year, today);
  // 대한민국(사는 나라)은 새로 간 나라로 치지 않습니다.
  const fresh = [...counts.keys()].filter(c => c !== KOREA && !before.has(c) && byId.get(c)?.status !== 'region');
  const days = daysSummary(state, { today, year }).total;
  const dist = distanceSummary(state, { home: home.ll, llOf: id => infoOf(id)?.ll ?? null, today, year });
  let longest = null;
  for (const t of trips) { const d = tripDays(t); if (d && (!longest || d > longest.days)) longest = { title: t.title || fmtRange(t), days: d }; }
  const end = String(year) === today.slice(0, 4) ? `${+today.slice(5, 7)}. ${+today.slice(8, 10)}` : '12. 31';
  const names = fresh.map(c => byId.get(c)?.ko).filter(Boolean);
  return {
    kind: 'world',
    title: `${year} 올해의 여정`,
    levels: new Map([...counts].map(([c, n]) => [c, level(n)])),
    stars: [],
    dots: [...dots.values()],
    big: String(counts.size),
    bigLabel: `나라 · 새로 간 곳 ${fresh.length}`,
    facts: [
      { label: '여행', value: `${trips.length}회` },
      { label: '여행 일수', value: `${days}일` },
      { label: '가장 긴 여행', value: longest ? `${longest.title} · ${longest.days}일` : '—' },
      { label: '새로 간 나라', value: names.length ? names.join(', ') : '—' },
      { label: '이동 거리', value: dist.km ? `${fmtKm(dist.km)}km · 지구 ${fmtLaps(dist.laps)}바퀴` : '—' },
    ],
    summary: [`여행 ${trips.length}회`, days && `${days}일`, fresh.length && `새로운 나라 ${fresh.length}곳`].filter(Boolean).join(' · '),
    dates: `${year}. 1. 1 — ${end}`,
  };
}

// ---------- 템플릿 ④ 여행 카드(F8-5) ----------
// 고를 수 있는 여행: 경유지가 있는 여행(최근 것부터)
export const cardTrips = state => (state.trips ?? []).filter(t => (t.stops ?? []).length)
  .sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));

export function tripModel(state, countries, { trip, home, infoOf }) {
  const places = state.places ?? {};
  const domestic = isDomestic(trip, places);
  const stops = (trip.stops ?? []).map(s => ({ placeId: s.placeId, ...(infoOf(s.placeId) ?? { name: s.placeId, ll: null }) }));
  const pts = stops.filter(s => s.ll).map(s => s.ll);
  // 국내 여행은 경유지끼리만, 해외 여행은 홈 공항에서 출발해 돌아옴(연대기 경로 지도와 같음)
  const route = domestic ? pts : pts.length ? [home.ll, ...pts, home.ll] : [];
  const levels = new Map();
  for (const s of stops) {
    const key = domestic ? sidoOf(s.placeId, places) : countryOf(s.placeId, places);
    if (key) levels.set(key, 1);
  }
  if (!domestic && levels.size === 0) levels.set(KOREA, 1);
  const days = tripDays(trip);
  // 국내 여행은 공항을 그리지 않으므로 공항 왕복 거리도 적지 않습니다.
  const km = domestic ? 0 : tripDistanceKm(trip, home.ll, id => infoOf(id)?.ll ?? null);
  const names = stops.map(s => s.name);
  return {
    kind: domestic ? 'korea' : 'world',
    title: trip.title || '여행 카드',
    levels,
    stars: [],
    route,
    stops: stops.filter(s => s.ll).map((s, i) => ({ ll: s.ll, label: `${i + 1} ${s.name}` })),
    home: domestic ? null : { ll: home.ll, label: home.code },
    big: String(days ?? stops.length),
    bigLabel: days ? `일 · ${stops.length}곳` : '곳',
    lines: [
      domestic ? names.join(' → ') : [home.code, ...names, home.code].join(' → '),
      trip.note ? `“${trip.note.split('\n')[0]}”` : '',   // 메모는 첫 줄만
    ].filter(Boolean),
    summary: [COMPANIONS[trip.companion], fmtStars(trip.rating), km && `${fmtKm(km)}km`].filter(Boolean).join(' · ') || fmtRange(trip),
    dates: trip.start ? fmtRange(trip) : null,
  };
}

// ---------- 템플릿 ⑤ 위시 보드(F8-6) ----------
export const WISH_LABELS = 8;   // 지도에 이름을 쓰는 별 수(나머지는 별만)

/**
 * "내가 꿈꾸는 곳" 별 지도: 아직 이루지 않은 위시를 순위(우선순위 → 목표 시기 → 직접 정한 순서)대로 번호 붙여 별로.
 * 위시가 있는 나라는 은은하게 칠하고, 이미 다녀온 곳의 위시(다시 가고 싶은 곳)도 별로 보여 줍니다.
 * @param infoOf placeId → { name, ll, countryName? } | null
 */
export function wishModel(state, countries, { infoOf, today = todayStr() }) {
  const places = state.places ?? {};
  const all = state.wishlist ?? [];
  const open = all.filter(w => !w.doneAt)
    .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority ?? 'someday') - PRIORITY_ORDER.indexOf(b.priority ?? 'someday')
      || (a.targetMonth ?? '9999').localeCompare(b.targetMonth ?? '9999') || (a.order ?? 0) - (b.order ?? 0));
  const items = open.map(w => ({ w, info: infoOf(w.placeId) })).filter(x => x.info?.ll);
  const wishLands = new Set(open.map(w => countryOf(w.placeId, places)).filter(Boolean));
  const done = all.filter(w => w.doneAt).length;
  const pct = all.length ? Math.round(done / all.length * 100) : 0;
  const conts = new Set(open.map(w => countries.find(c => c.id === countryOf(w.placeId, places))?.cont).filter(Boolean));
  const months = open.map(w => w.targetMonth).filter(m => m && m >= today.slice(0, 7)).sort();
  return {
    kind: 'world',
    title: '내가 꿈꾸는 곳',
    levels: new Map(),
    wishLands,
    stars: items.map(({ w, info }, i) => ({ placeId: w.placeId, ll: info.ll, label: i < WISH_LABELS ? `${i + 1} ${info.name}` : null })),
    big: String(open.length),
    bigLabel: `곳 · 이룬 꿈 ${done}`,
    facts: items.slice(0, 6).map(({ w, info }, i) => ({
      label: `${i + 1}. ${info.name}`,
      value: [info.countryName, w.targetMonth ? fmtDate(w.targetMonth) : WISH_PRIORITY[w.priority] ?? '언젠가'].filter(Boolean).join(' · '),
    })),
    summary: [`위시 ${open.length}곳`, conts.size && `${conts.size}개 대륙`, all.length && `달성률 ${pct}%`].filter(Boolean).join(' · '),
    dates: months.length ? (months[0] === months.at(-1) ? fmtDate(months[0]) : `${fmtDate(months[0])} — ${fmtDate(months.at(-1))}`) : null,
  };
}
