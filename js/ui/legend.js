// 지도 범례와 색칠 기준 전환(F1-11): 방문 횟수(기본) / 상태 / 마지막 방문 연도 / 동행 유형
import { COMPANIONS } from '../stats.js';

export const COLOR_MODES = { count: '방문 횟수', status: '상태', year: '마지막 방문 연도', companion: '동행 유형' };

const sw = (bg, text) => `<span><i class="sw" style="background:${bg}"></i>${text}</span>`;
const FOIL = 'linear-gradient(135deg,var(--foil-3),var(--foil-2))';
const TRANSIT = sw('repeating-linear-gradient(45deg,var(--transit) 0 3px,var(--foil-2) 3px 6px)', '경유');
const WISH = '<span><svg width="14" height="14" viewBox="-12 -12 24 24" style="vertical-align:-3px;margin-right:6px;fill:var(--wish)" aria-hidden="true"><use href="#sparkle" x="-12" y="-12" width="24" height="24"/></svg>위시</span>';

// 연도 구간 → 색 번호(가장 최근 구간이 y4)
export const yearClass = (buckets, y) => {
  const i = buckets.findIndex(b => y >= b.from && y <= b.to);
  return i < 0 ? 'y-none' : `y${5 - buckets.length + i}`;
};

/**
 * @param el      범례 상자
 * @param view    'world' | 'korea'
 * @param mode    COLOR_MODES의 키
 * @param buckets 연도 구간 [{ from, to }]
 * @param unit    한국 지도 단위 'sido' | 'sigungu'
 */
export function renderLegend(el, { view, mode, buckets = [], unit = 'sido' }) {
  const korea = view === 'korea';
  const items = [sw(FOIL, korea ? '미방문' : '미방문(금박)')];
  if (mode === 'status') items.push(sw('var(--v1)', '방문함'));
  else if (mode === 'year') {
    buckets.forEach(b => items.push(sw(`var(--${yearClass(buckets, b.from)})`, `<span class="mono">${b.from === b.to ? b.from : `${b.from}–${String(b.to).slice(2)}`}</span>`)));
    items.push(sw('var(--y-none)', '날짜 모름'));
  } else if (mode === 'companion') {
    Object.entries(COMPANIONS).forEach(([k, v]) => items.push(sw(`var(--cp-${k})`, v)));
    items.push(sw('var(--cp-none)', '기록 없음'));
  } else ['1회', '2회', '3회', '4회 이상'].forEach((t, i) => items.push(sw(`var(--v${i + 1})`, t)));
  if (!korea) items.push(TRANSIT, WISH);
  if (korea && unit === 'sido') items.push('<span class="faint">시도를 두 번 누르면 시군구로 확대</span>');
  const options = Object.entries(COLOR_MODES).map(([k, v]) => `<option value="${k}"${k === mode ? ' selected' : ''}>${v}</option>`).join('');
  el.innerHTML = `<label class="legend-mode"><span class="faint">색칠 기준</span><select data-colorby aria-label="지도 색칠 기준">${options}</select></label>${items.join('')}`;
}
