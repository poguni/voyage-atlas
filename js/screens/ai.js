// AI 추천 화면(시안 07, PRD F7, 9장): 조건 → 비용 확인 창 → 세 모델 병렬 호출 → 병합·합의 → 지도 핀 ↔ 카드 → [☆ 위시] [제외]
// 같은 조건은 지난 결과(aiHistory)를 먼저 보여 주고, [↻ 새로 추천받기]를 눌러야 다시 호출합니다(9.7).
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { getState, saveAiRun, excludeRec, saveWish, newId } from '../store.js';
import { settings } from '../settings.js';
import { loadJSON } from '../data.js';
import { countryList, placeInfo, placeMeta, findCity } from '../places.js';
import { worldView } from '../map/world.js';
import { addStar } from '../map/effects.js';
import { activeModels, AIRPORTS, OUT_TOKENS } from '../ai/config.js';
import {
  historySummary, exclusions, buildMessages, SCHEMA, parseContent, validateResult, estimateTokens, costUSD, condKey,
  defaultConditions, INTERESTS, SCOPES,
} from '../ai/prompt.js';
import { mergeResults, checkCoords } from '../ai/merge.js';
import { getKey, chat } from '../ai/openrouter.js';
import { usdKrw } from '../ui/ai-settings.js';
import { flagHTML } from '../ui/flag.js';
import { openPanel, closePanel } from '../ui/panel.js';
import { toast } from '../ui/toast.js';
import { esc, josa } from '../env.js';
import { COMPANIONS, todayStr } from '../stats.js';

const $ = id => document.getElementById(id);
const COND_KEY = 'va-ai-cond', PICK_KEY = 'va-ai-models';
const RAW_MAX = 4000;

let ctx = null;          // { classFor, statusText, openPlace, openSettings }
let cond = null;         // 지금 조건
let shown = null;        // 화면에 보이는 실행 기록(진행 중이면 메모리의 객체)
let selected = -1;       // 고른 카드 번호
const tabOf = new Map(); // 카드별로 보고 있는 모델 이유
let map = null, mapSize = '', mapSeq = 0;
let geo = null;          // { byIso2: Map(iso2 → features), centroid }
let groups = [];

const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } },
};

const countryByIso2 = iso2 => countryList().find(c => c.iso2 === iso2);
const models = () => activeModels(settings);
const nameOf = placeId => placeInfo(placeId).name;

// ---------- 좌표 검증(F7-8): 경계 데이터는 50m. 해안 도시가 경계 밖으로 조금 벗어나도 통과하도록 주변 8점도 확인 ----------
async function loadGeo() {
  if (geo) return geo;
  const t = await loadJSON('data/countries-50m.json');
  const byId = d3.group(feature(t, t.objects.countries).features, f => f.id);
  const byIso2 = new Map(countryList().map(c => [c.iso2, byId.get(c.id) ?? []]));
  geo = {
    contains(iso2, [lon, lat]) {
      const fs = byIso2.get(iso2);
      if (!fs?.length) return null;
      const near = [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25], [0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]];
      return near.some(([dx, dy]) => fs.some(f => d3.geoContains(f, [lon + dx, lat + dy])));
    },
    centroid: iso2 => countryByIso2(iso2)?.ll ?? null,
  };
  return geo;
}

// ---------- 조건 ----------
function originName(code) { return AIRPORTS[code]?.name ?? code; }

function condChips(c) {
  return [
    `<span class="chip"><b>${+c.month.slice(0, 4)}년 ${+c.month.slice(5, 7)}월</b></span>`,
    `<span class="chip"><b>${c.days}일</b></span>`,
    `<span class="chip">${COMPANIONS[c.companion] ?? ''} ${c.party}명</span>`,
    `<span class="chip">1인 ${c.budget}만 원</span>`,
    `<span class="chip">${originName(c.origin)} 출발</span>`,
    ...c.interests.map(t => `<span class="chip on">${esc(t)}</span>`),
    c.onlyNew && c.scope !== 'korea' ? '<span class="chip on">안 가 본 나라만</span>' : '',
    `<span class="chip">${SCOPES[c.scope]}</span>`,
  ].join('');
}

