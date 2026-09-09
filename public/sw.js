const PREFIX = "ashfall-offline-";
const VERSION = "__ASHFALL_BUILD_HASH__";
const CACHE_NAME = PREFIX + VERSION;
let status = { state: "preparing", completed: 0, total: 0, version: VERSION };
async function announce(value) {
  status = { ...status, ...value };
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients)
    client.postMessage({ type: "ashfall-offline", ...status });
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch("/precache.json", { cache: "no-store" });
        if (!response.ok) throw new Error("Offline manifest unavailable");
        const manifest = await response.json();
        if (manifest.version !== VERSION)
          throw new Error("Build changed during cache installation");
        const cache = await caches.open(CACHE_NAME);
        await announce({
          state: "preparing",
          total: manifest.files.length,
          completed: 0,
        });
        let next = 0,
          completed = 0;
        const worker = async () => {
          while (next < manifest.files.length) {
            const url = manifest.files[next++];
            if (!(await cache.match(url, { ignoreVary: true }))) {
              const asset = await fetch(url);
              if (!asset.ok)
                throw new Error("Offline asset unavailable: " + url);
              await cache.put(url, asset);
            }
            completed++;
            if (completed % 8 === 0 || completed === manifest.files.length)
              await announce({ completed });
          }
        };
        // Three bounded queues avoid hundreds of simultaneous asset requests during the first game.
        await Promise.all([worker(), worker(), worker()]);
        await cache.put(
          "/precache.json",
          new Response(JSON.stringify(manifest), {
            headers: { "Content-Type": "application/json" },
          }),
        );
        await announce({ state: "ready", completed: manifest.files.length });
        await self.skipWaiting();
      } catch (error) {
        await announce({ state: "failed", message: String(error) });
        throw error;
      }
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
      await announce({ state: "ready" });
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "ashfall-offline-status") return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME),
        complete = await cache.match("/precache.json");
      if (complete) {
        const manifest = await complete.json();
        event.source?.postMessage({
          type: "ashfall-offline",
          state: "ready",
          completed: manifest.files.length,
          total: manifest.files.length,
          version: VERSION,
        });
      } else event.source?.postMessage({ type: "ashfall-offline", ...status });
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
