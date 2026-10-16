// PWA(Phase 5g): 서비스 워커 등록, 캐시 채우기, 오프라인 표시(DESIGN.md 11장: 상단 알약 + AI 버튼 비활성)
const $ = id => document.getElementById(id);

// 처음 화면에서 쓰지 않아 아직 받지 않은 파일(오프라인에서 필요할 때를 위해 미리 받음)
const LAZY = ['data/countries-50m.json', 'data/korea-sigungu.json', 'data/cities.json', 'manifest.webmanifest',
  'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png', 'assets/icons/apple-touch-icon.png'];

function showNetwork() {
  const off = !navigator.onLine;
  $('offlinePill').hidden = !off;
  document.body.classList.toggle('offline', off);
  $('aiRun').disabled = off;
  $('aiRun').title = off ? '오프라인에서는 AI 추천을 받을 수 없어요' : '';
}

/** @param iso2List 국기 이미지를 미리 받을 나라 코드 */
export function initPwa(iso2List) {
  addEventListener('online', showNetwork);
  addEventListener('offline', showNetwork);
  showNetwork();
  if (!('serviceWorker' in navigator) || !isSecureContext) return;
  navigator.serviceWorker.register('sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(reg => setTimeout(() => {
      // 지금까지 받은 파일(앱 코드·라이브러리·글꼴·지도) + 국기 전체 + 아직 안 받은 데이터
      const urls = [
        ...performance.getEntriesByType('resource').map(e => e.name),
        ...iso2List.map(c => `assets/flags/${c.toLowerCase()}.svg`),
        ...LAZY,
      ].map(u => new URL(u, location.href).href);
      reg.active?.postMessage({ type: 'warm', urls });
    }, 4000))
    .catch(err => console.warn('서비스 워커를 등록하지 못했어요.', err));
}
