/* Andromeda Quest service worker: keeps the game on the player's device.
   - Game files (HTML, CSS, our JS): network first, so updates show up straight away;
     the saved copy is used when offline or when the network is slower than 2.5 s.
   - Libraries in js/lib/ (version numbers in their names, they never change):
     cache first, saved the first time they're needed, so nothing extra downloads up front.
   - Google Fonts: saved copy shown at once, refreshed in the background.
   - Everything else (online play's PeerJS broker, WebRTC) is never touched. */
const APP = "aq-app-v1";
const LIBS = "aq-libs-v1";
const FONTS = "aq-fonts-v1";
const KEEP = [APP, LIBS, FONTS];

// small set of files needed to open the game offline (big libraries are saved on first use)
const SHELL = [
  "./", "index.html", "css/style.css",
  "js/loader.js", "js/rng.js", "js/net.js", "js/audio.js", "js/music.js", "js/camera.js",
  "js/particles.js", "js/starfield.js", "js/board.js", "js/game.js", "js/dice.js",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("aq-") && !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(APP);
  const fromNet = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  fromNet.catch(() => { /* handled below */ });
  // a slow network shouldn't hold the page up when a saved copy exists
  const slow = new Promise(resolve => setTimeout(resolve, 2500)).then(() => cache.match(req, { ignoreSearch: true }));
  try {
    return (await Promise.race([fromNet, slow.then(r => r || fromNet)])) || fromNet;
  } catch {
    const saved = await cache.match(req, { ignoreSearch: true });
    if (saved) return saved;
    throw new Error("offline and not saved");
  }
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const update = fetch(req).then(res => {
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || update;
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.includes("/js/lib/")) return event.respondWith(cacheFirst(req, LIBS));
    if (url.pathname.endsWith("/sw.js")) return; // always straight from the network
    return event.respondWith(networkFirst(req));
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    return event.respondWith(staleWhileRevalidate(req, FONTS));
  }
  // anything else (PeerJS broker etc.) goes to the network untouched
});
