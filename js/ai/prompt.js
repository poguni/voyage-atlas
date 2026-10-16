// AI 추천 프롬프트·출력 스키마·검증(순수 함수, PRD F7-1·F7-2, 9.3·9.4·9.6)
// 이력 요약에는 장소·통계만 넣고 메모·여행 제목·동행인 이름은 보내지 않습니다.
import {
  visitCount, countryId, tripStarted, tripDays, isDomestic, KR_SIDO, sidoId, todayStr, COMPANIONS,
} from '../stats.js';
import { CONT, CONT_ORDER } from '../data.js';

export const INTERESTS = ['사진', '음식', '자연', '휴양', '도시', '역사', '축제', '쇼핑', '액티비티'];
export const SCOPES = { world: '전 세계', asia: '아시아', korea: '국내' };
export const BUDGET_LEVELS = ['저', '중', '고'];

export const defaultConditions = (today = todayStr(), origin = 'ICN') => {
  const d = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) + 2, 1));   // 석 달 뒤
  return {
    month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    days: 7, companion: 'family', party: 2, budget: 200, origin, interests: ['사진', '음식'], onlyNew: true, scope: 'world',
  };
};

// 같은 조건인지 비교하는 키(관심사 순서는 무시)
// 웹 검색(F7-12)은 켰을 때만 덧붙여, 예전에 저장한 추천의 조건 키가 그대로 맞게 합니다.
export const condKey = c => JSON.stringify([c.month, c.days, c.companion, c.party, c.budget, c.origin, [...c.interests].sort(), c.onlyNew, c.scope, ...(c.web ? ['web'] : [])]);

const ymKo = s => `${s.slice(0, 4)}년 ${+s.slice(5, 7)}월`;

/**
 * 이력 요약(F7-2)
 * @param nameOf placeId → 한국어 이름
 */
export function historySummary(state, countries, nameOf, today = todayStr()) {
  const lines = [];
  const visited = countries.map(c => ({ c, n: visitCount(state, countryId(c.id), today) })).filter(x => x.n).sort((a, b) => b.n - a.n);
  lines.push(visited.length
    ? `방문한 나라(${visited.length}곳): ${visited.map(x => `${x.c.ko}${x.n > 1 ? `(${x.n}회)` : ''}`).join(', ')}`
    : '방문한 나라: 아직 기록 없음');
  const byCont = {};
  for (const x of visited) byCont[x.c.cont] = (byCont[x.c.cont] ?? 0) + 1;
  const cont = CONT_ORDER.filter(k => byCont[k]).map(k => `${CONT[k]} ${byCont[k]}`);
  if (cont.length) lines.push(`대륙 분포: ${cont.join(', ')}`);

  const sido = KR_SIDO.filter(code => visitCount(state, sidoId(code), today)).map(code => nameOf(sidoId(code)));
  if (sido.length) lines.push(`다녀온 국내 시도(${sido.length}/17): ${sido.join(', ')}`);

  const trips = (state.trips ?? []).filter(t => tripStarted(t, today));
  const loved = trips.filter(t => t.rating >= 4).sort((a, b) => b.rating - a.rating || (b.start ?? '').localeCompare(a.start ?? '')).slice(0, 6);
  if (loved.length) {
    lines.push(`별점 4점 이상 여행: ${loved.map(t => `${(t.stops ?? []).map(s => nameOf(s.placeId)).join('·') || '장소 미상'}(★${t.rating}${t.start ? `, ${ymKo(t.start)}` : ''})`).join('; ')}`);
  }

  const since = `${+today.slice(0, 4) - 3}${today.slice(4)}`;
  const recent = trips.filter(t => t.start && t.start >= since);
  if (recent.length) {
    const months = {}, comp = {};
    for (const t of recent) {
      months[+t.start.slice(5, 7)] = (months[+t.start.slice(5, 7)] ?? 0) + 1;
      if (t.companion) comp[t.companion] = (comp[t.companion] ?? 0) + 1;
    }
    const days = recent.map(tripDays).filter(Boolean);
    const parts = [
      `${recent.length}회`,
      `떠난 달 ${Object.entries(months).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m}월${n > 1 ? ` ${n}회` : ''}`).join(', ')}`,
      days.length && `평균 ${Math.round(days.reduce((a, b) => a + b, 0) / days.length)}일`,
      Object.keys(comp).length && `동행 ${Object.entries(comp).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${COMPANIONS[k]} ${n}`).join(', ')}`,
      `해외 ${recent.filter(t => !isDomestic(t, state.places)).length} · 국내 ${recent.filter(t => isDomestic(t, state.places)).length}`,
    ].filter(Boolean);
    lines.push(`최근 3년 여행 패턴: ${parts.join(' / ')}`);
  }

  const wishes = (state.wishlist ?? []).filter(w => !w.doneAt).map(w => w.label || nameOf(w.placeId));
  if (wishes.length) lines.push(`위시리스트(이미 가고 싶어 하는 곳): ${wishes.join(', ')}`);
  return lines.join('\n');
}