function fillForm() {
  const c = cond;
  $('acMonth').value = c.month; $('acDays').value = c.days; $('acParty').value = c.party; $('acBudget').value = c.budget;
  $('acOrigin').value = c.origin; $('acOnlyNew').checked = c.onlyNew;
  $('acCompanion').innerHTML = Object.entries(COMPANIONS).filter(([k]) => k !== 'business')
    .map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${k === c.companion}">${v}</button>`).join('');
  $('acInterests').innerHTML = INTERESTS.map(t => `<button type="button" class="chip chip-btn${c.interests.includes(t) ? ' on' : ''}" data-v="${t}" aria-pressed="${c.interests.includes(t)}">${t}</button>`).join('');
  $('acScope').innerHTML = Object.entries(SCOPES).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${k === c.scope}">${v}</button>`).join('');
  $('acError').textContent = '';
}

function readForm() {
  const pressedV = id => $(id).querySelector('[aria-pressed="true"]')?.dataset.v;
  const c = {
    month: $('acMonth').value, days: +$('acDays').value, companion: pressedV('acCompanion') ?? 'family', party: +$('acParty').value,
    budget: +$('acBudget').value, origin: $('acOrigin').value, onlyNew: $('acOnlyNew').checked, scope: pressedV('acScope') ?? 'world',
    interests: [...$('acInterests').querySelectorAll('[aria-pressed="true"]')].map(b => b.dataset.v),
  };
  if (!/^\d{4}-\d{2}$/.test(c.month)) return { error: '여행 시기를 연·월로 골라 주세요(예: 2027-05).' };
  if (!(c.days >= 1 && c.days <= 60)) return { error: '기간은 1~60일로 넣어 주세요.' };
  if (!(c.party >= 1)) c.party = 1;
  if (!(c.budget >= 10)) return { error: '1인 예산을 10만 원 이상으로 넣어 주세요.' };
  return { cond: c };
}

// ---------- 비용 확인 창(Boarding Receipt) ----------
function promptFor(c) {
  const s = getState(), countries = countryList();
  return buildMessages(c, { summary: historySummary(s, countries, nameOf), excluded: exclusions(s, countries, c), originName: originName(c.origin) });
}

function openReceipt() {
  const messages = promptFor(cond);
  const inTok = estimateTokens(messages.map(m => m.content).join('\n')) + estimateTokens(JSON.stringify(SCHEMA)) + 20;
  const picked = store.get(PICK_KEY, models().map(m => m.key));
  $('rcRows').innerHTML = models().map(m => {
    const cost = m.price ? costUSD(m.price, inTok, OUT_TOKENS) : null;
    return `<tr><td><label class="row rc-model"><input type="checkbox" data-model="${m.key}" ${picked.includes(m.key) ? 'checked' : ''}> <span class="model ${m.key}"><i>${m.mono}</i>${esc(m.label)}</span></label></td>
      <td>${inTok.toLocaleString('ko-KR')}</td><td>${OUT_TOKENS.toLocaleString('ko-KR')}</td><td data-cost="${cost ?? ''}">${cost != null ? usdKrw(cost) : '단가 미확인'}</td></tr>`;
  }).join('');
  updateReceipt();
  $('aiReceipt').hidden = false;
  $('rcGo').focus();
}

function updateReceipt() {
  const rows = [...$('rcRows').querySelectorAll('input[data-model]')];
  const on = rows.filter(i => i.checked);
  const total = on.reduce((a, i) => a + (+i.closest('tr').querySelector('[data-cost]').dataset.cost || 0), 0);
  $('rcCount').textContent = `합계 ${on.length}회`;
  $('rcTotal').textContent = usdKrw(total);
  const key = getKey();
  $('rcError').innerHTML = !key ? '설정에서 OpenRouter API 키를 먼저 넣어 주세요. <button class="link-btn" type="button" id="rcSettings">설정 열기</button>'
    : !on.length ? '모델을 하나 이상 골라 주세요.' : '';
  $('rcGo').disabled = !key || !on.length;
}

function closeReceipt() { $('aiReceipt').hidden = true; }

// ---------- 실행 ----------
const sumUsage = (a, b) => ({ in: (a?.in ?? 0) + (b?.in ?? 0), out: (a?.out ?? 0) + (b?.out ?? 0), cost: a?.cost == null && b?.cost == null ? null : (a?.cost ?? 0) + (b?.cost ?? 0) });

