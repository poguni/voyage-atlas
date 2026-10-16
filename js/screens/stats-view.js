// 통계 화면(시안 04, PRD F4): 성과 제목 + 기간(전체/연도) → KPI 4칸 → 대륙 도넛 | 연도별 막대 → 많이 간 나라 TOP 5 | 기록으로 본 나
// 아래에 배지 보관함(Phase 5a). 이동 거리는 Phase 5e에서 추가합니다(지금 4번째 KPI는 여행 횟수).
import * as d3 from 'd3';
import { getState } from '../store.js';
import { settings, motionReduced } from '../settings.js';
import {
  countryStats, countriesInYear, daysSummary, daysByYear, tripYears, countryRanking, recordFacts, tripStarted,
  tripYear, isDomestic, todayStr, COMPANIONS,
} from '../stats.js';
import { CONT, CONT_COLOR, CONT_ORDER } from '../data.js';
import { countryList, countryOfId } from '../places.js';
import { flagHTML } from '../ui/flag.js';
import { coinSVG } from '../ui/milestone.js';
import { evaluate, nextGoals, vaultOrder } from '../badges.js';
import { esc } from '../env.js';

const $ = id => document.getElementById(id);
let period = 'all';
let ctx = null;   // { openPlace, goTrip }

export function initStats(c) {
  ctx = c;
  $('statsPeriod').addEventListener('click', e => {
    const b = e.target.closest('button[data-period]');
    if (b) { period = b.dataset.period; renderStats(); }
  });
  $('statsTop').addEventListener('click', e => { const b = e.target.closest('[data-place]'); if (b) ctx.openPlace(b.dataset.place); });
  $('statsFacts').addEventListener('click', e => { const b = e.target.closest('[data-trip]'); if (b) ctx.goTrip(b.dataset.trip); });
}

const kpi = (num, unit, small) => `<div class="kpi"><span class="num">${num}</span><span class="unit">${unit}</span><small>${small}</small></div>`;

export function renderStats() {
  const s = getState(), today = todayStr(), countries = countryList();
  const years = tripYears(s, today);
  if (period !== 'all' && !years.includes(+period)) period = 'all';
  const year = period === 'all' ? null : +period;
  $('statsPeriod').innerHTML = [['all', '전체'], ...years.slice(0, 4).map(y => [String(y), String(y)])]
    .map(([k, v]) => `<button type="button" data-period="${k}" aria-pressed="${k === period}">${v}</button>`).join('');

  // 방문국·대륙: 전체는 모든 방문 표시, 연도는 그해 여행으로 간 나라
  let visited, byCont, regions, pct;
  if (!year) {
    const cs = countryStats(s, countries, { includeTransit: settings.includeTransit });
    ({ visited, byCont, regions, pct } = cs);
  } else {
    const ids = new Set(countriesInYear(s, year, today));
    byCont = Object.fromEntries(CONT_ORDER.map(k => [k, { visited: 0, total: 0 }]));
    visited = 0; regions = 0;
    for (const c of countries) {
      if (c.status === 'region') { if (ids.has(c.id)) regions++; continue; }
      byCont[c.cont].total++;
      if (ids.has(c.id)) { visited++; byCont[c.cont].visited++; }
    }
    pct = visited / 195 * 100;
  }
  const conts = CONT_ORDER.filter(k => byCont[k].visited > 0);
  const days = daysSummary(s, { today, year });
  const trips = s.trips.filter(t => tripStarted(t, today) && (!year || tripYear(t) === year));
  const domestic = trips.filter(t => isDomestic(t, s.places)).length;

  $('statsTitle').innerHTML = year
    ? `${year}년,<br><span class="gold-text">${visited}개국</span>을 다녀왔어요`
    : `지금까지, 세계의<br><span class="gold-text">${pct.toFixed(1)}%</span>를 걸었어요`;

  const missing = CONT_ORDER.filter(k => !byCont[k].visited).map(k => CONT[k]);
  $('statsKpis').innerHTML = [
    kpi(visited, '개국', `195개국 중${regions ? ` · 지역 ${regions}곳 별도` : ''}`),
    kpi(conts.length, '/ 6 대륙', missing.length ? `남은 대륙: ${missing.join(', ')}` : '여섯 대륙을 모두 밟았어요!'),
    kpi(days.total.toLocaleString('ko-KR'), '일', `해외 ${days.overseas}일 · 국내 ${days.domestic}일 (겹친 날 제외)${days.unknownTrips ? ` · 날짜 미상 여행 ${days.unknownTrips}개` : ''}`),
    kpi(trips.length, '번', `해외 ${trips.length - domestic}번 · 국내 ${domestic}번의 여정`),
  ].join('');

  renderBadges(s, countries, today);
  drawDonut(byCont, visited);
  drawBars(daysByYear(s, today).slice(-10), year ?? +today.slice(0, 4));

  // 가장 많이 간 나라(연도 보기에서도 전체 기준)
  const top = countryRanking(s, countries, { today });
  $('statsTop').innerHTML = top.length ? top.map((r, i) => {
    const c = countryOfId(r.id);
    const cities = r.cities.length ? ` <span class="faint">· ${esc(r.cities.slice(0, 3).join(', '))}${r.cities.length > 3 ? ` 외 ${r.cities.length - 3}` : ''}</span>` : '';
    return `<li><span class="rk">${i + 1}</span>${flagHTML(c.iso2, c.ko, 20)}<button type="button" class="link-row" data-place="country:${c.id}">${esc(c.ko)}${cities}</button><b>${r.count}회</b></li>`;
  }).join('') : '<li class="empty-li dim">나라를 색칠하거나 여행을 기록하면 순위가 생겨요.</li>';

  const f = recordFacts(s, today);
  const facts = [
    f.longest && ['가장 긴 여행', `<button type="button" class="link-row" data-trip="${esc(f.longest.trip.id)}">${esc(f.longest.trip.title)}</button>`, `${f.longest.days}일`],
    f.topMonth && ['가장 자주 떠난 달', '', `${f.topMonth.month}월`],
    f.companion && [`${COMPANIONS[f.companion.type]} 여행 비율`, '', `${f.companion.pct}%`],
    f.wish.total && ['위시 달성', `<span class="faint">${f.wish.total}곳 중</span>`, `${f.wish.done}곳`],
    f.firstOverseasYear && ['첫 해외여행 이후', `<span class="faint">${f.firstOverseasYear}년부터</span>`, `${f.yearsSinceFirstOverseas}년`],
  ].filter(Boolean);
  $('statsFacts').innerHTML = facts.length
    ? facts.map(([t, sub, v]) => `<li><span class="rk">✦</span><span>${t} ${sub}</span><b>${v}</b></li>`).join('')
    : '<li class="empty-li dim">여행을 기록하면 나만의 여행 습관이 보여요.</li>';
}

