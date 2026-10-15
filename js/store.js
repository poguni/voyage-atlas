// 상태 저장소: 구독 방식 + IndexedDB 자동 저장(idb-keyval, PRD 10.1)
// 바꾸는 함수는 모두 '되돌리기 함수'를 돌려줍니다(실행 취소 토스트용, F2-7).
import { get, set } from 'idb-keyval';
import { emptyState, migrate, mergeStates } from './backup.js';

const KEY = 'state';
let state = emptyState();
const subs = new Set();
let saveTimer = null;

export const getState = () => state;

// fn(state, meta): meta.reason = 'place' | 'wish' | 'restore' | 'reset' ...
export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function commit(next, meta = {}) {
  state = next;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 150);
  subs.forEach(fn => fn(state, meta));
}

async function save() {
  saveTimer = null;
  try { await set(KEY, state); }
  catch (err) { console.error('저장 실패', err); }
}

// 탭을 닫거나 숨길 때 남은 저장을 바로 처리
addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); save(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) { clearTimeout(saveTimer); save(); } });

export async function loadState() {
  try {
    const saved = await get(KEY);
    if (saved) state = migrate(saved);
  } catch (err) {
    console.error('저장된 기록을 불러오지 못했어요.', err);
  }
  return state;
}

const now = () => new Date().toISOString();

function putPlace(placeId, entry, meta) {
  const places = { ...state.places };
  if (entry) places[placeId] = entry; else delete places[placeId];
  commit({ ...state, places }, { reason: 'place', placeId, ...meta });
}

// 장소 상태 바꾸기: status = 'visited' | 'transit' | null(표시 지우기)
export function setPlaceStatus(placeId, status, { quick = false } = {}) {
  const prev = state.places[placeId];
  let next = null;
  if (status) next = { ...prev, status, quickMarked: quick, updatedAt: now() };
  else if (prev) {
    // 상태만 지우고 메모 등 다른 정보는 남깁니다.
    const { status: _s, quickMarked: _q, updatedAt: _u, ...rest } = prev;
    next = Object.keys(rest).length ? { ...rest, updatedAt: now() } : null;
  }
  putPlace(placeId, next, { status });
  return () => putPlace(placeId, prev, { status: prev?.status ?? null, undo: true });
}

// 여러 장소를 한 번에(목록으로 색칠)
export function setManyStatus(placeIds, status) {
  const prev = state.places;
  const places = { ...prev };
  for (const id of placeIds) {
    if (status) places[id] = { ...places[id], status, quickMarked: true, updatedAt: now() };
    else delete places[id];
  }
  commit({ ...state, places }, { reason: 'place' });
  return () => commit({ ...state, places: prev }, { reason: 'place', undo: true });
}

// 위시리스트 담기·빼기. 자세한 항목(목표 시기 등)은 Phase 2 위시 화면에서 채웁니다.
export function toggleWish(placeId) {
  const prev = state.wishlist;
  const has = prev.some(w => w.placeId === placeId && !w.doneAt);
  const wishlist = has
    ? prev.filter(w => w.placeId !== placeId)
    : [...prev, { id: `w_${Date.now().toString(36)}`, placeId, priority: 'someday', source: 'manual', createdAt: now(), updatedAt: now() }];
  commit({ ...state, wishlist }, { reason: 'wish', placeId });
  return { added: !has, undo: () => commit({ ...state, wishlist: prev }, { reason: 'wish', placeId, undo: true }) };
}

// 백업 복원: mode = 'overwrite' | 'merge'
export function restoreState(incoming, mode) {
  const prev = state;
  commit(mode === 'merge' ? mergeStates(state, incoming) : incoming, { reason: 'restore' });
  return () => commit(prev, { reason: 'restore', undo: true });
}

export function resetState() {
  commit(emptyState(), { reason: 'reset' });
}
