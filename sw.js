// PONGTRESS 서비스 워커 — 오프라인 캐시 (프로토타입: 네트워크 우선, 실패 시 캐시)
// 에셋(assets/…)은 요청될 때마다 캐시에 쌓이므로 목록에는 앱 셸만 둔다. 에셋이 크게 바뀌면 CACHE 이름을 올려 옛 캐시를 비운다.
const CACHE = 'pongtress-v0-3';
const ASSETS = [
  './', './index.html', './css/game.css', './js/audio.js', './js/spritemeta.js', './js/content.js', './js/meta.js', './js/game.js', './manifest.json'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
