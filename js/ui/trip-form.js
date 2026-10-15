// 여행 추가·편집 패널(DESIGN.md 9장, PRD F2-4, F3-1)
// 제목 → 기간(날짜 / 연·월만 / 날짜 모름) → 동행·인원 → 방문 장소(검색 + 순서 바꾸기) → 별점 → 대표 색 → 메모
import { saveTrip, deleteTrip, getState } from '../store.js';
import { COMPANIONS, tripDays } from '../stats.js';
import { placeInfo, placeMeta, allSearchItems, loadCityItems } from '../places.js';
import { TRIP_COLORS, colorVar } from '../format.js';
import { attachCombobox } from './search.js';
import { flagHTML } from './flag.js';
import { openPanel, closePanel } from './panel.js';
import { toast } from './toast.js';
import { esc } from '../env.js';

const $ = id => document.getElementById(id);
let editing = null;      // 편집 중인 여행(새 여행이면 null)
let stops = [];          // placeId 배열(순서대로)
let precision = 'day', companion = '', rating = 0, color = 'v1';
let onSavedCb = null;
let dragFrom = -1;

const pressed = (groupId, attr, value) =>
  $(groupId).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(value))));

function renderDates() {
  pressed('tfPrecision', 'p', precision);
  const type = precision === 'month' ? 'month' : 'date';
  for (const id of ['tfStart', 'tfEnd']) {
    const el = $(id);
    if (el.type !== type) { const v = el.value; el.type = type; el.value = type === 'month' ? v.slice(0, 7) : (v.length === 7 ? `${v}-01` : v); }
  }
  $('tfDates').hidden = precision === 'unknown';
  const t = { start: $('tfStart').value, end: $('tfEnd').value || $('tfStart').value, datePrecision: precision };
  const d = tripDays(t);
  $('tfDays').textContent = precision === 'unknown' ? '날짜를 몰라도 괜찮아요. 통계에서는 "날짜 미상"으로 따로 셉니다.'
    : precision === 'month' ? '연·월만 입력한 여행은 여행 일수 합계에 넣지 않고 따로 셉니다.'
      : d > 0 ? `${d}일` : '';
}

function renderStops() {
  $('tfStops').innerHTML = stops.map((id, i) => {
    const p = placeInfo(id);
    return `<li draggable="true" data-i="${i}">
      <span class="stop-handle" aria-hidden="true">⋮⋮</span><span class="stop-no mono">${i + 1}</span>${flagHTML(p.iso2, p.name, 20)}
      <span class="stop-name">${esc(p.name)}<small>${esc(p.sub)}</small></span>
      <button type="button" class="mini-btn" data-act="up" aria-label="${esc(p.name)} 앞으로" ${i === 0 ? 'disabled' : ''}>▲</button>
      <button type="button" class="mini-btn" data-act="down" aria-label="${esc(p.name)} 뒤로" ${i === stops.length - 1 ? 'disabled' : ''}>▼</button>
      <button type="button" class="mini-btn" data-act="del" aria-label="${esc(p.name)} 빼기">✕</button></li>`;
  }).join('') || '<li class="stops-empty">위에서 다녀온 나라·시도·도시를 찾아 추가하세요.</li>';
}

function move(from, to) {
  if (to < 0 || to >= stops.length || from === to) return;
  const [x] = stops.splice(from, 1);
  stops.splice(to, 0, x);
  renderStops();
}

function renderChoices() {
  pressed('tfCompanion', 'c', companion);
  $('tfRating').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.r <= rating)));
  pressed('tfColor', 'color', color);
}

/**
 * @param opts { trip?: 편집할 여행, placeIds?: 미리 넣을 장소, title?: 미리 넣을 제목, onSaved?(trip) }
 */
export function openTripForm({ trip = null, placeIds = [], title = '', onSaved = null } = {}) {
  editing = trip;
  onSavedCb = onSaved;
  stops = trip ? trip.stops.map(s => s.placeId) : [...placeIds];
  precision = trip?.datePrecision ?? 'day';
  companion = trip?.companion ?? '';
  rating = trip?.rating ?? 0;
  color = trip?.color ?? TRIP_COLORS[getState().trips.length % 4];
  $('tripFormTitle').textContent = trip ? '여행 편집' : '여행 추가';
  $('tfTitle').value = trip?.title ?? title;
  $('tfStart').value = trip?.start ?? '';
  $('tfEnd').value = trip?.end ?? '';
  $('tfParty').value = trip?.partySize ?? 1;
  $('tfNote').value = trip?.note ?? '';
  $('tfError').textContent = '';
  $('tfDelete').hidden = !trip;
  $('tfPlaceInput').value = '';
  renderDates(); renderStops(); renderChoices();
  openPanel('tripPanel');
  loadCityItems();   // 도시 검색 준비
}

