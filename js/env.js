// 실행 환경 공통 값
export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// 애니메이션 줄이기: 금박 광택(SMIL)을 없앱니다(DESIGN.md 10장).
if (REDUCED) document.querySelectorAll('.smil').forEach(n => n.remove());

// innerHTML에 넣을 글자를 안전하게 바꿉니다.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
