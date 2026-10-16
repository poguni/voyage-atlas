// 트립픽(TravelPick) 연동 JSON(PRD F9-6, F6-8, 순수 함수)
// - visited: 다녀온 나라·시도·도시(방문 횟수, 마지막 방문)
// - candidates: 아직 이루지 않은 위시를 트립픽 후보 입력 형식({ name, country, region, code, note })으로
// - excludeText: 트립픽 "추천 제외 조건" 칸(200자)에 그대로 붙여 넣을 문장(해외용·국내용)
import { visitCount, placeVisits, placeStatus, countryOf, sidoOf, isCountry, isSido, KOREA, todayStr } from './stats.js';
import { fmtDate, WISH_PRIORITY } from './format.js';

export const TRIPPICK_FORMAT = 1;
const EXCLUDE_MAX = 200;   // 트립픽 제외 조건 글자 수 한도

// "가 본 곳: 일본, 프랑스, … 외 3곳" (한도 안에서 앞쪽부터)
export function excludeLine(head, names, max = EXCLUDE_MAX) {
  if (!names.length) return '';
  let out = '';
  for (let i = 0; i < names.length; i++) {
    const rest = names.length - i - 1;
    const next = `${head}${names.slice(0, i + 1).join(', ')}${rest ? ` 외 ${rest}곳` : ''}`;
    if (next.length > max) break;
    out = next;
  }
  return out || `${head}${names.length}곳`;
}

/**
 * @param o { countries: 국가 사전, sidoCodes, infoOf(placeId → { name, en }), homeAirport, today, now }
 */
export function tripPickExport(state, { countries, sidoCodes, infoOf, homeAirport = 'ICN', today = todayStr(), now = new Date() }) {
  const places = state.places ?? {};
  const visitOf = id => {
    const n = visitCount(state, id, today);
    return n ? { visits: n, lastVisit: placeVisits(state, id, today).last } : null;
  };
  const byName = (a, b) => a.name_ko.localeCompare(b.name_ko, 'ko');
  const visitedCountries = countries.map(c => ({ c, v: visitOf(`country:${c.id}`) })).filter(x => x.v)
    .map(({ c, v }) => ({ iso2: c.iso2, iso3: c.iso3, name_ko: c.ko, name_en: c.en, region: c.status === 'region', ...v })).sort(byName);
  const koreaSido = sidoCodes.map(code => ({ code, v: visitOf(`kr-sido:${code}`) })).filter(x => x.v)
    .map(({ code, v }) => ({ code, name_ko: infoOf(`kr-sido:${code}`)?.name ?? code, ...v }));
  const cityIds = new Set(Object.keys(places));
  for (const t of state.trips ?? []) for (const s of t.stops ?? []) cityIds.add(s.placeId);
  const iso2Of = id => countries.find(c => c.id === id)?.iso2 ?? null;
  const cities = [...cityIds].filter(id => !isCountry(id) && !isSido(id) && placeStatus(state, id) === 'visited')
    .map(id => ({ id, name_ko: infoOf(id)?.name ?? id, name_en: infoOf(id)?.en ?? null, country_iso2: iso2Of(countryOf(id, places)), ...visitOf(id) }))
    .sort(byName);

  // 위시 → 트립픽 후보(해외: 나라, 국내: 시·도)
  const candidates = (state.wishlist ?? []).filter(w => !w.doneAt).map(w => {
    const domestic = w.placeId.startsWith('kr-') || (!isCountry(w.placeId) && countryOf(w.placeId, places) === KOREA);
    const country = countryOf(w.placeId, places);
    const sido = sidoOf(w.placeId, places);
    const note = [w.reason, w.targetMonth && `목표 ${fmtDate(w.targetMonth)}`, WISH_PRIORITY[w.priority], w.budgetKRW && `1인 예산 ${Math.round(w.budgetKRW / 10000).toLocaleString('ko-KR')}만 원`]
      .filter(Boolean).join(' · ');
    return {
      name: infoOf(w.placeId)?.name ?? w.placeId,
      tripType: domestic ? 'domestic' : 'overseas',
      country: domestic ? null : (country ? infoOf(`country:${country}`)?.name ?? null : null),
      region: domestic ? (sido ? infoOf(`kr-sido:${sido}`)?.name ?? null : null) : null,
      code: null,
      note,
      targetMonth: w.targetMonth ?? null,
    };
  });

  const abroad = visitedCountries.filter(c => c.iso2 !== 'KR').map(c => c.name_ko);
  return {
    app: 'voyage-atlas',
    kind: 'trippick',
    format: TRIPPICK_FORMAT,
    exportedAt: now.toISOString(),
    homeAirport,
    visited: { countries: visitedCountries, koreaSido, cities },
    candidates,
    excludeText: {
      overseas: excludeLine('이미 가 본 나라: ', abroad),
      domestic: excludeLine('이미 가 본 시도: ', koreaSido.map(s => s.name_ko)),
    },
  };
}
