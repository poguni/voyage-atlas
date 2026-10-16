// 도시 핀(F1-10): 다녀온 도시를 금빛 점으로 표시합니다. 이름은 확대해야 보이고, 많이 간 도시일수록 먼저 보입니다.
import { esc } from '../env.js';
import { placeInfo } from '../places.js';

// 이름을 보일 지도 폭(px) × 확대 배율: [1회, 2회, 3회 이상]
const LABEL_PX = { world: [3000, 2200, 1500], korea: [1400, 1000, 700] };

export const toggleCityLabels = m => m.pins.selectAll('.city-pin text')
  .attr('hidden', function () { return m.w * m.k < +this.dataset.px ? '' : null; });

/**
 * @param rows   visitedCities 결과 [{ placeId, count }]
 * @param mapOf  placeId → 그 도시가 속한 땅의 장소 ID
 */
export function drawCityPins(m, rows, app, { scale = 'world', mapOf }) {
  const px = LABEL_PX[scale];
  for (const { placeId, count } of rows) {
    const info = placeInfo(placeId);
    if (!info.ll) continue;
    const xy = m.proj(info.ll), mapId = mapOf(info);
    const g = m.pin(m.pins, xy, 'city-pin');
    g.append('circle').attr('r', 4);
    g.append('text').attr('class', 'label').attr('x', 7).attr('dy', '.35em').attr('data-px', px[Math.min(count, 3) - 1]).text(info.name);
    m.hover(g, () => `<b>${esc(info.name)}</b><span class="dim">${esc(info.sub)}</span><br><span style="color:var(--gold-strong)">${esc(app.statusText(placeId))}</span>`);
    g.on('click', e => { e.stopPropagation(); app.onPlace(e, placeId, m.pathOf(mapId), xy, mapId); });
  }
  toggleCityLabels(m);
}
