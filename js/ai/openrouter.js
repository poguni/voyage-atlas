// OpenRouter 호출(PRD 9.1, F10-1·F10-2). API 키는 OpenRouter에만 보내고 백업 파일에 넣지 않습니다.
// 키 보관: "이 기기에 저장" → localStorage, "이번 세션만" → sessionStorage
const BASE = 'https://openrouter.ai/api/v1';
const KEY = 'va-or-key';

export function getKey() {
  try { return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || ''; } catch { return ''; }
}
export function keyRemembered() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}
export function setKey(key, remember) {
  try {
    localStorage.removeItem(KEY); sessionStorage.removeItem(KEY);
    if (key) (remember ? localStorage : sessionStorage).setItem(KEY, key);
  } catch { /* 사생활 보호 모드: 저장하지 못함 */ }
}

const headers = key => ({
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': location.origin + location.pathname,
  'X-Title': 'Voyage Atlas',
});

// 오류 응답을 사람이 읽을 문장으로
async function fail(res) {
  let msg = '';
  try { msg = (await res.json())?.error?.message ?? ''; } catch { /* 본문 없음 */ }
  const why = { 401: 'API 키가 올바르지 않아요', 402: '크레딧이 부족해요', 403: '이 키로는 쓸 수 없는 모델이에요', 404: '모델을 찾지 못했어요(슬러그 확인)', 408: '시간이 초과됐어요', 429: '요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요' }[res.status];
  const err = new Error(why ?? `요청에 실패했어요(${res.status})`);
  err.status = res.status;
  err.detail = msg;
  return err;
}

// 연결 테스트: 키 정보(남은 한도·사용량)
export async function testKey(key) {
  const res = await fetch(`${BASE}/key`, { headers: headers(key) });
  if (!res.ok) throw await fail(res);
  return (await res.json()).data;
}

// 모델 단가 조회(키 필요 없음): slug → { in, out } (USD / 100만 토큰)
export async function fetchPrices(slugs) {
  const res = await fetch(`${BASE}/models`);
  if (!res.ok) throw await fail(res);
  const { data } = await res.json();
  const out = {};
  for (const m of data) {
    if (!slugs.includes(m.id)) continue;
    out[m.id] = { in: +m.pricing.prompt * 1e6, out: +m.pricing.completion * 1e6, name: m.name, schema: (m.supported_parameters ?? []).includes('response_format') };
  }
  return out;
}

/**
 * 채팅 호출(구조화 출력). @returns { content, usage: { in, out, cost } }
 */
export async function chat({ key, slug, messages, schema, signal }) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(key),
    signal,
    body: JSON.stringify({ model: slug, messages, response_format: { type: 'json_schema', json_schema: schema }, temperature: 0.7 }),
  });
  if (!res.ok) throw await fail(res);
  const d = await res.json();
  if (d.error) { const e = new Error(d.error.message ?? '모델이 오류를 돌려줬어요'); e.detail = d.error.message; throw e; }
  const u = d.usage ?? {};
  return { content: d.choices?.[0]?.message?.content ?? '', usage: { in: u.prompt_tokens ?? 0, out: u.completion_tokens ?? 0, cost: u.cost ?? null } };
}
