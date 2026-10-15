// 방문·통계 계산 순수 함수(DOM·D3 없이 Node 테스트 가능, PRD 10.3절)
// state: { places: { [placeId]: { status } }, trips: [...], wishlist: [...] }
// 장소 ID: country:<ISO 숫자 또는 x-ID>, kr-sido:<17칸 코드>, (Phase 2) city:<GeoNames ID>

export const KOREA = '410';
export const KR_SIDO = ['11', '26', '27', '28', '29', '30', '31', '36', '41', '43', '44', '46', '47', '48', '50', '51', '52'];
export const GOALS = [5, 10, 20, 30, 50, 100];          // HUD 다음 목표(DESIGN.md 8장 01)
export const COUNTRY_TOTAL = 195;                        // UN 193 + 옵서버 2
const CONTS = ['AS', 'EU', 'AF', 'NA', 'SA', 'OC'];

export const countryId = id => `country:${id}`;
export const sidoId = code => `kr-sido:${code}`;
export const isCountry = placeId => placeId.startsWith('country:');
export const isSido = placeId => placeId.startsWith('kr-sido:');

// 장소가 속한 국가 ID(ISO 숫자)
export function countryOf(placeId, places = {}) {
  if (isCountry(placeId)) return placeId.slice(8);
  if (placeId.startsWith('kr-')) return KOREA;
  return places[placeId]?.countryId ?? null;
}

// 장소가 속한 한국 시도 코드
export function sidoOf(placeId, places = {}) {
  if (isSido(placeId)) return placeId.slice(8);
  return places[placeId]?.sido ?? null;
}

// 여행이 이 장소를 포함하는지: 경유지가 그 장소이거나, 그 국가·시도 안의 장소이면 포함
export function tripIncludes(trip, placeId, places = {}) {
  return (trip.stops ?? []).some(s => {
    if (s.placeId === placeId) return true;
    if (isCountry(placeId)) return countryOf(s.placeId, places) === placeId.slice(8);
    if (isSido(placeId)) return sidoOf(s.placeId, places) === placeId.slice(8);
    return false;
  });
}

// 방문 횟수 = 이 장소가 들어간 여행 수. 여행이 없으면 '방문함' 단순 표시(또는 그 안의 방문 장소)는 1회.
// 여행 기록이 생기면 단순 표시는 그 기록에 흡수됩니다(PRD v0.3).
export function visitCount(state, placeId) {
  const places = state.places ?? {};
  const trips = (state.trips ?? []).filter(t => tripIncludes(t, placeId, places)).length;
  if (trips > 0) return trips;
  if (places[placeId]?.status === 'visited') return 1;
  // 국가 안의 시도·도시를 방문했으면 국가도 방문(F2-8). 대한민국도 방문 국가로 셉니다.
  if (isCountry(placeId)) {
    const c = placeId.slice(8);
    const inside = Object.entries(places).some(([id, p]) => id !== placeId && p.status === 'visited' && countryOf(id, places) === c);
    if (inside) return 1;
  }
  return 0;
}

export const isWished = (state, placeId) => (state.wishlist ?? []).some(w => w.placeId === placeId && !w.doneAt);

// 지도 표시 상태: visited | transit | none
export function placeStatus(state, placeId) {
  if (visitCount(state, placeId) > 0) return 'visited';
  if (state.places?.[placeId]?.status === 'transit') return 'transit';
  return 'none';
}

// 방문 횟수 → 오로라 단계 클래스(DESIGN.md 7.2)
export const levelClass = n => (n >= 4 ? 'lv4' : `lv${n}`);

// 국가 통계: countries는 data/countries.ko.json 배열
export function countryStats(state, countries, { includeTransit = false } = {}) {
  const counted = c => {
    const st = placeStatus(state, countryId(c.id));
    return st === 'visited' || (includeTransit && st === 'transit');
  };
  const byCont = Object.fromEntries(CONTS.map(k => [k, { visited: 0, total: 0 }]));
  let visited = 0, regions = 0;
  for (const c of countries) {
    const hit = counted(c);
    if (c.status === 'region') { if (hit) regions++; continue; }
    byCont[c.cont].total++;
    if (hit) { visited++; byCont[c.cont].visited++; }
  }
  return { visited, total: COUNTRY_TOTAL, pct: visited / COUNTRY_TOTAL * 100, regions, byCont };
}

// 한국 시도 통계(17칸)
export function koreaStats(state) {
  const ranking = KR_SIDO
    .map(code => ({ code, count: visitCount(state, sidoId(code)) }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  return { visited: ranking.length, total: KR_SIDO.length, ranking };
}

export const nextGoal = n => GOALS.find(g => g > n) ?? null;
