// 통계 HUD(DESIGN.md 6.3, 8장 01·02): 방문국 n/195, 진행 링, 다음 목표, 대륙 막대, 보조 지표 / 한국 정복률
import { CONT, CONT_COLOR, CONT_ORDER } from '../data.js';
import { esc, countTo } from '../env.js';
import { nextGoal } from '../stats.js';

const $ = id => document.getElementById(id);
const RING = 2 * Math.PI * 27;   // 진행 링 둘레(r=27)

/**
 * @param s      countryStats 결과
 * @param k      koreaStats 결과
 * @param anim   숫자 카운트업 여부
 * @param days   여행 일수 합계, years: [첫 여행 연도, 올해]
 */
export function renderWorldHud(s, k, anim, reduced, { days = 0, years = null } = {}) {
  $('hudEyebrow').textContent = years ? `My Voyage · ${years[0]} — ${years[1]}` : 'My Voyage';
  countTo($('hudDays'), days, undefined, !anim || reduced);
  const pctFmt = v => v.toFixed(1) + '%';
  countTo($('hudCount'), s.visited, undefined, !anim || reduced);
  countTo($('hudPct'), s.pct, pctFmt, !anim || reduced);
  $('hudRing').setAttribute('stroke-dashoffset', RING * (1 - Math.min(100, s.pct) / 100));
  $('hudRingWrap').setAttribute('aria-label', `세계 비율 ${pctFmt(s.pct)}`);

  const goal = nextGoal(s.visited);
  $('hudNext').innerHTML = s.visited === 0
    ? '✦ 나라를 눌러 첫 금박을 긁어 보세요.'
    : goal
      ? `✦ ${goal - s.visited}개국만 더 가면 <b style="color:var(--gold-strong)">${goal}개국</b> 달성!`
      : `✦ <b style="color:var(--gold-strong)">100개국</b>을 넘었어요. 세계의 ${pctFmt(s.pct)}를 밟았어요!`;

  $('hudCont').innerHTML = CONT_ORDER.map(c => {
    const { visited, total } = s.byCont[c];
    return `<div class="r"><span>${CONT[c]}</span><div class="progress"><span style="width:${visited / total * 100}%;background:${CONT_COLOR[c]}"></span></div><span class="mono">${visited}/${total}</span></div>`;
  }).join('');
  $('hudRegions').textContent = s.regions ? `+ 지역 ${s.regions}곳(대만·홍콩 등)` : '';

  countTo($('hudSido'), k.visited, undefined, !anim || reduced);
}

/** @param nameOf code => 시도 이름 */
export function renderKoreaHud(k, nameOf, anim, reduced) {
  countTo($('krCount'), k.visited, undefined, !anim || reduced);
  $('krBar').style.width = (k.visited / k.total * 100) + '%';
  $('krBarWrap').setAttribute('aria-label', `한국 정복률 ${k.visited} / ${k.total}`);
  $('krNext').textContent = k.visited >= k.total
    ? '✦ 전국 17칸을 모두 색칠했어요!'
    : k.visited === 0
      ? '시도를 눌러 첫 금박을 긁어 보세요.'
      : `남은 시도 ${k.total - k.visited}곳. 시도를 눌러 금박을 긁어 보세요.`;
  $('krList').innerHTML = k.ranking.slice(0, 5).map((r, i) =>
    `<li><span class="rk">${i + 1}</span><span class="dot" style="background:var(--v${Math.min(4, r.count)})"></span><span>${esc(nameOf(r.code))}</span><b>${r.count}회</b></li>`).join('');
}

/**
 * 지구본 HUD(DESIGN.md 8장 03 FLIGHT LOG): 지구 ○바퀴(km) → 설명 → 여행 횟수·방문 도시
 * @param d  { laps, kmText, home(공항 이름), places(다녀온 해외 경유지 수), trips, cities }
 */
export function renderGlobeHud(d, anim, reduced) {
  const lapsFmt = v => (v >= 10 ? Math.round(v).toLocaleString('ko-KR') : v.toFixed(1));
  countTo($('glLaps'), d.laps, lapsFmt, !anim || reduced);
  $('glKm').textContent = `${d.kmText} km`;
  $('glDesc').textContent = d.places
    ? `${d.home}에서 출발한 ${d.places}곳의 비행 궤적이에요. 지구본을 끌어서 돌려 보세요.`
    : '해외여행을 기록하면 비행 궤적과 이동 거리가 보여요.';
  countTo($('glTrips'), d.trips, undefined, !anim || reduced);
  countTo($('glCities'), d.cities, undefined, !anim || reduced);
}
