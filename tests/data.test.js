// 데이터 검증 테스트: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as topojson from 'topojson-client';
import { geoArea } from 'd3-geo';

const json = p => JSON.parse(readFileSync(p, 'utf8'));
const countries = json('data/countries.ko.json');
const byId = new Map(countries.map(c => [c.id, c]));

test('국가 기준: UN 193 + 옵서버 2 = 195개국', () => {
  assert.equal(countries.filter(c => c.status === 'un').length, 193);
  assert.equal(countries.filter(c => c.status === 'observer').length, 2);
});

test('6대륙 국가 수 합계가 195이고 대륙 분류가 정해진 값과 같음', () => {
  const by = {};
  countries.filter(c => c.status !== 'region').forEach(c => { by[c.cont] = (by[c.cont] || 0) + 1; });
  assert.deepEqual(by, { AS: 47, EU: 45, AF: 54, NA: 23, SA: 12, OC: 14 });
  const cont = iso2 => countries.find(c => c.iso2 === iso2).cont;
  assert.equal(cont('RU'), 'EU');
  assert.equal(cont('CY'), 'EU');
  assert.equal(cont('TR'), 'AS');
  assert.equal(cont('GE'), 'AS');
  assert.equal(cont('EG'), 'AF');
});

test('대만·홍콩·마카오·그린란드·코소보는 지역으로 분류', () => {
  for (const ko of ['대만', '홍콩', '마카오', '그린란드', '코소보']) {
    assert.equal(countries.find(c => c.ko === ko).status, 'region', ko);
  }
});

test('모든 항목에 한국어·영어 이름, 대륙, 좌표가 있고 ID가 겹치지 않음', () => {
  assert.equal(byId.size, countries.length);
  for (const c of countries) {
    assert.ok(c.ko && c.en && c.cont, `${c.id} 이름·대륙 누락`);
    assert.ok(Array.isArray(c.ll) && c.ll.length === 2, `${c.ko} 좌표 누락`);
  }
});

for (const res of ['110m', '50m']) {
  test(`세계 지도 ${res}: 남극이 없고 모든 지형이 국가 사전과 연결됨`, () => {
    const topo = json(`data/countries-${res}.json`);
    const geoms = topo.objects.countries.geometries;
    assert.ok(!geoms.some(g => g.id === '010'), '남극이 남아 있음');
    const unknown = geoms.filter(g => !byId.has(g.id)).map(g => g.id ?? g.properties.name);
    assert.deepEqual(unknown, []);
  });
}

test('50m 지도에 작은 나라(싱가포르·몰디브·바티칸·몰타)가 있고 마커 대상임', () => {
  const topo = json('data/countries-50m.json');
  const ids = new Set(topo.objects.countries.geometries.map(g => g.id));
  for (const iso2 of ['SG', 'MV', 'VA', 'MT']) {
    const c = countries.find(x => x.iso2 === iso2);
    assert.ok(ids.has(c.id), `${c.ko} 지형 없음`);
    assert.ok(c.marker, `${c.ko} 마커 아님`);
  }
});

test('투발루처럼 지도 모양이 없는 UN 회원국은 마커로 표시', () => {
  const tv = countries.find(c => c.iso2 === 'TV');
  assert.ok(tv.marker && tv.noShape);
});

test('국기: ISO 코드가 있는 모든 항목에 SVG 파일이 있음', () => {
  const missing = countries.filter(c => c.iso2 && !existsSync(`assets/flags/${c.iso2.toLowerCase()}.svg`)).map(c => c.ko);
  assert.deepEqual(missing, []);
  const noIso = countries.filter(c => !c.iso2).map(c => c.ko).sort();
  assert.deepEqual(noIso, ['북키프로스', '소말릴란드', '시아첸 빙하', '오스트레일리아령 인도양 지역'].sort());
});

test('국기 이모지(지역 표시 문자)를 앱 코드에서 쓰지 않음', () => {
  const files = [];
  const walk = d => { if (!existsSync(d)) return; for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); f.isDirectory() ? walk(p) : /\.(js|css|html)$/.test(f.name) && files.push(p); } };
  walk('js'); walk('css'); files.push('index.html');
  const regional = /[\u{1F1E6}-\u{1F1FF}]/u;
  const bad = files.filter(f => existsSync(f) && (regional.test(readFileSync(f, 'utf8')) || /127397|0x1F1E6/i.test(readFileSync(f, 'utf8'))));
  assert.deepEqual(bad, []);
});

