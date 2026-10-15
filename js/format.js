// 화면 표시용 글자 만들기(날짜, 별점, 동행, 색)
import { COMPANIONS, tripDays } from './stats.js';

const ymd = s => s.split('-').map(Number);

// '2025-10-03' → '2025. 10. 3', withYear=false면 '10. 3'
export function fmtDate(s, withYear = true) {
  if (!s) return '';
  const [y, m, d] = ymd(s);
  const md = d ? `${m}. ${d}` : `${m}`;
  return withYear ? `${y}. ${md}` : md;
}

// 여행 기간: 같은 해면 뒤쪽 연도 생략. withYear=false면 앞쪽 연도도 생략(연도별 타임라인 안)
export function fmtRange(trip, withYear = true) {
  if (!trip.start) return '날짜 미상';
  const end = trip.end || trip.start;
  const sameYear = end.slice(0, 4) === trip.start.slice(0, 4);
  const a = fmtDate(trip.start, withYear || !sameYear);
  if (end === trip.start) return a;
  return `${a} — ${fmtDate(end, !sameYear)}`;
}

export const fmtStars = n => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');

// 타임라인 한 줄: '10. 3 — 10. 8 · 가족 · 6일'
export function fmtTripMeta(trip, withYear = false) {
  const days = tripDays(trip);
  return [fmtRange(trip, withYear), COMPANIONS[trip.companion], days ? `${days}일` : '', trip.partySize > 1 ? `${trip.partySize}명` : '']
    .filter(Boolean).join(' · ');
}

// 여행 대표 색 토큰 → CSS 색
export const TRIP_COLORS = ['v1', 'v2', 'v3', 'v4', 'gold'];
export const colorVar = token => (TRIP_COLORS.includes(token) ? `var(--${token})` : 'var(--v1)');

export const WISH_PRIORITY = { confirmed: '확정', nextyear: '내년', someday: '언젠가', dream: '꿈' };
export const PRIORITY_ORDER = ['confirmed', 'nextyear', 'someday', 'dream'];

export const won = n => (n ? `${Math.round(n / 10000).toLocaleString('ko-KR')}만 원` : '');
