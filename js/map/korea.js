// 대한민국 지도(Mercator). 시도 17칸, 또는 시군구(F1-9, 처음 열 때 경계 파일을 불러옴).
// 독도는 경계와 함께 마커·라벨을 항상 표시합니다(PRD 8.4).
import * as d3 from 'd3';
import { feature, merge, mesh } from 'topojson-client';
import { createMap } from './engine.js';
import { addStar } from './effects.js';
import { drawCityPins, toggleCityLabels } from './pins.js';
import { loadJSON } from '../data.js';
import { esc } from '../env.js';
import { sidoId, isSido, sigunguKey } from '../stats.js';
import { placeInfo, registerSigungu } from '../places.js';

export const DOKDO = [131.8669, 37.2419];   // 동도·서도 사이
const GYEONGBUK = sidoId('47');
const ULLEUNG = 'kr-sigungu:47940';

// 라벨 위치: 섬 때문에 중심이 어긋나는 곳은 [경도, 위도]로 직접 지정
const LABEL_AT = { '28': [126.66, 37.45], '41': [127.3, 37.2] };   // 인천, 경기
// 작은 지도(휴대폰)에서 겹치는 작은 시·도 라벨: 확대하면 보입니다.
const MINOR = new Set(['28', '29', '30', '31', '36']);              // 인천, 광주, 대전, 울산, 세종
const MINOR_MIN_PX = 700;                                           // 지도 폭 × 확대 배율이 이 값 이상이면 표시
const SGG_MIN_K = 3;      // 시군구 라벨은 3배 이상 확대했을 때만(DESIGN.md 9장)
const SGG_LABEL_W = 44;   // 그리고 시군구가 화면에서 이 폭(px) 이상일 때

// 시군구 경계를 장소 단위로 합칩니다(구가 있는 시는 시 하나로).
function sigunguFeatures(topo) {
  const groups = new Map();
  for (const g of topo.objects.sigungu.geometries) {
    const { code, name } = sigunguKey(g.properties.code, g.properties.name);
    if (!groups.has(code)) groups.set(code, { code, name, sido: g.properties.sido, geoms: [] });
    groups.get(code).geoms.push(g);
  }
  return [...groups.values()].map(({ geoms, ...properties }) => ({ type: 'Feature', properties, geometry: merge(topo, geoms) }));
}

// 여러 조각으로 된 곳은 가장 큰 조각의 중심(섬 때문에 바다로 가지 않도록)
function mainCentroid(f) {
  if (f.geometry.type !== 'MultiPolygon') return d3.geoCentroid(f);
  const parts = f.geometry.coordinates.map(coordinates => ({ type: 'Polygon', coordinates }));
  return d3.geoCentroid(parts.sort((a, b) => d3.geoArea(b) - d3.geoArea(a))[0]);
}