async function callModel(run, key, messages) {
  const m = models().find(x => x.key === key);
  run.models[key] = { slug: m.slug, label: m.label, status: 'loading' };
  render();
  const apiKey = getKey();
  let usage = null, raw = '';
  try {
    if (!apiKey) throw new Error('API 키가 없어요');
    await loadGeo();
    let r = await chat({ key: apiKey, slug: m.slug, messages, schema: SCHEMA });
    usage = r.usage; raw = r.content;
    let v = tryParse(raw);
    // 형식이 맞지 않으면 오류를 붙여 한 번 더 요청(9.6)
    if (!v.recs.length) {
      r = await chat({ key: apiKey, slug: m.slug, schema: SCHEMA, messages: [...messages, { role: 'assistant', content: raw }, { role: 'user', content: `형식 오류: ${v.errors.join(' ')} 스키마에 맞는 JSON만 다시 출력해 주세요.` }] });
      usage = sumUsage(usage, r.usage); raw = r.content;
      v = tryParse(raw);
    }
    if (!v.recs.length) run.models[key] = { slug: m.slug, label: m.label, status: 'error', error: '추천 형식이 맞지 않아요', raw: raw.slice(0, RAW_MAX), usage };
    else run.models[key] = { slug: m.slug, label: m.label, status: 'done', recs: v.recs.map(x => checkCoords(x, geo.contains, geo.centroid)), usage };
  } catch (err) {
    console.error(err);
    run.models[key] = { slug: m.slug, label: m.label, status: 'error', error: err.message, detail: err.detail ?? '', usage };
  }
  const u = run.models[key].usage;
  if (!u) return null;
  const cost = u.cost ?? (m.price ? costUSD(m.price, u.in, u.out) : 0);
  return { id: newId('c'), at: new Date().toISOString(), runId: run.id, model: key, slug: m.slug, in: u.in, out: u.out, cost, estimated: u.cost == null };
}

function tryParse(text) {
  try { return validateResult(parseContent(text)); } catch { return { recs: [], errors: ['JSON 형식이 아닙니다.'] }; }
}

async function run(keys) {
  const messages = promptFor(cond);
  const r = { id: newId('ai'), at: new Date().toISOString(), cond: { ...cond }, condKey: condKey(cond), order: keys,
    models: Object.fromEntries(keys.map(k => [k, { slug: models().find(x => x.key === k).slug, label: models().find(x => x.key === k).label, status: 'loading' }])) };
  shown = r; selected = -1; tabOf.clear();
  const costs = (await Promise.all(keys.map(k => callModel(r, k, messages)))).filter(Boolean);
  saveAiRun(stripLive(r), costs);
  const ok = keys.filter(k => r.models[k].status === 'done').length;
  const spent = costs.reduce((a, c) => a + c.cost, 0);
  toast(ok ? `✦ ${ok}개 모델의 추천이 도착했어요 · ${usdKrw(spent)}` : '추천을 받지 못했어요. 모델 옆 [다시 시도]를 눌러 보세요.');
}

async function retry(key) {
  const r = shown;
  if (!r) return;
  const c = await callModel(r, key, buildMessages(r.cond, (() => {
    const s = getState(), countries = countryList();
    return { summary: historySummary(s, countries, nameOf), excluded: exclusions(s, countries, r.cond), originName: originName(r.cond.origin) };
  })()));
  saveAiRun(stripLive(r), c ? [c] : []);
}

// 저장할 때는 진행 중 표시를 남기지 않음
const stripLive = r => ({ ...r, models: Object.fromEntries(Object.entries(r.models).map(([k, v]) => [k, v.status === 'loading' ? { ...v, status: 'error', error: '중단됨' } : v])) });

// ---------- 그리기 ----------
const orderOf = r => r?.order ?? Object.keys(r?.models ?? {});
const consensusCls = n => (n >= 3 ? 'c3' : n === 2 ? 'c2' : 'c1');
const wishedKey = key => getState().wishlist.some(w => w.aiKey === key && !w.doneAt);

function computeGroups() {
  if (!shown) return [];
  const excluded = new Set((getState().aiExcluded ?? []).map(x => x.key));
  const results = orderOf(shown).map(model => ({ model, recs: shown.models[model]?.status === 'done' ? shown.models[model].recs : [] }));
  return mergeResults(results, { excluded });
}

function renderModels() {
  if (!shown) { $('aiModels').innerHTML = models().map(m => `<span class="model ${m.key}"><i>${m.mono}</i>${esc(m.label)}</span>`).join(''); return; }
  $('aiModels').innerHTML = orderOf(shown).map(k => {
    const st = shown.models[k], m = models().find(x => x.key === k) ?? { mono: k.slice(0, 2).toUpperCase() };
    if (!st) return '';
    const state = st.status === 'loading' ? '<span class="faint mono small ai-wait">추천 중…</span>'
      : st.status === 'done' ? `<span class="faint mono small">완료 · ${st.usage?.cost != null ? `$${st.usage.cost.toFixed(3)}` : '비용 미확인'}</span>`
        : `<span class="warn-text mono small" title="${esc(st.detail || st.error)}">실패 · ${esc(st.error)}</span> <button class="link-btn" type="button" data-retry="${k}">다시 시도</button>`;
    return `<span class="model ${k}"><i>${m.mono}</i>${esc(st.label ?? k)} ${state}</span>`;
  }).join('');
}

