// 앱 진입점: 상태 불러오기, 화면 이동(지도·연대기·위시·AI 추천·통계·공유), 지도 보기 전환, 장소 클릭(팝오버·빠른 색칠·금박 긁기),
// HUD, 검색, 패널(목록·설정·여행·장소 상세·위시)
import { geoCentroid } from 'd3';
import { feature } from 'topojson-client';
import { settings, motionReduced, onSettings } from './settings.js';
import { esc, josa } from './env.js';
import { loadJSON, loadCountries } from './data.js';
import { loadState, getState, subscribe, setPlaceStatus, setManyStatus, toggleWish, recordAchievements } from './store.js';
import {
  visitCount, placeStatus, isWished, levelClass, countryStats, koreaStats, isCountry, isSido, KR_SIDO, sidoId,
  daysSummary, tripStarted, tripYear, todayStr, visitedCities, lastVisitYear, mainCompanion, yearBuckets,
} from './stats.js';
import { registerPlaces, placeInfo, placeMeta, countryList, baseSearchItems, allSearchItems, loadCityItems } from './places.js';
import { worldView } from './map/world.js';
import { koreaView } from './map/korea.js';
import { globeView } from './map/globe.js';
import * as d3 from 'd3';
import { scratch, particles } from './map/effects.js';
import { drawSky } from './ui/sky.js';
import { toast } from './ui/toast.js';
import { initPopover, openPopover, closePopover, popoverTarget } from './ui/popover.js';
import { renderWorldHud, renderKoreaHud, renderGlobeHud } from './ui/hud.js';
import { attachCombobox } from './ui/search.js';
import { initPanels, openPanel, closePanel } from './ui/panel.js';
import { initListPanel, renderListPanel } from './ui/list-panel.js';
import { initSettingsPanel, pickRestoreFile } from './ui/settings-panel.js';
import { initTripForm, openTripForm } from './ui/trip-form.js';
import { initWishForm, openWishForm } from './ui/wish-form.js';
import { initPlaceDetail, openPlaceDetail, renderPlaceDetail, placeDetailOpen } from './ui/place-detail.js';
import { renderDream } from './ui/dream.js';
import { initTrips, renderTrips, selectTrip } from './screens/trips.js';
import { HOME_AIRPORT } from './map/mini.js';
import { initWish, renderWish } from './screens/wish.js';
import { initStats, renderStats, travelDistance, fmtKm } from './screens/stats-view.js';
import { initShare, renderShare } from './screens/share.js';
import { initMilestone, celebrate } from './ui/milestone.js';
import { initTimelapse, startTimelapse, stopTimelapse, frameState } from './ui/timelapse.js';
import { renderLegend, yearClass, COLOR_MODES } from './ui/legend.js';
import { newlyEarned, nextGoals, headline, metrics } from './badges.js';
import { initAi, renderAi } from './screens/ai.js';
import { initAiSettings, refreshPrices } from './ui/ai-settings.js';

const $ = id => document.getElementById(id);
const VIEWS = { world: worldView, korea: koreaView, globe: globeView };
const ROUTES = ['home', 'trips', 'wish', 'ai', 'stats', 'share'];
const TITLES = { home: '지도', trips: '여행 연대기', wish: '위시리스트', ai: 'AI 추천', stats: '통계', share: '공유 스튜디오' };
const box = $('map');
let current = null;      // 현재 지도 객체
let viewName = 'world';
let route = 'home';
let seq = 0;             // 빠르게 전환할 때 늦게 끝난 이전 그리기를 버리기 위한 번호
let popScreen = null;    // 팝오버를 연 화면 좌표(상태가 바뀌면 같은 자리에서 다시 그림)
let mapSize = '';        // 지도를 그린 상자 크기(화면을 오가는 사이 크기가 바뀌었으면 다시 그림)
let colorBy = 'count';   // 지도 색칠 기준(F1-11)
let krUnit = 'sido';     // 한국 지도 단위(F1-9)

const session = {
  get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: k => { try { sessionStorage.setItem(k, '1'); } catch { /* 무시 */ } },
};
try {
  const v = localStorage.getItem('va-view'); if (VIEWS[v]) viewName = v;
  const c = localStorage.getItem('va-colorby'); if (COLOR_MODES[c]) colorBy = c;
  if (localStorage.getItem('va-kr-unit') === 'sigungu') krUnit = 'sigungu';
} catch { /* 무시 */ }

