// 세계 지도(Natural Earth 투영). 110m로 먼저 그리고 50m로 바꿉니다(PRD 7.2, 8.5).
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { createMap } from './engine.js';
import { loadJSON, loadCountries, CONT } from '../data.js';
import { flagHTML } from '../ui/flag.js';
import { esc } from '../env.js';

const toFeatures = topo => feature(topo, topo.objects.countries).features;

// Phase 0: 아직 방문 기록이 없으므로 모두 미방문(금박)
const classOf = () => 'unv';
const statusText = () => '미방문';

function tipHTML(c) {
  return `<b>${flagHTML(c.iso2, c.ko, 16)}${esc(c.ko)}</b>`
    + `<span class="dim">${esc(c.en)} · ${CONT[c.cont] ?? ''}</span><br>`
    + `<span style="color:var(--gold-strong)">${statusText(c)}</span>`;
}

export async function worldView(container) {
  const [{ list, byId }, topo110] = await Promise.all([loadCountries(), loadJSON('data/countries-110m.json')]);
  const feats110 = toFeatures(topo110);
  const info = f => byId.get(f.id);

  const m = createMap(container, {
    projection: d3.geoNaturalEarth1(),
    fitObject: { type: 'FeatureCollection', features: feats110 },
    extent: (w, h) => w > 720 ? [[40, 40], [w - 40, h - 40]] : [[12, 12], [w - 12, h - 12]],
    graticule: true,
    label: '방문 국가가 색칠된 세계 지도',
    maxZoom: 12,
    classOf,
    tip: f => tipHTML(info(f)),
  });
  if (!m) return null;
  m.setFeatures(feats110);

  // 작은 나라 원형 마커(PRD 8.3): 지도에서 너무 작은 국가와 지도에 모양이 없는 국가
  for (const c of list.filter(x => x.marker)) {
    const g = m.pin(m.markers, m.proj(c.ll), 'small-country');
    g.append('circle').attr('class', 'marker').attr('r', m.w > 720 ? 4 : 3);
    m.hover(g, tipHTML(c));
  }

  // 자세한 50m 지도로 바꾸기(같은 투영 유지)
  loadJSON('data/countries-50m.json').then(topo50 => {
    if (m.svg.node().isConnected) m.setFeatures(toFeatures(topo50));
  }).catch(err => console.warn('50m 지도를 불러오지 못해 110m로 유지합니다.', err));

  return m;
}
