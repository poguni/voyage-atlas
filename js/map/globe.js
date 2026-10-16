// 2D 지구본(PRD F1-7, DESIGN.md 7.6): Orthographic 투영, 느린 자전(0.006°/ms), 끌어서 돌리기 + 관성, 휠·버튼 확대.
// 레이어: 대기 광채 → 바다 → 경위선 → 땅 → 작은 나라 마커 → 비행 궤적(홈 공항 → 방문 도시) → 도시 점 → 홈 공항 → 위시 별
// 세계 지도와 같은 연결 함수(app)를 쓰고, main.js가 기대하는 지도 객체 모양(redraw, target, zoomToBounds…)을 맞춥니다.
// 뒤쪽 반구의 점·별은 숨깁니다(geoDistance > 90°).
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { loadJSON, loadCountries } from '../data.js';
import { addStar } from './effects.js';
import { HOME_AIRPORT } from './mini.js';
import { countryTipHTML } from './world.js';
import { showTip, moveTip, hideTip } from '../ui/tooltip.js';
import { esc } from '../env.js';
import { motionReduced } from '../settings.js';
import { countryId, isCountry, countryOf, tripStarted, KOREA } from '../stats.js';
import { placeInfo } from '../places.js';
import { getState } from '../store.js';

const SPEED = 0.006;            // 자전 속도(°/ms)
const TILT = 60;                // 위아래 기울기 한계(°)
const MAX_K = 6;
let introDone = false;          // 궤적이 그려지는 시작 연출은 실행마다 한 번

