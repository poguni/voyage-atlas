// CSV 내보내기·가져오기(순수 함수, PRD F9-4, F9-5)
// 내보내기: 여행 목록, 방문 목록. 엑셀에서 한글이 깨지지 않게 BOM을 붙여 저장합니다(screens 쪽).
// 가져오기: 나라·시도 이름 목록(쉼표·줄바꿈·탭 구분, 또는 머리줄이 있는 CSV)을 장소 ID로 바꿉니다.
import { visitCount, placeStatus, placeVisits, tripDays, tripStarted, countryOf, isCountry, isSido, COMPANIONS, todayStr } from './stats.js';
import { normName } from './ai/merge.js';

// ---------- CSV 글자 ----------
const cell = v => {
  const s = String(v ?? '');
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCSV = rows => rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

// 따옴표·줄바꿈을 지원하는 CSV 읽기. 탭이 있으면 탭으로 나눕니다(엑셀에서 복사해 붙여 넣은 경우).
export function parseCSV(text) {
  const src = String(text ?? '').replace(/^\u{feff}/u, '');
  const sep = src.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"' && cur === '') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
}

// ---------- 내보내기 ----------
const KIND = { country: '나라', region: '지역', sido: '시도', city: '도시', sigungu: '시군구' };

/**
 * 여행 목록: 시작일 순(날짜 없는 여행은 맨 뒤)
 * @param infoOf placeId → { name }
 */
export function tripsCSV(state, infoOf, today = todayStr()) {
  const trips = [...state.trips].sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999'));
  const rows = trips.map(t => {
    const stops = (t.stops ?? []).map(s => s.placeId);
    const countries = [...new Set(stops.map(id => countryOf(id, state.places)).filter(Boolean))].map(c => infoOf(`country:${c}`)?.name ?? c);
    return [
      t.start ?? '', t.end ?? '', tripDays(t) ?? '', tripStarted(t, today) ? '다녀옴' : '예정', t.title ?? '',
      stops.map(id => infoOf(id)?.name ?? id).join(' → '), countries.join(', '),
      COMPANIONS[t.companion] ?? '', t.rating || '', t.note ?? '',
    ];
  });
  return toCSV([['시작', '끝', '일수', '상태', '제목', '경로', '나라', '동행', '별점', '메모'], ...rows]);
}

/**
 * 방문 목록: 방문·경유한 나라 → 시도 → 도시·시군구
 * @param countries 국가 사전 [{ id }], @param sidoCodes 시도 코드 17개
 * @param infoOf    placeId → { name, sub, kind, region }
 */
export function placesCSV(state, { countries, sidoCodes, infoOf, today = todayStr() }) {
  const others = new Set(Object.keys(state.places));
  for (const t of state.trips) for (const s of t.stops ?? []) others.add(s.placeId);
  const ids = [
    ...countries.map(c => `country:${c.id}`),
    ...sidoCodes.map(c => `kr-sido:${c}`),
    ...[...others].filter(id => !isCountry(id) && !isSido(id)),
  ].filter(id => placeStatus(state, id) !== 'none');
  const unique = [...new Set(ids)];
  const rows = unique.map(id => {
    const info = infoOf(id) ?? { name: id };
    const st = placeStatus(state, id);
    const v = placeVisits(state, id, today);
    const country = isCountry(id) ? '' : (infoOf(`country:${countryOf(id, state.places)}`)?.name ?? '');
    const kind = info.kind === 'country' && info.region ? 'region' : info.kind;
    return [KIND[kind] ?? '', info.name, country, st === 'visited' ? '방문' : '경유', st === 'visited' ? visitCount(state, id, today) : '', v.first ?? '', v.last ?? '', state.places[id]?.note ?? ''];
  });
  return toCSV([['종류', '장소', '나라', '상태', '방문 횟수', '첫 방문', '마지막 방문', '메모'], ...rows]);
}

// ---------- 가져오기(이름 목록 → 장소) ----------
// 자주 쓰는 다른 이름(정규화한 글자 → ISO 코드)
const ALIAS = {
  usa: 'US', us: 'US', america: 'US', unitedstatesofamerica: 'US', 미합중국: 'US',
  uk: 'GB', britain: 'GB', greatbritain: 'GB', england: 'GB', 잉글랜드: 'GB', 스코틀랜드: 'GB', 영국잉글랜드: 'GB',
  korea: 'KR', southkorea: 'KR', republicofkorea: 'KR', 한국: 'KR', 남한: 'KR', northkorea: 'KP',
  czechrepublic: 'CZ', turkey: 'TR', 터키: 'TR', vietnam: 'VN', 베트남: 'VN', uae: 'AE', 두바이: 'AE',
  holland: 'NL', 홀란드: 'NL', russianfederation: 'RU', burma: 'MM', 버마: 'MM', 마카오: 'MO',
  ivorycoast: 'CI', capeverde: 'CV', swaziland: 'SZ', macedonia: 'MK', 마케도니아: 'MK', vatican: 'VA',
  중화인민공화국: 'CN', 중국본토: 'CN', 타이완: 'TW', 호주: 'AU', 오스트레일리아: 'AU', 뉴질랜드: 'NZ',
};
const HEADERS = ['나라', '국가', '장소', '이름', 'country', 'name', 'place'];
const HEADER_KEYS = new Set(HEADERS.map(normName));

// 이름 목록 글자에서 후보 이름을 뽑습니다. 머리줄에 '나라'·'장소' 같은 열이 있으면 그 열만 씁니다.
export function namesFromText(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const col = rows[0].findIndex(c => HEADER_KEYS.has(normName(c)));
  if (col >= 0) return rows.slice(1).map(r => r[col]).filter(Boolean);
  return rows.flat().flatMap(c => c.split(/[,;、]/)).map(s => s.trim()).filter(Boolean);
}

/**
 * @param countries 국가 사전 [{ id, iso2, iso3, ko, en }]
 * @param sido      [{ code, name, official, short }]
 * @returns { found: [{ placeId, input }], missing: [이름] } (같은 곳·같은 이름은 한 번만)
 */
export function matchPlaces(text, countries, sido) {
  const keys = new Map();
  const add = (k, id) => { const n = normName(k); if (n && !keys.has(n)) keys.set(n, id); };
  for (const c of countries) [c.ko, c.en].forEach(k => add(k, `country:${c.id}`));
  for (const p of sido) [p.name, p.official, p.short].forEach(k => add(k, `kr-sido:${p.code}`));
  const byIso = new Map(countries.flatMap(c => [[c.iso2, c.id], [c.iso3, c.id]]));
  const found = new Map(), missing = new Set();
  for (const input of namesFromText(text)) {
    const n = normName(input.replace(/\(.*?\)|（.*?）/g, ''));
    const up = input.trim().toUpperCase();
    const iso = ALIAS[n] ?? (/^[A-Z]{2,3}$/.test(up) ? up : null);
    const id = keys.get(n) ?? (iso && byIso.has(iso) ? `country:${byIso.get(iso)}` : null);
    if (id) { if (!found.has(id)) found.set(id, { placeId: id, input }); }
    else if (!HEADER_KEYS.has(n)) missing.add(input);
  }
  return { found: [...found.values()], missing: [...missing] };
}
