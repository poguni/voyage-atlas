// 공유 스튜디오(시안 08, PRD F8-1~F8-10): 템플릿 → 크기 → 테마·표시 옵션 → 미리 보기 → PNG 저장·바로 공유
// 저장 이미지는 미리 만들어 두어, 버튼을 누르자마자 공유 창을 엽니다(iOS는 누른 직후에만 공유 창을 허용).
import { feature } from 'topojson-client';
import { getState } from '../store.js';
import { settings } from '../settings.js';
import { loadJSON } from '../data.js';
import { countryList, sidoList, placeInfo } from '../places.js';
import { tripYears, todayStr } from '../stats.js';
import { fmtRange } from '../format.js';
import { HOME_AIRPORT } from '../map/mini.js';
import {
  worldModel, koreaModel, yearModel, tripModel, cardTrips, parseSize, exportSize, TEMPLATES,
} from '../share/model.js';
import { drawPoster, ensureFonts } from '../share/poster.js';
import { toast } from '../ui/toast.js';
import { esc } from '../env.js';

const $ = id => document.getElementById(id);
const KEY = 'va-share';
// year: 올해의 여정 연도, trip: 여행 카드의 여행 ID(없으면 가장 최근 여행)
const opt = { tpl: 'world', size: '1080x1350', theme: 'night', nums: true, dates: false, mark: true, title: {}, name: '', year: null, trip: null };
try { Object.assign(opt, JSON.parse(localStorage.getItem(KEY)) ?? {}); } catch { /* 무시 */ }
if (!TEMPLATES[opt.tpl]) opt.tpl = 'world';

let seq = 0;
let job = null;       // { seq, blob: Promise<Blob> } 지금 미리 보기와 같은 저장 이미지
let exportTimer = null;
let typing = null;

const saveOpt = () => { try { localStorage.setItem(KEY, JSON.stringify(opt)); } catch { /* 무시 */ } };

// 지도 모양(한 번만 불러옴)
const geo = {
  world: () => loadJSON('data/countries-50m.json').then(t => ({
    features: feature(t, t.objects.countries).features,
    markers: countryList().filter(c => c.marker),
  })),
  korea: () => loadJSON('data/korea-sido.json').then(t => ({ features: feature(t, t.objects.sido).features })),
};
geo.year = geo.world;
geo.trip = () => Promise.all([geo.world(), geo.korea()]).then(([world, korea]) => ({ world, korea }));

