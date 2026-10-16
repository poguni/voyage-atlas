// 장소 정보 찾기: 장소 ID → 이름·국기·좌표, 검색 항목 만들기
// 국가·시도는 시작할 때 등록하고, 도시·시군구(data/cities.json)는 검색을 처음 쓸 때 불러옵니다.
// 여행·위시에 쓴 도시는 state.places에 이름·좌표가 저장되므로, 도시 파일 없이도 표시됩니다.
import { CONT, loadJSON } from './data.js';
import { isCountry, isSido, KOREA } from './stats.js';
import { getState } from './store.js';
import { normName, distKm } from './ai/merge.js';

const reg = { countries: new Map(), sido: new Map() };
const cityIndex = new Map();   // placeId → 저장용 정보 { name_ko, name_en, countryId, sido?, lat, lon, admin1? }
let cityItems = null, cityLoading = null;

export function registerPlaces({ countries, sido }) {
  countries.forEach(c => reg.countries.set(`country:${c.id}`, c));
  sido.forEach(p => reg.sido.set(`kr-sido:${p.code}`, p));   // { code, name, official, short, ll }
}

export const countryList = () => [...reg.countries.values()];
export const sidoList = () => [...reg.sido.entries()].map(([placeId, p]) => ({ placeId, ...p }));
export const countryOfId = id => reg.countries.get(`country:${id}`);

const metaOf = placeId => {
  const p = getState().places[placeId];
  return p && (p.name_ko || p.name_en) ? p : cityIndex.get(placeId);
};

// { name, en, sub, iso2, view('world'|'korea'), ll[경도, 위도], region, kind }
export function placeInfo(placeId) {
  if (isCountry(placeId)) {
    const c = reg.countries.get(placeId);
    if (!c) return { name: placeId, sub: '', iso2: '', view: 'world', kind: 'country' };
    return { name: c.ko, en: c.en, sub: CONT[c.cont] ?? '', iso2: c.iso2, view: 'world', ll: c.ll, region: c.status === 'region', kind: 'country' };
  }
  if (isSido(placeId)) {
    const p = reg.sido.get(placeId);
    return { name: p?.name ?? placeId, sub: p && p.official !== p.name ? p.official : '대한민국', iso2: 'KR', view: 'korea', ll: p?.ll, kind: 'sido' };
  }
  const m = metaOf(placeId);
  if (!m) return { name: placeId, sub: '', iso2: '', view: 'world', kind: 'city' };
  const country = reg.countries.get(`country:${m.countryId}`);
  const sigungu = placeId.startsWith('kr-sigungu:');
  const sido = sigungu ? reg.sido.get(`kr-sido:${m.sido}`) : null;
  return {
    name: m.name_ko || m.name_en, en: m.name_en,
    sub: sigungu ? (sido?.name ?? '대한민국') : [country?.ko, m.admin1].filter(Boolean).join(' · '),
    iso2: country?.iso2 ?? '', view: sigungu ? 'korea' : 'world', ll: [m.lon, m.lat],
    countryId: m.countryId, sido: m.sido, kind: sigungu ? 'sigungu' : 'city',
  };
}

// 여행·위시에 저장할 장소 정보(도시·시군구만 해당)
export function placeMeta(placeId) {
  if (isCountry(placeId) || isSido(placeId)) return null;
  const m = cityIndex.get(placeId) ?? getState().places[placeId];
  if (!m) return null;
  const { name_ko, name_en, countryId, sido, lat, lon, admin1 } = m;
  return Object.fromEntries(Object.entries({ name_ko, name_en, countryId, sido, lat, lon, admin1 }).filter(([, v]) => v !== undefined && v !== ''));
}

// ---------- 검색 항목 ----------
let baseItems = null;
export function baseSearchItems() {
  if (baseItems) return baseItems;
  baseItems = [
    ...countryList().map(c => ({
      placeId: `country:${c.id}`, name: c.ko, sub: c.status === 'region' ? `${c.en} · 지역` : c.en, iso2: c.iso2,
      keys: [c.ko, c.en, ...(c.alt ?? [])], region: c.status === 'region', group: c.status === 'region' ? 'region' : c.cont, rank: 0,
    })),
    ...sidoList().map(p => ({
      placeId: p.placeId, name: p.name, sub: p.official !== p.name ? p.official : '대한민국 시도', iso2: 'KR',
      keys: [p.name, p.short, p.official], rank: 0,
    })),
  ];
  return baseItems;
}

export const allSearchItems = () => (cityItems ? [...baseSearchItems(), ...cityItems] : baseSearchItems());

// 도시·시군구 불러오기(한 번만)
export function loadCityItems() {
  cityLoading ??= loadJSON('data/cities.json').then(d => {
    const items = [];
    for (const [code, name, sido, lat, lon, dup] of d.sigungu.rows) {
      const placeId = `kr-sigungu:${code}`;
      const s = reg.sido.get(`kr-sido:${sido}`);
      cityIndex.set(placeId, { name_ko: name, countryId: KOREA, sido, lat, lon });
      items.push({ placeId, name, sub: `${s?.name ?? ''}${dup ? '' : ' · 대한민국'}`, iso2: 'KR', keys: [name, `${s?.short ?? ''}${name}`], rank: 0.3 });
    }
    for (const [id, ko, en, country, lat, lon, popK, admin1, alt] of d.cities.rows) {
      const placeId = `city:${id}`;
      const c = reg.countries.get(`country:${country}`);
      cityIndex.set(placeId, { name_ko: ko, name_en: en, countryId: country, lat, lon, admin1 });
      items.push({
        placeId, name: ko || en, sub: [ko ? en : '', c?.ko, admin1].filter(Boolean).join(' · '), iso2: c?.iso2 ?? '',
        keys: [ko, en, ...(alt ? alt.split('|') : [])], rank: 1 / (2 + popK),
      });
    }
    cityItems = items;
    return items;
  });
  return cityLoading;
}

// AI 추천지 → 도시·시군구 장소 ID(위시에 담을 때). 같은 나라에서 이름이 같은 60km 이내 도시를 먼저,
// 없으면 25km 이내 가장 가까운 도시. 찾지 못하면 null(나라로 담음)
export async function findCity(countryId, ll, names = []) {
  await loadCityItems();
  const want = new Set(names.map(normName).filter(Boolean));
  let byName = null, nameKm = 60, near = null, nearKm = 25;
  for (const [placeId, m] of cityIndex) {
    if (m.countryId !== countryId) continue;
    const d = distKm(ll, [m.lon, m.lat]);
    if (d < nameKm && (want.has(normName(m.name_ko)) || want.has(normName(m.name_en)))) { byName = placeId; nameKm = d; }
    if (d < nearKm) { near = placeId; nearKm = d; }
  }
  return byName ?? near;
}
