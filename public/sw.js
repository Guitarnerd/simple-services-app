// Offline cache for set lists, so a band member's music survives the Wi-Fi
// dropping mid-service or the page being reloaded with no signal.
//
// Kept on the device:
//   - set list pages (/plans/<id>/setlist), freshest copy when online
//   - uploaded files (/files/<id>): charts and recordings
//   - the app's own scripts and styles (/_next/static)
// Nothing else is touched; every other request goes to the network as usual.
// The page clears all of this when the person logs out (see components/nav.tsx).

const CACHE = "simple-services-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request.url);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.status === 200) cache.put(request.url, response.clone());
  return response;
}

// A recording is fetched in slices so the player can seek. Offline, the slice
// is cut from the whole file saved earlier.
async function fileSlice(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request.url);
  if (!cached) return fetch(request);

  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get("range") || "");
  const blob = await cached.blob();
  if (!range) return new Response(blob, { headers: cached.headers });

  const start = Number(range[1]);
  const end = range[2] ? Math.min(Number(range[2]), blob.size - 1) : blob.size - 1;
  const headers = new Headers(cached.headers);
  headers.set("Content-Range", `bytes ${start}-${end}/${blob.size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(blob.slice(start, end + 1), { status: 206, headers });
}

// `key` is the address without its "?song=..." part, so one saved copy serves
// the set list whichever song it is opened on.
async function networkFirst(request, key) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    // A redirect means the session ended and this is the sign-in page: don't keep it.
    if (response.ok && !response.redirected) cache.put(key, response.clone());
    return response;
  } catch {
    const cached = await cache.match(key);
    if (cached) return cached;
    return new Response("You're offline, and this set list hasn't been saved on this device.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (url.pathname.startsWith("/files/")) {
    event.respondWith(request.headers.has("range") ? fileSlice(request) : cacheFirst(request));
  } else if (/^\/plans\/[^/]+\/setlist$/.test(url.pathname) && !url.searchParams.has("_rsc")) {
    event.respondWith(networkFirst(request, url.origin + url.pathname));
  }
});
