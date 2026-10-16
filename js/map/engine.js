// 지도 엔진: SVG 레이어 구성, 투영 맞추기, 확대·이동, 툴팁·클릭 연결 (시안 drawWorld에서 출발)
// 레이어 순서(DESIGN.md 7.1): 경위선 → 땅 → 작은 나라 마커 → 라벨 → 긁기 효과(fx) → 경로 → 핀
import * as d3 from 'd3';
import { motionReduced } from '../env.js';
import { showTip, moveTip, hideTip } from '../ui/tooltip.js';

const grain = () => (motionReduced() ? null : 'url(#grain)');

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
 *   onClick     (event, feature, pathEl) => void
 *   onZoom      (m) => void  확대 배율이 바뀔 때
 *   onZoomStart () => void   확대·이동을 시작할 때(팝오버 닫기)
 *   onBackground (event) => void  땅·마커가 아닌 곳을 눌렀을 때
 */
export function createMap(container, o) {
  // 보기 전환 연출 중인 이전 지도(data-keep)는 남겨 둡니다.
  container.querySelectorAll('.map-svg:not([data-keep])').forEach(n => n.remove());
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return null;

  const svg = d3.select(container).insert('svg', ':first-child')
    .attr('class', 'map-svg').attr('viewBox', `0 0 ${w} ${h}`)
    .attr('role', 'img').attr('aria-label', o.label);
  const proj = o.projection.fitExtent(o.extent(w, h), o.fitObject);
  const path = d3.geoPath(proj);

  const root = svg.append('g');
  if (o.graticule) root.append('path').attr('class', 'graticule').attr('d', path(d3.geoGraticule10()));
  const land = root.append('g').attr('class', 'land').attr('filter', grain());
  const markers = root.append('g').attr('class', 'markers');
  const labels = root.append('g').attr('class', 'labels');
  const fx = root.append('g');
  const routes = root.append('g');
  const pins = root.append('g');

  const m = { svg, root, land, markers, labels, fx, routes, pins, proj, path, w, h, k: 1, sel: null };

  // 땅 path 그리기(같은 투영으로 데이터만 바꿀 때도 사용: 110m → 50m)
  // 키(ID + 같은 ID 안의 순번)로 묶어, 데이터를 바꿔도 같은 지형의 path 요소는 그대로 둡니다.
  m.setFeatures = feats => {
    const seen = new Map();
    const keys = feats.map(f => { const id = f.id ?? f.properties.code; const n = seen.get(id) ?? 0; seen.set(id, n + 1); return `${id}#${n}`; });
    const keyOf = new Map(feats.map((f, i) => [f, keys[i]]));
    m.sel = land.selectAll('path').data(feats, function (f) { return f ? keyOf.get(f) : this.dataset.key; }).join('path')
      .attr('data-key', f => keyOf.get(f))
      .attr('d', path).attr('class', o.classOf).attr('data-id', f => f.id ?? f.properties.code);
    if (o.tip) m.sel.on('pointerenter', (e, f) => showTip(e, o.tip(f))).on('pointermove', moveTip).on('pointerleave', hideTip);
    if (o.onClick) m.sel.on('click', function (e, f) { o.onClick(e, f, this); });
    return m.sel;
  };

  // 상태가 바뀌었을 때 색만 다시 칠합니다(긁는 중인 path는 연출이 끝난 뒤 칠함).
  m.refresh = () => {
    m.sel?.attr('class', function (f) { return this.dataset.scratching ? this.getAttribute('class') : o.classOf(f); });
  };

  // 확대해도 화면 크기를 유지하는 요소(마커, 라벨, 핀): 좌표를 datum.xy에 두고 scale(1/k)
  const place = sel => sel.attr('transform', d => `translate(${d.xy[0]},${d.xy[1]}) scale(${1 / m.k})`);
  m.pin = (layer, xy, cls = '') => layer.append('g').datum({ xy }).attr('class', `keep ${cls}`).call(place);
  m.hover = (sel, html) => sel.on('pointerenter', e => showTip(e, typeof html === 'function' ? html() : html)).on('pointermove', moveTip).on('pointerleave', hideTip);

  // 확대·이동. 이동 중에는 금박 노이즈 필터를 꺼서 부드럽게 합니다.
  const zoom = d3.zoom()
    .scaleExtent([1, o.maxZoom ?? 8])
    .translateExtent([[0, 0], [w, h]])
    .on('start', e => { land.attr('filter', null); hideTip(); if (e.sourceEvent?.type !== 'mousedown' && e.sourceEvent?.type !== 'pointerdown') o.onZoomStart?.(); })
    .on('zoom', e => {
      root.attr('transform', e.transform);
      if (e.sourceEvent?.type === 'mousemove' || e.sourceEvent?.type === 'touchmove') o.onZoomStart?.();
      if (e.transform.k !== m.k) { m.k = e.transform.k; root.selectAll('.keep').call(place); o.onZoom?.(m); }
    })
    .on('end', () => land.attr('filter', grain()));
  svg.call(zoom).on('dblclick.zoom', null);
  svg.on('click.bg', e => { if (e.target === svg.node() || e.target.classList.contains('graticule')) o.onBackground?.(e); });

  const dur = ms => (motionReduced() ? 0 : ms);
  const run = (fn, ms) => new Promise(res => {
    const t = svg.transition().duration(dur(ms));
    t.call(fn).on('end interrupt', () => res());
    if (!dur(ms)) res();
  });
  m.zoomBy = f => run(s => s.call(zoom.scaleBy, f), 500);
  m.reset = () => run(s => s.call(zoom.transform, d3.zoomIdentity), 700);

  // 지도 좌표 영역 [[x0,y0],[x1,y1]]이 화면에 알맞게 보이도록 확대
  m.zoomToBounds = ([[x0, y0], [x1, y1]], maxK = 6) => {
    // 팝오버가 장소를 가리지 않도록 화면의 35% 정도만 채웁니다.
    const k = Math.max(1, Math.min(maxK, 0.35 / Math.max((x1 - x0) / w, (y1 - y0) / h)));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const t = d3.zoomIdentity.translate(w / 2, h / 2).scale(k).translate(-cx, -cy);
    return run(s => s.call(zoom.transform, t), 750);
  };

  // 지도 좌표 → 상자 안 화면 좌표(현재 확대 반영)
  m.toScreen = xy => d3.zoomTransform(svg.node()).apply(xy);
  m.screenBox = ([a, b]) => [m.toScreen(a), m.toScreen(b)];

  // 보기 전환(F1-8): 지도 좌표 영역 src가 화면 영역 dst에 오도록 확대·이동(ms = 0이면 바로)
  m.fitBox = ([[x0, y0], [x1, y1]], [[X0, Y0], [X1, Y1]], ms = 750) => {
    const k = Math.min((X1 - X0) / (x1 - x0), (Y1 - Y0) / (y1 - y0));
    const t = d3.zoomIdentity.translate((X0 + X1) / 2 - k * (x0 + x1) / 2, (Y0 + Y1) / 2 - k * (y0 + y1) / 2).scale(k);
    if (!ms) { svg.call(zoom.transform, t); return Promise.resolve(); }
    return run(s => s.call(zoom.transform, t), ms);
  };
  // 지금 확대 상태를 반영한 투영 값(지구본 접기 연출의 출발·도착점)
  m.zoomSpec = () => {
    const t = d3.zoomTransform(svg.node()), [tx, ty] = proj.translate();
    return { scale: proj.scale() * t.k, translate: [tx * t.k + t.x, ty * t.k + t.y], rotate: proj.rotate() };
  };

  m.destroy = () => { svg.interrupt().on('.zoom', null); hideTip(); svg.remove(); };
  return m;
}