const clampTilt = v => Math.max(-TILT, Math.min(TILT, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = d => ((d + 540) % 360) - 180;   // 경도 차이를 -180~180으로

/** @param app worldView와 같은 형태 + spin(), busy() */
export async function globeView(container, app) {
  const [{ list, byId }, topo] = await Promise.all([loadCountries(), loadJSON('data/countries-110m.json')]);
  container.querySelectorAll('.map-svg:not([data-keep])').forEach(n => n.remove());
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return null;
  const feats = feature(topo, topo.objects.countries).features;
  const korea = feats.find(f => f.id === KOREA);

  // 넓은 화면에서는 왼쪽 HUD 자리를 피해 오른쪽으로(시안 03)
  const R0 = Math.min(w, h) * (w > 720 ? 0.4 : 0.44);
  const C0 = [w > 900 ? w / 2 + 120 : w / 2, h / 2];
  const HOME_ROT = [-HOME_AIRPORT.ll[0], clampTilt(-HOME_AIRPORT.ll[1] + 12), 0];
  const globeProj = d3.geoOrthographic().scale(R0).translate(C0).rotate(HOME_ROT).clipAngle(90).precision(0.5);
  let proj = globeProj, path = d3.geoPath(proj);
  let morphing = false, animating = false, dragging = false, hover = false;
  let vel = [0, 0];

  const svg = d3.select(container).insert('svg', ':first-child')
    .attr('class', 'map-svg globe').attr('viewBox', `0 0 ${w} ${h}`)
    .attr('role', 'img').attr('aria-label', '돌릴 수 있는 지구본: 다녀온 나라가 색칠되어 있어요');
  const atmo = svg.append('circle').attr('class', 'globe-atmo').attr('fill', 'url(#atmo)');
  const sphere = svg.append('path').datum({ type: 'Sphere' }).attr('class', 'globe-sphere');
  const grat = svg.append('path').datum(d3.geoGraticule10()).attr('class', 'graticule');
  const land = svg.append('g').attr('class', 'land');
  const markers = svg.append('g').attr('class', 'markers');
  const routes = svg.append('g').attr('class', 'globe-routes');
  const points = svg.append('g').attr('class', 'globe-points');
  const pins = svg.append('g');

  const pid = f => countryId(f.id);
  const sel = land.selectAll('path').data(feats).join('path').attr('data-id', f => f.id)
    .on('pointerenter', (e, f) => { hover = true; const c = byId.get(f.id); if (c) showTip(e, countryTipHTML(c, app.statusText)); })
    .on('pointermove', moveTip)
    .on('pointerleave', () => { hover = false; hideTip(); })
    .on('click', function (e, f) { app.onPlace(e, pid(f), this, d3.pointer(e, svg.node())); });

  const m = { view: 'globe', svg, land, sel, w, h, ready: Promise.resolve() };

  // 같은 나라의 path 중 가장 큰 것(팝오버 기준)
  m.pathOf = placeId => {
    let best = null, area = -1;
    sel.filter(f => pid(f) === placeId).each(function (f) { const a = d3.geoArea(f); if (a > area) { area = a; best = this; } });
    return best;
  };

  // 작은 나라 마커
  const markerSel = markers.selectAll('g').data(list.filter(c => c.marker)).join('g').attr('class', 'keep');
  markerSel.append('circle').attr('r', w > 720 ? 4 : 3);
  markerSel.on('pointerenter', (e, c) => showTip(e, countryTipHTML(c, app.statusText))).on('pointermove', moveTip).on('pointerleave', hideTip)
    .on('click', (e, c) => { e.stopPropagation(); app.onPlace(e, countryId(c.id), m.pathOf(countryId(c.id)), proj(c.ll)); });

  // 비행 궤적: 이미 다녀온 여행의 해외 경유지(같은 곳은 한 번)
  let arcs = [], stars = [];
  function collect() {
    const s = getState(), seen = new Map();
    for (const t of s.trips) {
      if (!tripStarted(t)) continue;
      for (const st of t.stops ?? []) {
        if (seen.has(st.placeId) || countryOf(st.placeId, s.places) === KOREA) continue;
        const info = placeInfo(st.placeId);
        if (info.ll) seen.set(st.placeId, { ll: info.ll, name: info.name });
      }
    }
    arcs = [...seen.values()].map(p => ({ ...p, line: { type: 'LineString', coordinates: [HOME_AIRPORT.ll, p.ll] } }));
    stars = app.stars('world').map(id => {
      const c = isCountry(id) ? byId.get(id.slice(8)) : null;
      const info = c ? null : placeInfo(id);
      return { id, ll: c ? c.ll : info.ll, mapId: c ? id : countryId(info.countryId), html: c ? countryTipHTML(c, app.statusText) : `<b>✦ ${esc(info.name)}</b><span class="dim">${esc(info.sub)}</span>` };
    }).filter(s => s.ll);
  }

  let routeShadow, routeLine, cityDots, home, starSel;
  function build() {
    routes.selectAll('*').remove(); points.selectAll('*').remove(); pins.selectAll('*').remove();
    routeShadow = routes.selectAll('.route-shadow').data(arcs).join('path').attr('class', 'route-shadow');
    routeLine = routes.selectAll('.route').data(arcs).join('path').attr('class', 'route');
    cityDots = points.selectAll('circle.globe-city').data(arcs).join('circle').attr('class', 'globe-city').attr('r', 2.6);
    cityDots.on('pointerenter', (e, d) => showTip(e, `<b>${esc(d.name)}</b>`)).on('pointermove', moveTip).on('pointerleave', hideTip);
    home = points.append('circle').attr('class', 'route-home').attr('r', 5);
    starSel = stars.map(s => {
      const g = addStar(pins.append('g').attr('class', 'keep'), 16);
      g.on('pointerenter', e => showTip(e, s.html)).on('pointermove', moveTip).on('pointerleave', hideTip);
      g.on('click', e => { e.stopPropagation(); app.onPlace(e, s.id, m.pathOf(s.mapId), proj(s.ll), s.mapId); });
      return { s, g };
    });
  }

  // 모양 다시 그리기(회전·확대·접기 연출마다)
  function draw() {
    sphere.attr('d', path); grat.attr('d', path); sel.attr('d', path);
    routeShadow.attr('d', d => path(d.line)); routeLine.attr('d', d => path(d.line));
    const [cx, cy] = proj.translate(), r = proj.scale();
    atmo.attr('cx', cx).attr('cy', cy).attr('r', r * 1.18);
    if (morphing) return;
    const center = proj.invert([cx, cy]);
    const vis = ll => d3.geoDistance(ll, center) < Math.PI / 2 - 0.02;
    const at = (sel2, ll) => { const p = proj(ll); sel2.attr('transform', `translate(${p})`).style('display', vis(ll) ? null : 'none'); };
    markerSel.each(function (c) { at(d3.select(this), c.ll); });
    cityDots.each(function (d) { at(d3.select(this), d.ll); });
    at(home, HOME_AIRPORT.ll);
    starSel.forEach(({ s, g }) => at(g, s.ll));
  }

  m.refresh = () => {
    sel.attr('class', f => app.classFor(pid(f)));
    markerSel.select('circle').attr('class', c => `marker ${app.classFor(countryId(c.id))}`);
  };
  m.redraw = () => { m.refresh(); collect(); build(); draw(); };

  // ---------- 움직임 ----------
  const setRotate = r => { proj.rotate([r[0], clampTilt(r[1]), r[2] ?? 0]); };
  const kOf = () => proj.scale() / R0;

  // 회전·확대·위치를 ms 동안 바꿈(ms = 0이면 바로)
  function tweenView(to, ms) {
    const from = { rotate: proj.rotate(), scale: proj.scale(), translate: proj.translate() };
    const dλ = wrap(to.rotate[0] - from.rotate[0]);
    const apply = t => {
      proj.rotate([from.rotate[0] + dλ * t, lerp(from.rotate[1], to.rotate[1], t), 0])
        .scale(Math.exp(lerp(Math.log(from.scale), Math.log(to.scale), t)))
        .translate([lerp(from.translate[0], to.translate[0], t), lerp(from.translate[1], to.translate[1], t)]);
      draw();
    };
    if (!ms || motionReduced()) { apply(1); return Promise.resolve(); }
    return run(ms, apply);
  }

  function run(ms, frame) {
    animating = true;
    return new Promise(res => {
      const t0 = performance.now();
      const tm = d3.timer(() => {
        const t = Math.min(1, (performance.now() - t0) / ms);
        frame(d3.easeCubicInOut(t));
        if (t >= 1) { tm.stop(); animating = false; res(); }
      });
      timers.add(tm);
    });
  }
  const timers = new Set();

  // 끌어서 돌리기 + 관성
  let lastT = 0;
  const drag = d3.drag().clickDistance(4)
    .on('start', () => { dragging = true; vel = [0, 0]; lastT = performance.now(); app.onZoomStart(); hideTip(); })
    .on('drag', e => {
      const now = performance.now(), dt = Math.max(1, now - lastT); lastT = now;
      const f = 0.3 / kOf(), r = proj.rotate();
      const dλ = e.dx * f, dφ = -e.dy * f;
      setRotate([r[0] + dλ, r[1] + dφ, 0]);
      vel = [dλ / dt, dφ / dt];
      draw();
    })
    .on('end', () => { dragging = false; if (performance.now() - lastT > 80) vel = [0, 0]; });
  svg.call(drag);
  svg.on('click.bg', e => { const c = e.target.classList; if (e.target === svg.node() || c.contains('graticule') || c.contains('globe-sphere')) app.onBackground(e); });

  const zoomTo = (k, ms = 300) => tweenView({ rotate: proj.rotate(), scale: R0 * Math.max(1, Math.min(MAX_K, k)), translate: proj.translate() }, ms);
  const onWheel = e => { e.preventDefault(); app.onZoomStart(); zoomTo(kOf() * Math.pow(2, -e.deltaY * 0.002), 0); };
  svg.node().addEventListener('wheel', onWheel, { passive: false });

  // 자전·관성: 끌기·연출 중, 팝오버가 열려 있을 때, 나라 위에 마우스가 있을 때, 지도 화면이 아닐 때는 멈춤
  let last = performance.now();
  const ticker = d3.timer(() => {
    const now = performance.now(), dt = Math.min(64, now - last); last = now;
    if (dragging || animating || morphing || container.offsetParent === null) return;
    if (Math.abs(vel[0]) + Math.abs(vel[1]) > 1e-4 && !motionReduced()) {
      const r = proj.rotate();
      setRotate([r[0] + vel[0] * dt, r[1] + vel[1] * dt, 0]);
      const decay = Math.pow(0.94, dt / 16);
      vel = [vel[0] * decay, vel[1] * decay];
      draw();
      return;
    }
    if (motionReduced() || !app.spin() || app.busy() || hover) return;
    const r = proj.rotate();
    setRotate([r[0] + SPEED * dt, r[1], 0]);
    draw();
  });

  // ---------- main.js가 쓰는 함수 ----------
  m.toScreen = xy => xy;   // 확대·이동을 투영에 바로 반영하므로 지도 좌표 = 화면 좌표
  m.zoomBy = f => zoomTo(kOf() * f, 400);
  m.reset = () => tweenView({ rotate: HOME_ROT, scale: R0, translate: C0 }, 700);
  m.resetView = () => m.reset();

  // 검색으로 찾아갈 때: target의 bounds 자리에 경위도를 넘기고, zoomToBounds가 그곳을 가운데로 돌립니다.
  m.target = placeId => {
    const c = isCountry(placeId) ? byId.get(placeId.slice(8)) : null;
    const info = c ? null : placeInfo(placeId);
    const ll = c ? c.ll : info?.ll;
    if (!ll) return null;
    const mapId = c ? placeId : countryId(info.countryId);
    return { el: m.pathOf(mapId), xy: C0, bounds: ll, mapId };
  };
  m.zoomToBounds = ll => tweenView({ rotate: [-ll[0], clampTilt(-ll[1]), 0], scale: R0 * Math.max(kOf(), 2), translate: C0 }, 750);

  // ---------- 보기 전환(F1-8) ----------
  // 대한민국이 화면 영역 box에 오도록 돌리고 확대(한국 시도 지도와 겹쳐 보이게)
  m.flyToKorea = (box, ms) => {
    const ll = d3.geoCentroid(korea), rot = [-ll[0], -ll[1], 0];
    const b = d3.geoPath(d3.geoOrthographic().rotate(rot).scale(1).translate([0, 0]).clipAngle(90)).bounds(korea);
    const s = Math.min((box[1][0] - box[0][0]) / (b[1][0] - b[0][0]), (box[1][1] - box[0][1]) / (b[1][1] - b[0][1]));
    const tr = [(box[0][0] + box[1][0]) / 2 - s * (b[0][0] + b[1][0]) / 2, (box[0][1] + box[1][1]) / 2 - s * (b[0][1] + b[1][1]) / 2];
    return tweenView({ rotate: rot, scale: s, translate: tr }, ms);
  };

  // 평면 지도 ↔ 지구본 접기: 두 투영의 원시 좌표를 섞고, 확대·위치·회전·잘라내는 각도를 함께 바꿉니다.
  // 평면 지도 ↔ 지구본 접기: 두 투영의 원시 좌표를 섞고, 확대·위치·회전을 함께 바꿉니다.
  // 정사영은 뒤쪽 반구를 앞쪽 위로 접어 겹치므로, 연출 중에는 뒤쪽 반구를 원 바깥 고리로 펼치고(spread)
  // 지구본에 가까워질수록 고리를 테두리로 좁힙니다. 자르기(clipAngle)를 쓰지 않아 날짜변경선을 넘는 나라도 깨지지 않습니다.
  const unfold = spread => (λ, φ) => {
    const x = Math.cos(φ) * Math.sin(λ), y = Math.sin(φ), c = Math.cos(φ) * Math.cos(λ);
    if (c >= 0) return [x, y];
    const n = Math.hypot(x, y) || 1e-9, r = 1 + (Math.acos(Math.max(-1, c)) - Math.PI / 2) * spread;
    return [x / n * r, y / n * r];
  };
  const globeSpec = () => ({ globe: true, scale: globeProj.scale(), translate: globeProj.translate(), rotate: globeProj.rotate() });
  function morph(a, b, ms) {
    morphing = true;
    points.style('display', 'none'); pins.style('display', 'none'); markers.style('display', 'none');
    const rot = d3.interpolate(a.rotate, b.rotate);
    const frame = t => {
      const g = a.globe ? 1 - t : t;                   // 0 = 평면, 1 = 지구본
      const flat = a.globe ? b.raw : a.raw, ball = unfold(0.6 * (1 - g));
      const raw = (λ, φ) => { const p = flat(λ, φ), q = ball(λ, φ); return [lerp(p[0], q[0], g), lerp(p[1], q[1], g)]; };
      proj = d3.geoProjection(raw).scale(lerp(a.scale, b.scale, t))
        .translate([lerp(a.translate[0], b.translate[0], t), lerp(a.translate[1], b.translate[1], t)])
        .rotate(rot(t)).precision(0.7);
      path = d3.geoPath(proj);
      sphere.style('opacity', Math.max(0, g * 2 - 1)); atmo.style('opacity', g * g);   // 바다는 후반에만(중간 모양이 마름모라서)
      draw();
    };
    frame(0);
    return run(ms, frame).then(() => {
      proj = globeProj; path = d3.geoPath(proj); morphing = false;
      sphere.style('opacity', null); atmo.style('opacity', null);
      points.style('display', null); pins.style('display', null); markers.style('display', null);
      draw();
    });
  }
  m.morphFrom = (spec, ms) => morph(spec, globeSpec(), ms);
  m.morphTo = (spec, ms) => morph(globeSpec(), spec, ms);

  // 시작 연출(DESIGN.md 7.4): 처음 지구본을 열 때 궤적이 90ms 간격으로 그려짐(각 1.2초)
  m.intro = () => {
    if (introDone || motionReduced()) return;
    introDone = true;
    routeLine.each(function (d, i) {
      const L = this.getTotalLength();
      if (!L) return;
      d3.select(this).attr('stroke-dasharray', `${L} ${L}`).attr('stroke-dashoffset', L)
        .transition().delay(i * 90).duration(1200).attr('stroke-dashoffset', 0)
        .on('end', function () { d3.select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null); });
    });
  };

  m.destroy = () => {
    ticker.stop();
    timers.forEach(t => t.stop());
    svg.node().removeEventListener('wheel', onWheel);
    svg.interrupt().on('.drag', null);
    hideTip();
    svg.remove();
  };

  m.redraw();
  return m;
}
