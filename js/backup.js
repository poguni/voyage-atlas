// 데이터 구조 기본값, 마이그레이션, 백업 파일 만들기·읽기·합치기(순수 함수, PRD 10.2, F9-2)
export const SCHEMA_VERSION = 1;
export const APP_ID = 'voyage-atlas';

export const emptyState = () => ({
  schemaVersion: SCHEMA_VERSION, places: {}, trips: [], wishlist: [], aiHistory: [], costLog: [], achievements: {},
});

// 특별자치도 전환 전 코드(강원 42, 전북 45)로 저장된 옛 데이터를 새 코드로 바꿉니다(PRD 8.4).
const OLD_SIDO = { '42': '51', '45': '52' };
const renameSido = id => {
  const m = /^kr-sido:(\d+)$/.exec(id);
  return m && OLD_SIDO[m[1]] ? `kr-sido:${OLD_SIDO[m[1]]}` : id;
};

export function migrate(raw) {
  const s = { ...emptyState(), ...(raw ?? {}) };
  s.places = Object.fromEntries(Object.entries(s.places ?? {}).map(([id, p]) => [renameSido(id), p]));
  s.wishlist = (s.wishlist ?? []).map(w => ({ ...w, placeId: renameSido(w.placeId) }));
  s.trips = (s.trips ?? []).map(t => ({ ...t, stops: (t.stops ?? []).map(st => ({ ...st, placeId: renameSido(st.placeId) })) }));
  s.schemaVersion = SCHEMA_VERSION;
  return s;
}

export function toBackup(state, now = new Date()) {
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), data: state };
}

// 백업 파일 글자 → 상태. 형식이 맞지 않으면 오류
export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('JSON 형식이 아니에요.'); }
  if (obj?.app !== APP_ID || typeof obj.data !== 'object') throw new Error('나의 여정 지도 백업 파일이 아니에요.');
  if (obj.schemaVersion > SCHEMA_VERSION) throw new Error('더 새로운 버전의 앱에서 만든 백업이에요. 앱을 새로 고친 뒤 다시 시도해 주세요.');
  return migrate(obj.data);
}

const newer = (a, b) => ((b?.updatedAt ?? '') > (a?.updatedAt ?? '') ? b : a);
const unionBy = (a, b, key) => {
  const m = new Map(a.map(x => [key(x), x]));
  for (const x of b) m.set(key(x), m.has(key(x)) ? newer(m.get(key(x)), x) : x);
  return [...m.values()];
};

// 합치기: 장소는 둘 중 최근에 바뀐 것, 여행·위시·기록은 ID 기준 합집합
export function mergeStates(cur, inc) {
  const places = { ...cur.places };
  for (const [id, p] of Object.entries(inc.places)) places[id] = places[id] ? newer(places[id], p) : p;
  return {
    ...cur,
    places,
    trips: unionBy(cur.trips, inc.trips, t => t.id),
    wishlist: unionBy(cur.wishlist, inc.wishlist, w => w.placeId),
    aiHistory: unionBy(cur.aiHistory, inc.aiHistory, x => x.id),
    costLog: unionBy(cur.costLog, inc.costLog, x => x.id),
    achievements: { ...inc.achievements, ...cur.achievements },
  };
}
