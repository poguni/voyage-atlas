// 한국 시도·시군구 경계 TopoJSON을 만듭니다.
// 원본: vuski/admdongkor ver20260701 행정동 경계(GeoJSON, 약 35MB) → tools/.cache/에 내려받음(Git 제외)
// 처리: 행정동을 시도·시군구 단위로 합치고(dissolve) 단순화한 뒤, 단순화로 사라지는 독도(동도·서도)
//       원본 폴리곤을 다시 넣습니다. (mapshaper의 keep-shapes는 지형 안의 작은 섬까지 지켜 주지 않음)
// 출력: data/korea-sido.json(객체 이름 sido), data/korea-sigungu.json(객체 이름 sigungu)
//   시도 속성: code(2자리), name(지도 표시 이름), official(행정구역 명칭), short(약칭)
//   시군구 속성: code(5자리), name, sido(아래 17칸 코드)
// 17칸 규칙: 2026-07-01 광주광역시와 전라남도가 전남광주통합특별시(12)로 통합되었지만,
//   여행 기록에서는 둘을 구분하는 편이 자연스러워 지도에서는 광주권(옛 광주 5개 구, 29)과 전남권(46)으로 나눕니다.
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import mapshaper from 'mapshaper';
import { topology } from 'topojson-server';
import { quantize } from 'topojson-client';

const VERSION = 'ver20260701';
const URL = `https://raw.githubusercontent.com/vuski/admdongkor/master/${VERSION}/HangJeongDong_${VERSION}.geojson`;
const CACHE = 'tools/.cache';
const SRC = `${CACHE}/HangJeongDong_${VERSION}.geojson`;

const GWANGJU_SGG = ['12210', '12240', '12270', '12300', '12330'];   // 동구·서구·남구·북구·광산구
const UNIFIED = '전남광주통합특별시';
const SHORT = {
  '11': '서울', '26': '부산', '27': '대구', '28': '인천', '29': '광주', '30': '대전', '31': '울산', '36': '세종',
  '41': '경기', '43': '충북', '44': '충남', '46': '전남', '47': '경북', '48': '경남', '50': '제주', '51': '강원', '52': '전북',
};
const DOKDO_BBOX = [131.84, 37.22, 131.90, 37.26];   // [서, 남, 동, 북]

mkdirSync(CACHE, { recursive: true });
if (!existsSync(SRC)) {
  console.log(`내려받는 중: ${URL}`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`다운로드 실패: ${res.status}`);
  writeFileSync(SRC, Buffer.from(await res.arrayBuffer()));
}

const REGION = `region = sido === '12' ? (${JSON.stringify(GWANGJU_SGG).replace(/"/g, "'")}.includes(sgg) ? '29' : '46') : sido`;

async function dissolve(field, copy, simplify) {
  const cmd = `-i "${SRC}" -each "${REGION}" -dissolve ${field} copy-fields=${copy} ${simplify} -clean -o out.geojson format=geojson precision=0.00001`;
  const out = await mapshaper.applyCommands(cmd);
  return JSON.parse(out['out.geojson']);
}

const polysOf = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const inBox = ring => ring.every(([x, y]) => x >= DOKDO_BBOX[0] && x <= DOKDO_BBOX[2] && y >= DOKDO_BBOX[1] && y <= DOKDO_BBOX[3]);

// 단순화된 지형에 원본의 독도 폴리곤을 다시 넣습니다.
function restoreDokdo(simple, full, key, value) {
  const src = full.features.find(f => f.properties[key] === value);
  const dokdo = polysOf(src.geometry).filter(p => inBox(p[0]));
  if (dokdo.length === 0) throw new Error('원본에서 독도 폴리곤을 찾지 못함');
  const dst = simple.features.find(f => f.properties[key] === value);
  const kept = polysOf(dst.geometry).filter(p => !inBox(p[0]));
  dst.geometry = { type: 'MultiPolygon', coordinates: [...kept, ...dokdo] };
  return dokdo.length;
}

// D3는 바깥 고리가 시계 방향, 구멍이 반시계 방향이어야 합니다(반대면 '지구 전체 - 폴리곤'으로 해석).
// mapshaper GeoJSON 출력은 RFC 7946(바깥 반시계)이라 방향을 뒤집습니다.
const signedArea = ring => ring.reduce((s, [x1, y1], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return s + (x2 - x1) * (y2 + y1); }, 0);
function rewindForD3(geom) {
  for (const poly of polysOf(geom)) {
    poly.forEach((ring, i) => {
      const clockwise = signedArea(ring) > 0;
      if ((i === 0) !== clockwise) ring.reverse();
    });
  }
}

function save(fc, objName, out, props) {
  fc.features.forEach(f => { f.properties = props(f.properties); rewindForD3(f.geometry); });
  const topo = quantize(topology({ [objName]: fc }), 1e5);
  writeFileSync(out, JSON.stringify(topo));
  console.log(`${out}: ${fc.features.length}개, ${(statSync(out).size / 1024).toFixed(0)}KB`);
}

// 시도: 전국 보기용
const sidoFull = await dissolve('region', 'sidonm', '');
const sido = await dissolve('region', 'sidonm', '-simplify interval=250 keep-shapes');
console.log(`독도 폴리곤 ${restoreDokdo(sido, sidoFull, 'region', '47')}개 복원(경상북도)`);
save(sido, 'sido', 'data/korea-sido.json', p =>
  p.region === '29' ? { code: '29', name: '광주', official: UNIFIED, short: '광주' }
    : p.region === '46' ? { code: '46', name: '전남', official: UNIFIED, short: '전남' }
      : { code: p.region, name: p.sidonm, official: p.sidonm, short: SHORT[p.region] });

// 시군구: 시도 확대용(P1)이라 조금 더 자세히
const sggFull = await dissolve('sgg', 'sggnm,region', '');
const sgg = await dissolve('sgg', 'sggnm,region', '-simplify interval=120 keep-shapes');
console.log(`독도 폴리곤 ${restoreDokdo(sgg, sggFull, 'sgg', '47940')}개 복원(울릉군)`);
save(sgg, 'sigungu', 'data/korea-sigungu.json', p => ({ code: p.sgg, name: p.sggnm, sido: p.region }));
