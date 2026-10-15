// 위시리스트 화면(시안 06, PRD F6): 별 지도 + 위시 카드(우선순위·D-day·이유·함께·예산) + 정렬 + "꿈 → 현실"
import * as d3 from 'd3';
import { getState, completeWish, saveWish, reorderWishes } from '../store.js';
import { dday, todayStr, countryOf, visitCount, levelClass } from '../stats.js';
import { placeInfo, countryOfId } from '../places.js';
import { fmtDate, WISH_PRIORITY, PRIORITY_ORDER, won } from '../format.js';
import { CONT_ORDER } from '../data.js';
import { drawWishMap } from '../map/mini.js';
import { scratch } from '../map/effects.js';
import { flagHTML } from '../ui/flag.js';
import { toast } from '../ui/toast.js';
import { esc, motionReduced } from '../env.js';

const $ = id => document.getElementById(id);
let ctx = null;        // { classFor, openWishForm, openTripForm, openPlace }
let sort = 'priority';
let mapObj = null, mapW = 0;
let dragId = null;

const labelOf = w => w.label || placeInfo(w.placeId).name;

function sorted(list) {
  const s = getState();
  const contOf = w => CONT_ORDER.indexOf(countryOfId(countryOf(w.placeId, s.places))?.cont ?? 'AN');
  const byTarget = (a, b) => (a.target ?? '9999').localeCompare(b.target ?? '9999');
  const cmp = {
    priority: (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || byTarget(a, b),
    target: byTarget,
    continent: (a, b) => contOf(a) - contOf(b) || labelOf(a).localeCompare(labelOf(b), 'ko'),
    custom: (a, b) => (a.order ?? 0) - (b.order ?? 0),
  }[sort];
  return [...list].sort(cmp);
}

export function initWish(c) {
  ctx = c;
  $('wishSort').addEventListener('click', e => {
    const b = e.target.closest('button[data-sort]');
    if (!b) return;
    sort = b.dataset.sort;
    $('wishSort').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderWish();
  });
  $('addWishBtn').addEventListener('click', () => ctx.openWishForm({}));
  $('wishGrid').addEventListener('click', onCardClick);
  $('wishDone').addEventListener('click', onCardClick);
  // 내 순서: 끌어서 놓기
  $('wishGrid').addEventListener('dragstart', e => { dragId = e.target.closest('[data-wish]')?.dataset.wish; });
  $('wishGrid').addEventListener('dragover', e => { if (dragId) e.preventDefault(); });
  $('wishGrid').addEventListener('drop', e => {
    e.preventDefault();
    const to = e.target.closest('[data-wish]')?.dataset.wish;
    if (dragId && to && to !== dragId) moveTo(dragId, to);
    dragId = null;
  });
}

function moveTo(id, targetId) {
  const ids = sorted(active()).map(w => w.id);
  ids.splice(ids.indexOf(id), 1);
  ids.splice(ids.indexOf(targetId), 0, id);
  reorderWishes(ids);
}

const active = () => getState().wishlist.filter(w => !w.doneAt);

function onCardClick(e) {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const w = getState().wishlist.find(x => x.id === b.closest('[data-wish]').dataset.wish);
  if (!w) return;
  const act = b.dataset.act;
  if (act === 'edit') ctx.openWishForm({ wish: w });
  else if (act === 'done') complete(w);
  else if (act === 'record') ctx.openTripForm({ placeIds: [w.placeId], title: `${labelOf(w)} 여행` });
  else if (act === 'undone') saveWish({ ...w, doneAt: null });
  else if (act === 'place') ctx.openPlace(w.placeId);
  else if (act === 'up' || act === 'down') {
    const ids = sorted(active()).map(x => x.id);
    const i = ids.indexOf(w.id), j = act === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderWishes(ids);
  }
}

// "꿈 → 현실"(F6-5): 별이 커졌다가 땅으로 떨어지고, 그 나라 금박이 긁히며 색이 드러남
async function complete(w) {
  const s = getState();
  const star = mapObj?.starOf(w.id);
  if (star && !motionReduced()) {
    const core = star.select('.core');
    await core.transition().duration(300).attr('transform', 'scale(2)').end().catch(() => {});
    await star.transition().duration(500).ease(d3.easeCubicIn).style('opacity', 0)
      .attrTween('transform', function () { const t0 = this.getAttribute('transform'); return t => `${t0} translate(0,${t * 30})`; }).end().catch(() => {});
  }
  const countryKey = `country:${countryOf(w.placeId, s.places)}`;
  const info = placeInfo(w.placeId);
  if (mapObj && info.ll && !visitCount(s, countryKey)) {
    const el = mapObj.m.sel.filter(f => `country:${f.id}` === countryKey).node();
    if (el) scratch(mapObj.m, el, mapObj.m.proj(info.ll), levelClass(1)).then(() => mapObj?.m.refresh());
  }
  const undo = completeWish(w.id, { today: todayStr() });
  toast(`✦ <b>${esc(labelOf(w))}</b>, 별이 땅에 닿았어요! 카드에서 여행 기록을 남길 수 있어요.`, { label: '실행 취소', fn: undo });
}

function card(w, today, i, n) {
  const info = placeInfo(w.placeId);
  const d = dday(w.target, today);
  const ddayText = w.doneAt ? '꿈을 이뤘어요 ✓' : d == null ? '언젠가 ✦' : d > 0 ? `D-${d}` : d === 0 ? 'D-Day' : `D+${-d}`;
  const tagCls = { confirmed: 'gold', nextyear: 'wish' }[w.priority] ?? '';
  const sub = info.kind === 'country' ? info.sub : `${info.sub}`;
  const custom = sort === 'custom' && !w.doneAt;
  const chips = [w.who && `<span class="chip">함께 · <b>${esc(w.who)}</b></span>`, w.budgetKRW && `<span class="chip">예산 · <b>${won(w.budgetKRW)}</b></span>`,
    w.link && `<a class="chip" href="${esc(w.link)}" target="_blank" rel="noopener noreferrer">참고 링크 ↗</a>`].filter(Boolean).join('');
  return `<article class="wcard${w.doneAt ? ' done' : ''}" data-wish="${esc(w.id)}"${custom ? ' draggable="true"' : ''}>
    <svg class="stardeco" viewBox="-12 -12 24 24" aria-hidden="true"><use href="#sparkle" x="-12" y="-12" width="24" height="24"/></svg>
    <div class="row"><span class="tag ${tagCls}">${WISH_PRIORITY[w.priority] ?? '언젠가'}</span><span class="faint wsrc">${w.source?.startsWith('ai') ? 'AI 추천' : '직접 추가'}</span>
      ${custom ? `<span class="spacer"></span><button class="mini-btn" type="button" data-act="up" aria-label="앞으로" ${i === 0 ? 'disabled' : ''}>▲</button><button class="mini-btn" type="button" data-act="down" aria-label="뒤로" ${i === n - 1 ? 'disabled' : ''}>▼</button>` : ''}</div>
    <div><div class="dday">${ddayText}</div><div class="faint mono wdate">${w.doneAt ? `${fmtDate(w.doneAt)} 달성` : w.target ? fmtDate(w.target) : '목표 시기 미정'}</div></div>
    <div><button type="button" class="place link-row" data-act="place">${esc(labelOf(w))} ${flagHTML(info.iso2, info.name, 18)}</button>
      <div class="dim wsub">${esc(w.label ? `${info.name} · ${sub}` : sub)}</div></div>
    ${w.reason ? `<p class="wreason">“${esc(w.reason)}”</p>` : ''}
    ${chips ? `<div class="row wchips">${chips}</div>` : ''}
    <div class="row wacts">${w.doneAt
      ? '<button class="btn btn-sm btn-ghost" type="button" data-act="undone">아직 못 갔어요</button><span class="spacer"></span><button class="btn btn-sm btn-primary" type="button" data-act="record">기록 작성하기 →</button>'
      : '<button class="btn btn-sm" type="button" data-act="edit">편집</button><span class="spacer"></span><button class="btn btn-sm btn-primary" type="button" data-act="done">✓ 다녀왔어요</button>'}</div>
  </article>`;
}

export async function renderWish() {
  const s = getState(), today = todayStr();
  const list = sorted(active());
  const done = s.wishlist.filter(w => w.doneAt).sort((a, b) => b.doneAt.localeCompare(a.doneAt));
  $('wishTitle').innerHTML = list.length ? `아직 닿지 않은<br><span class="wish-text">별 ${list.length}개</span>` : '가고 싶은 곳을<br><span class="wish-text">별로 새겨 볼까요?</span>';
  $('wishGrid').innerHTML = list.map((w, i) => card(w, today, i, list.length)).join('')
    || `<div class="card empty-wish"><p class="dim">아직 담은 꿈이 없어요. [＋ 꿈 추가]를 누르거나, 지도에서 나라를 눌러 [☆ 위시에 담기]를 해 보세요.</p></div>`;
  $('wishDoneWrap').hidden = !done.length;
  $('wishDone').innerHTML = done.map(w => card(w, today, 0, 1)).join('');

  // 별 지도: 처음이거나 크기가 바뀌었을 때만 새로 그리고, 나머지는 별·색만 바꿈
  const box = $('wishMap');
  const stars = list.map(w => ({ id: w.id, placeId: w.placeId, label: labelOf(w), ll: placeInfo(w.placeId).ll }));
  if (!mapObj || mapW !== box.clientWidth || !mapObj.m.svg.node().isConnected) {
    mapW = box.clientWidth;
    mapObj = await drawWishMap(box, { classFor: ctx.classFor, onStar: id => document.querySelector(`[data-wish="${id}"]`)?.scrollIntoView({ behavior: motionReduced() ? 'auto' : 'smooth', block: 'center' }) });
  }
  mapObj?.update(stars);
}

export function resetWishMap() { mapObj = null; }
