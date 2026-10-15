// 대한민국 시도 지도(Mercator, 17칸). 독도는 경계와 함께 마커·라벨을 항상 표시합니다(PRD 8.4).
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { createMap } from './engine.js';
import { addStar } from './effects.js';
import { loadJSON } from '../data.js';
import { esc } from '../env.js';
import { sidoId, isSido } from '../stats.js';
import { placeInfo } from '../places.js';

export const DOKDO = [131.8669, 37.2419];   // 동도·서도 사이
const GYEONGBUK = sidoId('47');

// 라벨 위치: 섬 때문에 중심이 어긋나는 곳은 [경도, 위도]로 직접 지정
const LABEL_AT = { '28': [126.66, 37.45], '41': [127.3, 37.2] };   // 인천, 경기
// 작은 지도(휴대폰)에서 겹치는 작은 시·도 라벨: 확대하면 보입니다.
const MINOR = new Set(['28', '29', '30', '31', '36']);              // 인천, 광주, 대전, 울산, 세종
const MINOR_MIN_PX = 700;                                           // 지도 폭 × 확대 배율이 이 값 이상이면 표시

const toggleMinor = m => m.labels.selectAll('.minor').attr('hidden', m.w * m.k < MINOR_MIN_PX ? '' : null);

/** @param app worldView와 같은 형태 */
export async function koreaView(container, app) {
  const topo = await loadJSON('data/korea-sido.json');
  const feats = feature(topo, topo.objects.sido).features;
  const pid = f => sidoId(f.properties.code);
  const tipHTML = (p, placeId) => {
    const sub = p.official !== p.name ? `<span class="dim">${esc(p.official)}</span><br>` : '';
    return `<b>${esc(p.name)}</b>${sub}<span style="color:var(--gold-strong)">${esc(app.statusText(placeId))}</span>`;
  };

  const m = createMap(container, {
    projection: d3.geoMercator(),
    fitObject: { type: 'FeatureCollection', features: [...feats, { type: 'Feature', geometry: { type: 'Point', coordinates: DOKDO } }] },
    // 넓은 화면에서는 왼쪽 HUD 자리를 비우고(시안 02), 위 검색창·아래 탭 바에 가리지 않게 합니다.
    // 휴대폰에서는 독도 라벨이 잘리지 않도록 오른쪽을 더 띄웁니다.
    extent: (w, h) => w > 720 ? [[w > 900 ? 360 : 20, 96], [w - 40, h - 104]] : [[20, 24], [w - 36, h - 24]],
    label: '대한민국 시도 지도',
    maxZoom: 12,
    classOf: f => app.classFor(pid(f)),
    tip: f => tipHTML(f.properties, pid(f)),
    onClick: (e, f, el) => app.onPlace(e, pid(f), el, d3.pointer(e, m.root.node())),
    onZoom: toggleMinor,
    onZoomStart: app.onZoomStart,
    onBackground: app.onBackground,
  });
  if (!m) return null;
  m.view = 'korea';
  m.setFeatures(feats);

  const anchor = new Map();
  for (const f of feats) {
    const code = f.properties.code;
    const xy = LABEL_AT[code] ? m.proj(LABEL_AT[code]) : m.path.centroid(f);
    anchor.set(pid(f), xy);
    m.pin(m.labels, xy, MINOR.has(code) ? 'minor' : '').append('text').attr('class', 'label').attr('dy', '.35em').text(f.properties.short);
  }
  toggleMinor(m);

  m.pathOf = placeId => m.sel.filter(f => pid(f) === placeId).node();

  // 독도: 경상북도의 일부라서 누르면 경상북도 팝오버가 열립니다.
  const dkXY = m.proj(DOKDO);
  const dk = m.pin(m.markers, dkXY, 'dokdo');
  const dkCircle = dk.append('circle').attr('r', 6);
  dk.append('text').attr('class', 'label').attr('y', -10).text('독도');
  m.hover(dk, () => `<b>독도</b><span class="dim">경상북도 울릉군</span><br><span style="color:var(--gold-strong)">${esc(app.statusText(GYEONGBUK))}</span>`);
  dk.on('click', e => { e.stopPropagation(); app.onPlace(e, GYEONGBUK, m.pathOf(GYEONGBUK), dkXY); });

  m.redraw = () => {
    m.refresh();
    dkCircle.attr('class', `marker dokdo-ring ${app.classFor(GYEONGBUK)}`);
    m.pins.selectAll('*').remove();
    for (const placeId of app.stars('korea')) {
      // 시도는 라벨 위, 시군구는 저장된 좌표
      const info = isSido(placeId) ? null : placeInfo(placeId);
      const xy = info ? (info.ll && m.proj(info.ll)) : anchor.get(placeId);
      if (!xy) continue;
      const mapId = info ? sidoId(info.sido) : placeId;
      const g = addStar(m.pin(m.pins, info ? xy : [xy[0], xy[1] - 16]), 14);
      if (info) m.hover(g, () => `<b>✦ ${esc(info.name)}</b><span class="dim">${esc(info.sub)}</span>`);
      g.on('click', e => { e.stopPropagation(); app.onPlace(e, placeId, m.pathOf(mapId), xy, mapId); });
    }
  };

  m.target = placeId => {
    if (!isSido(placeId)) {
      const info = placeInfo(placeId);
      if (!info.ll) return null;
      const mapId = sidoId(info.sido);
      const xy = m.proj(info.ll);
      return { el: m.pathOf(mapId), xy, bounds: [[xy[0] - 8, xy[1] - 8], [xy[0] + 8, xy[1] + 8]], mapId };
    }
    const el = m.pathOf(placeId);
    if (!el) return null;
    return { el, xy: anchor.get(placeId), bounds: m.path.bounds(d3.select(el).datum()), mapId: placeId };
  };

  m.redraw();
  m.ready = Promise.resolve();
  return m;
}
