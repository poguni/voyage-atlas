// 화면 안의 작은 지도들: 여행 경로 지도(연대기), 장소 지도(장소 상세), 별 지도(위시리스트)
// 모두 engine.createMap을 재사용합니다.
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { createMap } from './engine.js';
import { addStar } from './effects.js';
import { loadJSON } from '../data.js';
import { placeInfo } from '../places.js';
import { countryOf, sidoOf, isCountry, isSido } from '../stats.js';
import { getState } from '../store.js';

export const HOME_AIRPORT = { code: 'ICN', name: '인천', ll: [126.45, 37.46] };   // 설정(Phase 4)에서 바꿀 수 있게 될 예정

const worldFeats = async (res = '50m') => { const t = await loadJSON(`data/countries-${res}.json`); return feature(t, t.objects.countries).features; };
const koreaFeats = async () => { const t = await loadJSON('data/korea-sido.json'); return feature(t, t.objects.sido).features; };
const keyOfWorld = f => `country:${f.id}`;
const keyOfKorea = f => `kr-sido:${f.properties.code}`;

// 경도·위도 점들을 감싸는 영역(여유 포함)
function bboxOf(points, minPad = 4) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const px = Math.max(minPad, (x1 - x0) * 0.2), py = Math.max(minPad * 0.6, (y1 - y0) * 0.25);
  const c = [[x0 - px, y0 - py], [x1 + px, y0 - py], [x1 + px, y1 + py], [x0 - px, y1 + py], [(x0 + x1) / 2, y1 + py], [(x0 + x1) / 2, y0 - py]];
  return { type: 'MultiPoint', coordinates: c };
}

// 여러 폴리곤 중 가장 큰 것(프랑스 본토 등)
function mainPolygon(f) {
  if (f.geometry.type !== 'MultiPolygon') return f;
  let best = null, area = -1;
  for (const coordinates of f.geometry.coordinates) {
    const g = { type: 'Polygon', coordinates };
    const a = d3.geoArea(g);
    if (a > area) { area = a; best = g; }
  }
  return { type: 'Feature', geometry: best };
}

const dot = (m, ll, cls, r = 5) => { const g = m.pin(m.pins, m.proj(ll)); g.append('circle').attr('r', r).attr('class', cls); return g; };
const label = (g, text, below) => g.append('text').attr('class', 'label').attr('y', below ? 18 : -10).text(text);

/**
 * 여행 경로 지도(PRD F3-3, DESIGN 7.5): 해외는 출발 공항 → 경유지 순서 → 출발 공항의 대권 곡선, 국내는 대한민국 지도에서 경유지 순서
 * @param classFor placeId → 땅 클래스(방문 단계)
 */
export async function drawRouteMap(container, trip, { classFor, onPlace }) {
  const places = getState().places;
  const stops = trip.stops.map(s => ({ placeId: s.placeId, info: placeInfo(s.placeId) })).filter(s => s.info.ll);
  const isKorea = trip.stops.length > 0 && trip.stops.every(s => countryOf(s.placeId, places) === '410');
  const feats = isKorea ? await koreaFeats() : await worldFeats();
  const keyOf = isKorea ? keyOfKorea : keyOfWorld;
  const hl = new Set(trip.stops.map(s => (isKorea ? `kr-sido:${sidoOf(s.placeId, places)}` : `country:${countryOf(s.placeId, places)}`)));
  const pts = stops.map(s => s.info.ll);
  const seq = isKorea ? pts : [HOME_AIRPORT.ll, ...pts, HOME_AIRPORT.ll];
  const fitPts = seq.length ? seq : [HOME_AIRPORT.ll];

  const m = createMap(container, {
    projection: isKorea ? d3.geoMercator() : d3.geoNaturalEarth1(),
    fitObject: isKorea ? { type: 'FeatureCollection', features: feats.filter(f => hl.has(keyOf(f))).concat(stops.length ? [] : feats) } : bboxOf(fitPts),
    extent: (w, h) => [[24, 24], [w - 24, h - 24]],
    label: `${trip.title} 여행 경로 지도`,
    maxZoom: 12,
    classOf: f => `${classFor(keyOf(f))}${hl.has(keyOf(f)) ? ' hl' : ''}`,
    onClick: (e, f) => onPlace?.(keyOf(f)),
  });
  if (!m) return null;
  m.land.classed('dim', true);
  m.setFeatures(feats);

  // 대권 곡선(d3.geoPath는 LineString을 대권으로 그립니다)
  for (let i = 1; i < seq.length; i++) {
    const leg = { type: 'LineString', coordinates: [seq[i - 1], seq[i]] };
    m.routes.append('path').attr('class', 'route-shadow').attr('d', m.path(leg));
    m.routes.append('path').attr('class', 'route').attr('d', m.path(leg));
  }
  if (!isKorea) label(dot(m, HOME_AIRPORT.ll, 'route-home'), HOME_AIRPORT.code, true);
  stops.forEach((s, i) => {
    const g = dot(m, s.info.ll, 'route-stop', 6);
    label(g, `${i + 1} ${s.info.name}`, i % 2 === 1);
    g.style('cursor', 'pointer').on('click', e => { e.stopPropagation(); onPlace?.(s.placeId); });
  });
  return { m, domestic: isKorea };
}

