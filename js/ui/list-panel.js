// 목록으로 색칠(접근성 대안 + 한꺼번에 입력, DESIGN.md 13장): 대륙별 국가 목록 / 한국 17칸
// 버튼을 누르면 '방문함' 단순 표시를 켜고 끕니다. 여행 기록으로 생긴 방문은 여기서 끄지 않습니다.
import { flagHTML } from './flag.js';
import { esc } from '../env.js';
import { matchIndex } from '../hangul.js';
import { CONT } from '../data.js';
import { isPanelOpen } from './panel.js';

const $ = id => document.getElementById(id);
const ORDER = ['AS', 'EU', 'AF', 'NA', 'SA', 'OC'];
let ctx = null;   // { view(), rows(view), stateOf(placeId), onToggle(placeId, on) }

/** rows(view) → [{ placeId, name, sub, iso2, group, keys }] */
export function initListPanel(c) {
  ctx = c;
  $('listFilter').addEventListener('input', render);
  $('listBody').addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (b && b.getAttribute('aria-disabled') !== 'true') ctx.onToggle(b.dataset.id, b.getAttribute('aria-pressed') !== 'true');
  });
}

function rowHTML(r) {
  const st = ctx.stateOf(r.placeId);   // { on, locked, label }
  return `<li><button type="button" class="lp-row" data-id="${esc(r.placeId)}" aria-pressed="${st.on}"${st.locked ? ' aria-disabled="true" title="여행 기록으로 방문 표시된 곳이에요"' : ''}>`
    + `${flagHTML(r.iso2, r.name, 20)}<span class="lp-name">${esc(r.name)}<small>${esc(r.sub)}</small></span>`
    + `<span class="lp-state">${esc(st.label)}</span></button></li>`;
}

export function renderListPanel() {
  if (!ctx || !isPanelOpen('listPanel')) return;
  render();
}

function render() {
  const view = ctx.view();
  const q = $('listFilter').value.trim();
  const rows = ctx.rows(view).filter(r => !q || r.keys.some(k => matchIndex(k, q) >= 0));
  $('listTitle').textContent = view === 'korea' ? '목록으로 색칠 · 대한민국' : '목록으로 색칠 · 세계';
  const groups = view === 'korea' ? [['', rows]] : [
    ...ORDER.map(c => [CONT[c], rows.filter(r => r.group === c)]),
    ['지역(국가 수에 넣지 않음)', rows.filter(r => r.group === 'region')],
  ];
  const body = $('listBody');
  const top = body.scrollTop;
  body.innerHTML = groups.filter(([, rs]) => rs.length).map(([title, rs]) => {
    const on = rs.filter(r => ctx.stateOf(r.placeId).on).length;
    const head = title ? `<h3 class="lp-group">${esc(title)} <span class="mono">${on}/${rs.length}</span></h3>` : '';
    return `${head}<ul class="lp-list">${rs.map(rowHTML).join('')}</ul>`;
  }).join('') || '<p class="dim lp-empty">찾는 곳이 없어요.</p>';
  body.scrollTop = top;
}