// ---------- 대한민국 ----------
const KR_CODES = ['11', '26', '27', '28', '29', '30', '31', '36', '41', '43', '44', '46', '47', '48', '50', '51', '52'];
const sidoTopo = json('data/korea-sido.json');
const sido = topojson.feature(sidoTopo, sidoTopo.objects.sido).features;
const polysOf = f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
const hasIslandIn = (f, [x0, y0, x1, y1]) =>
  polysOf(f).some(p => p[0].every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1));

test('한국 시도: 17칸, 최신 코드(강원 51, 전북 52), 광주·전남은 통합특별시 안에서 나눔', () => {
  assert.deepEqual(sido.map(f => f.properties.code).sort(), KR_CODES);
  const p = code => sido.find(f => f.properties.code === code).properties;
  assert.equal(p('51').name, '강원특별자치도');
  assert.equal(p('52').name, '전북특별자치도');
  assert.equal(p('29').official, '전남광주통합특별시');
  assert.equal(p('46').official, '전남광주통합특별시');
  for (const f of sido) assert.ok(f.properties.short, `${f.properties.code} 약칭 없음`);
});

test('한국 경계의 감는 방향이 D3 기준(뒤집혀 지구 전체를 덮지 않음)', () => {
  for (const [file, obj] of [['data/korea-sido.json', 'sido'], ['data/korea-sigungu.json', 'sigungu']]) {
    const t = json(file);
    const inverted = topojson.feature(t, t.objects[obj]).features.filter(f => geoArea(f) > 0.01).map(f => f.properties.name);
    assert.deepEqual(inverted, [], file);
  }
});

test('독도: 경상북도(47)에 독도 폴리곤이 있음', () => {
  const gb = sido.find(f => f.properties.code === '47');
  assert.ok(hasIslandIn(gb, [131.84, 37.22, 131.90, 37.26]), '독도 폴리곤 없음');
});

test('울릉도(경북)와 제주도(제주)가 있음', () => {
  assert.ok(hasIslandIn(sido.find(f => f.properties.code === '47'), [130.75, 37.42, 130.95, 37.58]), '울릉도 없음');
  assert.ok(hasIslandIn(sido.find(f => f.properties.code === '50'), [126.1, 33.1, 127.0, 33.6]), '제주도 없음');
});

test('한국 시군구: 모든 시군구가 17칸 중 하나에 속하고, 광주권은 5개 구', () => {
  const t = json('data/korea-sigungu.json');
  const g = t.objects.sigungu.geometries;
  assert.ok(g.length > 220);
  assert.deepEqual(g.filter(x => !KR_CODES.includes(x.properties.sido)), []);
  assert.equal(g.filter(x => x.properties.sido === '29').length, 5);
});

// ---------- 도시 ----------
const cityData = json('data/cities.json');
const cityRows = cityData.cities.rows;
const cityById = new Map(cityRows.map(r => [r[0], r]));

test('도시: 3만 곳 이상, 모든 도시의 국가가 국가 사전에 있음, 한국은 GeoNames 대신 시군구', () => {
  assert.ok(cityRows.length > 30000);
  assert.deepEqual(cityRows.filter(r => !byId.has(r[3])).map(r => r[2]), []);
  assert.equal(cityRows.filter(r => r[3] === '410').length, 0);
  assert.ok(cityData.sigungu.rows.length >= 220);
  assert.deepEqual(cityData.sigungu.rows.filter(r => !KR_CODES.includes(r[2])).map(r => r[1]), []);
});

test('도시: 주요 여행지 한국어 이름(보강표 포함, " 시" 접미사 없음)', () => {
  const ko = id => cityById.get(id)?.[1];
  assert.equal(ko(1850147), '도쿄');
  assert.equal(ko(1857910), '교토');
  assert.equal(ko(2735943), '포르투');
  assert.equal(ko(1572151), '나트랑');
  assert.equal(ko(2130531), '비에이');      // 작은 관광 도시(인구 1만 5천 미만)
  assert.ok(cityRows.every(r => !/\s시$/.test(r[1])));
});

test('시군구: 구가 있는 시는 하나로(수원시), 이름이 겹치는 곳(중구)은 표시', () => {
  const sgg = cityData.sigungu.rows;
  assert.ok(sgg.some(r => r[1] === '수원시'));
  assert.ok(!sgg.some(r => r[1] === '수원시장안구'));
  assert.ok(sgg.filter(r => r[1] === '중구').every(r => r[5] === 1));
});

test('지도 데이터 용량 목표', () => {
  const kb = p => statSync(p).size / 1024;
  assert.ok(kb('data/korea-sido.json') <= 200);
  assert.ok(kb('data/korea-sigungu.json') <= 600);
  assert.ok(kb('data/countries-110m.json') <= 150);
});
