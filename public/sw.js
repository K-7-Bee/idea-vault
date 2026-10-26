// Lets the vault open with no connection.
// - Page code and icons: saved the first time they load, then served from the phone.
// - The /vault page: always fetched fresh when online; the last copy is used when offline.
// Saving ideas offline is handled by the page itself (an on-device outbox), not here.
const VERSION = "v1";
const ASSETS = `vault-assets-${VERSION}`;
const PAGES = `vault-pages-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== ASSETS && key !== PAGES) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch Supabase or other sites

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/pwa-icon/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(event, url));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirstPage(event, url) {
  try {
    const response = await fetch(event.request);
    // Keep a copy of the vault page, but never a login redirect or an error.
    if (url.pathname === "/vault" && response.ok && !response.redirected) {
      const copy = response.clone();
      event.waitUntil(caches.open(PAGES).then((cache) => cache.put("/vault", copy)));
    }
    return response;
  } catch {
    if (url.pathname === "/vault") {
      const cached = await caches.match("/vault", { cacheName: PAGES });
      if (cached) return cached;
    }
    return new Response("You're offline, and this page hasn't been saved on this device yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