// 배지 보관함(F5-3): 달성은 금박 + 날짜, 잠김은 은색 + 진행 막대. 머리에 다음 목표(F5-4)
const ym = d => `${d.slice(0, 4)}. ${+d.slice(5, 7)}`;
function renderBadges(s, countries, today) {
  const list = evaluate(s, countries, { includeTransit: settings.includeTransit, today });
  const earned = list.filter(b => b.earned).length;
  $('badgeCount').textContent = `${earned} / ${list.length} 획득`;
  const next = nextGoals(s, countries, { includeTransit: settings.includeTransit, today });
  $('badgeNext').innerHTML = next.length ? `다음 목표: <b class="gold-text">${esc(next[0].short)}</b>` : '모든 목표를 이뤘어요!';
  $('badges').innerHTML = vaultOrder(list).map(b => `<li class="badge${b.earned ? '' : ' locked'}">${coinSVG(b.icon, 72, b.earned ? 'gold' : 'silver')}
    <b>${esc(b.title)}</b><small>${b.earned ? (b.date ? ym(b.date) : '달성') : `${b.value} / ${b.target}`}</small>
    ${b.earned ? '' : `<div class="progress" role="progressbar" aria-label="${esc(b.title)} 진행률" aria-valuenow="${Math.round(b.progress * 100)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${b.progress * 100}%"></span></div>`}</li>`).join('');
}

