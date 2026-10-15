// 위시 추가·편집 패널(PRD F6-1, F6-2): 장소 + (선택) 지도에 보일 이름 → 이유 → 우선순위 → 목표 시기 → 예산 → 함께 → 참고 링크
import { saveWish, deleteWish } from '../store.js';
import { placeInfo, placeMeta, allSearchItems, loadCityItems } from '../places.js';
import { WISH_PRIORITY } from '../format.js';
import { attachCombobox } from './search.js';
import { flagHTML } from './flag.js';
import { openPanel, closePanel } from './panel.js';
import { toast } from './toast.js';
import { esc } from '../env.js';

const $ = id => document.getElementById(id);
let editing = null, placeId = null, priority = 'someday', targetMode = 'none';

const pressed = (groupId, attr, value) =>
  $(groupId).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === value)));

function renderPlace() {
  if (!placeId) { $('wfPlace').innerHTML = '<span class="dim">위에서 장소를 찾아 고르세요.</span>'; return; }
  const p = placeInfo(placeId);
  $('wfPlace').innerHTML = `${flagHTML(p.iso2, p.name, 20)}<span class="stop-name">${esc(p.name)}<small>${esc(p.sub)}</small></span><button type="button" class="mini-btn" id="wfPlaceClear" aria-label="장소 지우기">✕</button>`;
}

function renderTarget() {
  pressed('wfTargetMode', 'mode', targetMode);
  const el = $('wfTarget');
  el.hidden = targetMode === 'none';
  const type = targetMode === 'month' ? 'month' : 'date';
  if (el.type !== type) { const v = el.value; el.type = type; el.value = type === 'month' ? v.slice(0, 7) : (v.length === 7 ? `${v}-01` : v); }
}

/** opts: { wish?: 편집할 위시, placeId?: 미리 고른 장소 } */
export function openWishForm({ wish = null, placeId: pid = null } = {}) {
  editing = wish;
  placeId = wish?.placeId ?? pid;
  priority = wish?.priority ?? 'someday';
  targetMode = !wish?.target ? 'none' : wish.target.length === 7 ? 'month' : 'date';
  $('wishFormTitle').textContent = wish ? '꿈 편집' : '꿈 추가';
  $('wfLabel').value = wish?.label ?? '';
  $('wfReason').value = wish?.reason ?? '';
  $('wfTarget').value = wish?.target ?? '';
  $('wfBudget').value = wish?.budgetKRW ? Math.round(wish.budgetKRW / 10000) : '';
  $('wfWho').value = wish?.who ?? '';
  $('wfLink').value = wish?.link ?? '';
  $('wfError').textContent = '';
  $('wfDelete').hidden = !wish;
  $('wfPlaceInput').value = '';
  pressed('wfPriority', 'p', priority);
  renderPlace(); renderTarget();
  openPanel('wishPanel');
  loadCityItems();
}

function save(e) {
  e.preventDefault();
  const link = $('wfLink').value.trim();
  const target = targetMode === 'none' ? null : $('wfTarget').value || null;
  const err = !placeId ? '가고 싶은 장소를 골라 주세요.'
    : link && !/^https?:\/\//i.test(link) ? '참고 링크는 http:// 또는 https://로 시작해야 해요.'
      : targetMode !== 'none' && !target ? '목표 시기를 넣거나 "미정"을 골라 주세요.' : '';
  $('wfError').textContent = err;
  if (err) return;
  const budget = +$('wfBudget').value;
  const item = {
    ...editing, placeId,
    label: $('wfLabel').value.trim(), reason: $('wfReason').value.trim(), priority, target,
    budgetKRW: budget > 0 ? Math.round(budget * 10000) : null, who: $('wfWho').value.trim(), link,
    source: editing?.source ?? 'manual',
  };
  const meta = placeMeta(placeId);
  const { wish, undo } = saveWish(item, meta ? { [placeId]: meta } : {});
  closePanel();
  const name = wish.label || placeInfo(placeId).name;
  toast(`☆ <b>${esc(name)}</b>, 꿈을 ${editing ? '고쳤어요' : '별로 새겼어요'}`, { label: '실행 취소', fn: undo });
}

export function initWishForm() {
  $('wfPriority').innerHTML = Object.entries(WISH_PRIORITY).reverse().map(([k, v]) => `<button type="button" data-p="${k}" aria-pressed="false">${v}</button>`).join('');
  $('wfPriority').addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b) { priority = b.dataset.p; pressed('wfPriority', 'p', priority); } });
  $('wfTargetMode').addEventListener('click', e => { const b = e.target.closest('button[data-mode]'); if (b) { targetMode = b.dataset.mode; renderTarget(); } });
  $('wfPlace').addEventListener('click', e => { if (e.target.closest('#wfPlaceClear')) { placeId = null; renderPlace(); $('wfPlaceInput').focus(); } });
  attachCombobox($('wfPlaceInput'), $('wfPlaceList'), {
    getItems: allSearchItems,
    keepText: false,
    emptyText: '찾는 곳이 없어요. 가까운 도시나 나라로 고른 뒤 "지도에 보일 이름"을 바꿔 보세요.',
    onOpen: () => loadCityItems(),
    onSelect: it => { placeId = it.placeId; renderPlace(); },
  });
  $('wishForm').addEventListener('submit', save);
  $('wfDelete').addEventListener('click', () => {
    if (!editing) return;
    const undo = deleteWish(editing.id);
    closePanel();
    toast('위시에서 지웠어요', { label: '실행 취소', fn: undo });
  });
}
