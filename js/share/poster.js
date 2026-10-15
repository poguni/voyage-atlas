// 공유 포스터 그리기(PRD 10.4): 지도는 d3.geoPath를 Canvas에 바로 그리고, 글자는 Canvas fillText로 그립니다.
// SVG → 이미지 변환을 거치지 않으므로 웹 글꼴(한글)이 빠지지 않습니다. 글꼴은 그리기 전에 ensureFonts로 불러옵니다.
import * as d3 from 'd3';
import { POSTER_THEMES, posterLayout } from './model.js';
import { DOKDO } from '../map/korea.js';

const F = 'Fraunces, "Noto Serif KR", serif';
const S = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const MO = '"JetBrains Mono", ui-monospace, monospace';
const STAR = new Path2D('M0-11C1.2-3.5 3.5-1.2 11 0 3.5 1.2 1.2 3.5 0 11-1.2 3.5-3.5 1.2-11 0-3.5-1.2-1.2-3.5 0-11Z');
const MARK = '✦ VOYAGE ATLAS';

// 포스터에 쓰는 글자를 글꼴마다 미리 불러옵니다(한글 글꼴은 글자 범위별로 나뉘어 있어 실제 글자를 넘김).
export async function ensureFonts(texts) {
  if (!document.fonts?.load) return;
  const all = texts.filter(Boolean).join(' ');
  const fonts = ['700 72px Fraunces', '800 150px Fraunces', '700 72px "Noto Serif KR"', '600 30px "Pretendard Variable"', '400 22px "JetBrains Mono"'];
  try { await Promise.all(fonts.map(f => document.fonts.load(f, all))); } catch { /* 불러오지 못하면 대체 글꼴로 그림 */ }
  await document.fonts.ready;
}

function spacing(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; }

