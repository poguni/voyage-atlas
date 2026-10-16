// 3D 시네마틱 지구본(PRD F1-12, P2): globe.gl(Three.js 포함, 약 1.9MB)을 버튼을 누를 때만 불러옵니다.
// 별 하늘(#sky) 위에 투명 배경으로 그리고, 나라는 방문 단계 색으로 살짝 솟아오르며, 홈 공항에서 다녀온 곳까지
// 금빛 비행 궤적이 흐릅니다. [▶ 여정 투어]를 누르면 여행을 처음부터 차례로 찾아갑니다.
// 3D 글자(three-text)는 한글을 그리지 못해, 도시·위시 이름은 HTML 요소로 겹쳐 그립니다.
import { feature } from 'topojson-client';
import { loadJSON } from '../data.js';
import { getState } from '../store.js';
import { visitCount, tripStarted, isDomestic, visitedCities, todayStr, isWished } from '../stats.js';
import { placeInfo } from '../places.js';
import { HOME_AIRPORT } from './mini.js';
import { motionReduced } from '../settings.js';
import { fmtRange } from '../format.js';
import { esc } from '../env.js';

const LIB = 'https://cdn.jsdelivr.net/npm/globe.gl@2.46.2/dist/globe.gl.min.js';
const TOUR_STEP = 3600;      // 여행 하나를 보여 주는 시간(ms)
const MAX_NAMES = 40;        // 이름을 붙이는 도시 수(많이 간 순)
const $ = id => document.getElementById(id);

let lib = null, globe = null, tour = null, returnFocus = null, onResize = null;

function loadLib() {
  if (window.Globe) return Promise.resolve(window.Globe);
  lib ??= new Promise((ok, fail) => {
    const s = Object.assign(document.createElement('script'), { src: LIB, crossOrigin: 'anonymous', async: true });
    s.onload = () => ok(window.Globe);
    s.onerror = () => { lib = null; s.remove(); fail(new Error('globe.gl')); };
    document.head.append(s);
  });
  return lib;
}

const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

// 지금 기록 → 3D에 올릴 것들
function scene(features) {
  const s = getState(), today = todayStr();
  const lv = [css('--v1'), css('--v2'), css('--v3'), css('--v4')];
  const home = HOME_AIRPORT;
  const levelOf = f => Math.min(4, visitCount(s, `country:${f.id}`, today));
  const llOf = id => placeInfo(id).ll ?? null;
  const trips = s.trips.filter(t => tripStarted(t, today) && t.start).sort((a, b) => a.start.localeCompare(b.start));
  const arcs = [], stops = [];
  for (const t of trips) {
    const pts = (t.stops ?? []).map(x => llOf(x.placeId)).filter(Boolean);
    if (!pts.length) continue;
    const domestic = isDomestic(t, s.places);
    const seq = domestic ? pts : [home.ll, ...pts, home.ll];
    for (let i = 1; i < seq.length; i++) arcs.push({ tripId: t.id, a: seq[i - 1], b: seq[i] });
    stops.push({ trip: t, pts, domestic });
  }
  const cities = [...visitedCities(s, 'city', today), ...visitedCities(s, 'kr-sigungu', today)]
    .map(c => ({ ...c, info: placeInfo(c.placeId) })).filter(c => c.info.ll).sort((a, b) => b.count - a.count);
  const wishes = s.wishlist.filter(w => !w.doneAt && isWished(s, w.placeId) && !visitCount(s, w.placeId, today))
    .map(w => ({ placeId: w.placeId, info: placeInfo(w.placeId) })).filter(w => w.info.ll);
  return { features, levelOf, lv, home, arcs, stops, cities, wishes };
}

function marker(cls, text) {
  const el = document.createElement('div');
  el.className = `g3-mark ${cls}`;
  el.innerHTML = cls === 'wish'
    ? `<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0-11C1.2-3.5 3.5-1.2 11 0 3.5 1.2 1.2 3.5 0 11-1.2 3.5-3.5 1.2-11 0-3.5-1.2-1.2-3.5 0-11Z"/></svg><span>${esc(text)}</span>`
    : `<i></i><span>${esc(text)}</span>`;
  return el;
}

