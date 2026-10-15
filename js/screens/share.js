// 공유 스튜디오(시안 08, PRD F8-1~F8-10): 템플릿 → 크기 → 테마·표시 옵션 → 미리 보기 → PNG 저장·바로 공유
// 저장 이미지는 미리 만들어 두어, 버튼을 누르자마자 공유 창을 엽니다(iOS는 누른 직후에만 공유 창을 허용).
import { feature } from 'topojson-client';
import { getState } from '../store.js';
import { settings } from '../settings.js';
import { loadJSON } from '../data.js';
import { countryList, sidoList } from '../places.js';
import { worldModel, koreaModel, parseSize, TEMPLATES, EXPORT_SCALE } from '../share/model.js';
import { drawPoster, ensureFonts } from '../share/poster.js';
import { toast } from '../ui/toast.js';

const $ = id => document.getElementById(id);
const KEY = 'va-share';
const opt = { tpl: 'world', size: '1080x1350', theme: 'night', nums: true, dates: false, mark: true, title: {}, name: '' };
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
  $('shSave').addEventListener('click', save);
  $('shShare').addEventListener('click', share);
}

function debounced() { clearTimeout(typing); typing = setTimeout(changed, 250); }
function changed() { saveOpt(); renderShare(); }

const fileName = () => `voyage-atlas-${opt.tpl}-${opt.size}.png`;

// 지금 옵션으로 그릴 내용과 글자
function current() {
  const s = getState(), [W, H] = parseSize(opt.size), t = TEMPLATES[opt.tpl];
  const model = opt.tpl === 'korea' ? koreaModel(s, sidoList()) : worldModel(s, countryList(), { includeTransit: settings.includeTransit });
  const o = { W, H, theme: opt.theme, nums: opt.nums, dates: opt.dates, mark: opt.mark, title: opt.title[opt.tpl] || t.title, eyebrow: t.eyebrow, name: opt.name };
  const texts = [o.title, o.eyebrow, model.dates, model.big, model.bigLabel, model.summary, o.name, '독도 ✦ VOYAGE ATLAS 0123456789/',
    ...(model.rows ?? []).map(r => r.label), ...(model.chips ?? []).map(c => c.label)];
  return { model, o, texts };
}

export async function renderShare() {
  // 화면 컨트롤을 옵션과 맞춤
  pressed('shTpl', 'data-tpl', opt.tpl);
  pressed('shSize', 'data-v', opt.size);
  pressed('shTheme', 'data-v', opt.theme);
  $('shNums').checked = opt.nums; $('shDates').checked = opt.dates; $('shMark').checked = opt.mark;
  const titleIn = $('shTitleIn');
  titleIn.placeholder = TEMPLATES[opt.tpl].title;
  if (document.activeElement !== titleIn) titleIn.value = opt.title[opt.tpl] ?? '';
  if (document.activeElement !== $('shName')) $('shName').value = opt.name;

  const my = ++seq;
  job = null;
  clearTimeout(exportTimer);
  const { model, o, texts } = current();
  const [g] = await Promise.all([geo[opt.tpl](), ensureFonts(texts)]);
  if (my !== seq) return;
  const canvas = $('shCanvas');
  drawPoster(canvas, model, g, { ...o, scale: 1 });
  canvas.setAttribute('aria-label', `공유 포스터 미리 보기: ${o.title}, ${model.big}${model.bigLabel}`);
  $('shInfo').textContent = `저장 크기 ${o.W * EXPORT_SCALE}×${o.H * EXPORT_SCALE}px (2배 해상도)`;
  // 미리 보기가 멈추면 저장 이미지를 미리 만들어 둠
  exportTimer = setTimeout(() => { if (my === seq) job = { seq: my, blob: makeBlob(model, g, o) }; }, 500);
}

function makeBlob(model, g, o) {
  const c = document.createElement('canvas');
  drawPoster(c, model, g, { ...o, scale: EXPORT_SCALE });
  return new Promise((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error('PNG를 만들지 못했어요'))), 'image/png'));
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