function renderHistory() {
  const hist = getState().aiHistory ?? [];
  const sel = $('aiHistory');
  sel.hidden = !hist.length;
  const fmt = r => { const d = new Date(r.at); return `${d.getMonth() + 1}. ${d.getDate()}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${+r.cond.month.slice(5, 7)}월 ${r.cond.days}일 · ${SCOPES[r.cond.scope]}`; };
  sel.innerHTML = `<option value="">지난 추천 ${hist.length}개</option>` + hist.map(r => `<option value="${esc(r.id)}"${shown?.id === r.id ? ' selected' : ''}>${esc(fmt(r))}</option>`).join('');
}

function recCard(g, i, total) {
  const c = countryByIso2(g.iso2);
  const n = g.models.length;
  const tab = g.byModel[tabOf.get(g.key)] ? tabOf.get(g.key) : g.models[0];
  const rec = g.byModel[tab];
  const meta = [g.months.length && `${g.months.join('·')}월`, g.hours != null && `약 ${g.hours}시간`, g.budget && `예산 ${g.budget}`].filter(Boolean).join(' · ');
  const wished = wishedKey(g.key);
  return `<article class="rec${i === selected ? ' on' : ''}" data-i="${i}" tabindex="0">
    <div class="row rec-head">${flagHTML(g.iso2, c?.ko ?? g.iso2, 22)}<div class="rec-name"><b>${esc(g.name_ko)}</b> <span class="dim">${esc(c?.ko ?? g.iso2)}</span></div><span class="spacer"></span><span class="consensus ${consensusCls(n)}">${n}/${total}</span></div>
    ${g.needsCheck ? '<span class="tag warn">위치 확인 필요</span>' : ''}
    ${n > 1 ? `<div class="rec-tabs" role="group" aria-label="모델별 추천 이유">${g.models.map(md => `<button type="button" class="rec-tab ${md}" data-tab="${md}" aria-pressed="${md === tab}">${esc(models().find(x => x.key === md)?.label ?? md)}</button>`).join('')}</div>` : ''}
    <p class="rec-reason">${esc(rec.reason)}</p>
    ${rec.linked.length ? `<p class="faint small rec-line">이력 연결: ${esc(rec.linked.join(', '))}</p>` : ''}
    ${g.photos.length ? `<p class="faint small rec-line">사진 포인트: ${esc(g.photos.join(', '))}</p>` : ''}
    <div class="row rec-meta"><span class="dots">${models().map(m => `<i class="${g.models.includes(m.key) ? m.key : ''}" title="${esc(m.label)}"></i>`).join('')}</span><span class="faint">${esc(meta)}</span></div>
    <div class="row rec-acts"><span class="spacer"></span><button class="btn btn-sm btn-ghost" type="button" data-act="exclude">제외</button><button class="btn btn-sm${wished ? ' btn-primary' : ''}" type="button" data-act="wish" ${wished ? 'aria-pressed="true"' : ''}>${wished ? '★ 담김' : '☆ 위시'}</button></div>
  </article>`;
}

function renderList() {
  const list = $('recList');
  const total = shown ? orderOf(shown).length : 0;
  $('aiCount').textContent = groups.length ? `추천 ${groups.length}곳` : '추천';
  $('aiOrder').textContent = groups.length ? '합의 순' : '';
  const raws = shown ? Object.entries(shown.models).filter(([, v]) => v.raw) : [];
  const rawHTML = raws.map(([k, v]) => `<details class="rec-raw"><summary>${esc(v.label ?? k)} 응답 원문 보기</summary><pre>${esc(v.raw)}</pre></details>`).join('');
  if (groups.length) { list.innerHTML = rawHTML + groups.map((g, i) => recCard(g, i, total)).join(''); return; }
  const loading = shown && Object.values(shown.models).some(v => v.status === 'loading');
  list.innerHTML = rawHTML + (loading ? '<p class="dim rec-empty">세 AI가 다음 별자리를 그리는 중이에요…</p>'
    : !getKey() ? '<div class="rec-empty"><p class="dim">설정에서 OpenRouter API 키를 넣으면 추천을 받을 수 있어요.</p><button class="btn btn-sm" type="button" data-act="settings">설정 열기</button></div>'
      : `<div class="rec-empty"><p class="dim">${shown ? '보여 드릴 추천이 없어요(모두 제외했거나 실패).' : '조건을 정하고 세 AI의 추천을 받아 보세요.'}</p><button class="btn btn-sm" type="button" data-act="cond">조건 정하기</button></div>`);
}

