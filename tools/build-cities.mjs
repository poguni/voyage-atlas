// data/cities.json(도시 검색·여행 경유지용)을 만듭니다.
// 원본(tools/.cache/, Git 제외, 없으면 자동 다운로드):
//   - GeoNames cities15000.zip: 인구 1만 5천 이상 도시(CC BY 4.0)
//   - GeoNames cities1000.zip: 인구 1천 이상 도시 중 한국어 이름이 있는 곳만 추가(인터라켄·할슈타트 같은 작은 관광지)
//   - GeoNames alternateNamesV2.zip: 한국어 이름(isolanguage = ko)
//   - GeoNames admin1CodesASCII.txt: 같은 나라 안 같은 이름 도시를 구분할 1차 행정구역 이름
// 한국은 GeoNames 대신 data/korea-sigungu.json의 시군구를 씁니다(구가 있는 시는 시 하나로 합침).
// 출력: { cities: { fields, rows }, sigungu: { fields, rows } }
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import readline from 'node:readline';
import yauzl from 'yauzl';
import * as topojson from 'topojson-client';
import { geoCentroid, geoArea } from 'd3-geo';

const CACHE = 'tools/.cache';
const BASE = 'https://download.geonames.org/export/dump/';
const KEEP_CODES = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLG', 'PPLS', 'PPLF', 'PPLL', 'PPLR']);   // 동네(PPLX)·옛 지명 제외
// 국가 사전에 따로 없는 해외 영토 → 지도에서 속한 나라
const TERRITORY = { GF: 'FR', GP: 'FR', MQ: 'FR', RE: 'FR', YT: 'FR', SJ: 'NO', BQ: 'NL', TK: 'NZ', UM: 'US', GI: 'GB' };
const NO_ISO = { CC: 'x-ioter', CX: 'x-ioter' };   // 오스트레일리아령 인도양 지역
const OVERRIDES = 'tools/city-ko-overrides.csv';   // 한국어 이름 수작업 보강: geonameid,한국어 이름,검색용 다른 이름(|로 구분)