/**
 * 장소 상세의 작은 지도: 국가·시도를 확대해 강조하고, 그 안에서 다녀온 도시를 점으로 표시
 * @param cities [{ ll, name }]
 */
export async function drawPlaceMap(container, placeId, { classFor, cities = [] }) {
  const info = placeInfo(placeId);
  const korea = isSido(placeId) || placeId.startsWith('kr-sigungu:');
  const feats = korea ? await koreaFeats() : await worldFeats();
  const keyOf = korea ? keyOfKorea : keyOfWorld;
  // 도시는 속한 국가(시군구는 시도)를 강조
  const focusKey = isCountry(placeId) || isSido(placeId) ? placeId
    : korea ? `kr-sido:${info.sido}` : `country:${info.countryId}`;
  const target = feats.find(f => keyOf(f) === focusKey);
  const m = createMap(container, {
    projection: korea ? d3.geoMercator() : d3.geoNaturalEarth1(),
    fitObject: target ? mainPolygon(target) : { type: 'Sphere' },
    extent: (w, h) => [[20, 20], [w - 20, h - 20]],
    label: `${info.name} 지도`,
    maxZoom: 16,
    classOf: f => `${classFor(keyOf(f))}${keyOf(f) === focusKey ? ' hl' : ''}`,
  });
  if (!m) return null;
  m.land.classed('dim', true);
  m.setFeatures(feats);
  for (const c of cities) label(dot(m, c.ll, 'route-stop', 4), c.name, false);
  if (!isCountry(placeId) && !isSido(placeId) && info.ll) label(dot(m, info.ll, 'route-home', 5), info.name, true);
  return m;
}

/**
 * 위시리스트 별 지도(DESIGN 06): 방문한 땅은 진하게, 나머지는 옅게. 위시마다 반짝이는 별 + 이름
 * @returns { m, update(wishes) }  wishes: [{ id, placeId, label, ll }]
 */
export async function drawWishMap(container, { classFor, onStar }) {
  const feats = await worldFeats('110m');
  const m = createMap(container, {
    projection: d3.geoNaturalEarth1(),
    fitObject: { type: 'FeatureCollection', features: feats },
    extent: (w, h) => [[16, 16], [w - 16, h - 16]],
    label: '위시리스트 별 지도',
    maxZoom: 10,
    classOf: f => `${classFor(keyOfWorld(f))} wishmap`,
  });
  if (!m) return null;
  m.setFeatures(feats);
  const stars = new Map();
  const update = wishes => {
    m.refresh();
    m.pins.selectAll('*').remove();
    stars.clear();
    wishes.forEach((w, i) => {
      if (!w.ll) return;
      const g = addStar(m.pin(m.pins, m.proj(w.ll)), 18);
      g.append('text').attr('class', 'label').attr('y', i % 2 ? -16 : 26).text(w.label);
      g.attr('aria-label', w.label).on('click', e => { e.stopPropagation(); onStar?.(w.id); });
      stars.set(w.id, g);
    });
  };
  return { m, update, starOf: id => stars.get(id) };
}

