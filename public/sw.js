const PREFIX = "ashfall-offline-";
// The build script replaces this token with the content hash of the complete asset set.
const VERSION = "__ASHFALL_BUILD_HASH__";
const CACHE_NAME = PREFIX + VERSION;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch("/precache.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Offline manifest unavailable");
      const manifest = await response.json();
      if (manifest.version !== VERSION)
        throw new Error("Build changed during cache installation");
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(manifest.files);
      await cache.put(
        "/precache.json",
        new Response(JSON.stringify(manifest), {
          headers: { "Content-Type": "application/json" },
        }),
      );
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const owned = (await caches.keys()).filter((key) =>
        key.startsWith(PREFIX),
      );
      const previous = owned.filter((key) => key !== CACHE_NAME).at(-1);
      await Promise.all(
        owned
          .filter((key) => key !== CACHE_NAME && key !== previous)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      if (event.request.mode === "navigate") {
        try {
          return await fetch(event.request);
        } catch {
          return (
            (await cache.match("/index.html", { ignoreVary: true })) ||
            Response.error()
          );
        }
      }
      // These are immutable public game assets. Preview CORS headers must not turn
      // an Origin-less precache request into a miss for crossorigin module loads.
      let cached = await cache.match(event.request, { ignoreVary: true });
      if (!cached) {
        const previous = (await caches.keys()).filter(
          (key) => key.startsWith(PREFIX) && key !== CACHE_NAME,
        );
        for (const name of previous) {
          cached = await (
            await caches.open(name)
          ).match(event.request, { ignoreVary: true });
          if (cached) break;
        }
      }
      return cached || fetch(event.request);
    })(),
  );
});