// ---------- 지도 ----------
const aiApp = () => ({
  classFor: ctx.classFor,
  statusText: ctx.statusText,
  onPlace: (e, placeId) => ctx.openPlace(placeId),
  onZoomStart: () => {},
  onBackground: () => select(-1),
  stars: () => [],
});

async function ensureMap() {
  const box = $('aiMap');
  const size = `${box.clientWidth}x${box.clientHeight}`;
  if (map && size === mapSize) return map;
  const my = ++mapSeq;
  map?.destroy();
  map = null;
  const m = await worldView(box, aiApp());
  if (my !== mapSeq) { m?.destroy(); return null; }
  if (!m) return null;
  box.querySelectorAll('.map-skeleton').forEach(n => n.remove());
  m.land.style('opacity', 0.8);
  const base = m.redraw;
  m.redraw = () => { base(); drawPins(m); };
  map = m; mapSize = size;
  return m;
}

function drawPins(m) {
  m.pins.selectAll('.ai-pin').remove();
  groups.forEach((g, i) => {
    const xy = m.proj(g.ll);
    if (!xy) return;
    const n = g.models.length;
    const pin = m.pin(m.pins, xy, 'ai-pin').attr('data-i', i);
    if (n >= 3) pin.append('circle').attr('class', 'ai-ring pulse').attr('r', 22);
    if (n >= 2) addStar(pin, n >= 3 ? 26 : 18);
    g.models.forEach((md, j) => {
      const a = -Math.PI / 2 + (j - (n - 1) / 2) * 0.9, rr = n >= 2 ? 18 : 0;
      pin.append('circle').attr('class', `ai-dot ${md}`).attr('cx', Math.cos(a) * rr).attr('cy', Math.sin(a) * rr).attr('r', n >= 2 ? 5 : 7);
    });
    pin.append('text').attr('class', 'label').attr('y', n >= 2 ? 36 : 20).text(g.name_ko);
    m.hover(pin, () => `<b>${flagHTML(g.iso2, '', 16)}${esc(g.name_ko)}</b><span class="dim">${esc(countryByIso2(g.iso2)?.ko ?? g.iso2)} · ${n}/${orderOf(shown).length} 합의</span>`);
    pin.on('click', e => { e.stopPropagation(); select(i, true); });
  });
  applySelection();
}

function applySelection() {
  map?.pins.selectAll('.ai-pin').classed('dim', function () { return selected >= 0 && +this.dataset.i !== selected; });
  $('recList').querySelectorAll('.rec').forEach(el => el.classList.toggle('on', +el.dataset.i === selected));
}