// ---------- 장소 상태 → 지도·팝오버 표시 ----------
const isSimple = placeId => getState().places[placeId]?.status === 'visited'
  && !getState().trips.some(t => tripStarted(t) && (t.stops ?? []).some(s => s.placeId === placeId));

function classFor(placeId) {
  const s = frameState() ?? getState();   // 전체 연대기 재생 중에는 그해까지의 기록으로
  const n = visitCount(s, placeId);
  if (n) return levelClass(n);
  const wish = isWished(s, placeId) ? ' wishc' : '';
  return (s.places[placeId]?.status === 'transit' ? 'transit' : 'unv') + wish;
}

// 지도 홈의 색: 색칠 기준에 따라(작은 지도들은 늘 방문 횟수 기준)
let bucketCache = { s: null, buckets: [] };
function yearBucketsNow() {
  const s = getState();
  if (bucketCache.s !== s) bucketCache = { s, buckets: yearBuckets(s.trips.filter(t => t.start && tripStarted(t)).map(tripYear)) };
  return bucketCache.buckets;
}
function mapClassFor(placeId) {
  const cls = classFor(placeId);
  if (colorBy === 'count' || !/^lv\d/.test(cls)) return cls;
  const s = frameState() ?? getState();
  if (colorBy === 'status') return 'vis lv1';
  if (colorBy === 'year') { const y = lastVisitYear(s, placeId); return `vis ${y == null ? 'y-none' : yearClass(yearBucketsNow(), y)}`; }
  return `vis cp-${mainCompanion(s, placeId) ?? 'none'}`;
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
  if (status === 'visited' && !simple && !s.trips.some(t => tripStarted(t) && t.stops.some(x => x.placeId === placeId)) && (isCountry(placeId) || isSido(placeId))) {
    v.desc = isSido(placeId) ? '안에 있는 시군구를 방문해서 자동으로 방문 표시됐어요.' : '안에 있는 시도·도시를 방문해서 자동으로 방문 표시됐어요.';
  }
  return v;
}

