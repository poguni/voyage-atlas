// 장소 정보 찾기: 장소 ID → 이름·국기·설명. 지도 데이터는 main.js가 시작할 때 한 번 등록합니다.
import { CONT } from './data.js';
import { isCountry, isSido, KOREA } from './stats.js';

const reg = { countries: new Map(), sido: new Map() };

export function registerPlaces({ countries, sidoFeatures }) {
  countries.forEach(c => reg.countries.set(`country:${c.id}`, c));
  sidoFeatures.forEach(f => reg.sido.set(`kr-sido:${f.properties.code}`, f.properties));
}

export const countryList = () => [...reg.countries.values()];
export const sidoList = () => [...reg.sido.entries()].map(([placeId, p]) => ({ placeId, ...p }));
export const KOREA_INFO = () => reg.countries.get(`country:${KOREA}`);

// { name, sub(대륙 또는 행정구역), iso2(국기), en, view('world'|'korea'), ll }
export function placeInfo(placeId) {
  if (isCountry(placeId)) {
    const c = reg.countries.get(placeId);
    if (!c) return { name: placeId, sub: '', iso2: '', view: 'world' };
    return { name: c.ko, en: c.en, sub: CONT[c.cont] ?? '', iso2: c.iso2, view: 'world', ll: c.ll, region: c.status === 'region' };
  }
  if (isSido(placeId)) {
    const p = reg.sido.get(placeId);
    return { name: p?.name ?? placeId, sub: p && p.official !== p.name ? p.official : '대한민국', iso2: 'KR', view: 'korea' };
  }
  return { name: placeId, sub: '', iso2: '', view: 'world' };
}