function pressed(groupId, attr, value) {
  $(groupId).querySelectorAll(`button[${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)));
}

export function initShare() {
  $('shTpl').addEventListener('click', e => {
    const b = e.target.closest('button[data-tpl]');
    if (!b || b.disabled) return;
    opt.tpl = b.dataset.tpl; changed();
  });
  $('shSize').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) { opt.size = b.dataset.v; changed(); } });
  $('shTheme').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) { opt.theme = b.dataset.v; changed(); } });
  for (const [id, k] of [['shNums', 'nums'], ['shDates', 'dates'], ['shMark', 'mark']]) $(id).addEventListener('change', e => { opt[k] = e.target.checked; changed(); });
  // 글자를 입력하는 동안에는 잠깐 기다렸다가 다시 그림
  $('shTitleIn').addEventListener('input', e => { opt.title[opt.tpl] = e.target.value.trim(); debounced(); });
  $('shName').addEventListener('input', e => { opt.name = e.target.value.trim(); debounced(); });
  $('shPick').addEventListener('change', e => {
    if (opt.tpl === 'year') opt.year = +e.target.value; else opt.trip = e.target.value;
    changed();
  });
  $('shSave').addEventListener('click', save);
  $('shShare').addEventListener('click', share);
}

function debounced() { clearTimeout(typing); typing = setTimeout(changed, 250); }
function changed() { saveOpt(); renderShare(); }

const fileName = () => `voyage-atlas-${opt.tpl}-${opt.size}.png`;

// 올해의 여정·여행 카드에서 고를 수 있는 것(연도 / 여행)
const pickYears = s => { const ys = tripYears(s); const now = +todayStr().slice(0, 4); return ys.length ? ys : [now]; };
const pickedYear = s => (pickYears(s).includes(opt.year) ? opt.year : pickYears(s)[0]);
const pickedTrip = s => { const list = cardTrips(s); return list.find(t => t.id === opt.trip) ?? list.find(t => t.start && t.start <= todayStr()) ?? list[0] ?? null; };
const infoOf = id => { const p = placeInfo(id); return p.ll ? { name: p.name, ll: p.ll } : null; };

function modelFor(s) {
  const home = { code: HOME_AIRPORT.code, ll: HOME_AIRPORT.ll };
  if (opt.tpl === 'korea') return koreaModel(s, sidoList());
  if (opt.tpl === 'year') return yearModel(s, countryList(), { year: pickedYear(s), home, infoOf });
  if (opt.tpl === 'trip') {
    const trip = pickedTrip(s);
    if (trip) return tripModel(s, countryList(), { trip, home, infoOf });
  }
  return { ...worldModel(s, countryList(), { includeTransit: settings.includeTransit }), ...(opt.tpl === 'trip' ? { empty: true } : {}) };
}

// 지금 옵션으로 그릴 내용과 글자
function current() {
  const s = getState(), [W, H] = parseSize(opt.size), t = TEMPLATES[opt.tpl];
  const model = modelFor(s);
  const o = { W, H, theme: opt.theme, nums: opt.nums, dates: opt.dates, mark: opt.mark, title: opt.title[opt.tpl] || model.title || t.title, eyebrow: t.eyebrow, name: opt.name };
  const texts = [o.title, o.eyebrow, model.dates, model.big, model.bigLabel, model.summary, o.name, '독도 ✦ VOYAGE ATLAS 0123456789/…→',
    ...(model.rows ?? []).map(r => r.label), ...(model.chips ?? []).map(c => c.label),
    ...(model.facts ?? []).flatMap(f => [f.label, f.value]), ...(model.lines ?? []), ...(model.stops ?? []).map(x => x.label)];
  return { model, o, texts };
}

// 여행 카드는 국내 여행이면 한국 지도
const geoOf = (g, model) => (opt.tpl === 'trip' ? g[model.kind] : g);

// 연도·여행 고르기(올해의 여정·여행 카드에서만)
function renderPick(s) {
  const show = opt.tpl === 'year' || opt.tpl === 'trip';
  $('shPickWrap').hidden = !show;
  if (!show) return;
  const sel = $('shPick');
  if (opt.tpl === 'year') {
    $('shPickLabel').textContent = '연도';
    const y = pickedYear(s);
    sel.innerHTML = pickYears(s).map(v => `<option value="${v}"${v === y ? ' selected' : ''}>${v}년</option>`).join('');
  } else {
    $('shPickLabel').textContent = '여행';
    const list = cardTrips(s), cur = pickedTrip(s);
    sel.innerHTML = list.length
      ? list.map(t => `<option value="${esc(t.id)}"${t === cur ? ' selected' : ''}>${esc(t.title || '여행')} · ${esc(fmtRange(t))}</option>`).join('')
      : '<option>기록한 여행이 없어요</option>';
  }
  sel.disabled = opt.tpl === 'trip' && !cardTrips(s).length;
}

export async function renderShare() {
  // 화면 컨트롤을 옵션과 맞춤
  pressed('shTpl', 'data-tpl', opt.tpl);
  pressed('shSize', 'data-v', opt.size);
  pressed('shTheme', 'data-v', opt.theme);
  $('shNums').checked = opt.nums; $('shDates').checked = opt.dates; $('shMark').checked = opt.mark;
  const titleIn = $('shTitleIn');
  renderPick(getState());
  if (document.activeElement !== titleIn) titleIn.value = opt.title[opt.tpl] ?? '';
  if (document.activeElement !== $('shName')) $('shName').value = opt.name;

  const my = ++seq;
  job = null;
  clearTimeout(exportTimer);
  const { model, o, texts } = current();
  titleIn.placeholder = model.title || TEMPLATES[opt.tpl].title;
  const [g] = await Promise.all([geo[opt.tpl](), ensureFonts(texts)]);
  if (my !== seq) return;
  const canvas = $('shCanvas');
  drawPoster(canvas, model, geoOf(g, model), { ...o, scale: 1 });
  canvas.setAttribute('aria-label', `공유 포스터 미리 보기: ${o.title}, ${model.big}${model.bigLabel}`);
  const [pw, ph] = exportSize(opt.size);
  $('shInfo').textContent = model.empty ? '여행을 기록하면 여행 카드를 만들 수 있어요. 지금은 월드 포스터로 보여 줘요.'
    : `저장 크기 ${pw}×${ph}px ${opt.size === 'a3' ? '(A3 297×420mm, 300dpi)' : '(2배 해상도)'}`;
  // 미리 보기가 멈추면 저장 이미지를 미리 만들어 둠
  exportTimer = setTimeout(() => { if (my === seq) job = { seq: my, blob: makeBlob(model, g, o) }; }, 500);
}

// 캔버스 최대 넓이(iOS Safari 약 1,677만 px). A3 300dpi(1,740만 px)가 안 되면 이 넓이에 맞춰 조금 줄여 저장합니다.
const MAX_AREA = 16777216;
function render(model, g, o, px) {
  const c = document.createElement('canvas');
  drawPoster(c, model, geoOf(g, model), { ...o, scale: px[0] / o.W, px });
  return new Promise(ok => c.toBlob(ok, 'image/png'));
}
async function makeBlob(model, g, o) {
  const px = exportSize(opt.size);
  let blob = await render(model, g, o, px);
  if (!blob && px[0] * px[1] > MAX_AREA) {
    const k = Math.sqrt(MAX_AREA / (px[0] * px[1])) * 0.99;
    blob = await render(model, g, o, px.map(v => Math.floor(v * k)));
  }
  if (!blob) throw new Error('PNG를 만들지 못했어요');
  return blob;
}

async function blobNow() {
  if (job?.seq === seq) return job.blob;
  clearTimeout(exportTimer);
  const { model, o, texts } = current();
  const [g] = await Promise.all([geo[opt.tpl](), ensureFonts(texts)]);
  job = { seq, blob: makeBlob(model, g, o) };
  return job.blob;
}

function download(blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function save() {
  try {
    download(await blobNow());
    toast('⤓ PNG를 저장했어요');
  } catch (err) { console.error(err); toast('이미지를 만들지 못했어요. 다시 시도해 주세요.'); }
}

// 바로 공유(F8-9): 파일 공유를 지원하면 공유 창, 아니면 PNG 저장으로 대신함
async function share() {
  let blob;
  try { blob = await blobNow(); } catch (err) { console.error(err); return toast('이미지를 만들지 못했어요. 다시 시도해 주세요.'); }
  const file = new File([blob], fileName(), { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); }
    catch (err) {
      if (err.name === 'AbortError') return;   // 사용자가 공유 창을 닫음
      if (err.name === 'NotAllowedError') return toast('공유 창을 열지 못했어요. 한 번 더 눌러 주세요.');
      console.error(err);
      download(blob);
      toast('공유하지 못해 PNG로 저장했어요');
    }
    return;
  }
  download(blob);
  toast('이 브라우저는 바로 공유를 지원하지 않아 PNG로 저장했어요');
}
