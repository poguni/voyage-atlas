// 서비스 워커(PRD 7.3 오프라인, Phase 5g): 여행지에서 인터넷 없이도 앱을 열고 기록할 수 있게 캐시합니다.
// - 앱 코드(html·js·css): 네트워크 먼저(늘 최신), 안 되면 캐시 → 배포할 때 캐시 이름을 바꾸지 않아도 됩니다.
// - 지도·국기·도시 데이터, 라이브러리(jsDelivr), 글꼴: 캐시 먼저, 뒤에서 새로 받아 둠
// - OpenRouter(AI 추천) 등 다른 주소는 건드리지 않습니다.
// 페이지가 처음 열린 뒤 'warm' 메시지로 이미 받은 파일과 국기·지도 전체를 캐시에 채웁니다(js/pwa.js).
const CACHE = 'va-cache-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'assets/icons/icon.svg', 'assets/icons/icon-192.png'];
const CDN = ['https://cdn.jsdelivr.net', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
const NET_TIMEOUT = 4000;   // 느린 네트워크에서 이만큼 기다린 뒤 캐시로

const allowed = url => url.origin === self.location.origin || CDN.includes(url.origin);
const isCode = url => url.origin === self.location.origin && (/\.(html|js|css|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/'));
const keep = res => res && res.ok && res.type !== 'opaque';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('va-cache-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req, fallback) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then(res => { if (keep(res)) cache.put(req, res.clone()); return res; });
  const timer = new Promise(res => setTimeout(res, NET_TIMEOUT));
  try {
    const res = await Promise.race([net, timer.then(() => null)]);
    if (res) return res;
  } catch { /* 오프라인 */ }
  const hit = await cache.match(req, { ignoreSearch: true }) ?? (fallback && await cache.match(fallback));
  return hit ?? net;   // 캐시에도 없으면 네트워크를 끝까지 기다림
}

async function cacheFirst(req, event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (keep(res)) cache.put(req, res.clone()); return res; });
  if (hit) { event.waitUntil(net.catch(() => {})); return hit; }
  return net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!allowed(url)) return;
  if (req.mode === 'navigate') e.respondWith(networkFirst(req, 'index.html'));
  else if (isCode(url)) e.respondWith(networkFirst(req));
  else e.respondWith(cacheFirst(req, e));
});

// 캐시 채우기: 아직 없는 것만 6개씩 받아 둡니다.
self.addEventListener('message', e => {
  if (e.data?.type !== 'warm') return;
  const urls = [...new Set(e.data.urls)].filter(u => { try { return allowed(new URL(u, self.location.href)); } catch { return false; } });
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const todo = [];
    for (const u of urls) if (!(await cache.match(u))) todo.push(u);
    for (let i = 0; i < todo.length; i += 6) {
      await Promise.all(todo.slice(i, i + 6).map(u => fetch(u, { mode: new URL(u, self.location.href).origin === self.location.origin ? 'same-origin' : 'cors' })
        .then(res => keep(res) && cache.put(u, res)).catch(() => {})));
    }
  })());
});
