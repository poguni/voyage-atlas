// 지도 엔진: SVG 레이어 구성, 투영 맞추기, 확대·이동, 툴팁 연결 (시안 drawWorld에서 출발)
// 레이어 순서(DESIGN.md 7.1): 경위선 → 땅 → 작은 나라 마커 → 라벨 → 긁기 효과(fx) → 경로 → 핀
import * as d3 from 'd3';
import { REDUCED } from '../env.js';
import { showTip, moveTip, hideTip } from '../ui/tooltip.js';

const GRAIN = REDUCED ? null : 'url(#grain)';

/**
 * @param {HTMLElement} container 지도를 그릴 상자
 * @param {object} o
 *   projection  d3 투영
 *   fitObject   투영을 맞출 GeoJSON
 *   extent      (w, h) => [[x0, y0], [x1, y1]]  투영을 맞출 화면 영역
 *   graticule   경위선 표시 여부
 *   label       지도 aria-label
 *   maxZoom     최대 확대 배율
 *   tip         feature => 툴팁 HTML
 *   classOf     feature => path 클래스
 *   onZoom      (m) => void  확대 배율이 바뀔 때
 */
export function createMap(container, o) {
  container.querySelectorAll('.map-svg').forEach(n => n.remove());
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return null;

  const svg = d3.select(container).append('svg')
    .attr('class', 'map-svg').attr('viewBox', `0 0 ${w} ${h}`)
    .attr('role', 'img').attr('aria-label', o.label);
  const proj = o.projection.fitExtent(o.extent(w, h), o.fitObject);
  const path = d3.geoPath(proj);

  const root = svg.append('g');
  if (o.graticule) root.append('path').attr('class', 'graticule').attr('d', path(d3.geoGraticule10()));
  const land = root.append('g').attr('class', 'land').attr('filter', GRAIN);
  const markers = root.append('g').attr('class', 'markers');
  const labels = root.append('g').attr('class', 'labels');
  const fx = root.append('g');
  const routes = root.append('g');
  const pins = root.append('g');

  const m = { svg, root, land, markers, labels, fx, routes, pins, proj, path, w, h, k: 1, sel: null };

  // 땅 path 그리기(같은 투영으로 데이터만 바꿀 때도 사용: 110m → 50m)
  m.setFeatures = feats => {
    m.sel = land.selectAll('path').data(feats).join('path')
      .attr('d', path).attr('class', o.classOf).attr('data-id', f => f.id ?? f.properties.code);
    if (o.tip) m.sel.on('pointerenter', (e, f) => showTip(e, o.tip(f))).on('pointermove', moveTip).on('pointerleave', hideTip);
    return m.sel;
  };

  // 확대해도 화면 크기를 유지하는 요소(마커, 라벨, 핀): 좌표를 datum.xy에 두고 scale(1/k)
  const place = sel => sel.attr('transform', d => `translate(${d.xy[0]},${d.xy[1]}) scale(${1 / m.k})`);
  m.pin = (layer, xy, cls = '') => layer.append('g').datum({ xy }).attr('class', `keep ${cls}`).call(place);
  m.hover = (sel, html) => sel.on('pointerenter', e => showTip(e, html)).on('pointermove', moveTip).on('pointerleave', hideTip);

  // 확대·이동. 이동 중에는 금박 노이즈 필터를 꺼서 부드럽게 합니다.
  const zoom = d3.zoom()
    .scaleExtent([1, o.maxZoom ?? 8])
    .translateExtent([[0, 0], [w, h]])
    .on('start', () => { land.attr('filter', null); hideTip(); })
    .on('zoom', e => {
      root.attr('transform', e.transform);
      if (e.transform.k !== m.k) { m.k = e.transform.k; root.selectAll('.keep').call(place); o.onZoom?.(m); }
    })
    .on('end', () => land.attr('filter', GRAIN));
  svg.call(zoom).on('dblclick.zoom', null);

  const dur = ms => (REDUCED ? 0 : ms);
  m.zoomBy = f => svg.transition().duration(dur(500)).call(zoom.scaleBy, f);
  m.reset = () => svg.transition().duration(dur(700)).call(zoom.transform, d3.zoomIdentity);
  m.destroy = () => { svg.interrupt().on('.zoom', null); hideTip(); svg.remove(); };
  return m;
}