mkdirSync(CACHE, { recursive: true });
async function download(name) {
  const path = `${CACHE}/${name}`;
  if (existsSync(path)) return path;
  console.log(`내려받는 중: ${BASE}${name}`);
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`다운로드 실패 ${name}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(path));
  return path;
}

// zip 안의 텍스트 파일을 한 줄씩 읽기
function zipLines(zipPath, entryName, onLine) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      zip.on('entry', entry => {
        if (entry.fileName !== entryName) return zip.readEntry();
        zip.openReadStream(entry, (e, stream) => {
          if (e) return reject(e);
          const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
          rl.on('line', onLine);
          rl.on('close', () => { zip.close(); resolve(); });
        });
      });
      zip.on('end', resolve);
      zip.readEntry();
    });
  });
}

const HANGUL = /^[가-힣\s]+$/;
const TAB = '\t';
const countries = JSON.parse(readFileSync('data/countries.ko.json', 'utf8'));
const idOfIso2 = new Map([...countries.filter(c => c.iso2).map(c => [c.iso2, c.id]), ...Object.entries(NO_ISO)]);

const citiesZip = await download('cities15000.zip');
const smallZip = await download('cities1000.zip');
const admin1Path = await download('admin1CodesASCII.txt');
const altZip = await download('alternateNamesV2.zip');

// ---------- 1. 도시 목록 ----------
const overrides = new Map();
if (existsSync(OVERRIDES)) {
  for (const l of readFileSync(OVERRIDES, 'utf8').split(/\r?\n/).slice(1)) {
    const [id, ko, alt] = l.split(',').map(s => s?.trim());
    if (id && ko) overrides.set(id, { ko, alt: alt ? alt.split('|') : [] });
  }
}

const admin1 = new Map(readFileSync(admin1Path, 'utf8').split('\n').map(l => l.split(TAB)).map(p => [p[0], p[2]]));
const cities = new Map();
const skipped = {};
function readCities(zipPath, entry, small) {
  return zipLines(zipPath, entry, line => {
    const c = line.split(TAB);
    const [id, name, ascii, alts, lat, lon, , fcode, cc, , a1] = c;
    if (cc === 'KR' || cities.has(id) || (!KEEP_CODES.has(fcode) && !overrides.has(id))) return;
    const country = idOfIso2.get(TERRITORY[cc] ?? cc);
    if (!country) { if (!small) skipped[cc] = (skipped[cc] ?? 0) + 1; return; }
    // 한국어 이름이 alternateNames에 없을 때를 대비해 alternatenames 열의 한글 표기를 모아 둡니다.
    const hangul = alts.split(',').filter(a => HANGUL.test(a));
    cities.set(id, {
      id: +id, en: name || ascii, country, lat: +(+lat).toFixed(2), lon: +(+lon).toFixed(2),
      pop: +c[14], a1: admin1.get(`${cc}.${a1}`) ?? '', ko: [], hangul, small,
    });
  });
}
await readCities(citiesZip, 'cities15000.txt', false);
const bigCount = cities.size;
await readCities(smallZip, 'cities1000.txt', true);
console.log(`도시 ${bigCount}곳 + 작은 도시 후보 ${cities.size - bigCount}곳(국가 사전에 없는 지역 제외: ${Object.entries(skipped).map(([k, v]) => `${k} ${v}`).join(', ') || '없음'})`);

// ---------- 2. 한국어 이름 ----------
await zipLines(altZip, 'alternateNamesV2.txt', line => {
  const c = line.split(TAB);
  if (c[2] !== 'ko') return;
  const city = cities.get(c[1]);
  if (!city || c[6] === '1' || c[7] === '1') return;   // 구어·옛 이름 제외
  city.ko.push({ name: c[3].trim(), preferred: c[4] === '1' });
});

// 작은 도시는 한국어 이름이 있는 곳(한국인에게 알려진 관광지일 가능성이 높음)만 남깁니다.
for (const [id, c] of cities) if (c.small && !c.ko.length && !c.hangul.length && !overrides.has(id)) cities.delete(id);

// '오사카 시'처럼 끝에 ' 시'가 붙은 이름은 떼어 낸 이름을 대표로
const plain = n => n.replace(/\s시$/, '');
const dupKey = c => `${c.country}|${c.en}`;
const dupCount = {};
for (const c of cities.values()) dupCount[dupKey(c)] = (dupCount[dupKey(c)] ?? 0) + 1;

const rows = [];
let withKo = 0;
for (const c of cities.values()) {
  // 대표 한국어 이름: 수작업 보강 → 대표 이름(preferred) → 짧은 순. 나머지는 검색용 다른 이름
  const names = [...new Set([
    ...c.ko.sort((a, b) => (b.preferred - a.preferred) || (a.name.length - b.name.length)).map(k => k.name),
    ...c.hangul,
  ])].filter(n => HANGUL.test(n));
  const ov = overrides.get(String(c.id));
  const ko = ov?.ko ?? (names[0] ? plain(names[0]) : '');
  const alt = [...new Set([...(ov?.alt ?? []), ...names])].filter(n => n !== ko && plain(n) !== ko).slice(0, 3);
  if (ko) withKo++;
  rows.push([c.id, ko, c.en, c.country, c.lat, c.lon, Math.round(c.pop / 1000), dupCount[dupKey(c)] > 1 ? c.a1 : '', alt.join('|')]);
}
rows.sort((a, b) => b[6] - a[6]);   // 인구 많은 순(검색 순위에 사용)
const smallKept = [...cities.values()].filter(c => c.small).length;

// ---------- 3. 한국 시군구(구가 있는 시는 시로 합침) ----------
const sggTopo = JSON.parse(readFileSync('data/korea-sigungu.json', 'utf8'));
const sggFeats = topojson.feature(sggTopo, sggTopo.objects.sigungu).features;
const groups = new Map();
for (const f of sggFeats) {
  const { code, name, sido } = f.properties;
  // 광역시·특별시의 자치구('중구' 등)는 그대로, 일반 시 안의 구('수원시장안구')는 '수원시'로
  const m = /^(.+시)(.+구)$/.exec(name);
  const key = m ? `${code.slice(0, 4)}0` : code;
  if (!groups.has(key)) groups.set(key, { code: key, name: m ? m[1] : name, sido, feats: [] });
  groups.get(key).feats.push(f);
}
const sggDup = {};
for (const g of groups.values()) sggDup[g.name] = (sggDup[g.name] ?? 0) + 1;
const sggRows = [];
for (const g of groups.values()) {
  // 가장 큰 조각의 중심(섬 때문에 중심이 바다로 가지 않도록)
  const main = g.feats.sort((a, b) => geoArea(b) - geoArea(a))[0];
  const [lon, lat] = geoCentroid(main);
  sggRows.push([g.code, g.name, g.sido, +lat.toFixed(3), +lon.toFixed(3), sggDup[g.name] > 1 ? 1 : 0]);
}

const out = {
  source: 'GeoNames cities15000·cities1000 + alternateNamesV2 (CC BY 4.0), 한국은 SGIS 행정경계(vuski/admdongkor) 시군구',
  cities: { fields: ['id', 'ko', 'en', 'country', 'lat', 'lon', 'popK', 'admin1', 'alt'], rows },
  sigungu: { fields: ['code', 'name', 'sido', 'lat', 'lon', 'dupName'], rows: sggRows },
};
writeFileSync('data/cities.json', JSON.stringify(out));
console.log(`한국 시군구 ${sggRows.length}곳(구가 있는 시는 하나로)`);
console.log(`data/cities.json: 도시 ${rows.length}곳(작은 관광 도시 ${smallKept}곳 포함, 한국어 이름 ${withKo}곳 ${(withKo / rows.length * 100).toFixed(1)}%), ${(statSync('data/cities.json').size / 1024).toFixed(0)}KB`);