// 너비를 넘으면 글자 크기를 줄입니다.
function fitFont(ctx, text, weight, size, family, maxW) {
  let px = size;
  ctx.font = `${weight} ${px}px ${family}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) { px = Math.max(size * 0.5, size * maxW / w); ctx.font = `${weight} ${px}px ${family}`; }
}

function text(ctx, str, x, y, { font, color, align = 'left', ls = 0, alpha = 1 }) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.globalAlpha = alpha;
  spacing(ctx, ls);
  ctx.fillText(str, x, y);
  spacing(ctx, 0); ctx.globalAlpha = 1;
}

function pill(ctx, x, y, w, h) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
}

/**
 * @param canvas  그릴 캔버스(크기는 여기서 W·H × scale로 맞춤)
 * @param model   worldModel / koreaModel 결과
 * @param geo     { features, markers(작은 나라: { id, ll }) }
 * @param o       { W, H, scale, theme, nums, dates, mark, title, eyebrow, name }
 */
export function drawPoster(canvas, model, geo, o) {
  const { W, H, scale = 1 } = o, T = POSTER_THEMES[o.theme];
  const L = posterLayout(W, H, { nums: o.nums });
  const { s, M } = L;
  canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = 'alphabetic';

  // 배경 + 별 120개 + 안쪽 금빛 액자선
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, T.bg0); bg.addColorStop(1, T.bg1);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (T.stars) {
    let sd = 7; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 120; i++) {
      const x = rnd() * W, y = rnd() * H, r = rnd() * 1.6 + 0.3;
      ctx.globalAlpha = rnd() * 0.6 + 0.2;
      ctx.beginPath(); ctx.arc(x, y, r * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = T.accent; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5 * s;
  ctx.strokeRect(M * 0.35, M * 0.35, W - M * 0.7, H - M * 0.7);
  ctx.globalAlpha = 1;

  // 위: eyebrow(날짜 또는 VOYAGE ATLAS) → 제목
  text(ctx, (o.dates && model.dates) || o.eyebrow, L.tx, L.eyebrowY, { font: `400 ${22 * s}px ${MO}`, color: T.accent, align: L.align, ls: 6 * s });
  fitFont(ctx, o.title, 700, 72 * s, F, L.titleMaxW);
  text(ctx, o.title, L.tx, L.titleY, { font: ctx.font, color: T.text, align: L.align });

  drawMap(ctx, model, geo, L, T);

  // 아래: 큰 숫자 + 설명 → 대륙 막대(또는 시도 칩) → 요약 한 줄
  if (o.nums) {
    const { big, rows } = L;
    text(ctx, model.big, L.tx, big.y, { font: `800 ${big.size}px ${F}`, color: T.accent, align: L.align });
    text(ctx, model.bigLabel, L.tx, big.labelY, { font: `600 ${30 * s}px ${S}`, color: T.dim, align: L.align });
    if (model.rows) drawBars(ctx, model.rows, rows, s, T);
    if (model.chips) drawChips(ctx, model.chips, rows, s, T);
    text(ctx, model.summary, L.tx, L.summaryY, { font: `600 ${26 * s}px ${S}`, color: T.text, align: L.align });
  }
  if (o.name) text(ctx, o.name, M, L.markY, { font: `600 ${20 * s}px ${S}`, color: T.dim, alpha: 0.9 });
  if (o.mark) text(ctx, MARK, W - M, L.markY, { font: `400 ${18 * s}px ${MO}`, color: T.dim, align: 'right', ls: 3 * s, alpha: 0.8 });
}

function drawMap(ctx, model, geo, L, T) {
  const { s } = L;
  const korea = model.kind === 'korea';
  const fit = { type: 'FeatureCollection', features: korea ? [...geo.features, { type: 'Feature', geometry: { type: 'Point', coordinates: DOKDO } }] : geo.features };
  const proj = (korea ? d3.geoMercator() : d3.geoNaturalEarth1()).fitExtent(L.mapBox, fit);
  const path = d3.geoPath(proj, ctx);
  const [[x0, y0], [x1, y1]] = L.mapBox;
  const land = ctx.createLinearGradient(x0, y0, x1, y1);
  land.addColorStop(0, T.land0); land.addColorStop(1, T.land1);
  const lvOf = f => model.levels.get(korea ? f.properties.code : f.id) ?? 0;

  ctx.lineJoin = 'round';
  ctx.strokeStyle = T.edge; ctx.lineWidth = (korea ? 1.2 : 0.7) * s;
  for (const f of geo.features) {
    const lv = lvOf(f);
    ctx.beginPath(); path(f);
    ctx.fillStyle = lv ? T.lv[lv - 1] : land; ctx.fill(); ctx.stroke();
  }

  // 지도에서 너무 작은 나라(싱가포르 등)는 방문했을 때 원으로 표시
  for (const c of geo.markers ?? []) {
    const lv = model.levels.get(c.id);
    if (!lv) continue;
    const [x, y] = proj(c.ll);
    ctx.beginPath(); ctx.arc(x, y, 5 * s, 0, Math.PI * 2);
    ctx.fillStyle = T.lv[lv - 1]; ctx.fill(); ctx.stroke();
  }

  // 독도(PRD 8.4): 경상북도와 같은 색 원 + 라벨
  if (korea) {
    const [x, y] = proj(DOKDO), lv = model.levels.get('47') ?? 0;
    ctx.beginPath(); ctx.arc(x, y, 7 * s, 0, Math.PI * 2);
    ctx.fillStyle = lv ? T.lv[lv - 1] : T.land0; ctx.fill();
    ctx.strokeStyle = T.accent; ctx.lineWidth = 1.5 * s; ctx.stroke();
    ctx.font = `600 ${20 * s}px ${S}`; ctx.textAlign = 'center';
    ctx.lineWidth = 4 * s; ctx.strokeStyle = T.bg1; ctx.strokeText('독도', x, y - 14 * s);
    ctx.fillStyle = T.text; ctx.fillText('독도', x, y - 14 * s);
  }

  // 위시 별(후광 + 4각 반짝임)
  for (const w of model.stars) {
    const p = proj(w.ll);
    if (!p) continue;
    const halo = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 16 * s);
    halo.addColorStop(0, 'rgba(255,231,163,.8)'); halo.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(p[0], p[1], 16 * s, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(0.9 * s, 0.9 * s);
    ctx.fillStyle = T.wish; ctx.fill(STAR);
    ctx.restore();
  }
}

// 대륙 진행 막대: 이름 · 방문/전체 · 막대
function drawBars(ctx, rows, R, s, T) {
  const gap = 60 * s, colW = (R.w - gap * (R.cols - 1)) / R.cols;
  rows.forEach((r, i) => {
    const x = R.x + (i % R.cols) * (colW + gap), y = R.y + Math.floor(i / R.cols) * R.rowH;
    text(ctx, r.label, x, y, { font: `400 ${22 * s}px ${S}`, color: T.text });
    text(ctx, `${r.n}/${r.total}`, x + colW, y, { font: `400 ${20 * s}px ${MO}`, color: T.dim, align: 'right' });
    ctx.fillStyle = T.track; pill(ctx, x, y + 12 * s, colW, 8 * s); ctx.fill();
    if (r.n) { ctx.fillStyle = T.lv[i % 4]; pill(ctx, x, y + 12 * s, Math.max(10 * s, colW * r.n / r.total), 8 * s); ctx.fill(); }
  });
}

// 시도 칩 17개: 방문한 곳은 방문 단계 색 점 + 진한 글자, 아닌 곳은 흐린 글자
function drawChips(ctx, chips, R, s, T) {
  const gap = 14 * s, cols = R.chipCols, w = (R.w - gap * (cols - 1)) / cols, h = Math.min(R.rowH - 12 * s, 40 * s);
  const rowH = h + 12 * s;
  chips.forEach((c, i) => {
    const x = R.x + (i % cols) * (w + gap), y = R.y - 26 * s + Math.floor(i / cols) * rowH;
    pill(ctx, x, y, w, h);
    if (c.level) { ctx.fillStyle = T.track; ctx.fill(); }
    else { ctx.strokeStyle = T.track; ctx.lineWidth = 1.5 * s; ctx.stroke(); }
    ctx.font = `600 ${20 * s}px ${S}`;
    const tw = ctx.measureText(c.label).width, dot = c.level ? 14 * s : 0;
    const cx = x + (w - tw - dot) / 2;
    if (c.level) { ctx.fillStyle = T.lv[c.level - 1]; ctx.beginPath(); ctx.arc(cx + 5 * s, y + h / 2, 5 * s, 0, Math.PI * 2); ctx.fill(); }
    text(ctx, c.label, cx + dot, y + h / 2 + 7 * s, { font: ctx.font, color: c.level ? T.text : T.dim, alpha: c.level ? 1 : 0.6 });
  });
}
