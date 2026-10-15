// 공유 포스터의 내용(숫자·문구)과 배치 계산(DOM·Canvas 없이 Node 테스트 가능, PRD F8, DESIGN.md 8장 08)
import {
  countryStats, koreaStats, visitCount, countryId, sidoId, KR_SIDO, daysSummary, tripStarted, isDomestic, todayStr,
} from '../stats.js';
import { CONT, CONT_ORDER } from '../data.js';

export const SIZES = [['1080x1350', '세로 4:5'], ['1080x1920', '스토리 9:16'], ['1080x1080', '정사각'], ['1920x1080', '가로 16:9']];
export const EXPORT_SCALE = 2;   // 저장 이미지는 2배 해상도(F8-10)
export const parseSize = size => size.split('x').map(Number);

// 포스터 테마(DESIGN.md 8장 08 표)
export const POSTER_THEMES = {
  night:   { bg0: '#141C45', bg1: '#070B1F', land0: '#8E7646', land1: '#5A4829', edge: 'rgba(246,223,174,.35)', lv: ['#2EC4B6', '#4C8DFF', '#9B5DE5', '#F15BB5'], text: '#F5F1E8', dim: '#B3BAD8', accent: '#E8C98A', track: '#222C5C', wish: '#FFD166', stars: true },
  vintage: { bg0: '#F6EEDD', bg1: '#E7D8BA', land0: '#D6C39A', land1: '#C3AC7E', edge: 'rgba(110,80,30,.4)', lv: ['#0F8F84', '#2F67D8', '#7A3FC4', '#C9348F'], text: '#2B2418', dim: '#5E5240', accent: '#8A6420', track: '#D9CBAE', wish: '#C98A00', stars: false },
  minimal: { bg0: '#FFFFFF', bg1: '#F4F5F8', land0: '#E3E6EE', land1: '#E3E6EE', edge: '#FFFFFF', lv: ['#8FA3C8', '#5C78AE', '#334F86', '#1B2D57'], text: '#111827', dim: '#5B6475', accent: '#1B2D57', track: '#E3E6EE', wish: '#C98A00', stars: false },
};

export const TEMPLATES = {
  world: { title: '나의 여정 지도', eyebrow: 'VOYAGE ATLAS' },
  korea: { title: '대한민국 정복 지도', eyebrow: 'KOREA CONQUEST' },
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
