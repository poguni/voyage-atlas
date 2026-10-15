// 지도 툴팁(DESIGN.md 7.7)
const tip = () => document.getElementById('tip');

export function showTip(e, html) {
  const t = tip();
  t.innerHTML = html;
  t.classList.add('show');
  moveTip(e);
}

export function moveTip(e) {
  const t = tip();
  const x = Math.min(e.clientX + 16, innerWidth - t.offsetWidth - 8);
  const y = Math.min(e.clientY + 16, innerHeight - t.offsetHeight - 8);
  t.style.left = x + 'px';
  t.style.top = y + 'px';
}

export function hideTip() {
  tip().classList.remove('show');
}