function select(i, fromMap = false) {
  selected = i;
  applySelection();
  if (fromMap && i >= 0) $('recList').querySelector(`.rec[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function render() {
  groups = computeGroups();
  if (selected >= groups.length) selected = -1;
  $('aiChips').innerHTML = condChips(shown?.cond ?? cond);
  renderModels();
  renderHistory();
  renderList();
  if (map) drawPins(map);
}

export async function renderAi() {
  if (!shown) shown = (getState().aiHistory ?? []).find(r => r.condKey === condKey(cond)) ?? getState().aiHistory?.[0] ?? null;
  render();
  const m = await ensureMap();
  if (m) drawPins(m);
}

// ---------- 위시에 담기·제외(F7-6) ----------
async function addWish(g) {
  if (wishedKey(g.key)) return toast(`<b>${esc(g.name_ko)}</b>${josa(g.name_ko, '은', '는')} 이미 위시리스트에 있어요`);
  const c = countryByIso2(g.iso2);
  if (!c) return toast('나라를 알 수 없어 담지 못했어요');
  let placeId = `country:${c.id}`;
  if (g.type === 'city' || g.iso2 === 'KR') {
    const id = await findCity(c.id, g.ll, [g.name_ko, g.name_en]).catch(() => null);
    if (id) placeId = id;
  }
  const meta = placeMeta(placeId);
  const name = meta?.name_ko || meta?.name_en || placeInfo(placeId).name;
  const rec = g.byModel[g.models[0]];
  const { undo } = saveWish({
    placeId, label: name !== g.name_ko ? g.name_ko : '', reason: rec.reason, priority: 'someday',
    target: shown?.cond.month ?? null, source: `ai:${g.models.join('+')}`, aiKey: g.key,
  }, meta ? { [placeId]: meta } : {});
  toast(`☆ <b>${esc(g.name_ko)}</b>${josa(g.name_ko, '을', '를')} 위시리스트에 담았어요`, { label: '실행 취소', fn: undo });
}

function exclude(g) {
  const undo = excludeRec({ key: g.key, name: g.name_ko, iso2: g.iso2 });
  selected = -1;
  toast(`<b>${esc(g.name_ko)}</b>${josa(g.name_ko, '은', '는')} 다음 추천에서도 빼 둘게요`, { label: '실행 취소', fn: undo });
}

// ---------- 연결 ----------
export function initAi(c) {
  ctx = c;
  cond = { ...defaultConditions(todayStr(), settings.homeAirport), ...store.get(COND_KEY, {}) };
  $('acOrigin').innerHTML = Object.entries(AIRPORTS).map(([code, a]) => `<option value="${code}">${a.name}(${code})</option>`).join('');

  $('aiCondBtn').addEventListener('click', () => { fillForm(); openPanel('aiPanel'); });
  $('aiRun').addEventListener('click', openReceipt);
  $('aiHistory').addEventListener('change', e => {
    const r = (getState().aiHistory ?? []).find(x => x.id === e.target.value);
    if (!r) return;
    shown = r; cond = { ...r.cond }; selected = -1; tabOf.clear();
    render();
  });
  $('aiModels').addEventListener('click', e => { const b = e.target.closest('[data-retry]'); if (b) retry(b.dataset.retry); });

  // 조건 패널
  for (const id of ['acCompanion', 'acScope']) {
    $(id).addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  }
  $('acInterests').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on);
  });
  $('aiForm').addEventListener('submit', e => {
    e.preventDefault();
    const { cond: next, error } = readForm();
    if (error) { $('acError').textContent = error; return; }
    cond = next;
    store.set(COND_KEY, cond);
    closePanel(false);
    // 같은 조건의 지난 결과가 있으면 먼저 보여 줌(캐시, 9.7)
    const cached = (getState().aiHistory ?? []).find(r => r.condKey === condKey(cond));
    if (cached) {
      shown = cached; selected = -1; tabOf.clear(); render();
      const d = new Date(cached.at);
      toast(`같은 조건으로 ${d.getMonth() + 1}월 ${d.getDate()}일에 받은 추천이에요. 새로 받으려면 [↻ 새로 추천받기]를 눌러 주세요.`);
      return;
    }
    render();
    openReceipt();
  });

  // 비용 확인 창
  $('rcRows').addEventListener('change', updateReceipt);
  $('rcCancel').addEventListener('click', closeReceipt);
  $('aiReceipt').addEventListener('click', e => {
    if (e.target === $('aiReceipt')) closeReceipt();
    if (e.target.id === 'rcSettings') { closeReceipt(); ctx.openSettings(); }
  });
  $('aiReceipt').addEventListener('keydown', e => { if (e.key === 'Escape') closeReceipt(); });
  $('rcGo').addEventListener('click', () => {
    const keys = [...$('rcRows').querySelectorAll('input[data-model]:checked')].map(i => i.dataset.model);
    if (!keys.length || !getKey()) return;
    store.set(PICK_KEY, keys);
    closeReceipt();
    run(keys);
  });

  // 카드
  $('recList').addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'settings') return ctx.openSettings();
    if (act === 'cond') { fillForm(); return openPanel('aiPanel'); }
    const card = e.target.closest('.rec');
    if (!card) return;
    const g = groups[+card.dataset.i];
    const tab = e.target.closest('[data-tab]');
    if (tab) { tabOf.set(g.key, tab.dataset.tab); renderList(); applySelection(); return; }
    if (act === 'wish') return addWish(g);
    if (act === 'exclude') return exclude(g);
    select(+card.dataset.i === selected ? -1 : +card.dataset.i);
  });
  $('recList').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('rec')) { e.preventDefault(); select(+e.target.dataset.i); }
  });
  document.addEventListener('va-key', () => { if (!$('ai').hidden) render(); });
}
