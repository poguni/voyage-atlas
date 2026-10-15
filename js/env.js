// 실행 환경 공통 도구
export { motionReduced } from './settings.js';

// innerHTML에 넣을 글자를 안전하게 바꿉니다.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 한국어 조사만 돌려줍니다: 받침이 있으면 앞, 없으면 뒤(예: josa('일본', '을', '를') → '을')
export function josa(word, withFinal, withoutFinal) {
  const ch = String(word).trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) return `${withFinal}(${withoutFinal})`;   // 한글이 아니면 둘 다 표시
  return code % 28 ? withFinal : withoutFinal;
}

// 숫자 카운트업(DESIGN.md 10장: 700ms, ease-out cubic)
export function countTo(el, to, fmt = v => String(Math.round(v)), reduced = false) {
  const from = parseFloat(el.dataset.value ?? el.textContent) || 0;
  el.dataset.value = to;
  if (reduced || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 700;
  (function tick(t) {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(tick);
  })(t0);
}
