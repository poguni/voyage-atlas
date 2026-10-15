// 장소 상세 패널(DESIGN.md 9장, PRD F2-5, F2-6)
// 국기 56px + 이름 → 방문·첫/최근 방문 태그 → 작은 지도(다녀온 도시 점) → 방문 기록 목록 → 도시 칩 → 메모 → 버튼
import { getState, setPlaceStatus, setPlaceNote, deleteWish } from '../store.js';
import { visitCount, placeStatus, placeVisits, isWished, countryOf, sidoOf, isCountry, isSido, todayStr } from '../stats.js';
import { placeInfo, placeMeta } from '../places.js';
import { fmtDate, fmtTripMeta, fmtStars, colorVar } from '../format.js';
import { drawPlaceMap } from '../map/mini.js';
import { flagHTML } from './flag.js';
import { openPanel, isPanelOpen } from './panel.js';
import { toast } from './toast.js';
import { esc, josa } from '../env.js';

const $ = id => document.getElementById(id);
let current = null;    // 열린 장소 ID
let ctx = null;        // { classFor, openTripForm, openWishForm, goTrip }
let noteTimer = null;

export function initPlaceDetail(c) {
  ctx = c;
  $('placeBody').addEventListener('click', e => {
    const b = e.target.closest('[data-act], [data-trip], [data-place]');
    if (!b || !current) return;
    if (b.dataset.trip) return ctx.goTrip(b.dataset.trip);
    if (b.dataset.place) return openPlaceDetail(b.dataset.place);
    const name = placeInfo(current).name;
    switch (b.dataset.act) {
      case 'trip': return ctx.openTripForm({ placeIds: [current] });
      case 'wish': return ctx.openWishForm({ placeId: current });
      case 'unwish': {
        const w = getState().wishlist.find(x => x.placeId === current && !x.doneAt);
        if (w) { const undo = deleteWish(w.id); toast(`<b>${esc(name)}</b>${josa(name, '을', '를')} 위시리스트에서 뺐어요`, { label: '실행 취소', fn: undo }); }
        return;
      }
      case 'visit': {
        const undo = setPlaceStatus(current, 'visited', { meta: placeMeta(current) });
        return toast(`✦ <b>${esc(name)}</b>${josa(name, '을', '를')} 방문함으로 표시했어요`, { label: '실행 취소', fn: undo });
      }
      case 'clear': {
        const undo = setPlaceStatus(current, null);
        return toast(`<b>${esc(name)}</b>의 방문 표시를 지웠어요`, { label: '실행 취소', fn: undo });
      }
    }
  });
  // 메모는 입력이 멈추면 저장
  $('placeBody').addEventListener('input', e => {
    if (e.target.id !== 'placeNote') return;
    clearTimeout(noteTimer);
    const id = current, v = e.target.value;
    noteTimer = setTimeout(() => setPlaceNote(id, v.trim(), placeMeta(id)), 600);
  });
}

// 이 장소 안에서 다녀온 도시(여행 경유지 + 방문 표시한 도시)와 위시 도시
function citiesInside(s, placeId) {
  const inside = id => (isCountry(placeId) ? countryOf(id, s.places) === placeId.slice(8) : isSido(placeId) ? sidoOf(id, s.places) === placeId.slice(8) : false);
  const ids = new Set();
  for (const t of s.trips) for (const st of t.stops ?? []) if (/^(city|kr-sigungu):/.test(st.placeId) && inside(st.placeId)) ids.add(st.placeId);
  for (const [id, p] of Object.entries(s.places)) if (/^(city|kr-sigungu):/.test(id) && p.status === 'visited' && inside(id)) ids.add(id);
  const wished = s.wishlist.filter(w => !w.doneAt && /^(city|kr-sigungu):/.test(w.placeId) && inside(w.placeId)).map(w => w.placeId);
  return { visited: [...ids], wished: wished.filter(id => !ids.has(id)) };
}

export function openPlaceDetail(placeId) {
  current = placeId;
  renderPlaceDetail();
  openPanel('placePanel');
}