// 제외 목록: "안 가 본 나라만"이면 방문국, 그리고 사용자가 [제외]한 추천지
export function exclusions(state, countries, cond, today = todayStr()) {
  const out = (state.aiExcluded ?? []).map(x => x.name);
  if (cond.onlyNew && cond.scope !== 'korea') {
    out.push(...countries.filter(c => visitCount(state, countryId(c.id), today)).map(c => `${c.ko}(나라 전체)`));
  }
  return out;
}

const SYSTEM = `당신은 한국인 여행자의 여행 기록을 깊이 이해하는 여행지 추천 전문가입니다.
- 반드시 주어진 JSON 스키마에 맞는 JSON만 출력합니다.
- 추천은 정확히 5곳, 서로 다른 곳이어야 합니다. 도시나 지역(예: 국립공원, 섬) 단위로 추천합니다.
- name_ko는 한국에서 흔히 쓰는 표기, name_en은 영어 이름, country_iso2는 ISO 3166-1 alpha-2 대문자 코드입니다.
- lat/lon은 그 장소 중심의 실제 좌표(소수 둘째 자리 이상)입니다.
- reason은 한국어 1~2문장이며, 가능하면 사용자의 이력(좋아한 여행지·패턴)과 연결해 설명합니다. linked_history에는 연결한 이력 장소 이름을 넣습니다(없으면 빈 배열).
- best_months는 1~12 숫자, flight_hours_from_origin은 출발 공항에서 가는 대략적인 시간(직항이 없으면 경유 포함), budget_level은 '저'·'중'·'고' 중 하나입니다.
- photo_spots는 사진 찍기 좋은 곳 1~3개, tags는 관심사 단어, confidence는 high/medium/low입니다.
- 안전·입국 규정은 다루지 않습니다.`;

