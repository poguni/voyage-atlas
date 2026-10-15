// 장소 검색(PRD F1-6): 국가·시도를 한국어·영어·초성으로 찾아 지도 이동 후 팝오버 열기
// 접근성: combobox + listbox, 위·아래 화살표로 고르고 Enter로 이동, Esc로 닫기
import { matchIndex, normalize } from '../hangul.js';
import { flagHTML } from './flag.js';
import { esc } from '../env.js';

const $ = id => document.getElementById(id);
const MAX = 8;

// items: [{ placeId, name, sub, iso2, keys: [...], region }]
// 순위: 이름 전체 일치 → 앞부분 일치 → 중간 일치, 같으면 일치한 이름이 짧은 순(예: "ㅈㅈ" → 제주가 조지아보다 먼저)
function find(items, q) {
  const qn = normalize(q);
  const out = [];
  for (const it of items) {
    let best = null;
    for (const k of it.keys) {
      const i = matchIndex(k, q);
      if (i < 0) continue;
      const len = normalize(k).length;
      const s = [i === 0 ? (len === qn.length ? 0 : 1) : 2, len];
      if (!best || s[0] < best[0] || (s[0] === best[0] && s[1] < best[1])) best = s;
    }
    if (best) out.push({ it, s: best[0] + (it.region ? 0.5 : 0), len: best[1] });
  }
  return out.sort((a, b) => a.s - b.s || a.len - b.len || a.it.name.localeCompare(b.it.name, 'ko'))
    .slice(0, MAX).map(x => x.it);
}

/** opts: { getItems(), onSelect(item) } */
export function initSearch({ getItems, onSelect }) {
  const input = $('searchInput'), list = $('searchList');
  let results = [], active = -1;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const setActive = i => {
    active = i;
    [...list.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) { input.setAttribute('aria-activedescendant', `sr-${i}`); list.children[i]?.scrollIntoView({ block: 'nearest' }); }
  };
  const choose = i => {
    const it = results[i];
    if (!it) return;
    close();
    input.value = it.name;
    onSelect(it);
  };

  function update() {
    const q = input.value.trim();
    if (!q) { close(); return; }
    results = find(getItems(), q);
    list.innerHTML = results.length
      ? results.map((it, i) => `<li id="sr-${i}" role="option" aria-selected="false" data-i="${i}">${flagHTML(it.iso2, it.name, 20)}<span class="sr-name">${esc(it.name)}</span><span class="sr-sub">${esc(it.sub)}</span></li>`).join('')
      : '<li class="sr-empty" role="option" aria-disabled="true">찾는 곳이 없어요. 도시 검색은 다음 단계에서 추가돼요.</li>';
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(results.length ? 0 : -1);
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', () => { if (input.value.trim()) update(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); if (list.hidden) update(); else setActive((active + 1) % results.length); }
    else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); setActive((active - 1 + results.length) % results.length); }
    else if (e.key === 'Enter' && !list.hidden && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { if (!list.hidden) { e.stopPropagation(); close(); } else input.value = ''; }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  list.addEventListener('mousedown', e => e.preventDefault());   // 목록을 눌러도 입력창 포커스 유지
  list.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) choose(+li.dataset.i); });
}
