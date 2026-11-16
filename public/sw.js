// Cache static assets only. Private navigation requires a network response.
// Already-open offline capture uses the page's on-device outbox.
const VERSION = "v1";
const ASSETS = `vault-assets-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  // Retain existing caches; legacy private HTML is never read by this worker.
  event.waitUntil(self.clients.claim());
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
    event.respondWith(networkPage(request, url));
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

async function networkPage(request, url) {
  const isPrivate = url.pathname === "/vault" || url.pathname.startsWith("/vault/");
  try {
    return await (isPrivate ? fetch(request, { cache: "no-store" }) : fetch(request));
  } catch {
    return new Response(isPrivate
      ? "You're offline. Connect to the internet to open the Vault."
      : "You're offline, and this page hasn't been saved on this device yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
