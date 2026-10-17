// 장소 팝오버(DESIGN.md 6.4, PRD F2-1): 지도 위 클릭 지점에 꼬리와 함께 표시
// 미방문: [✦ 긁어서 방문 표시] [☆ 위시에 담기] [＋ 기록 추가]
// 방문함: [◎ 상세 보기] [☆ 위시] [＋ 기록 추가]
// 아래 줄: 경유로 표시 / 경유 표시 지우기 / 방문 표시 지우기
import { photoURL } from '../photos.js';
import { flagHTML } from './flag.js';
import { esc } from '../env.js';

const $ = id => document.getElementById(id);
let target = null;     // { placeId, el, xy, status, count, simple }
let returnFocus = null;

/** h: { scratch, detail, wish, record, transit, clear } — 각각 target을 받음 */
export function initPopover(h) {
  $('popMain').onclick = () => target && (target.status === 'visited' ? h.detail(target) : h.scratch(target));
  $('popWish').onclick = () => target && h.wish(target);
  $('popRecord').onclick = () => target && h.record(target);
  $('popTransit').onclick = () => target && h.transit(target);
  $('popClear').onclick = () => target && h.clear(target);
  $('popClose').onclick = () => closePopover(true);
  $('popPhoto').onclick = () => target && h.detail(target);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('popover').hidden) closePopover(true); });
}

export const popoverTarget = () => target;

/**
 * @param t       { placeId, el, xy(지도 좌표) }
 * @param screen  [x, y] 지도 상자 안 화면 좌표
 * @param v       { name, sub, iso2, status: 'visited'|'transit'|'none', count, simple(단순 표시만 있음), wished, desc? }
 * @param focus   키보드로 열었으면 첫 버튼에 포커스
 */
export function openPopover(t, screen, v, { focus = false, around = t.around } = {}) {
  target = { ...t, around, status: v.status, count: v.count, simple: v.simple };
  const pop = $('popover');
  const box = pop.parentElement;
  returnFocus = focus ? document.activeElement : null;

  $('popFlag').innerHTML = flagHTML(v.iso2, v.name, 30);
  // 대표 사진(F2-10)이 있으면 이름 옆에 작게
  const ph = $('popPhoto'), id = t.placeId;
  ph.hidden = true; ph.removeAttribute('src');
  photoURL(id).then(u => { if (u && target?.placeId === id) { ph.src = u; ph.alt = `${v.name} 대표 사진`; ph.hidden = false; } });
  $('popName').textContent = v.name;
  const statusText = v.status === 'visited' ? `방문 ${v.count}회` : v.status === 'transit' ? '경유' : v.wished ? '위시리스트' : '미방문';
  $('popMeta').textContent = [v.sub, statusText].filter(Boolean).join(' · ');
  $('popDesc').textContent = v.desc ?? (v.status === 'visited'
    ? `${v.count}번 다녀왔어요. 방문 기록을 더하거나 상세를 볼 수 있어요.`
    : v.status === 'transit'
      ? '공항만 들렀어요(경유). 긁어서 방문으로 바꿀 수 있어요.'
      : '아직 금박에 덮여 있어요. 긁어서 첫 방문을 기록해 볼까요?');
  $('popMain').textContent = v.status === 'visited' ? '◎ 상세 보기' : '✦ 긁어서 방문 표시';
  $('popWish').textContent = v.wished ? '★ 위시에서 빼기' : (v.status === 'visited' ? '☆ 위시' : '☆ 위시에 담기');
  $('popWish').setAttribute('aria-pressed', String(v.wished));

  // 경유·지우기: 여행 기록으로 생긴 방문은 여기서 지우지 않습니다(Phase 2 기록 화면에서 관리).
  $('popTransit').hidden = v.status === 'visited';
  $('popTransit').textContent = v.status === 'transit' ? '경유 표시 지우기' : '✈ 경유로 표시';
  $('popClear').hidden = !(v.status === 'visited' && v.simple);

  // 위치: 좌우는 상자 안으로, 위쪽 공간이 부족하면 아래로 뒤집기
  const cw = box.clientWidth;
  pop.style.left = Math.max(155, Math.min(cw - 155, screen[0])) + 'px';
  let below = screen[1] < Math.min(360, box.clientHeight * 0.45), y = screen[1];
  pop.hidden = false;
  // around(검색으로 찾은 곳의 화면 영역): 장소를 가리지 않게 그 위에, 자리가 없으면 아래에 붙임
  if (around) {
    const ph = pop.offsetHeight + 18, [[, top], [, bottom]] = around;
    // 위쪽 도구줄 아래 ~ 아래쪽 탭 바 위(상자 기준 좌표)
    const bt = box.getBoundingClientRect().top;
    const minY = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? bt) - bt + 8;
    const maxY = Math.min(box.clientHeight, ($('tabbar')?.getBoundingClientRect().top ?? Infinity) - bt) - 8;
    if (top - ph >= minY) { below = false; y = top; }
    else if (bottom + ph <= maxY) { below = true; y = bottom; }
    else below = y - ph < minY;   // 자리가 없으면 장소 가운데에, 위로 열면 도구줄에 가려질 때만 아래로
  }
  pop.classList.toggle('below', below);
  pop.style.top = Math.max(8, y) + 'px';
  if (focus) $('popMain').focus();
}

export function closePopover(restore = false) {
  const pop = $('popover');
  if (pop.hidden) return;
  pop.hidden = true;
  target = null;
  if (restore && returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}