const screenOf = e => { const r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

// ---------- 지도에 넘기는 연결 함수 ----------
const app = {
  classFor: mapClassFor,
  statusText,
  // 지도 핀(F1-10): 다녀온 도시·시군구
  cities: kind => visitedCities(frameState() ?? getState(), kind),
  krUnit: () => krUnit,
  onDrill: placeId => drill(placeId),
  // mapId: 클릭한 땅의 장소 ID(도시 별을 누르면 그 도시가 속한 나라·시도)
  onPlace(e, placeId, el, xy, mapId = placeId) {
    if ($('quickPaint').checked) return quickPaint({ placeId, el, xy, mapId }, screenOf(e));
    popScreen = screenOf(e);
    openPopover({ placeId, el, xy, mapId }, popScreen, popoverView(placeId));
  },
  onZoomStart: () => closePopover(),
  // 지구본: 자전 스위치, 팝오버가 열려 있으면 자전을 멈춤
  spin: () => $('spinToggle').checked,
  busy: () => !$('popover').hidden,
  onBackground: () => closePopover(),
  // 지도에 별로 띄울 위시(아직 방문 전). 세계 지도는 나라·도시, 한국 지도는 시도·시군구
  stars(view) {
    const s = getState();
    return s.wishlist.filter(w => !w.doneAt && visitCount(s, w.placeId) === 0).map(w => w.placeId)
      .filter(id => (view === 'korea' ? id.startsWith('kr-') : !id.startsWith('kr-')));
  },
};

// ---------- 방문 표시(금박 긁기) ----------
function markVisited({ placeId, el, xy, mapId = placeId }, screen, { quick = false } = {}) {
  const s = getState();
  // 긁을 땅이 아직 칠해지지 않았을 때만 긁기 연출(도시를 표시했는데 나라가 이미 방문함이면 생략)
  const landCount = visitCount(s, mapId);
  const level = levelClass(Math.max(1, mapId === placeId ? visitCount(s, placeId) : landCount));
  // 지구본은 돌고 있어 금박 긁기 대신 파티클만
  const done = current && current.view !== 'globe' && el?.isConnected && (mapId === placeId || !landCount)
    ? scratch(current, el, xy, level, { quick }) : Promise.resolve();
  particles(box.querySelector('.fx-canvas'), screen[0], screen[1], { n: quick ? 12 : 36 });
  const undo = setPlaceStatus(placeId, 'visited', { quick, meta: placeMeta(placeId) });
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
function quickPaint(t, screen) {
  closePopover();
  const st = placeStatus(getState(), t.placeId);
  if (st !== 'visited') return markVisited(t, screen, { quick: true });
  if (isSimple(t.placeId)) return clearMark(t.placeId);
  // 여행 기록이나 시도 방문으로 생긴 방문은 빠른 색칠로 지우지 않고 팝오버로 안내
  popScreen = screen;
  openPopover(t, screen, popoverView(t.placeId));
}

// 여행 저장 뒤: 지도에서 기록했으면 연대기로 바로 가 볼 수 있게
const afterTripSaved = t => { selectTrip(t.id); if (route !== 'trips') toast('연대기에서 경로를 볼 수 있어요.', { label: '보러 가기', fn: () => goTrip(t.id) }); };

initPopover({
  scratch: t => { closePopover(); markVisited(t, popScreen ?? current.toScreen(t.xy)); },
  detail: t => { closePopover(); openPlaceDetail(t.placeId); },
  record: t => { closePopover(); openTripForm({ placeIds: [t.placeId], onSaved: afterTripSaved }); },
  wish: t => {
    const { added, undo } = toggleWish(t.placeId, placeMeta(t.placeId));
    const name = placeInfo(t.placeId).name;
    toast(added ? `☆ <b>${esc(name)}</b>${josa(name, '을', '를')} 위시리스트에 담았어요` : `<b>${esc(name)}</b>${josa(name, '을', '를')} 위시리스트에서 뺐어요`, { label: '실행 취소', fn: undo });
  },
  transit: t => {
    if (placeStatus(getState(), t.placeId) === 'transit') return clearMark(t.placeId, '경유');
    const undo = setPlaceStatus(t.placeId, 'transit', { meta: placeMeta(t.placeId) });
    const name = placeInfo(t.placeId).name;
    toast(`✈ <b>${esc(name)}</b>${josa(name, '을', '를')} 경유로 표시했어요`, { label: '실행 취소', fn: undo });
  },
  clear: t => { closePopover(); clearMark(t.placeId); },
});

// ---------- HUD ----------
const sidoName = code => placeInfo(sidoId(code)).name;
function renderHuds(anim) {
  const s = getState(), today = todayStr();
  const cs = countryStats(s, countryList(), { includeTransit: settings.includeTransit });
  const ks = koreaStats(s);
  const firstYear = s.trips.filter(t => tripStarted(t, today) && t.start).map(tripYear).sort()[0];
  renderWorldHud(cs, ks, anim, motionReduced(), {
    days: daysSummary(s, { today }).total,
    years: firstYear ? [firstYear, +today.slice(0, 4)] : null,
  });
  renderKoreaHud(ks, sidoName, anim, motionReduced());
  const dist = travelDistance(s);
  renderGlobeHud({
    laps: dist.laps, kmText: fmtKm(dist.km), home: HOME_AIRPORT.name, places: dist.overseasPlaces,
    trips: s.trips.filter(t => tripStarted(t, today)).length,
    cities: visitedCities(s, 'city', today).length + visitedCities(s, 'kr-sigungu', today).length,
  }, anim, motionReduced());
}

// ---------- 마일스톤(PRD F5-1·F5-2) ----------
// 새로 달성한 배지를 기록하고 축하 창을 띄웁니다. 앱을 열 때 이미 달성해 있던 배지, 백업 복원·초기화·실행 취소는 조용히 기록만 합니다.
let badgesReady = false;
function checkBadges(meta = {}) {
  const opts = { includeTransit: settings.includeTransit };
  const { list, dates } = newlyEarned(getState(), countryList(), opts);
  if (!list.length) return;
  recordAchievements(dates);
  if (!badgesReady || meta.quiet || meta.undo || meta.reason === 'restore' || meta.reason === 'reset') return;
  const b = headline(list);
  const next = nextGoals(getState(), countryList(), opts)[0];
  const desc = [
    b.kind === 'countries' && `세계의 ${metrics(getState(), countryList(), opts).pct.toFixed(1)}%를 걸었어요.`,
    next ? `다음 목표: ${next.text}` : '모든 목표를 이뤘어요!',
    list.length > 1 && `배지 ${list.length - 1}개도 함께 얻었어요.`,
  ].filter(Boolean).map(t => (/[.!?]$/.test(t) ? t : `${t}.`)).join(' ');
  // 금박 긁기 연출(850ms)이 끝난 뒤에 축하
  setTimeout(() => celebrate(b, desc), motionReduced() ? 0 : 900);
}

// ---------- 첫 실행 화면(DESIGN.md 9장 빈 상태) ----------
function updateEmpty() {
  const s = getState();
  const empty = !Object.keys(s.places).length && !s.wishlist.length && !s.trips.length;
  $('emptyCard').hidden = !empty || !!session.get('va-empty-closed');
}

// ---------- 범례·색칠 기준(F1-11)·한국 지도 단위(F1-9) ----------
function renderLegends() {
  const buckets = colorBy === 'year' ? yearBucketsNow() : [];
  renderLegend($('legendWorld'), { view: 'world', mode: colorBy, buckets });
  renderLegend($('legendKorea'), { view: 'korea', mode: colorBy, buckets, unit: krUnit });
}

function setColorBy(mode) {
  colorBy = mode;
  try { localStorage.setItem('va-colorby', mode); } catch { /* 무시 */ }
  renderLegends();
  current?.redraw();
}

function setUnit(unit) {
  krUnit = unit;
  try { localStorage.setItem('va-kr-unit', unit); } catch { /* 무시 */ }
  renderLegends();
}

// 시도를 두 번 누르면 시군구 지도로 바꾸고 그 시도로 확대
async function drill(placeId) {
  closePopover();
  setUnit('sigungu');
  await show('korea');
  const t = current?.target(placeId);
  if (t) await current.zoomToBounds(t.bounds, 8, 0.8);
}

// ---------- 지도 보기 전환 ----------
// 전환 연출(F1-8): 세계 ↔ 지구본은 평면이 둥글게 접히고, 한국으로 갈 때는 대한민국으로 날아가 시도 지도로 겹쳐 바뀝니다.
const fade = (node, from, to, ms) => new Promise(res => {
  d3.select(node).style('opacity', from).transition().duration(ms).style('opacity', to).on('end interrupt', () => res());
});
async function transition(prev, m, from, to) {
  const a = prev.svg.node(), b = m.svg.node();
  if (to === 'korea' || from === 'korea') {
    const kv = to === 'korea' ? m : prev, other = to === 'korea' ? prev : m;
    const target = kv.koreaBox();
    b.style.opacity = 0;
    if (to === 'korea') await other.flyToKorea(target, 850);
    else await other.flyToKorea(target, 0);
    await Promise.all([fade(b, 0, 1, 380), fade(a, 1, 0, 380)]);
    if (from === 'korea') await other.resetView();
  } else if (to === 'globe') {
    const spec = prev.spec();
    a.style.opacity = 0;
    await m.morphFrom(spec, 1100);
  } else {
    b.style.opacity = 0;
    await prev.morphTo(m.spec(), 1100);
    b.style.opacity = 1; a.style.opacity = 0;
  }
  b.style.opacity = '';
}

async function show(name) {
  const prev = current, from = prev?.view;
  viewName = name;
  try { localStorage.setItem('va-view', name); } catch { /* 무시 */ }
  closePopover();
  box.parentElement.dataset.view = name;   // 휴대폰에서 보기별 지도 높이(세계는 가로로 긴 비율)
  document.querySelectorAll('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  // 지구본은 FLIGHT LOG HUD + 세계 범례
  for (const [id, v] of [['legendWorld', 'world globe'], ['legendKorea', 'korea'], ['hudWorld', 'world'], ['hudKorea', 'korea'], ['hudGlobe', 'globe']]) $(id).hidden = !v.split(' ').includes(name);
  $('spinWrap').hidden = name !== 'globe';
  $('unitSeg').hidden = name !== 'korea';
  document.querySelectorAll('#unitSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.unit === krUnit)));

  const my = ++seq;
  // 같은 크기의 지도에서 보기만 바꿀 때만 연출(창 크기가 바뀌어 다시 그릴 때는 생략)
  const animate = !!prev && from !== name && !motionReduced() && prev.w === box.clientWidth && prev.h === box.clientHeight;
  current = null;
  if (animate) prev.svg.node().dataset.keep = '1'; else prev?.destroy();
  try {
    const m = await VIEWS[name](box, app);
    if (my !== seq) { m?.destroy(); if (animate) prev.destroy(); return; }
    if (animate && m) {
      try { await transition(prev, m, from, name); } catch (err) { console.error(err); }
      prev.destroy();
      if (my !== seq) { m.destroy(); return; }
    }
    current = m;
    mapSize = `${box.clientWidth}x${box.clientHeight}`;
    box.querySelectorAll('.map-skeleton, .map-error').forEach(n => n.remove());
    introOnce(m);
    m?.intro?.();
    renderListPanel();
  } catch (err) {
    console.error(err);
    box.querySelector('.map-error') ?? box.insertAdjacentHTML('beforeend', '<p class="map-error">지도 데이터를 불러오지 못했어요.<br>로컬 서버로 실행했는지 확인해 주세요(docs/README_dev.md).</p>');
  }
}

// 시작 연출(DESIGN.md 7.4): 이번 실행에서 처음 세계 지도를 열 때 방문국이 70ms 간격으로 빛남
function introOnce(m) {
  if (!m || m.view !== 'world' || motionReduced() || session.get('va-intro')) return;
  session.set('va-intro');
  m.sel.filter(function () { return /lv\d|vis/.test(this.getAttribute('class')); })
    .style('opacity', 0).transition().delay((d, i) => 300 + i * 70).duration(600).style('opacity', 1)
    .on('end', function () { this.style.opacity = ''; });
}

// ---------- 화면 이동(해시 라우팅) ----------
function renderRoute() {
  if (route === 'trips') renderTrips();
  else if (route === 'wish') renderWish();
  else if (route === 'stats') renderStats();
  else if (route === 'share') renderShare().catch(err => console.error(err));
  else if (route === 'ai') renderAi().catch(err => console.error(err));
}

async function go(name) {
  route = ROUTES.includes(name) ? name : 'home';
  closePopover();
  if (route !== 'home') stopTimelapse();
  document.querySelectorAll('.screen').forEach(sc => { sc.hidden = sc.id !== route; });
  document.querySelectorAll('#tabbar a[data-tab]').forEach(a => {
    if (a.dataset.tab === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${TITLES[route]} · 나의 여정 지도`;
  scrollTo(0, 0);
  if (route === 'home') {
    renderDream();
    // 다른 화면에 있는 동안 창 크기가 바뀌었으면 지도를 다시 그림
    if (!current || mapSize !== `${box.clientWidth}x${box.clientHeight}`) await show(viewName);
  } else renderRoute();
}

function goTrip(id) {
  selectTrip(id);
  closePanel(false);
  if (route === 'trips') renderTrips(); else location.hash = '#trips';
}

// 검색·목록에서 장소로 이동해 팝오버 열기
async function focusPlace(placeId) {
  const info = placeInfo(placeId);
  if (route !== 'home') { location.hash = '#home'; await go('home'); }
  // 지구본에서 나라·도시를 찾으면 지구본을 돌려서 보여 줌
  const want = info.view === 'world' && viewName === 'globe' ? 'globe' : info.view;
  if (want !== viewName) await show(want);
  if (!current) return;
  await current.ready;
  const t = current.target(placeId);
  if (!t) return;
  await current.zoomToBounds(t.bounds, current.view === 'korea' ? 3 : 6);
  popScreen = current.toScreen(t.xy);
  openPopover({ placeId, el: t.el, xy: t.xy, mapId: t.mapId }, popScreen, popoverView(placeId), { focus: true });
}

// ---------- 시작 ----------
async function start() {
  const [{ list }, sidoTopo] = await Promise.all([loadCountries(), loadJSON('data/korea-sido.json'), loadState()]);
  const sidoFeats = feature(sidoTopo, sidoTopo.objects.sido).features;
  registerPlaces({ countries: list, sido: sidoFeats.map(f => ({ ...f.properties, ll: geoCentroid(f) })) });

  // 목록 패널 행(국가는 이름순, 한국은 17칸 순서)
  const byName = (a, b) => a.name.localeCompare(b.name, 'ko');
  const worldRows = baseSearchItems().filter(i => isCountry(i.placeId)).sort(byName);
  const koreaRows = KR_SIDO.map(code => baseSearchItems().find(i => i.placeId === sidoId(code)));

  // 위쪽 검색: 처음 누를 때 도시·시군구를 불러오고, 다 불러오면 결과를 다시 계산
  const searchBox = attachCombobox($('searchInput'), $('searchList'), {
    getItems: allSearchItems,
    emptyText: '찾는 곳이 없어요. 영어 이름으로도 찾아보세요.',
    onOpen: () => loadCityItems().then(() => searchBox.refresh()),
    onSelect: it => focusPlace(it.placeId),
  });

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
  initTripForm({ onDeleted: () => { if (route === 'trips') renderTrips(); } });
  initWishForm();
  const openTrip = opts => openTripForm({ onSaved: afterTripSaved, ...opts });
  initPlaceDetail({ classFor, openTripForm: openTrip, openWishForm, goTrip });
  initTrips({ classFor, openTripForm: openTrip, openPlace: openPlaceDetail, startTimelapse: async () => { location.hash = '#home'; await go('home'); startTimelapse(); } });
  initTimelapse({ redraw: () => current?.redraw() });
  initWish({ classFor, openWishForm, openTripForm: openTrip, openPlace: openPlaceDetail });
  initStats({ openPlace: openPlaceDetail, goTrip });
  initShare();
  initMilestone();
  initAiSettings();
  initAi({ classFor, statusText, openPlace: openPlaceDetail, openSettings: () => { if (!$('settingsPanel').hidden) return; $('settingsBtn').click(); } });
  refreshPrices({ quiet: true });   // 모델 단가(키 필요 없음)

  $('listBtn').addEventListener('click', () => { openPanel('listPanel'); renderListPanel(); });
  $('settingsBtn').addEventListener('click', () => openPanel('settingsPanel'));

  // 빈 상태 카드
  $('emptyPaint').addEventListener('click', () => { $('quickPaint').checked = true; document.body.classList.add('quick-paint'); session.set('va-empty-closed'); updateEmpty(); toast('빠른 색칠을 켰어요. 다녀온 나라를 차례로 눌러 보세요.'); });
  $('emptyImport').addEventListener('click', () => pickRestoreFile('overwrite'));
  $('emptyClose').addEventListener('click', () => { session.set('va-empty-closed'); updateEmpty(); });

  subscribe((s, meta) => {
    current?.redraw();
    if (colorBy === 'year') renderLegends();
    renderHuds(true);
    renderDream();
    renderListPanel();
    updateEmpty();
    // 팝오버가 열린 채로 상태가 바뀌면(위시·경유) 같은 자리에서 내용만 새로 그림
    const t = popoverTarget();
    if (t && popScreen) openPopover(t, popScreen, popoverView(t.placeId));
    if (meta.reason === 'restore' || meta.reason === 'reset') current?.reset();
    if (route !== 'home') renderRoute();
    // 메모를 쓰는 중에는 다시 그리지 않음(커서가 사라지지 않도록)
    if (placeDetailOpen() && meta.reason !== 'note') renderPlaceDetail();
    if (meta.reason !== 'achievement') queueMicrotask(() => checkBadges(meta));
  });
  onSettings(() => {
    checkBadges({ quiet: true });
    renderHuds(false);
    if (current?.view !== 'globe') current?.land.attr('filter', motionReduced() ? null : 'url(#grain)');
    if (route !== 'home') renderRoute();
  });

  renderLegends();
  checkBadges();          // 이미 달성해 있던 배지는 조용히 기록
  badgesReady = true;
  renderHuds(false);
  updateEmpty();
  addEventListener('hashchange', () => go(location.hash.slice(1)));
  await go(location.hash.slice(1));
}

$('viewSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]');
  if (b && !b.disabled && VIEWS[b.dataset.view] && b.dataset.view !== viewName) show(b.dataset.view);
});
$('unitSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-unit]');
  if (b && b.dataset.unit !== krUnit) { setUnit(b.dataset.unit); show('korea'); }
});
for (const id of ['legendWorld', 'legendKorea']) $(id).addEventListener('change', e => { if (e.target.matches('[data-colorby]')) setColorBy(e.target.value); });
$('zIn').onclick = () => current?.zoomBy(1.6);
$('zOut').onclick = () => current?.zoomBy(1 / 1.6);
$('zReset').onclick = () => current?.reset();
$('quickPaint').addEventListener('change', e => { closePopover(); document.body.classList.toggle('quick-paint', e.target.checked); });

// 아직 만들지 않은 화면(준비 중) 탭은 이동하지 않습니다.
document.querySelectorAll('#tabbar a[aria-disabled="true"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); toast(`${a.textContent.trim()} 화면은 다음 단계에서 열려요.`); }));

let rz, lastW = innerWidth, lastH = innerHeight;
addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    drawSky();
    // 휴대폰 주소창이 접힐 때처럼 높이만 조금 바뀌면 다시 그리지 않습니다(팝오버가 닫히지 않게).
    const changed = innerWidth !== lastW || Math.abs(innerHeight - lastH) > 120;
    lastW = innerWidth; lastH = innerHeight;
    if (!changed) return;
    if (route === 'home') show(viewName); else renderRoute();
  }, 200);
});

drawSky();
start().catch(err => { console.error(err); toast('앱을 시작하지 못했어요. 새로 고침해 주세요.'); });
