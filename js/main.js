// 앱 진입점: 상태 불러오기, 지도 보기 전환, 장소 클릭(팝오버·빠른 색칠·금박 긁기), HUD, 검색, 패널
import { feature } from 'topojson-client';
import { settings, motionReduced, onSettings } from './settings.js';
import { esc, josa } from './env.js';
import { loadJSON, loadCountries } from './data.js';
import { loadState, getState, subscribe, setPlaceStatus, setManyStatus, toggleWish } from './store.js';
import {
  visitCount, placeStatus, isWished, levelClass, countryStats, koreaStats, isCountry, isSido, KR_SIDO, sidoId,
} from './stats.js';
import { registerPlaces, placeInfo, countryList, sidoList } from './places.js';
import { worldView } from './map/world.js';
import { koreaView } from './map/korea.js';
import { scratch, particles } from './map/effects.js';
import { drawSky } from './ui/sky.js';
import { toast } from './ui/toast.js';
import { initPopover, openPopover, closePopover, popoverTarget } from './ui/popover.js';
import { renderWorldHud, renderKoreaHud } from './ui/hud.js';
import { initSearch } from './ui/search.js';
import { initPanels, openPanel } from './ui/panel.js';
import { initListPanel, renderListPanel } from './ui/list-panel.js';
import { initSettingsPanel, pickRestoreFile } from './ui/settings-panel.js';

const $ = id => document.getElementById(id);
const VIEWS = { world: worldView, korea: koreaView };
const box = $('map');
let current = null;      // 현재 지도 객체
let viewName = 'world';
let seq = 0;             // 빠르게 전환할 때 늦게 끝난 이전 그리기를 버리기 위한 번호
let popScreen = null;    // 팝오버를 연 화면 좌표(상태가 바뀌면 같은 자리에서 다시 그림)

const session = {
  get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: k => { try { sessionStorage.setItem(k, '1'); } catch { /* 무시 */ } },
};
try { const v = localStorage.getItem('va-view'); if (VIEWS[v]) viewName = v; } catch { /* 무시 */ }

// ---------- 장소 상태 → 지도·팝오버 표시 ----------
const isSimple = placeId => getState().places[placeId]?.status === 'visited'
  && !getState().trips.some(t => (t.stops ?? []).some(s => s.placeId === placeId));

function classFor(placeId) {
  const s = getState();
  const n = visitCount(s, placeId);
  if (n) return levelClass(n);
  const wish = isWished(s, placeId) ? ' wishc' : '';
  return (s.places[placeId]?.status === 'transit' ? 'transit' : 'unv') + wish;
}

function statusText(placeId) {
  const s = getState();
  const n = visitCount(s, placeId);
  if (n) return `방문 ${n}회`;
  if (s.places[placeId]?.status === 'transit') return '경유';
  return isWished(s, placeId) ? '위시리스트' : '미방문';
}

function popoverView(placeId) {
  const s = getState();
  const info = placeInfo(placeId);
  const status = placeStatus(s, placeId);
  const simple = isSimple(placeId);
  const v = { ...info, status, count: visitCount(s, placeId), simple, wished: isWished(s, placeId) };
  if (status === 'visited' && !simple && !s.trips.length) {
    v.desc = isCountry(placeId) ? '안에 있는 시도·도시를 방문해서 자동으로 방문 표시됐어요.' : undefined;
  }
  return v;
}