/** @param app worldView와 같은 형태 + krUnit(), onDrill(sidoPlaceId) */
export async function koreaView(container, app) {
  const unit = app.krUnit?.() === 'sigungu' ? 'sigungu' : 'sido';
  const sgg = unit === 'sigungu';
  const [topo, sggTopo] = await Promise.all([loadJSON('data/korea-sido.json'), sgg ? loadJSON('data/korea-sigungu.json') : null]);
  const feats = feature(topo, topo.objects.sido).features;
  const sggFeats = sgg ? sigunguFeatures(sggTopo) : null;
  if (sgg) registerSigungu(sggFeats.map(f => ({ ...f.properties, ll: mainCentroid(f) })));
  const pid = sgg ? f => `kr-sigungu:${f.properties.code}` : f => sidoId(f.properties.code);
  const tipHTML = (p, placeId) => {
    const official = sgg ? placeInfo(sidoId(p.sido)).name : p.official !== p.name ? p.official : '';
    const sub = official ? `<span class="dim">${esc(official)}</span><br>` : '';
    return `<b>${esc(p.name)}</b>${sub}<span style="color:var(--gold-strong)">${esc(app.statusText(placeId))}</span>`;
  };

  const m = createMap(container, {
    projection: d3.geoMercator(),
    fitObject: { type: 'FeatureCollection', features: [...feats, { type: 'Feature', geometry: { type: 'Point', coordinates: DOKDO } }] },
    // 넓은 화면에서는 왼쪽 HUD 자리를 비우고(시안 02), 위 검색창·아래 탭 바에 가리지 않게 합니다.
    // 휴대폰에서는 독도 라벨이 잘리지 않도록 오른쪽을 더 띄웁니다.
    extent: (w, h) => w > 720 ? [[w > 900 ? 360 : 20, 96], [w - 40, h - 104]] : [[20, 24], [w - 36, h - 24]],
    label: sgg ? '대한민국 시군구 지도' : '대한민국 시도 지도',
    maxZoom: sgg ? 16 : 12,
    classOf: f => app.classFor(pid(f)),
    tip: f => tipHTML(f.properties, pid(f)),
    onClick: (e, f, el) => app.onPlace(e, pid(f), el, d3.pointer(e, m.root.node())),
    onZoom: () => toggleLabels(),
    onZoomStart: app.onZoomStart,
    onBackground: app.onBackground,
  });
  if (!m) return null;
  m.view = 'korea';
  m.unit = unit;
  m.setFeatures(sgg ? sggFeats : feats);
  if (sgg) m.land.classed('sgg', true);
  // 시도를 두 번 누르면 그 시도의 시군구로 확대(F1-9)
  else m.sel.on('dblclick', (e, f) => { e.stopPropagation(); app.onDrill?.(pid(f)); });

  // 시군구 지도: 시도 경계를 굵게(DESIGN.md 9장)
  if (sgg) {
    m.markers.append('path').attr('class', 'sido-border')
      .attr('d', m.path(mesh(sggTopo, sggTopo.objects.sigungu, (a, b) => a !== b && a.properties.sido !== b.properties.sido)));
  }

  // 시도 라벨(시군구 지도에서는 확대하기 전까지만)
  const sidoFeat = new Map(feats.map(f => [sidoId(f.properties.code), f]));
  const anchor = new Map();
  for (const f of feats) {
    const code = f.properties.code;
    const xy = LABEL_AT[code] ? m.proj(LABEL_AT[code]) : m.path.centroid(f);
    anchor.set(sidoId(code), xy);
    m.pin(m.labels, xy, `sido-lbl${MINOR.has(code) ? ' minor' : ''}`).append('text').attr('class', 'label').attr('dy', '.35em').text(f.properties.short);
  }
  // 시군구 라벨: 화면에서 충분히 커졌을 때만
  if (sgg) {
    for (const f of sggFeats) {
      const [[x0], [x1]] = m.path.bounds(f);
      const g = m.pin(m.labels, m.proj(mainCentroid(f)), 'sgg-lbl');
      g.attr('data-k', Math.max(SGG_MIN_K, SGG_LABEL_W / Math.max(1, x1 - x0)));
      g.append('text').attr('class', 'label').attr('dy', '.35em').text(f.properties.name);
    }
  }
  function toggleLabels() {
    m.labels.selectAll('.sido-lbl').attr('hidden', function () {
      if (sgg) return m.k >= SGG_MIN_K ? '' : null;
      return this.classList.contains('minor') && m.w * m.k < MINOR_MIN_PX ? '' : null;
    });
    m.labels.selectAll('.sgg-lbl').attr('hidden', function () { return m.k < +this.dataset.k ? '' : null; });
    toggleCityLabels(m);
  }

  m.pathOf = placeId => m.sel.filter(f => pid(f) === placeId).node();

  // 독도: 경상북도 울릉군의 일부라서 누르면 경상북도(시군구 지도에서는 울릉군) 팝오버가 열립니다.
  const dkId = sgg ? ULLEUNG : GYEONGBUK;
  const dkXY = m.proj(DOKDO);
  const dk = m.pin(m.markers, dkXY, 'dokdo');
  const dkCircle = dk.append('circle').attr('r', 6);
  dk.append('text').attr('class', 'label').attr('y', -10).text('독도');
  m.hover(dk, () => `<b>독도</b><span class="dim">경상북도 울릉군</span><br><span style="color:var(--gold-strong)">${esc(app.statusText(dkId))}</span>`);
  dk.on('click', e => { e.stopPropagation(); app.onPlace(e, dkId, m.pathOf(dkId), dkXY); });

  m.redraw = () => {
    m.refresh();
    dkCircle.attr('class', `marker dokdo-ring ${app.classFor(dkId)}`);
    m.pins.selectAll('*').remove();
    // 다녀온 시군구는 시도 지도에서 점으로(시군구 지도에서는 땅이 칠해지므로 생략)
    if (!sgg) drawCityPins(m, app.cities('kr-sigungu'), app, { scale: 'korea', mapOf: info => sidoId(info.sido) });
    for (const placeId of app.stars('korea')) {
      // 시도는 라벨 위, 시군구는 저장된 좌표
      const info = isSido(placeId) ? null : placeInfo(placeId);
      const xy = info ? (info.ll && m.proj(info.ll)) : anchor.get(placeId);
      if (!xy) continue;
      const mapId = info ? (sgg ? placeId : sidoId(info.sido)) : placeId;
      const g = addStar(m.pin(m.pins, info ? xy : [xy[0], xy[1] - 16]), 14);
      if (info) m.hover(g, () => `<b>✦ ${esc(info.name)}</b><span class="dim">${esc(info.sub)}</span>`);
      g.on('click', e => { e.stopPropagation(); app.onPlace(e, placeId, m.pathOf(mapId), xy, mapId); });
    }
    toggleLabels();
  };

  m.target = placeId => {
    if (isSido(placeId)) {
      const f = sidoFeat.get(placeId);
      if (!f) return null;
      return { el: m.pathOf(placeId), xy: anchor.get(placeId), bounds: m.path.bounds(f), mapId: placeId };
    }
    const info = placeInfo(placeId);
    if (!info.ll) return null;
    const xy = m.proj(info.ll);
    const el = sgg ? m.pathOf(placeId) : null;
    if (el) return { el, xy, bounds: m.path.bounds(d3.select(el).datum()), mapId: placeId };
    const mapId = sidoId(info.sido);
    return { el: m.pathOf(mapId), xy, bounds: [[xy[0] - 8, xy[1] - 8], [xy[0] + 8, xy[1] + 8]], mapId };
  };

  // 보기 전환(F1-8): 지금 화면에서 대한민국(시도 전체)이 차지하는 영역
  m.koreaBox = () => m.screenBox(m.path.bounds({ type: 'FeatureCollection', features: feats }));
  m.resetView = () => m.reset();

  m.redraw();
  m.ready = Promise.resolve();
  return m;
}
