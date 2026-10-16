// 전체 연대기 재생(PRD F3-5, 시안 05 [▶ 전체 연대기 재생]): 첫 여행의 해부터 올해까지 지도가 해마다 색칠되는 타임랩스.
// 지도 홈 아래쪽 막대: [▶/❚❚] 연도·나라 수 · 연도 슬라이더 · [닫기]. 재생하는 동안 지도 색은 frameState()로 칠합니다.
import { getState } from '../store.js';
import { timelapseYears, stateUntil, countryStats, todayStr } from '../stats.js';
import { countryList } from '../places.js';
import { motionReduced } from '../settings.js';
import { toast } from './toast.js';

const $ = id => document.getElementById(id);
const STEP = 1400;   // 한 해에 머무는 시간(ms)
let ctx = null;      // { redraw() }
let years = [], idx = 0, timer = null, frame = null;

export const frameState = () => frame;
export const timelapseOn = () => !$('timelapse').hidden;

function setFrame(i) {
  idx = i;
  const s = getState(), final = i === years.length - 1;
  frame = stateUntil(s, years[i], { final, today: todayStr() });
  const n = countryStats(frame, countryList()).visited;
  const prev = i ? countryStats(stateUntil(s, years[i - 1]), countryList()).visited : 0;
  $('tlYear').textContent = years[i];
  $('tlCount').innerHTML = `${n}개국${n > prev ? ` <b class="gold-text">+${n - prev}</b>` : ''}${final ? ' · 지금' : ''}`;
  $('tlRange').value = i;
  ctx.redraw();
}

function pause() {
  clearInterval(timer); timer = null;
  $('tlPlay').textContent = idx >= years.length - 1 ? '↻' : '▶';
  $('tlPlay').setAttribute('aria-label', idx >= years.length - 1 ? '처음부터 다시 재생' : '재생');
}

function play() {
  if (idx >= years.length - 1) setFrame(0);
  clearInterval(timer);
  $('tlPlay').textContent = '❚❚';
  $('tlPlay').setAttribute('aria-label', '일시 정지');
  timer = setInterval(() => {
    if (idx >= years.length - 1) return pause();
    setFrame(idx + 1);
    if (idx >= years.length - 1) pause();
  }, motionReduced() ? STEP * 1.5 : STEP);
}

export function startTimelapse() {
  years = timelapseYears(getState());
  if (!years.length) return toast('날짜가 있는 여행을 기록하면 연대기를 재생할 수 있어요.');
  $('timelapse').hidden = false;
  $('tlRange').min = 0; $('tlRange').max = years.length - 1;
  $('tlFirst').textContent = years[0]; $('tlLast').textContent = years.at(-1);
  setFrame(0);
  setTimeout(play, 600);
}

export function stopTimelapse() {
  if (!timelapseOn()) return;
  clearInterval(timer); timer = null;
  frame = null;
  $('timelapse').hidden = true;
  ctx.redraw();
}

export function initTimelapse(c) {
  ctx = c;
  $('tlPlay').addEventListener('click', () => (timer ? pause() : play()));
  $('tlRange').addEventListener('input', e => { pause(); setFrame(+e.target.value); pause(); });
  $('tlClose').addEventListener('click', stopTimelapse);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && timelapseOn() && $('popover').hidden) stopTimelapse(); });
}