function build(Globe, el, sc) {
  const reduced = motionReduced();
  const gold = css('--gold') || '#E8C98A';
  let active = null;   // 투어 중인 여행
  const arcColor = a => (active && a.tripId !== active ? ['rgba(232,201,138,.12)', 'rgba(232,201,138,.06)'] : [hexA('#F6DFAE', 0.95), hexA(gold, 0.55)]);
  const g = new Globe(el, { animateIn: !reduced, rendererConfig: { antialias: true, alpha: true } })
    .width(el.clientWidth).height(el.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .showGraticules(true)
    .showAtmosphere(true).atmosphereColor('#6CB8FF').atmosphereAltitude(0.2)
    .polygonsData(sc.features)
    .polygonCapColor(f => { const n = sc.levelOf(f); return n ? hexA(sc.lv[n - 1], 0.92) : 'rgba(142,118,70,.55)'; })
    .polygonSideColor(f => (sc.levelOf(f) ? 'rgba(246,223,174,.25)' : 'rgba(142,118,70,.15)'))
    .polygonStrokeColor(() => 'rgba(246,223,174,.4)')
    .polygonAltitude(f => { const n = sc.levelOf(f); return n ? 0.008 + n * 0.006 : 0.004; })
    .polygonLabel(f => { const p = placeInfo(`country:${f.id}`), n = sc.levelOf(f); return `<div class="g3-tip"><b>${esc(p.name)}</b><br>${n ? `방문 ${visitCount(getState(), `country:${f.id}`)}회` : '미방문'}</div>`; })
    .polygonsTransitionDuration(reduced ? 0 : 800)
    .arcsData(sc.arcs)
    .arcStartLng(a => a.a[0]).arcStartLat(a => a.a[1]).arcEndLng(a => a.b[0]).arcEndLat(a => a.b[1])
    .arcColor(arcColor).arcStroke(0.55).arcAltitudeAutoScale(0.42)
    .arcDashLength(0.5).arcDashGap(0.18).arcDashInitialGap(() => Math.random()).arcDashAnimateTime(reduced ? 0 : 2800)
    .pointsData(sc.cities).pointLng(c => c.info.ll[0]).pointLat(c => c.info.ll[1])
    .pointColor(() => '#F6DFAE').pointAltitude(0.018).pointRadius(c => 0.18 + Math.min(c.count, 4) * 0.05).pointsMerge(true)
    .ringsData([{ ll: sc.home.ll, home: true }]).ringLng(r => r.ll[0]).ringLat(r => r.ll[1])
    .ringColor(r => (r.home ? t => `rgba(46,196,182,${1 - t})` : t => `rgba(255,209,102,${1 - t})`))
    .ringMaxRadius(r => (r.home ? 3.2 : 2.2)).ringPropagationSpeed(1.6).ringRepeatPeriod(reduced ? 0 : 1600)
    .htmlElementsData([
      { kind: 'home', ll: sc.home.ll, text: sc.home.code },
      ...sc.cities.slice(0, MAX_NAMES).map(c => ({ kind: 'city', ll: c.info.ll, text: c.info.name })),
      ...sc.wishes.map(w => ({ kind: 'wish', ll: w.info.ll, text: w.info.name })),
    ])
    .htmlLng(d => d.ll[0]).htmlLat(d => d.ll[1]).htmlAltitude(d => (d.kind === 'wish' ? 0.05 : 0.025))
    .htmlElement(d => marker(d.kind, d.text));
  const mat = g.globeMaterial();
  mat.color?.set('#0B1235'); mat.emissive?.set('#070B1F'); mat.shininess = 8;
  const c = g.controls();
  c.autoRotate = !reduced; c.autoRotateSpeed = 0.35;
  c.enableDamping = true;
  g.pointOfView({ lng: sc.home.ll[0], lat: sc.home.ll[1] - 8, altitude: 2.3 }, reduced ? 0 : 1200);
  // 투어: 고른 여행의 궤적만 밝게, 경유지에는 금빛 물결
  g.setActive = (id, pts = []) => {
    active = id;
    g.arcColor(arcColor);
    g.ringsData([{ ll: sc.home.ll, home: true }, ...pts.map(ll => ({ ll }))]);
  };
  return g;
}

// ---------- 여정 투어 ----------
function caption(html) {
  const el = $('cinemaCaption');
  el.hidden = !html;
  if (html) el.innerHTML = html;
}

function stopTour() {
  if (!tour) return;
  clearTimeout(tour.timer);
  tour = null;
  globe?.setActive(null);
  if (globe) globe.controls().autoRotate = !motionReduced();
  caption('');
  $('cinemaTour').textContent = '▶ 여정 투어';
}

function startTour(sc) {
  if (!sc.stops.length) return caption('여행을 기록하면 지나온 여정을 차례로 따라가요.');
  const reduced = motionReduced();
  globe.controls().autoRotate = false;
  $('cinemaTour').textContent = '■ 투어 멈추기';
  tour = { i: 0, timer: 0 };
  const step = () => {
    if (!tour) return;
    if (tour.i >= sc.stops.length) {
      globe.pointOfView({ lng: sc.home.ll[0], lat: sc.home.ll[1] - 8, altitude: 2.4 }, reduced ? 0 : 2200);
      return void (tour.timer = setTimeout(stopTour, reduced ? 1500 : 2400));
    }
    const { trip, pts, domestic } = sc.stops[tour.i];
    const lng = pts.reduce((a, p) => a + p[0], 0) / pts.length, lat = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    globe.setActive(trip.id, pts);
    globe.pointOfView({ lng, lat, altitude: domestic ? 0.55 : 1.25 }, reduced ? 0 : 1800);
    const names = (trip.stops ?? []).map(x => placeInfo(x.placeId).name).join(' → ');
    caption(`<span class="mono g3-year">${esc(trip.start.slice(0, 4))} · ${tour.i + 1}/${sc.stops.length}</span><b>${esc(trip.title || '여행')}</b><small>${esc(fmtRange(trip))} · ${esc(names)}</small>`);
    tour.i++;
    tour.timer = setTimeout(step, TOUR_STEP);
  };
  step();
}

// ---------- 열기·닫기 ----------
export async function openCinema({ summary = '' } = {}) {
  returnFocus = document.activeElement;
  const box = $('cinema'), el = $('cinemaGlobe');
  box.hidden = false;
  $('cinemaSub').textContent = summary;
  $('cinemaTour').disabled = true;
  caption('');
  $('cinemaClose').focus();
  const status = $('cinemaStatus');
  if (!webgl()) { status.textContent = '이 기기·브라우저는 3D 그래픽(WebGL)을 지원하지 않아요.'; return; }
  status.textContent = '3D 지구본을 불러오는 중…';
  try {
    // 50m 지도: 제주도 같은 작은 섬까지 보이도록(지도 홈에서 이미 받아 둔 파일)
    const [Globe, topo] = await Promise.all([loadLib(), loadJSON('data/countries-50m.json')]);
    if (box.hidden) return;   // 불러오는 사이에 닫음
    const sc = scene(feature(topo, topo.objects.countries).features.filter(f => f.id !== '010'));   // 남극 제외
    globe = build(Globe, el, sc);
    status.textContent = '';
    $('cinemaTour').disabled = false;
    $('cinemaTour').onclick = () => (tour ? stopTour() : startTour(sc));
    // 사용자가 지구본을 직접 움직이면 투어를 멈춤
    el.onpointerdown = () => { if (tour) stopTour(); };
    onResize = () => globe?.width(el.clientWidth).height(el.clientHeight);
    addEventListener('resize', onResize);
  } catch (err) {
    console.error(err);
    status.textContent = navigator.onLine ? '3D 지구본을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.' : '오프라인이에요. 3D 지구본은 한 번 인터넷에 연결된 상태에서 열어야 기기에 저장돼요.';
  }
}

export function closeCinema() {
  const box = $('cinema');
  if (box.hidden) return;
  stopTour();
  box.hidden = true;
  if (onResize) removeEventListener('resize', onResize);
  onResize = null;
  if (globe) {
    globe.pauseAnimation();
    globe._destructor?.();
    globe = null;
  }
  $('cinemaGlobe').replaceChildren();
  if (returnFocus?.isConnected) returnFocus.focus();
}

export const cinemaOpen = () => !$('cinema').hidden;

export function initCinema(getSummary) {
  $('cinemaBtn').addEventListener('click', () => openCinema({ summary: getSummary() }));
  $('cinemaClose').addEventListener('click', closeCinema);
  $('cinema').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeCinema(); } });
}
