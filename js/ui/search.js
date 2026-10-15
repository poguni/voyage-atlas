// 장소 검색(PRD F1-6): 국가·시도·시군구·도시를 한국어·영어·초성으로 찾기
// attachCombobox: 입력창 + 결과 목록(combobox + listbox). 위쪽 검색창과 여행·위시 입력의 장소 고르기에서 함께 사용
// 접근성: 위·아래 화살표로 고르고 Enter로 선택, Esc로 닫기
import { matchNormalized, normalize } from '../hangul.js';
import { flagHTML } from './flag.js';
import { esc } from '../env.js';

// items: [{ placeId, name, sub, iso2, keys: [...], region?, rank? }]
// 순위: 이름 전체 일치 → 앞부분 일치 → 중간 일치, 같으면 rank(작을수록 위: 국가·시도 0, 큰 도시일수록 작음) → 일치한 이름이 짧은 순
export function findPlaces(items, q, max = 8) {
  const qn = normalize(q);
  if (!qn) return [];
  const out = [];
  for (const it of items) {
    it.nkeys ??= it.keys.filter(Boolean).map(normalize);
    let best = null;
    for (const k of it.nkeys) {
      const i = matchNormalized(k, qn);
      if (i < 0) continue;
      const s = i === 0 ? (k.length === qn.length ? 0 : 1) : 2;
      if (!best || s < best[0] || (s === best[0] && k.length < best[1])) best = [s, k.length];
    }
    if (best) out.push({ it, s: best[0] + (it.region ? 0.5 : 0), r: it.rank ?? 0, len: best[1] });
  }
  return out.sort((a, b) => a.s - b.s || a.r - b.r || a.len - b.len || a.it.name.localeCompare(b.it.name, 'ko'))
    .slice(0, max).map(x => x.it);
}

let uid = 0;

/**
 * @param input  검색 입력창
 * @param list   결과 목록 <ul>
 * @param opts   { getItems(), onSelect(item), emptyText, keepText(선택 후 글자 유지), onOpen() }
 */
export function attachCombobox(input, list, { getItems, onSelect, emptyText = '찾는 곳이 없어요.', keepText = true, onOpen }) {
  const pre = `cb${++uid}-`;
  let results = [], active = -1;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id);
  list.setAttribute('role', 'listbox');

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const setActive = i => {
    active = i;
    [...list.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) { input.setAttribute('aria-activedescendant', `${pre}${i}`); list.children[i]?.scrollIntoView({ block: 'nearest' }); }
  };
  const choose = i => {
    const it = results[i];
    if (!it) return;
    close();
    input.value = keepText ? it.name : '';
    onSelect(it);
  };

  function update() {
    const q = input.value.trim();
    if (!q) { close(); return; }
    results = findPlaces(getItems(), q);
    list.innerHTML = results.length
      ? results.map((it, i) => `<li id="${pre}${i}" role="option" aria-selected="false" data-i="${i}">${flagHTML(it.iso2, it.name, 20)}<span class="sr-name">${esc(it.name)}</span><span class="sr-sub">${esc(it.sub)}</span></li>`).join('')
      : `<li class="sr-empty" role="option" aria-disabled="true">${esc(emptyText)}</li>`;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(results.length ? 0 : -1);
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', () => { onOpen?.(); if (input.value.trim()) update(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); if (list.hidden) update(); else setActive((active + 1) % results.length); }
    else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); setActive((active - 1 + results.length) % results.length); }
    else if (e.key === 'Enter' && !list.hidden && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { if (!list.hidden) { e.stopPropagation(); close(); } else if (input.value) { e.stopPropagation(); input.value = ''; } }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  list.addEventListener('mousedown', e => e.preventDefault());   // 목록을 눌러도 입력창 포커스 유지
  list.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) choose(+li.dataset.i); });
  return { refresh: () => { if (document.activeElement === input) update(); } };
}
