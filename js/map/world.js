// 세계 지도(Natural Earth 투영). 110m로 먼저 그리고 50m로 바꿉니다(PRD 7.2, 8.5).
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { createMap } from './engine.js';
import { addStar } from './effects.js';
import { drawCityPins, toggleCityLabels } from './pins.js';
import { loadJSON, loadCountries, CONT } from '../data.js';
import { flagHTML } from '../ui/flag.js';
import { esc } from '../env.js';
import { countryId, isCountry } from '../stats.js';
import { placeInfo } from '../places.js';

const toFeatures = topo => feature(topo, topo.objects.countries).features;

// 여러 폴리곤으로 된 나라(프랑스 + 프랑스령 기아나 등)는 가장 큰 폴리곤을 기준으로 확대합니다.
function mainBounds(path, f) {
  if (f.geometry.type !== 'MultiPolygon') return path.bounds(f);
  let best = null, area = -1;
  for (const coordinates of f.geometry.coordinates) {
    const g = { type: 'Polygon', coordinates };
    const a = path.area(g);
    if (a > area) { area = a; best = g; }
  }
  return path.bounds(best);
}

// 나라 툴팁(DESIGN.md 7.7): 국기 + 한국어 이름 / 영어 이름 · 대륙 / 상태
export const countryTipHTML = (c, statusText) => `<b>${flagHTML(c.iso2, c.ko, 16)}${esc(c.ko)}</b>`
  + `<span class="dim">${esc(c.en)} · ${CONT[c.cont] ?? ''}</span><br>`
  + `<span style="color:var(--gold-strong)">${esc(statusText(countryId(c.id)))}</span>`;

/**
 * @param app { classFor(placeId), statusText(placeId), onPlace(e, placeId, el, xy), onZoomStart(), onBackground(), stars(view), cities(kind) }
 */
export async function worldView(container, app) {
  const [{ list, byId }, topo110] = await Promise.all([loadCountries(), loadJSON('data/countries-110m.json')]);
  const pid = f => countryId(f.id);
  const tipHTML = c => countryTipHTML(c, app.statusText);

  const feats110 = toFeatures(topo110);
  const m = createMap(container, {
    projection: d3.geoNaturalEarth1(),
    fitObject: { type: 'FeatureCollection', features: feats110 },
    extent: (w, h) => w > 720 ? [[40, 40], [w - 40, h - 40]] : [[12, 12], [w - 12, h - 12]],
    graticule: true,
    label: '방문 국가가 색칠된 세계 지도',
    maxZoom: 12,
    classOf: f => app.classFor(pid(f)),
    tip: f => tipHTML(byId.get(f.id)),
    onClick: (e, f, el) => app.onPlace(e, pid(f), el, d3.pointer(e, m.root.node())),
    onZoom: toggleCityLabels,
    onZoomStart: app.onZoomStart,
    onBackground: app.onBackground,
  });
  if (!m) return null;
  m.view = 'world';
  m.setFeatures(feats110);

  // 같은 나라의 path 중 가장 큰 것(긁기 연출·확대 기준)
  m.pathOf = placeId => {
    let best = null, area = -1;
    m.sel.filter(f => pid(f) === placeId).each(function (f) { const a = m.path.area(f); if (a > area) { area = a; best = this; } });
    return best;
  };

  // 작은 나라 원형 마커(PRD 8.3): 지도에서 너무 작은 국가와 지도에 모양이 없는 국가
  const r = m.w > 720 ? 4 : 3;
  const markerSel = list.filter(c => c.marker).map(c => {
    const g = m.pin(m.markers, m.proj(c.ll), 'small-country');
    const circle = g.append('circle').attr('r', r).datum(c);
    m.hover(g, () => tipHTML(c));
    g.on('click', e => { e.stopPropagation(); app.onPlace(e, countryId(c.id), m.pathOf(countryId(c.id)), m.proj(c.ll)); });
    return circle;
  });

  m.redraw = () => {
    m.refresh();
    markerSel.forEach(cl => cl.attr('class', `marker ${app.classFor(countryId(cl.datum().id))}`));
    m.pins.selectAll('*').remove();
    drawCityPins(m, app.cities('city'), app, { mapOf: info => countryId(info.countryId) });
    for (const placeId of app.stars('world')) {
      // 국가는 국가 사전 좌표, 도시는 저장된 좌표
      const c = isCountry(placeId) ? byId.get(placeId.slice(8)) : null;
      const info = c ? null : placeInfo(placeId);
      const ll = c ? c.ll : info.ll;
      if (!ll) continue;
      const mapId = c ? placeId : countryId(info.countryId);
      const g = addStar(m.pin(m.pins, m.proj(ll)), 14);
      m.hover(g, () => (c ? tipHTML(c) : `<b>✦ ${esc(info.name)}</b><span class="dim">${esc(info.sub)}</span>`));
      g.on('click', e => { e.stopPropagation(); app.onPlace(e, placeId, m.pathOf(mapId), m.proj(ll), mapId); });
    }
  };

  // 검색 등으로 장소를 찾아갈 때: { el(긁을 땅), xy(지도 좌표), bounds, mapId(땅의 장소 ID) }
  m.target = placeId => {
    if (!isCountry(placeId)) {
      const info = placeInfo(placeId);
      if (!info.ll) return null;
      const mapId = countryId(info.countryId);
      const xy = m.proj(info.ll);
      return { el: m.pathOf(mapId), xy, bounds: [[xy[0] - 5, xy[1] - 5], [xy[0] + 5, xy[1] + 5]], mapId };
    }
    const c = byId.get(placeId.slice(8));
    if (!c) return null;
    const el = m.pathOf(placeId);
    const xy = m.proj(c.ll);
    const bounds = el ? mainBounds(m.path, d3.select(el).datum()) : [[xy[0] - 4, xy[1] - 4], [xy[0] + 4, xy[1] + 4]];
    return { el, xy, bounds, mapId: placeId };
  };

  // 보기 전환(F1-8): 지구본 접기 연출용 투영 값, 한국으로 날아가기·돌아오기
  m.spec = () => ({ raw: d3.geoNaturalEarth1Raw, clip: null, ...m.zoomSpec() });
  m.flyToKorea = (box, ms) => {
    const k = m.pathOf(countryId('410'));
    return k ? m.fitBox(mainBounds(m.path, d3.select(k).datum()), box, ms) : Promise.resolve();
  };
  m.resetView = () => m.reset();

  m.redraw();

  // 자세한 50m 지도로 바꾸기(같은 투영 유지). 같은 나라의 path는 그대로 두고 모양만 바꿉니다.
  m.ready = loadJSON('data/countries-50m.json').then(topo50 => {
    if (m.svg.node().isConnected) m.setFeatures(toFeatures(topo50));
  }).catch(err => console.warn('50m 지도를 불러오지 못해 110m로 유지합니다.', err));

  return m;
}
