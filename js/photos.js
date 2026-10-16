// 장소별 대표 사진 1장(PRD F2-10): 긴 변 640px JPEG로 줄여 기기 안(IndexedDB, 기록과 다른 저장소)에만 둡니다.
// 기록(state)과 따로 두어 화면 갱신·자동 저장이 가볍고, JSON 백업에는 고를 때만 함께 넣습니다.
import { get, set, del, keys, clear, createStore } from 'idb-keyval';
import { fitSize, THUMB_QUALITY } from './thumb.js';

const store = createStore('voyage-atlas-photos', 'thumbs');
const urls = new Map();   // placeId → object URL(화면 표시용, 한 번만 만듦)
const changed = () => document.dispatchEvent(new Event('va-photos'));

/** 사진 주소(없으면 null) */
export async function photoURL(placeId) {
  if (urls.has(placeId)) return urls.get(placeId);
  let blob = null;
  try { blob = await get(placeId, store); } catch { /* 사생활 보호 모드 등 */ }
  const url = blob ? URL.createObjectURL(blob) : null;
  urls.set(placeId, url);
  return url;
}

function forget(placeId) {
  const u = urls.get(placeId);
  if (u) URL.revokeObjectURL(u);
  urls.delete(placeId);
}

// 파일 → 썸네일 Blob(휴대폰 사진의 회전 정보 반영)
async function shrink(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const [w, h] = fitSize(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0B1026';   // 투명한 PNG는 JPEG에서 검게 되므로 밤하늘 색으로
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', THUMB_QUALITY));
  if (!blob) throw new Error('사진을 줄이지 못했어요');
  return blob;
}

/** 사진 넣기·바꾸기 → 이전 사진 Blob(실행 취소용, 없으면 null) */
export async function setPhoto(placeId, file) {
  const blob = await shrink(file);
  const prev = await get(placeId, store).catch(() => null);
  await set(placeId, blob, store);
  forget(placeId);
  changed();
  return prev ?? null;
}

/** 지우기(또는 실행 취소로 되돌리기: blob을 넘기면 그 사진으로) */
export async function putPhoto(placeId, blob) {
  if (blob) await set(placeId, blob, store); else await del(placeId, store);
  forget(placeId);
  changed();
}

export async function deletePhoto(placeId) {
  const prev = await get(placeId, store).catch(() => null);
  await putPhoto(placeId, null);
  return prev ?? null;
}

export async function photoIds() {
  try { return await keys(store); } catch { return []; }
}

export async function clearPhotos() {
  try { await clear(store); } catch { /* 무시 */ }
  [...urls.keys()].forEach(forget);
  changed();
}

const toDataURL = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
const fromDataURL = url => fetch(url).then(r => r.blob());

/** 백업용 { placeId: 'data:image/jpeg;base64,…' } */
export async function exportPhotos() {
  const out = {};
  for (const id of await photoIds()) { const b = await get(id, store); if (b) out[id] = await toDataURL(b); }
  return out;
}

/** 백업에서 되살리기: overwrite면 지금 사진을 모두 지우고, merge면 없는 것만 더함 → 넣은 수 */
export async function importPhotos(obj, mode) {
  if (!obj || typeof obj !== 'object') return 0;
  if (mode === 'overwrite') { await clear(store).catch(() => {}); [...urls.keys()].forEach(forget); }
  const have = new Set(await photoIds());
  let n = 0;
  for (const [id, url] of Object.entries(obj)) {
    if (typeof url !== 'string' || !url.startsWith('data:image/') || have.has(id)) continue;
    await set(id, await fromDataURL(url), store);
    forget(id);
    n++;
  }
  changed();
  return n;
}