// 대륙별 비율 도넛(DESIGN 6.14): 안쪽 반지름 68%, 조각 간격, 가운데 큰 숫자, 오른쪽에 이름 + 개수·비율
function drawDonut(byCont, total) {
  const box = $('donut');
  box.innerHTML = '';
  const data = CONT_ORDER.map(k => [k, byCont[k].visited]);
  const W = 460, H = 240, r = 100;
  const label = data.filter(d => d[1]).map(([k, v]) => `${CONT[k]} ${v}`).join(', ') || '방문한 나라 없음';
  const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img').attr('aria-label', `대륙별 방문국 비율: ${label}`);
  const g = svg.append('g').attr('transform', `translate(${r + 16},${H / 2})`);
  const arc = d3.arc().innerRadius(r * 0.68).outerRadius(r).cornerRadius(4);
  g.append('circle').attr('r', r * 0.84).style('fill', 'none').style('stroke', 'var(--panel-3)').style('stroke-width', r * 0.32);
  const pie = d3.pie().value(d => d[1]).sort(null).padAngle(0.025);
  g.selectAll('path').data(pie(data.filter(d => d[1]))).join('path').attr('fill', d => CONT_COLOR[d.data[0]]).attr('d', arc)
    .each(function (d) {
      if (motionReduced()) return;
      const i = d3.interpolate({ startAngle: d.startAngle, endAngle: d.startAngle }, d);
      d3.select(this).transition().duration(900).attrTween('d', () => t => arc(i(t)));
    });
  g.append('text').attr('text-anchor', 'middle').attr('y', 12).attr('class', 'num').style('font-size', '40px').style('fill', 'var(--text)').text(total);
  g.append('text').attr('text-anchor', 'middle').attr('y', 34).style('font-size', '12px').style('fill', 'var(--text-dim)').text('개국');
  const lg = svg.append('g').attr('transform', `translate(${2 * r + 56},40)`);
  data.forEach(([k, v], i) => {
    const row = lg.append('g').attr('transform', `translate(0,${i * 30})`);
    row.append('circle').attr('r', 6).attr('cy', -4).attr('fill', v ? CONT_COLOR[k] : 'var(--panel-3)');
    row.append('text').attr('x', 14).style('font-size', '13px').style('fill', v ? 'var(--text)' : 'var(--text-faint)').text(CONT[k]);
    row.append('text').attr('x', 200).attr('text-anchor', 'end').style('font-size', '13px').style('font-family', 'var(--font-mono)').style('fill', 'var(--text-dim)')
      .text(`${v} · ${total ? Math.round(v / total * 100) : 0}%`);
  });
}

// 연도별 여행 일수 막대(DESIGN 6.14): 기본 청록→파랑, 선택한 해(기본 올해)만 금색 + 값 라벨
function drawBars(rows, hiYear) {
  const box = $('bars');
  box.innerHTML = '';
  $('barsRange').textContent = rows.length ? `${rows[0].year}—${rows.at(-1).year}` : '';
  if (!rows.length) { box.innerHTML = '<p class="dim empty-note">날짜가 있는 여행을 기록하면 연도별 막대가 생겨요.</p>'; return; }
  const BW = 520, BH = 240, m = { l: 34, r: 8, t: 24, b: 26 };
  const max = d3.max(rows, d => d.days);
  const y = d3.scaleLinear().domain([0, max * 1.15]).nice(4).range([BH - m.b, m.t]);
  const x = d3.scaleBand().domain(rows.map(d => d.year)).range([m.l, BW - m.r]).padding(0.32);
  const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${BW} ${BH}`).attr('width', '100%').attr('class', 'bars')
    .attr('role', 'img').attr('aria-label', `연도별 여행 일수: ${rows.map(d => `${d.year}년 ${d.days}일`).join(', ')}`);
  y.ticks(4).forEach(v => {
    svg.append('line').attr('x1', m.l).attr('x2', BW - m.r).attr('y1', y(v)).attr('y2', y(v)).style('stroke', 'var(--line-2)');
    svg.append('text').attr('x', m.l - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').text(v);
  });
  const grad = svg.append('defs').append('linearGradient').attr('id', 'barG').attr('x1', 0).attr('y1', 1).attr('x2', 0).attr('y2', 0);
  grad.append('stop').attr('offset', 0).attr('stop-color', '#4C8DFF');
  grad.append('stop').attr('offset', 1).attr('stop-color', '#2EC4B6');
  svg.selectAll('rect').data(rows).join('rect').attr('x', d => x(d.year)).attr('width', x.bandwidth()).attr('rx', 4)
    .attr('fill', d => (d.year === hiYear ? 'var(--gold)' : 'url(#barG)')).attr('y', y(0)).attr('height', 0)
    .transition().duration(motionReduced() ? 0 : 800).delay((d, i) => (motionReduced() ? 0 : i * 50))
    .attr('y', d => y(d.days)).attr('height', d => y(0) - y(d.days));
  svg.selectAll('.yl').data(rows).join('text').attr('x', d => x(d.year) + x.bandwidth() / 2).attr('y', BH - 8).attr('text-anchor', 'middle').text(d => `'${String(d.year).slice(2)}`);
  const hi = rows.find(d => d.year === hiYear);
  if (hi) svg.append('text').attr('x', x(hi.year) + x.bandwidth() / 2).attr('y', y(hi.days) - 8).attr('text-anchor', 'middle').style('fill', 'var(--gold-strong)').style('font-weight', 600).text(`${hi.days}일`);
}
