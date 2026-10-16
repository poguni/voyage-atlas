// 토스트(DESIGN.md 6.15): 화면 아래 중앙, 5초 후 사라짐, 되돌릴 수 있으면 [실행 취소]
const wrap = () => document.getElementById('toasts');

/**
 * @param html    문구(호출하는 쪽에서 이스케이프)
 * @param action  { label, fn } 선택
 */
export function toast(html, action) {
  const t = document.createElement('div');
  t.className = 'toast glass';
  t.innerHTML = `<span>${html}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.onclick = () => { action.fn(); t.remove(); };
    t.append(b);
  }
  const w = wrap();
  // 토스트가 쌓이지 않게 최근 3개만 남깁니다.
  const old = w.querySelectorAll('.toast');   // 백업 권유 배너는 남김
  for (let i = 0; i <= old.length - 3; i++) old[i].remove();
  w.append(t);
  setTimeout(() => t.remove(), 5000);
}
