// 별 배경: 약 220개, 15%는 금빛(DESIGN.md 3장). 같은 씨앗값으로 항상 같은 하늘을 그립니다.
export function drawSky() {
  const c = document.getElementById('sky');
  const dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  let s = 11;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 220; i++) {
    ctx.globalAlpha = rnd() * 0.7 + 0.1;
    ctx.fillStyle = rnd() > 0.85 ? '#F6DFAE' : '#FFFFFF';
    ctx.beginPath();
    ctx.arc(rnd() * innerWidth, rnd() * innerHeight, rnd() * 1.2 + 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
