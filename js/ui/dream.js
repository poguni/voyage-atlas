// 지도 홈의 "가장 가까운 꿈"(DESIGN.md 8장 01, PRD F6-6): 목표 날짜가 가장 가까운 위시 1개와 D-day
import { getState } from '../store.js';
import { dday, todayStr } from '../stats.js';
import { placeInfo } from '../places.js';
import { fmtDate } from '../format.js';
import { flagHTML } from './flag.js';
import { esc } from '../env.js';

const $ = id => document.getElementById(id);

export function renderDream() {
  const today = todayStr();
  const next = getState().wishlist
    .filter(w => !w.doneAt && w.target && dday(w.target, today) >= 0)
    .sort((a, b) => a.target.localeCompare(b.target))[0];
  const card = $('dreamCard');
  card.hidden = !next;
  card.closest('.stage').classList.toggle('has-dream', !!next);
  if (!next) return;
  const p = placeInfo(next.placeId);
  const d = dday(next.target, today);
  $('dreamD').textContent = d === 0 ? 'D-Day' : `D-${d}`;
  $('dreamDate').textContent = fmtDate(next.target);
  $('dreamName').innerHTML = `${esc(next.label || p.name)} ${flagHTML(p.iso2, p.name, 18)}`;
  $('dreamReason').textContent = next.reason || p.sub;
}