const screenOf = e => { const r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

// ---------- 지도에 넘기는 연결 함수 ----------
const app = {
  classFor,
  statusText,
  onPlace(e, placeId, el, xy) {
    if ($('quickPaint').checked) return quickPaint(placeId, el, xy, screenOf(e));
    popScreen = screenOf(e);
    openPopover({ placeId, el, xy }, popScreen, popoverView(placeId));
  },
  onZoomStart: () => closePopover(),
  onBackground: () => closePopover(),
  stars(view) {
    const s = getState();
    return s.wishlist.filter(w => !w.doneAt && visitCount(s, w.placeId) === 0)
      .map(w => w.placeId).filter(id => (view === 'korea' ? isSido(id) : isCountry(id)));
  },
};

// ---------- 방문 표시(금박 긁기) ----------
function markVisited({ placeId, el, xy }, screen, { quick = false } = {}) {
  const level = levelClass(Math.max(1, visitCount(getState(), placeId)));
  // 긁기를 먼저 시작해 path에 표시를 붙인 뒤 상태를 바꿔야, 연출이 끝날 때까지 색이 바로 바뀌지 않습니다.
  const done = current && el?.isConnected ? scratch(current, el, xy, level, { quick }) : Promise.resolve();
  particles(box.querySelector('.fx-canvas'), screen[0], screen[1], { n: quick ? 12 : 36 });
  const undo = setPlaceStatus(placeId, 'visited', { quick });
  done.then(() => current?.refresh());
  const name = placeInfo(placeId).name;
  toast(`✦ <b>${esc(name)}</b>${josa(name, '을', '를')} 방문함으로 표시했어요`, { label: '실행 취소', fn: undo });
}

function clearMark(placeId, what = '방문') {
  const undo = setPlaceStatus(placeId, null);
  const name = placeInfo(placeId).name;
  toast(`<b>${esc(name)}</b>의 ${what} 표시를 지웠어요`, { label: '실행 취소', fn: undo });
}

// 빠른 색칠(F2-2): 클릭 한 번으로 방문함 켜기·끄기(팝오버 생략)
function quickPaint(placeId, el, xy, screen) {
  closePopover();
  const st = placeStatus(getState(), placeId);
  if (st !== 'visited') return markVisited({ placeId, el, xy }, screen, { quick: true });
  if (isSimple(placeId)) return clearMark(placeId);
  // 여행 기록이나 시도 방문으로 생긴 방문은 빠른 색칠로 지우지 않고 팝오버로 안내
  popScreen = screen;
  openPopover({ placeId, el, xy }, screen, popoverView(placeId));
}

initPopover({
  scratch: t => { closePopover(); markVisited(t, popScreen ?? current.toScreen(t.xy)); },
  detail: () => toast('장소 상세 화면은 다음 단계(Phase 2)에서 열려요.'),
  record: () => toast('여행 기록 추가는 다음 단계(Phase 2)에서 열려요.'),
  wish: t => {
    const { added, undo } = toggleWish(t.placeId);
    const name = placeInfo(t.placeId).name;
    toast(added ? `☆ <b>${esc(name)}</b>${josa(name, '을', '를')} 위시리스트에 담았어요` : `<b>${esc(name)}</b>${josa(name, '을', '를')} 위시리스트에서 뺐어요`, { label: '실행 취소', fn: undo });
  },
  transit: t => {
    if (placeStatus(getState(), t.placeId) === 'transit') return clearMark(t.placeId, '경유');
    const undo = setPlaceStatus(t.placeId, 'transit');
    const name = placeInfo(t.placeId).name;
    toast(`✈ <b>${esc(name)}</b>${josa(name, '을', '를')} 경유로 표시했어요`, { label: '실행 취소', fn: undo });
  },
  clear: t => { closePopover(); clearMark(t.placeId); },
});

// ---------- HUD ----------
const sidoName = code => placeInfo(sidoId(code)).name;
function renderHuds(anim) {
  const s = getState();
  const cs = countryStats(s, countryList(), { includeTransit: settings.includeTransit });
  const ks = koreaStats(s);
  renderWorldHud(cs, ks, anim, motionReduced());
  renderKoreaHud(ks, sidoName, anim, motionReduced());
}

// ---------- 첫 실행 화면(DESIGN.md 9장 빈 상태) ----------
function updateEmpty() {
  const s = getState();
  const empty = !Object.keys(s.places).length && !s.wishlist.length && !s.trips.length;
  $('emptyCard').hidden = !empty || !!session.get('va-empty-closed');
}

// ---------- 보기 전환 ----------
async function show(name) {
  viewName = name;
  try { localStorage.setItem('va-view', name); } catch { /* 무시 */ }
  closePopover();
  box.parentElement.dataset.view = name;   // 휴대폰에서 보기별 지도 높이(세계는 가로로 긴 비율)
  document.querySelectorAll('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  for (const [id, v] of [['legendWorld', 'world'], ['legendKorea', 'korea'], ['hudWorld', 'world'], ['hudKorea', 'korea']]) $(id).hidden = name !== v;

  const my = ++seq;
  current?.destroy();
  current = null;
  try {
    const m = await VIEWS[name](box, app);
    if (my !== seq) { m?.destroy(); return; }
    current = m;
    box.querySelectorAll('.map-skeleton, .map-error').forEach(n => n.remove());
    introOnce(m);
    renderListPanel();
  } catch (err) {
    console.error(err);
    box.querySelector('.map-error') ?? box.insertAdjacentHTML('beforeend', '<p class="map-error">지도 데이터를 불러오지 못했어요.<br>로컬 서버로 실행했는지 확인해 주세요(docs/README_dev.md).</p>');
  }
}

// 시작 연출(DESIGN.md 7.4): 이번 실행에서 처음 세계 지도를 열 때 방문국이 70ms 간격으로 빛남
function introOnce(m) {
  if (m.view !== 'world' || motionReduced() || session.get('va-intro')) return;
  session.set('va-intro');
  m.sel.filter(function () { return /lv\d/.test(this.getAttribute('class')); })
    .style('opacity', 0).transition().delay((d, i) => 300 + i * 70).duration(600).style('opacity', 1)
    .on('end', function () { this.style.opacity = ''; });
}

// 검색·목록에서 장소로 이동해 팝오버 열기
async function focusPlace(placeId) {
  const info = placeInfo(placeId);
  if (info.view !== viewName) await show(info.view);
  if (!current) return;
  await current.ready;
  const t = current.target(placeId);
  if (!t) return;
  await current.zoomToBounds(t.bounds, current.view === 'korea' ? 3 : 6);
  popScreen = current.toScreen(t.xy);
  openPopover({ placeId, el: t.el, xy: t.xy }, popScreen, popoverView(placeId), { focus: true });
}

// ---------- 시작 ----------
async function start() {
  const [{ list }, sidoTopo] = await Promise.all([loadCountries(), loadJSON('data/korea-sido.json'), loadState()]);
  registerPlaces({ countries: list, sidoFeatures: feature(sidoTopo, sidoTopo.objects.sido).features });

  // 검색·목록 항목
  const searchItems = [
    ...countryList().map(c => ({
      placeId: `country:${c.id}`, name: c.ko, sub: c.status === 'region' ? `${c.en} · 지역` : c.en, iso2: c.iso2,
      keys: [c.ko, c.en, ...(c.alt ?? [])], region: c.status === 'region', group: c.status === 'region' ? 'region' : c.cont,
    })),
    ...sidoList().map(p => ({
      placeId: p.placeId, name: p.name, sub: p.official !== p.name ? p.official : '대한민국 시도', iso2: 'KR',
      keys: [p.name, p.short, p.official], view: 'korea',
    })),
  ];
  const byName = (a, b) => a.name.localeCompare(b.name, 'ko');
  const worldRows = searchItems.filter(i => isCountry(i.placeId)).sort(byName);
  const koreaRows = KR_SIDO.map(code => searchItems.find(i => i.placeId === sidoId(code)));

  initSearch({ getItems: () => searchItems, onSelect: it => focusPlace(it.placeId) });
  initPanels();
  initListPanel({
    view: () => viewName,
    rows: v => (v === 'korea' ? koreaRows : worldRows),
    stateOf: placeId => {
      const st = placeStatus(getState(), placeId);
      return { on: st === 'visited', locked: st === 'visited' && !isSimple(placeId), label: st === 'visited' ? `방문 ${visitCount(getState(), placeId)}회` : st === 'transit' ? '경유' : '' };
    },
    onToggle: (placeId, on) => {
      const undo = setManyStatus([placeId], on ? 'visited' : null);
      const name = placeInfo(placeId).name;
      toast(on ? `✦ <b>${esc(name)}</b>${josa(name, '을', '를')} 방문함으로 표시했어요` : `<b>${esc(name)}</b>의 방문 표시를 지웠어요`, { label: '실행 취소', fn: undo });
    },
  });
  initSettingsPanel();

  $('listBtn').addEventListener('click', () => { openPanel('listPanel'); renderListPanel(); });
  $('settingsBtn').addEventListener('click', () => openPanel('settingsPanel'));

  // 빈 상태 카드
  $('emptyPaint').addEventListener('click', () => { $('quickPaint').checked = true; session.set('va-empty-closed'); updateEmpty(); toast('빠른 색칠을 켰어요. 다녀온 나라를 차례로 눌러 보세요.'); });
  $('emptyImport').addEventListener('click', () => pickRestoreFile('overwrite'));
  $('emptyClose').addEventListener('click', () => { session.set('va-empty-closed'); updateEmpty(); });

  subscribe((s, meta) => {
    current?.redraw();
    renderHuds(true);
    renderListPanel();
    updateEmpty();
    // 팝오버가 열린 채로 상태가 바뀌면(위시·경유) 같은 자리에서 내용만 새로 그림
    const t = popoverTarget();
    if (t && popScreen) openPopover(t, popScreen, popoverView(t.placeId));
    if (meta.reason === 'restore' || meta.reason === 'reset') current?.reset();
  });
  onSettings(() => {
    renderHuds(false);
    current?.land.attr('filter', motionReduced() ? null : 'url(#grain)');
  });

  renderHuds(false);
  updateEmpty();
  await show(viewName);
}

$('viewSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]');
  if (b && !b.disabled && VIEWS[b.dataset.view] && b.dataset.view !== viewName) show(b.dataset.view);
});
$('zIn').onclick = () => current?.zoomBy(1.6);
$('zOut').onclick = () => current?.zoomBy(1 / 1.6);
$('zReset').onclick = () => current?.reset();
$('quickPaint').addEventListener('change', e => { closePopover(); document.body.classList.toggle('quick-paint', e.target.checked); });

// 아직 만들지 않은 화면(준비 중) 탭은 이동하지 않습니다.
document.querySelectorAll('.tabbar a[aria-disabled="true"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); toast('이 화면은 다음 단계에서 열려요.'); }));

let rz, lastW = innerWidth, lastH = innerHeight;
addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    drawSky();
    // 휴대폰 주소창이 접힐 때처럼 높이만 조금 바뀌면 다시 그리지 않습니다(팝오버가 닫히지 않게).
    if (innerWidth !== lastW || Math.abs(innerHeight - lastH) > 120 || !current) { lastW = innerWidth; lastH = innerHeight; show(viewName); }
  }, 200);
});

drawSky();
start().catch(err => { console.error(err); toast('앱을 시작하지 못했어요. 새로 고침해 주세요.'); });
