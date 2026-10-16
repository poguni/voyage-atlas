// 지도 홈의 "가장 가까운 꿈"(DESIGN.md 8장 01, PRD F6-6, F3-6): 목표 날짜가 가장 가까운 위시 1개와 D-day.
// 다가오는 여정(미래 날짜 여행)이 더 가까우면 그 여행의 D-day를 대신 보여 주고, 누르면 연대기에서 그 여행을 엽니다.
import { getState } from '../store.js';
import { dday, isUpcoming, todayStr } from '../stats.js';
import { placeInfo } from '../places.js';
import { fmtDate } from '../format.js';
import { selectTrip } from '../screens/trips.js';
import { flagHTML } from './flag.js';
import { esc } from '../env.js';

const $ = id => document.getElementById(id);
let tripId = null;

export function renderDream() {
  const today = todayStr(), s = getState();
  const wish = s.wishlist
    .filter(w => !w.doneAt && w.target && dday(w.target, today) >= 0)
    .sort((a, b) => a.target.localeCompare(b.target))[0];
  const trip = s.trips.filter(t => isUpcoming(t, today)).sort((a, b) => a.start.localeCompare(b.start))[0];
  const card = $('dreamCard');
  const showTrip = trip && (!wish || trip.start <= wish.target);
  card.hidden = !wish && !trip;
  card.closest('.stage').classList.toggle('has-dream', !card.hidden);
  if (card.hidden) return;
  if (!card.dataset.bound) {
    card.dataset.bound = '1';
    card.addEventListener('click', () => { if (tripId) selectTrip(tripId); });
  }
  if (showTrip) {
    tripId = trip.id;
    const d = dday(trip.start, today);
    const first = placeInfo(trip.stops?.[0]?.placeId ?? '');
    card.href = '#trips';
    card.setAttribute('aria-label', '다가오는 여정, 연대기로 이동');
    $('dreamEyebrow').textContent = '✈ 다가오는 여정';
    $('dreamD').textContent = `D-${d}`;
    $('dreamDate').textContent = fmtDate(trip.start);
    $('dreamName').innerHTML = `${esc(trip.title)} ${first.iso2 ? flagHTML(first.iso2, first.name, 18) : ''}`;
    $('dreamReason').textContent = (trip.stops ?? []).map(st => placeInfo(st.placeId).name).join(' → ');
    return;
  }
  tripId = null;
  const p = placeInfo(wish.placeId);
  const d = dday(wish.target, today);
  card.href = '#wish';
  card.setAttribute('aria-label', '가장 가까운 꿈, 위시리스트로 이동');
  $('dreamEyebrow').textContent = '✦ 가장 가까운 꿈';
  $('dreamD').textContent = d === 0 ? 'D-Day' : `D-${d}`;
  $('dreamDate').textContent = fmtDate(wish.target);
  $('dreamName').innerHTML = `${esc(wish.label || p.name)} ${flagHTML(p.iso2, p.name, 18)}`;
  $('dreamReason').textContent = wish.reason || p.sub;
}
