// 대한민국 시도 지도(Mercator, 17칸). 독도는 경계와 함께 마커·라벨을 항상 표시합니다(PRD 8.4).
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { createMap } from './engine.js';
import { loadJSON } from '../data.js';
import { esc } from '../env.js';

export const DOKDO = [131.8669, 37.2419];   // 동도·서도 사이

// 라벨 위치: 섬 때문에 중심이 어긋나는 곳은 [경도, 위도]로 직접 지정
const LABEL_AT = { '28': [126.66, 37.45], '41': [127.3, 37.2] };   // 인천, 경기
// 작은 지도(휴대폰)에서 겹치는 작은 시·도 라벨: 확대하면 보입니다.
const MINOR = new Set(['28', '29', '30', '31', '36']);              // 인천, 광주, 대전, 울산, 세종
const MINOR_MIN_PX = 700;                                           // 지도 폭 × 확대 배율이 이 값 이상이면 표시

const classOf = () => 'unv';   // Phase 0: 모두 미방문

function tipHTML(p) {
  const sub = p.official !== p.name ? `<span class="dim">${esc(p.official)}</span><br>` : '';
  return `<b>${esc(p.name)}</b>${sub}<span style="color:var(--gold-strong)">미방문</span>`;
}

const toggleMinor = m => m.labels.selectAll('.minor').attr('hidden', m.w * m.k < MINOR_MIN_PX ? '' : null);

export async function koreaView(container) {
  const topo = await loadJSON('data/korea-sido.json');
  const feats = feature(topo, topo.objects.sido).features;

  const m = createMap(container, {
    projection: d3.geoMercator(),
    fitObject: { type: 'FeatureCollection', features: [...feats, { type: 'Feature', geometry: { type: 'Point', coordinates: DOKDO } }] },
    // 넓은 화면에서는 왼쪽 HUD(Phase 1) 자리를 비우고(시안 02), 위 검색창·아래 탭 바에 가리지 않게 합니다.
    // 휴대폰에서는 독도 라벨이 잘리지 않도록 오른쪽을 더 띄웁니다.
    extent: (w, h) => w > 720 ? [[w > 900 ? 360 : 20, 96], [w - 40, h - 104]] : [[20, 24], [w - 36, h - 24]],
    label: '대한민국 시도 지도',
    maxZoom: 12,
    classOf,
    tip: f => tipHTML(f.properties),
    onZoom: toggleMinor,
  });
  if (!m) return null;
  m.setFeatures(feats);

  for (const f of feats) {
    const code = f.properties.code;
    const xy = LABEL_AT[code] ? m.proj(LABEL_AT[code]) : m.path.centroid(f);
    m.pin(m.labels, xy, MINOR.has(code) ? 'minor' : '').append('text').attr('class', 'label').attr('dy', '.35em').text(f.properties.short);
  }
  toggleMinor(m);

  const dk = m.pin(m.markers, m.proj(DOKDO), 'dokdo');
  dk.append('circle').attr('class', 'marker dokdo-ring').attr('r', 6);
  dk.append('text').attr('class', 'label').attr('y', -10).text('독도');
  m.hover(dk, '<b>독도</b><span class="dim">경상북도 울릉군</span><br><span style="color:var(--gold-strong)">미방문</span>');

  return m;
}