export function buildMessages(cond, { summary, excluded = [], originName = '인천' }) {
  const scope = cond.scope === 'korea' ? '대한민국 안(국내 여행). country_iso2는 모두 KR, flight_hours_from_origin은 이동 시간'
    : cond.scope === 'asia' ? '아시아 지역' : '전 세계';
  const user = `## 추천 조건
- 여행 시기: ${ymKo(cond.month)}
- 기간: ${cond.days}일
- 동행: ${COMPANIONS[cond.companion] ?? cond.companion}, ${cond.party}명
- 1인 예산: 약 ${cond.budget}만 원(항공 포함)
- 출발: ${originName}(${cond.origin})
- 관심사: ${cond.interests.length ? cond.interests.join(', ') : '특별히 없음'}
- 지역 범위: ${scope}
${cond.onlyNew && cond.scope !== 'korea' ? '- 아직 가 본 적 없는 나라만 추천\n' : ''}${cond.web ? '- 웹 검색으로 최신 정보(새로 생긴 직항, 그 시기의 축제·행사)를 확인해 추천 이유에 반영\n' : ''}
## 나의 여행 이력
${summary}
${excluded.length ? `\n## 추천하지 말 곳\n${excluded.join(', ')}\n` : ''}
위 조건과 이력에 맞는 여행지 5곳을 추천해 주세요.`;
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }];
}

// 구조화 출력 스키마(PRD 9.4). strict 모드는 모든 속성을 required로 두어야 합니다.
const str = { type: 'string' };
const strArr = { type: 'array', items: str };
export const SCHEMA = {
  name: 'recommendations',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['recommendations'],
    properties: {
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name_ko', 'name_en', 'country_iso2', 'type', 'lat', 'lon', 'reason', 'linked_history', 'best_months', 'flight_hours_from_origin', 'budget_level', 'photo_spots', 'tags', 'confidence'],
          properties: {
            name_ko: str, name_en: str, country_iso2: str,
            type: { type: 'string', enum: ['city', 'region'] },
            lat: { type: 'number' }, lon: { type: 'number' },
            reason: str, linked_history: strArr,
            best_months: { type: 'array', items: { type: 'integer' } },
            flight_hours_from_origin: { type: 'number' },
            budget_level: { type: 'string', enum: BUDGET_LEVELS },
            photo_spots: strArr, tags: strArr,
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
        },
      },
    },
  },
};

// 응답 글자 → 객체(```json 울타리가 붙어 와도 처리)
export function parseContent(text) {
  const t = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(t);
}

const isStr = v => typeof v === 'string' && v.trim() !== '';
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const strList = v => (Array.isArray(v) ? v.filter(isStr).map(s => s.trim()) : []);

/**
 * 스키마 검증(9.6): 잘못된 항목은 빼고, 남은 항목이 없으면 errors로 이유를 돌려줍니다.
 * @returns { recs, errors }
 */
export function validateResult(obj) {
  const list = obj?.recommendations;
  if (!Array.isArray(list)) return { recs: [], errors: ['recommendations 배열이 없습니다.'] };
  const recs = [], errors = [];
  list.forEach((r, i) => {
    const bad = [];
    if (!isStr(r?.name_ko) && !isStr(r?.name_en)) bad.push('이름');
    if (!/^[A-Za-z]{2}$/.test(r?.country_iso2 ?? '')) bad.push('country_iso2');
    if (!isNum(r?.lat) || Math.abs(r.lat) > 90) bad.push('lat');
    if (!isNum(r?.lon) || Math.abs(r.lon) > 180) bad.push('lon');
    if (!isStr(r?.reason)) bad.push('reason');
    if (bad.length) { errors.push(`${i + 1}번 항목: ${bad.join(', ')} 값이 올바르지 않습니다.`); return; }
    recs.push({
      name_ko: (r.name_ko || r.name_en).trim(), name_en: (r.name_en || r.name_ko).trim(), iso2: r.country_iso2.toUpperCase(),
      type: r.type === 'region' ? 'region' : 'city', ll: [r.lon, r.lat], reason: r.reason.trim(),
      linked: strList(r.linked_history),
      months: (Array.isArray(r.best_months) ? r.best_months : []).filter(m => Number.isInteger(m) && m >= 1 && m <= 12),
      hours: isNum(r.flight_hours_from_origin) && r.flight_hours_from_origin >= 0 ? r.flight_hours_from_origin : null,
      budget: BUDGET_LEVELS.includes(r.budget_level) ? r.budget_level : null,
      photos: strList(r.photo_spots).slice(0, 3), tags: strList(r.tags), confidence: r.confidence ?? null,
    });
  });
  return { recs, errors: recs.length ? [] : (errors.length ? errors : ['추천 항목이 비어 있습니다.']) };
}

// 토큰 수 추정: 영문 4글자 ≈ 1토큰, 한글 1글자 ≈ 1토큰(대략)
export function estimateTokens(text) {
  let n = 0;
  for (const ch of String(text)) n += ch.charCodeAt(0) < 128 ? 0.25 : 1;
  return Math.ceil(n);
}

export const costUSD = (price, inTok, outTok) => (inTok * price.in + outTok * price.out) / 1e6;
