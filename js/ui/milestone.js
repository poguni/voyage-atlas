// 배지 코인(DESIGN.md 6.11)과 마일스톤 축하 창(6.16, PRD F5-2): 코인이 Y축으로 돌며 등장 + 금색·오로라 색종이 140개(2.2초)
// '애니메이션 줄이기'면 회전·색종이 없이 창만 보여 줍니다.
import { particles } from '../map/effects.js';
import { motionReduced } from '../settings.js';
import { esc } from '../env.js';
import { playChime } from './sound.js';

const $ = id => document.getElementById(id);
const TONES = { gold: ['#FFF1C9', '#E8C98A', '#9C7330'], silver: ['#E6E9F5', '#AEB5D4', '#5E6690'] };
let seq = 0, returnFocus = null;

export function coinSVG(icon, size = 72, tone = 'gold') {
  const g = TONES[tone], id = `coin${++seq}`;
  return `<svg class="coin-svg" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset=".5" stop-color="${g[1]}"/><stop offset="1" stop-color="${g[2]}"/></linearGradient></defs>`
    + `<circle cx="50" cy="50" r="46" fill="url(#${id})"/><circle cx="50" cy="50" r="38" fill="none" stroke="#1A1408" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="2 3"/><circle cx="50" cy="50" r="33" fill="#0B1026" fill-opacity=".85"/>`
    + `<text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-family="Fraunces,Noto Serif KR,serif" font-weight="800" font-size="${icon.length > 2 ? 18 : 26}" fill="${g[1]}">${esc(icon)}</text></svg>`;
}

/**
 * @param badge 축하할 배지 { icon, title, cheer }
 * @param desc  아래 설명 문장
 */
export function celebrate(badge, desc) {
  $('msCoin').innerHTML = coinSVG(badge.icon, 132);
  $('msTitle').textContent = badge.cheer ?? `${badge.title} 달성!`;
  $('msDesc').textContent = desc;
  returnFocus = document.activeElement;
  $('milestone').hidden = false;
  $('msClose').focus();
  playChime();
  if (motionReduced()) return;
  const cv = document.createElement('canvas');
  cv.className = 'fx-canvas confetti';
  document.body.append(cv);
  particles(cv, innerWidth / 2, innerHeight / 2 - 60, { n: 140, speed: 9, size: 5, dur: 2200, lift: 4, colors: ['#F6DFAE', '#E8C98A', '#2EC4B6', '#9B5DE5', '#F15BB5', '#4C8DFF'] });
  setTimeout(() => cv.remove(), 2400);
}

function close() {
  $('milestone').hidden = true;
  if (returnFocus?.isConnected) returnFocus.focus();
}

export function initMilestone() {
  $('msClose').addEventListener('click', close);
  $('msVault').addEventListener('click', () => { close(); location.hash = '#stats'; setTimeout(() => $('badgeCard')?.scrollIntoView({ behavior: motionReduced() ? 'auto' : 'smooth' }), 100); });
  $('milestone').addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  $('milestone').addEventListener('click', e => { if (e.target === $('milestone')) close(); });
}
