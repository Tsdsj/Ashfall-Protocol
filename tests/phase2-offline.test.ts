import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
type WorkerEvent = {
  waitUntil(p: Promise<unknown>): void;
  request?: { method: string; url: string; mode: string };
  respondWith?(p: Promise<Response>): void;
};
function workerHarness() {
  const listeners = new Map<string, (e: WorkerEvent) => void>(),
    stores = new Map<string, Map<string, Response>>(),
    messages: Record<string, unknown>[] = [];
  const files = [
    "/index.html",
    "/app.js",
    ...Array.from({ length: 10 }, (_, n) => "/asset-" + n),
  ];
  let active = 0,
    peak = 0,
    bad = false,
    offline = false;
  const key = (v: string | { url: string }) =>
    typeof v === "string" ? v : new URL(v.url).pathname;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        match: async (value: string | { url: string }) =>
          store.get(key(value))?.clone(),
        put: async (value: string | { url: string }, response: Response) => {
          store.set(key(value), response.clone());
        },
      };
    },
  };
  const fetch = async (value: string | { url: string }) => {
    if (offline) throw Error("Network disconnected");
    const path = key(value);
    if (path === "/precache.json")
      return Response.json({ version: "qa-current", files });
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 2));
    active--;
    return new Response("asset:" + path, {
      status: bad && path === "/asset-3" ? 503 : 200,
    });
  };
  const self = {
    location: { origin: "https://ashfall.test" },
    clients: {
      matchAll: async () => [
        {
          postMessage: (value: Record<string, unknown>) => messages.push(value),
        },
      ],
      claim: async () => {},
    },
    skipWaiting: async () => {},
    addEventListener: (name: string, callback: (e: WorkerEvent) => void) =>
      listeners.set(name, callback),
  };
  vm.runInNewContext(
    readFileSync("public/sw.js", "utf8").replace(
      "__ASHFALL_BUILD_HASH__",
      "qa-current",
    ),
    { self, caches, fetch, Response, URL, console },
  );
  return {
    stores,
    messages,
    files,
    get peak() {
      return peak;
    },
    set bad(value: boolean) {
      bad = value;
    },
    set offline(value: boolean) {
      offline = value;
    },
    async cache(name: string, path: string, text: string) {
      const c = await caches.open(name);
      await c.put(path, new Response(text));
    },
    async run(name: string) {
      let pending: Promise<unknown> | undefined;
      listeners.get(name)!({
        waitUntil: (p) => {
          pending = p;
        },
      });
      await pending;
    },
    async request(path: string, mode = "navigate") {
      let response: Promise<Response> | undefined;
      listeners.get("fetch")!({
        waitUntil: () => {},
        request: { method: "GET", url: "https://ashfall.test" + path, mode },
        respondWith: (p) => {
          response = p;
        },
      });
      return response!;
    },
  };
}
describe("实际 Service Worker 的离线事务", () => {
  it("最多三个资源请求同时进行，只在全部文件成功后写就绪标记", async () => {
    const h = workerHarness();
    await h.run("install");
    expect(h.peak).toBeLessThanOrEqual(3);
    expect(
      h.stores.get("ashfall-offline-qa-current")?.has("/precache.json"),
    ).toBe(true);
    expect(h.messages.at(-1)?.state).toBe("ready");
    h.offline = true;
    expect(await (await h.request("/")).text()).toBe("asset:/index.html");
  });
  it("下载失败保留旧缓存，不假报离线可用；重试补齐后才就绪", async () => {
    const h = workerHarness();
    await h.cache("ashfall-offline-previous", "/index.html", "previous-game");
    h.bad = true;
    await expect(h.run("install")).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 30));
    expect(h.stores.get("ashfall-offline-previous")?.has("/index.html")).toBe(
      true,
    );
    expect(
      h.stores.get("ashfall-offline-qa-current")?.has("/precache.json"),
    ).toBe(false);
    expect(h.messages.at(-1)?.state).toBe("failed");
    h.bad = false;
    await h.run("install");
    expect(h.messages.at(-1)?.state).toBe("ready");
    expect(h.stores.get("ashfall-offline-qa-current")?.size).toBe(
      h.files.length + 1,
    );
  });
  it("激活只清理本游戏过期版本，保留当前、上一版与其它应用缓存", async () => {
    const h = workerHarness();
    await h.cache("unrelated-app", "/data", "untouched");
    await h.cache("ashfall-offline-obsolete", "/index.html", "old");
    await h.cache("ashfall-offline-previous", "/index.html", "previous");
    await h.run("install");
    await h.run("activate");
    expect([...h.stores.keys()]).toEqual([
      "unrelated-app",
      "ashfall-offline-previous",
      "ashfall-offline-qa-current",
    ]);
  });
});
