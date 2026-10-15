// data/countries.ko.json(국가 사전)을 만듭니다.
// 입력: data/countries-50m.json(build-world 결과), country-meta.mjs(한국어 이름·대륙·지위)
// 출력 항목: { id, iso2, iso3, ko, en, cont, status, ll, marker?, alt? }
//   id     = 지도 지형 ID(ISO 숫자 코드, 없으면 x- ID). 장소 ID는 "country:" + id
//   status = un | observer | region
//   ll     = 마커·검색 이동용 대표 좌표 [경도, 위도](가장 큰 폴리곤의 중심)
//   marker = 지도에서 너무 작아 원형 마커를 함께 표시할 국가
import { readFileSync, writeFileSync } from 'node:fs';
import * as topojson from 'topojson-client';
import { geoArea, geoCentroid } from 'd3-geo';
import countries from 'i18n-iso-countries';
import { META, NO_ID, MARKER_ONLY } from './country-meta.mjs';

const EARTH_R = 6371;                 // km
const MARKER_MAX_KM2 = 15000;         // 이보다 작은 국가(UN·옵서버, 홍콩·마카오)는 마커 표시
const STATUS = { U: 'un', O: 'observer', R: 'region' };
// i18n-iso-countries의 영어 이름 중 공식 표기가 길거나 모호한 것을 일상 표기로 바꿉니다.
const EN = {
  BN: 'Brunei', LA: 'Laos', KR: 'South Korea', SY: 'Syria', TR: 'Türkiye', AE: 'United Arab Emirates',
  MD: 'Moldova', NL: 'Netherlands', GB: 'United Kingdom', VA: 'Vatican City', CG: 'Republic of the Congo',
  CD: 'DR Congo', GM: 'Gambia', FM: 'Micronesia', MO: 'Macau', AX: 'Åland Islands', VG: 'British Virgin Islands',
  VI: 'U.S. Virgin Islands', FK: 'Falkland Islands', MF: 'Saint Martin', SX: 'Sint Maarten', CV: 'Cabo Verde',
};

const topo = JSON.parse(readFileSync('data/countries-50m.json', 'utf8'));
const feats = topojson.feature(topo, topo.objects.countries).features;

// 같은 ID의 지형이 여러 개일 수 있음(예: 호주 + 애시모어 카르티에 제도)
const byId = new Map();
for (const f of feats) {
  if (!byId.has(f.id)) byId.set(f.id, []);
  byId.get(f.id).push(f);
}

// 지형들 중 가장 큰 폴리곤의 중심과 전체 면적
function shapeInfo(fs) {
  let area = 0, best = null, bestArea = -1;
  for (const f of fs) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys) {
      const g = { type: 'Polygon', coordinates: p };
      const a = geoArea(g);
      area += a;
      if (a > bestArea) { bestArea = a; best = g; }
    }
  }
  const [lon, lat] = geoCentroid(best);
  return { km2: area * EARTH_R * EARTH_R, ll: [+lon.toFixed(2), +lat.toFixed(2)] };
}

const round = n => +n.toFixed(2);
const out = [];
const used = new Set();

for (const line of META.trim().split('\n')) {
  const [iso2, ko, cont, st, alt] = line.split('|');
  const num = countries.alpha2ToNumeric(iso2);
  const iso3 = countries.alpha2ToAlpha3(iso2);
  if (!num || !iso3) throw new Error(`ISO 코드 변환 실패: ${iso2}`);
  const en = EN[iso2] || countries.getName(iso2, 'en', { select: 'alias' });
  const item = { id: num, iso2, iso3, ko, en, cont, status: STATUS[st] };
  const fs = byId.get(num);
  if (fs) {
    const s = shapeInfo(fs);
    item.ll = s.ll;
    if (st !== 'R' || iso2 === 'HK' || iso2 === 'MO') { if (s.km2 < MARKER_MAX_KM2) item.marker = true; }
  } else if (MARKER_ONLY[iso2]) {
    item.ll = MARKER_ONLY[iso2].map(round);
    item.marker = true;
    item.noShape = true;
  } else {
    throw new Error(`지도에 없는 국가이고 마커 좌표도 없음: ${iso2} ${ko}`);
  }
  if (alt) item.alt = alt.split(',');
  out.push(item);
  used.add(num);
}

for (const [mapName, [id, iso2, ko, cont, en]] of Object.entries(NO_ID)) {
  const fs = byId.get(id);
  if (!fs) throw new Error(`지도에서 찾을 수 없음: ${mapName}`);
  const item = { id, iso2, iso3: '', ko, en, cont, status: 'region', ll: shapeInfo(fs).ll };
  out.push(item);
  used.add(id);
}

// 지도의 모든 지형이 사전과 연결되는지 확인
const missing = [...byId.keys()].filter(id => !used.has(id));
if (missing.length) throw new Error(`사전에 없는 지도 지형: ${missing.join(', ')}`);

const count = s => out.filter(c => c.status === s).length;
console.log(`data/countries.ko.json: UN ${count('un')} + 옵서버 ${count('observer')} = ${count('un') + count('observer')}개국, 지역 ${count('region')}곳, 마커 ${out.filter(c => c.marker).length}개`);
writeFileSync('data/countries.ko.json', JSON.stringify(out));