export function renderPlaceDetail() {
  if (!current) return;
  const s = getState(), today = todayStr();
  const p = placeInfo(current);
  const count = visitCount(s, current, today);
  const status = placeStatus(s, current);
  const v = placeVisits(s, current, today);
  const wished = isWished(s, current);
  const simple = s.places[current]?.status === 'visited' && !v.trips.length;
  const { visited: cities, wished: wishCities } = citiesInside(s, current);
  const tags = [
    count ? `<span class="tag gold">방문 ${count}회</span>` : status === 'transit' ? '<span class="tag">경유</span>' : '<span class="tag">미방문</span>',
    v.first && `<span class="tag">첫 방문 ${fmtDate(v.first.slice(0, 7))}</span>`,
    v.last && v.last !== v.first && `<span class="tag">최근 ${fmtDate(v.last.slice(0, 7))}</span>`,
    wished && '<span class="tag wish">☆ 위시</span>',
  ].filter(Boolean).join('');
  const parent = p.kind === 'city' && p.countryId ? `country:${p.countryId}` : p.kind === 'sigungu' ? `kr-sido:${p.sido}` : null;

  $('placeTitle').textContent = p.name;
  $('placeBody').innerHTML = `
    <div class="pd-head">${flagHTML(p.iso2, p.name, 56)}<div>
      <h3 class="h-display pd-name">${esc(p.name)}</h3><div class="dim pd-sub">${esc([p.en !== p.name ? p.en : '', p.sub].filter(Boolean).join(' · '))}</div></div></div>
    <div class="row pd-tags">${tags}</div>
    <div class="pd-map" id="placeMap"></div>
    ${parent ? `<p class="pd-parent">속한 곳: <button type="button" class="link-row" data-place="${esc(parent)}">${esc(placeInfo(parent).name)} →</button></p>` : ''}
    <section><h4>방문 기록</h4>${v.trips.length
      ? `<ol class="pd-trips">${v.trips.map(t => `<li><button type="button" class="trip" data-trip="${esc(t.id)}"><span class="dot" style="background:${colorVar(t.color)}"></span><span><b>${esc(t.title)}</b><small>${esc(fmtTripMeta(t, true))}${t.rating ? ` · <span class="stars">${fmtStars(t.rating)}</span>` : ''}</small></span></button></li>`).join('')}</ol>`
      : `<p class="dim pd-empty">${simple ? '방문함으로만 표시했어요. 여행을 기록하면 날짜와 횟수가 쌓여요.' : '아직 기록한 여행이 없어요.'}</p>`}</section>
    ${cities.length || wishCities.length ? `<section><h4>다녀온 도시</h4><div class="row pd-chips">${cities.map(id => `<button type="button" class="chip chip-btn" data-place="${esc(id)}">${esc(placeInfo(id).name)}</button>`).join('')}${wishCities.map(id => `<button type="button" class="chip chip-btn on" data-place="${esc(id)}">☆ ${esc(placeInfo(id).name)}(위시)</button>`).join('')}</div></section>` : ''}
    <section><h4><label for="placeNote">메모</label></h4><textarea id="placeNote" rows="3" placeholder="이곳에 대한 기억, 다음에 가 볼 곳 등">${esc(s.places[current]?.note ?? '')}</textarea></section>
    <div class="pd-acts">
      <button class="btn btn-primary" type="button" data-act="trip">＋ 이 장소로 여행 기록</button>
      ${wished ? '<button class="btn" type="button" data-act="unwish">★ 위시에서 빼기</button>' : '<button class="btn" type="button" data-act="wish">☆ 위시에 담기</button>'}
      ${status !== 'visited' ? '<button class="btn" type="button" data-act="visit">✦ 방문함으로 표시</button>' : simple ? '<button class="btn btn-ghost" type="button" data-act="clear">방문 표시 지우기</button>' : ''}
    </div>`;

  const cityDots = cities.map(id => ({ ll: placeInfo(id).ll, name: placeInfo(id).name })).filter(c => c.ll);
  requestAnimationFrame(() => {
    const el = $('placeMap');
    if (el) drawPlaceMap(el, current, { classFor: ctx.classFor, cities: cityDots }).catch(err => console.error(err));
  });
}

export const placeDetailOpen = () => isPanelOpen('placePanel');
