// 앱 진입점: 별 배경, 지도 보기 전환(세계 / 대한민국), 확대 버튼
import './env.js';
import { drawSky } from './ui/sky.js';
import { worldView } from './map/world.js';
import { koreaView } from './map/korea.js';

const VIEWS = { world: worldView, korea: koreaView };
const box = document.getElementById('map');
let current = null;      // 현재 지도 객체
let viewName = 'world';
let seq = 0;             // 빠르게 전환할 때 늦게 끝난 이전 그리기를 버리기 위한 번호

try { const v = localStorage.getItem('va-view'); if (VIEWS[v]) viewName = v; } catch (e) {}

async function show(name) {
  viewName = name;
  try { localStorage.setItem('va-view', name); } catch (e) {}
  document.querySelectorAll('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  document.getElementById('legendWorld').hidden = name !== 'world';
  document.getElementById('legendKorea').hidden = name !== 'korea';

  const my = ++seq;
  current?.destroy();
  current = null;
  try {
    const m = await VIEWS[name](box);
    if (my !== seq) { m?.destroy(); return; }
    current = m;
    box.querySelectorAll('.map-skeleton, .map-error').forEach(n => n.remove());
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p class="map-error">지도 데이터를 불러오지 못했어요.<br>로컬 서버로 실행했는지 확인해 주세요(docs/README_dev.md).</p>';
  }
}

document.getElementById('viewSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]');
  if (b && !b.disabled && VIEWS[b.dataset.view] && b.dataset.view !== viewName) show(b.dataset.view);
});
document.getElementById('zIn').onclick = () => current?.zoomBy(1.6);
document.getElementById('zOut').onclick = () => current?.zoomBy(1 / 1.6);
document.getElementById('zReset').onclick = () => current?.reset();

// 아직 만들지 않은 화면(준비 중) 탭은 이동하지 않습니다.
document.querySelectorAll('.tabbar a[aria-disabled="true"]').forEach(a => a.addEventListener('click', e => e.preventDefault()));

let rz;
addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => { drawSky(); show(viewName); }, 200);
});

drawSky();
show(viewName);
