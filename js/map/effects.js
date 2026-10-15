// 지도 연출: 금박 긁기, 금가루 파티클, 별 핀 (시안 scratch·particles·addStar에서 출발, DESIGN.md 7.3·6.8)
import * as d3 from 'd3';
import { motionReduced } from '../env.js';

/**
 * 금박 긁기: 클릭 지점에서 거친 원이 커지며 방문 색이 드러납니다.
 * @param m       지도 객체(createMap)
 * @param pathEl  긁을 땅 path
 * @param xy      클릭 지점(지도 root 좌표)
 * @param level   'lv1'~'lv4'
 * @param quick   빠른 색칠: 500ms(기본 850ms)
 * @returns Promise(끝나면 resolve). 그동안 pathEl.dataset.scratching이 붙어 있어 다시 칠하지 않습니다.
 */
export function scratch(m, pathEl, xy, level, { quick = false } = {}) {
  if (motionReduced() || !pathEl) return Promise.resolve();
  pathEl.dataset.scratching = '1';
  const f = d3.select(pathEl).datum();
  const [[x0, y0], [x1, y1]] = m.path.bounds(f);
  const R = Math.hypot(Math.max(xy[0] - x0, x1 - xy[0]), Math.max(xy[1] - y0, y1 - xy[1])) * 1.25 + 30;
  const id = 'scr' + Math.random().toString(36).slice(2, 8);
  const defs = m.svg.append('defs');
  const mask = defs.append('mask').attr('id', id).attr('maskUnits', 'userSpaceOnUse')
    .attr('x', -1e4).attr('y', -1e4).attr('width', 2e4).attr('height', 2e4);
  const c = mask.append('circle').attr('cx', xy[0]).attr('cy', xy[1]).attr('r', 0).attr('fill', '#fff').attr('filter', 'url(#rough)');
  const d = m.path(f);
  const clone = m.fx.append('path').attr('d', d).attr('mask', `url(#${id})`)
    .style('fill', `var(--v${level.slice(2)})`).style('pointer-events', 'none');
  const shine = m.fx.append('path').attr('d', d).attr('mask', `url(#${id})`).attr('class', 'glow')
    .style('fill', 'none').style('stroke', 'var(--gold-strong)').style('stroke-width', 1.2)
    .style('vector-effect', 'non-scaling-stroke').style('pointer-events', 'none');

  return new Promise(resolve => {
    c.transition().duration(quick ? 500 : 850).ease(d3.easeCubicOut).attr('r', R)
      .on('end interrupt', () => {
        delete pathEl.dataset.scratching;
        shine.transition().duration(500).style('opacity', 0).remove();
        clone.remove();
        setTimeout(() => defs.remove(), 520);
        resolve();
      });
  });
}

/** 금가루 파티클(캔버스). n: 기본 36개, 빠른 색칠 12개 */
export function particles(canvas, x, y, opt = {}) {
  if (motionReduced() || !canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
  const n = opt.n || 36, colors = opt.colors || ['#F6DFAE', '#E8C98A', '#B8893E', '#FFF4D6'];
  const ps = Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2, v = (opt.speed || 3) * (0.4 + Math.random());
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opt.lift || 1.5), s: 1 + Math.random() * (opt.size || 2.4), c: colors[(Math.random() * colors.length) | 0], rot: Math.random() * 6 };
  });
  const t0 = performance.now(), dur = opt.dur || 1000;
  (function tick(t) {
    const k = (t - t0) / dur;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    ps.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.vx *= 0.985; p.rot += 0.2;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.fillStyle = p.c;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.s, -p.s / 2, p.s * 2, p.s); ctx.restore();
    });
    if (k < 1) requestAnimationFrame(tick); else ctx.clearRect(0, 0, r.width, r.height);
  })(t0);
}

/** 별 핀: g는 m.pin()으로 만든 그룹(확대해도 크기 유지) */
export function addStar(g, size = 14) {
  g.classed('star', true);
  g.append('circle').attr('class', 'halo').attr('r', size * 1.6);
  g.append('use').attr('href', '#sparkle').attr('class', 'core twinkle')
    .attr('x', -size / 2).attr('y', -size / 2).attr('width', size).attr('height', size)
    .style('--tw', (3 + Math.random() * 2.5) + 's').style('animation-delay', (-Math.random() * 4) + 's');
  return g;
}
