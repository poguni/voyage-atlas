// 여행 연대기 화면(시안 05, PRD F3): 연도별 타임라인 + 선택한 여행 카드(경로 지도, 경유지, 메모)
import { getState } from '../store.js';
import { tripStarted, isUpcoming, daysSummary, dday, tripYear, tripDays, todayStr, COMPANIONS } from '../stats.js';
import { fmtRange, fmtTripMeta, fmtStars, colorVar } from '../format.js';
import { drawRouteMap, HOME_AIRPORT } from '../map/mini.js';
import { placeInfo } from '../places.js';
import { esc } from '../env.js';

const $ = id => document.getElementById(id);
let ctx = null;          // { classFor, openTripForm, openPlace }
let selected = null;     // 선택한 여행 ID
let order = 'desc';      // 최신순 / 오래된순
let mapReq = 0;

export function initTrips(c) {
  ctx = c;
  $('addTripBtn').addEventListener('click', () => ctx.openTripForm({ onSaved: t => { selected = t.id; } }));
  $('tripsOrder').addEventListener('click', e => {
    const b = e.target.closest('button[data-order]');
    if (!b) return;
    order = b.dataset.order;
    $('tripsOrder').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderTrips();
  });
  $('timeline').addEventListener('click', e => {
    const b = e.target.closest('button[data-trip]');
    if (b) { selected = b.dataset.trip; renderTrips(); }
  });
  $('tripDetail').addEventListener('click', e => {
    const t = getState().trips.find(x => x.id === selected);
    const b = e.target.closest('[data-act], [data-place]');
    if (!b || !t) return;
    if (b.dataset.place) return ctx.openPlace(b.dataset.place);
    if (b.dataset.act === 'edit') ctx.openTripForm({ trip: t });
    if (b.dataset.act === 'add') ctx.openTripForm({ onSaved: x => { selected = x.id; } });
  });
}

export const selectTrip = id => { selected = id; };

function tripButton(t, withYear, extra = '') {
  return `<button type="button" class="trip${t.id === selected ? ' on' : ''}" data-trip="${esc(t.id)}" aria-pressed="${t.id === selected}">
    <span class="dot" style="background:${colorVar(t.color)}"></span>
    <span><b>${esc(t.title)}</b><small>${esc(fmtTripMeta(t, withYear))}${t.rating ? ` · <span class="stars">${'★'.repeat(t.rating)}</span>` : ''}${extra}</small></span></button>`;
}

export function renderTrips() {
  const s = getState(), today = todayStr();
  const past = s.trips.filter(t => tripStarted(t, today));
  const upcoming = s.trips.filter(t => isUpcoming(t, today)).sort((a, b) => a.start.localeCompare(b.start));
  const days = daysSummary(s, { today }).total;
  $('tripsTitle').innerHTML = past.length
    ? `${past.length}번의 여정,<br>${days.toLocaleString('ko-KR')}일의 이야기`
    : '첫 여정을<br>기록해 볼까요?';

  // 연도별 묶음(날짜 미상은 맨 끝)
  const dated = past.filter(t => t.start).sort((a, b) => (order === 'desc' ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));
  const undated = past.filter(t => !t.start);
  const ordered = [...upcoming, ...dated, ...undated];
  if (!ordered.some(t => t.id === selected)) selected = (dated[0] ?? upcoming[0] ?? undated[0])?.id ?? null;

  let html = '';
  if (upcoming.length) {
    html += '<div class="year upcoming">다가오는 여정</div>';
    html += upcoming.map(t => tripButton(t, true, ` · <span class="dday">D-${dday(t.start, today)}</span>`)).join('');
  }
  let lastY = null;
  for (const t of dated) {
    const y = tripYear(t);
    if (y !== lastY) { html += `<div class="year">${y}</div>`; lastY = y; }
    html += tripButton(t, false);
  }
  if (undated.length) html += '<div class="year faint">날짜 미상</div>' + undated.map(t => tripButton(t, false)).join('');
  $('timeline').innerHTML = html || '<p class="dim empty-note">아직 기록한 여정이 없어요. 지난 여행을 하나씩 남겨 보세요. 날짜를 몰라도 괜찮아요.</p>';

  renderDetail(s.trips.find(t => t.id === selected), today);
}

function renderDetail(t, today) {
  const box = $('tripDetail');
  if (!t) {
    box.innerHTML = `<div class="card empty-trip"><div class="eyebrow">Chronicle</div><h2>여정을 기록하면 경로가 그려져요</h2>
      <p class="dim">여행마다 날짜·동행·별점·메모를 남기면 방문 횟수와 여행 일수가 자동으로 쌓여요.</p>
      <button class="btn btn-primary" type="button" data-act="add">＋ 첫 여정 기록하기</button></div>`;
    return;
  }
  const days = tripDays(t);
  const eyebrow = [fmtRange(t, true), days ? `${days}일` : '', COMPANIONS[t.companion], t.partySize > 1 ? `${t.partySize}명` : '',
    isUpcoming(t, today) ? `D-${dday(t.start, today)}` : ''].filter(Boolean).join(' · ');
  const stops = t.stops.map(s => ({ id: s.placeId, info: placeInfo(s.placeId) }));
  const domesticLike = stops.length && stops.every(s => s.info.iso2 === 'KR');
  const chips = [
    ...(domesticLike ? [] : [`<span class="chip"><b class="mono">${HOME_AIRPORT.code}</b> ${HOME_AIRPORT.name}</span>`]),
    ...stops.map((s, i) => `<button type="button" class="chip chip-btn" data-place="${esc(s.id)}"><b>${i + 1}</b> ${esc(s.info.name)}</button>`),
    ...(domesticLike ? [] : [`<span class="chip"><b class="mono">${HOME_AIRPORT.code}</b></span>`]),
  ].join('<span class="faint arrow">→</span>');

  box.innerHTML = `<div class="card trip-card" style="--trip:${colorVar(t.color)}">
    <div class="trip-card-head"><div><div class="eyebrow">${esc(eyebrow)}</div><h2 class="trip-title">${esc(t.title)}</h2></div>
      <span class="spacer"></span>${t.rating ? `<span class="trip-stars" aria-label="별점 ${t.rating}점">${fmtStars(t.rating)}</span>` : ''}
      <button class="btn btn-sm" type="button" data-act="edit">편집</button></div>
    <div class="trip-map" id="tripMap"></div>
    <div class="trip-stops">${chips}</div>
    ${domesticLike ? '<p class="faint trip-hint">국내 여행은 대한민국 지도에서 경유 순서대로 보여 줘요.</p>' : ''}
    ${t.note ? `<p class="trip-note">“${esc(t.note)}”</p>` : ''}
  </div>`;

  const my = ++mapReq;
  requestAnimationFrame(async () => {
    const el = $('tripMap');
    if (!el || my !== mapReq) return;
    try { await drawRouteMap(el, t, { classFor: ctx.classFor, onPlace: ctx.openPlace }); }
    catch (err) { console.error(err); el.innerHTML = '<p class="map-error">경로 지도를 그리지 못했어요.</p>'; }
  });
}