function validate() {
  const start = $('tfStart').value, end = $('tfEnd').value || start;
  if (!stops.length) return '방문 장소를 한 곳 이상 넣어 주세요.';
  if (precision !== 'unknown' && !start) return precision === 'month' ? '시작 연·월을 넣어 주세요.' : "시작일을 넣거나 '날짜 모름'을 골라 주세요.";
  if (precision !== 'unknown' && end < start) return '끝나는 날이 시작일보다 빠를 수 없어요.';
  return '';
}

function autoTitle(start) {
  const names = stops.map(id => placeInfo(id).name);
  const year = start ? start.slice(0, 4) : '';
  return `${year} ${names.slice(0, 2).join('·')}${names.length > 2 ? ' 외' : ''}`.trim();
}

function save(e) {
  e.preventDefault();
  const err = validate();
  $('tfError').textContent = err;
  if (err) return;
  const start = precision === 'unknown' ? null : $('tfStart').value;
  const end = precision === 'unknown' ? null : ($('tfEnd').value || start);
  const trip = {
    ...editing,
    title: $('tfTitle').value.trim() || autoTitle(start),
    start, end, datePrecision: precision,
    companion: companion || null,
    partySize: Math.max(1, Math.min(99, +$('tfParty').value || 1)),
    rating, color,
    stops: stops.map((placeId, i) => ({ placeId, order: i + 1 })),
    note: $('tfNote').value.trim(),
  };
  const metas = Object.fromEntries(stops.map(id => [id, placeMeta(id)]).filter(([, m]) => m));
  const { trip: saved, undo } = saveTrip(trip, metas);
  closePanel();
  toast(`✦ <b>${esc(saved.title)}</b> 여정을 ${editing ? '고쳤어요' : '기록했어요'}`, { label: '실행 취소', fn: undo });
  onSavedCb?.(saved);
}

export function initTripForm({ onDeleted } = {}) {
  $('tfPrecision').addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b) { precision = b.dataset.p; renderDates(); } });
  $('tfStart').addEventListener('change', () => { if (!$('tfEnd').value || $('tfEnd').value < $('tfStart').value) $('tfEnd').value = $('tfStart').value; renderDates(); });
  $('tfEnd').addEventListener('change', renderDates);

  $('tfCompanion').innerHTML = Object.entries(COMPANIONS).map(([k, v]) => `<button type="button" data-c="${k}" aria-pressed="false">${v}</button>`).join('');
  $('tfCompanion').addEventListener('click', e => { const b = e.target.closest('button[data-c]'); if (b) { companion = companion === b.dataset.c ? '' : b.dataset.c; renderChoices(); } });

  $('tfRating').innerHTML = [1, 2, 3, 4, 5].map(r => `<button type="button" data-r="${r}" aria-label="별점 ${r}점" aria-pressed="false">★</button>`).join('');
  $('tfRating').addEventListener('click', e => { const b = e.target.closest('button[data-r]'); if (b) { rating = rating === +b.dataset.r ? 0 : +b.dataset.r; renderChoices(); } });

  const COLOR_NAMES = { v1: '청록', v2: '파랑', v3: '보라', v4: '분홍', gold: '금색' };
  $('tfColor').innerHTML = TRIP_COLORS.map(c => `<button type="button" data-color="${c}" aria-label="대표 색 ${COLOR_NAMES[c]}" aria-pressed="false" style="--c:${colorVar(c)}"></button>`).join('');
  $('tfColor').addEventListener('click', e => { const b = e.target.closest('button[data-color]'); if (b) { color = b.dataset.color; renderChoices(); } });

  attachCombobox($('tfPlaceInput'), $('tfPlaceList'), {
    getItems: allSearchItems,
    keepText: false,
    emptyText: '찾는 곳이 없어요. 다른 이름이나 영어로 찾아보세요.',
    onOpen: () => loadCityItems(),
    onSelect: it => { if (!stops.includes(it.placeId)) { stops.push(it.placeId); renderStops(); } },
  });

  // 순서 바꾸기: 버튼(키보드) + 끌어서 놓기
  $('tfStops').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const i = +b.closest('li').dataset.i;
    if (b.dataset.act === 'up') move(i, i - 1);
    else if (b.dataset.act === 'down') move(i, i + 1);
    else { stops.splice(i, 1); renderStops(); }
  });
  $('tfStops').addEventListener('dragstart', e => { dragFrom = +e.target.closest('li')?.dataset.i; e.dataTransfer.effectAllowed = 'move'; });
  $('tfStops').addEventListener('dragover', e => { if (dragFrom >= 0) e.preventDefault(); });
  $('tfStops').addEventListener('drop', e => { e.preventDefault(); const li = e.target.closest('li[data-i]'); if (li && dragFrom >= 0) move(dragFrom, +li.dataset.i); dragFrom = -1; });

  $('tripForm').addEventListener('submit', save);
  $('tfDelete').addEventListener('click', () => {
    if (!editing) return;
    const undo = deleteTrip(editing.id);
    closePanel();
    toast(`<b>${esc(editing.title)}</b> 여정을 지웠어요`, { label: '실행 취소', fn: undo });
    onDeleted?.(editing.id);
  });
}

