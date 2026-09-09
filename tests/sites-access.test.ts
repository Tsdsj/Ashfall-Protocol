import { describe, expect, it, vi } from "vitest";
import gate, { type HostingEnvironment } from "../src/hosting/password-gate";

function environment() {
  return {
    SITE_PASSWORD: "test-password-only",
    SITE_SESSION_SECRET: "test-signing-secret-not-a-production-value",
    SITE_ORIGIN: "https://game.example",
    SITE_ASSET_VERSION: "0123456789abcdef",
    SITE_DEPLOY_SECRET: "test-deployment-secret-not-a-production-value",
    GAME_ASSETS: {
      get: vi.fn(async () => ({
        body: new Response("game asset").body!,
        size: 10,
        httpEtag: '"test"',
        writeHttpMetadata(headers: Headers) {
          headers.set("Content-Type", "text/javascript");
        },
      })),
      put: vi.fn(
        async (
          ..._args: Parameters<HostingEnvironment["GAME_ASSETS"]["put"]>
        ) => ({}),
      ),
    },
  } satisfies HostingEnvironment;
}
function request(path = "/", headers: Record<string, string> = {}) {
  return new Request("https://game.example" + path, { headers });
}
function login(password: string, origin = "https://game.example") {
  return new Request("https://game.example/__access/login", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ password }),
  });
}

describe("Sites password access", () => {
  it("keeps ordinary full-object responses cacheable when R2 reports a full range", async () => {
    const env = environment();
    const response = await gate.fetch(login(env.SITE_PASSWORD), env);
    const cookie = response.headers.get("Set-Cookie")!.split(";")[0]!;
    env.GAME_ASSETS.get.mockImplementationOnce(async () => {
      const asset = {
        body: new Response("game asset").body!,
        size: 10,
        httpEtag: '"full"',
        range: { offset: 0, length: 10 },
        writeHttpMetadata(headers: Headers) {
          headers.set("Content-Type", "text/javascript");
        },
      };
      return asset;
    });
    const asset = await gate.fetch(
      request("/assets/game.js", { Cookie: cookie }),
      env,
    );
    expect(asset.status).toBe(200);
    expect(asset.headers.has("Content-Range")).toBe(false);
    expect(asset.headers.get("Content-Length")).toBe("10");
  });
  it("requires the deployment secret and a matching checksum before storing assets", async () => {
    const env = environment(),
      bytes = new TextEncoder().encode("game asset");
    const sha256 = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const put = (secret: string, checksum = sha256) =>
      new Request(
        "https://game.example/__access/upload?version=0123456789abcdef&key=assets/game.js",
        {
          method: "PUT",
          body: bytes,
          headers: {
            Authorization: "Bearer " + secret,
            "Content-Type": "text/javascript",
            "X-Asset-Sha256": checksum,
          },
        },
      );
    expect((await gate.fetch(put(env.SITE_PASSWORD), env)).status).toBe(401);
    expect(
      (await gate.fetch(put(env.SITE_DEPLOY_SECRET, "invalid"), env)).status,
    ).toBe(400);
    expect(env.GAME_ASSETS.put).not.toHaveBeenCalled();
    const stored = await gate.fetch(put(env.SITE_DEPLOY_SECRET), env);
    expect(stored.status).toBe(200);
    expect((await stored.json()).sha256).toBe(sha256);
    expect(env.GAME_ASSETS.put).toHaveBeenCalledOnce();
    expect(env.GAME_ASSETS.put.mock.calls[0]![0]).toBe(
      "0123456789abcdef/assets/game.js",
    );
  });
  it("returns authenticated byte ranges with correct media response headers", async () => {
    const env = environment();
    const loginResponse = await gate.fetch(login(env.SITE_PASSWORD), env);
    const cookie = loginResponse.headers.get("Set-Cookie")!.split(";")[0]!;
    env.GAME_ASSETS.get.mockImplementationOnce(async () => {
      const asset = {
        body: new Response("part").body!,
        size: 100,
        httpEtag: '"range"',
        range: { offset: 4, length: 4 },
        writeHttpMetadata(headers: Headers) {
          headers.set("Content-Type", "audio/mpeg");
        },
      };
      return asset;
    });
    const response = await gate.fetch(
      request("/audio/example.mp3", { Cookie: cookie, Range: "bytes=4-7" }),
      env,
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 4-7/100");
    expect(response.headers.get("Content-Length")).toBe("4");
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(await response.text()).toBe("part");
  });
  it("shows only the password form and denies direct scripts, assets and manifest without a session", async () => {
    const env = environment();
    const page = await gate.fetch(request(), env);
    expect(page.status).toBe(200);
    expect(await page.text()).not.toContain(env.SITE_PASSWORD);
    for (const path of [
      "/assets/game.js",
      "/assets/characters/survivor-male-high.glb",
      "/precache.json",
      "/sw.js",
    ])
      expect((await gate.fetch(request(path), env)).status).toBe(401);
    expect(env.GAME_ASSETS.get).not.toHaveBeenCalled();
  });
  it("rejects incorrect, overlong and cross-origin submissions without issuing cookies", async () => {
    const env = environment();
    for (const req of [
      login("incorrect"),
      login("x".repeat(3000)),
      login(env.SITE_PASSWORD, "https://other.example"),
    ]) {
      const response = await gate.fetch(req, env);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.headers.get("Set-Cookie")).toBeNull();
    }
  });
  it("issues a secure signed session and serves the real asset only after verification", async () => {
    const env = environment();
    const response = await gate.fetch(login(env.SITE_PASSWORD), env);
    expect(response.status).toBe(303);
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain("Secure; HttpOnly; SameSite=Lax");
    expect(cookie).not.toContain(env.SITE_PASSWORD);
    const asset = await gate.fetch(
      request("/assets/game.js", { Cookie: cookie.split(";")[0]! }),
      env,
    );
    expect(await asset.text()).toBe("game asset");
    expect(asset.headers.get("X-Ashfall-Access")).toBe("verified");
    expect(env.GAME_ASSETS.get).toHaveBeenCalledOnce();
  });
  it("rejects tampered, expired and password-rotated sessions", async () => {
    const env = environment();
    const response = await gate.fetch(login(env.SITE_PASSWORD), env);
    const cookie = response.headers.get("Set-Cookie")!.split(";")[0]!;
    const token = cookie.split("=")[1]!,
      parts = token.split(".");
    parts[1] = (parts[1]![0] === "a" ? "b" : "a") + parts[1]!.slice(1);
    expect(
      (
        await gate.fetch(
          request("/assets/game.js", {
            Cookie: cookie.split("=")[0] + "=" + parts.join("."),
          }),
          env,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await gate.fetch(request("/assets/game.js", { Cookie: cookie }), {
          ...env,
          SITE_PASSWORD: "changed",
        })
      ).status,
    ).toBe(401);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 86401_000);
    try {
      expect(
        (await gate.fetch(request("/assets/game.js", { Cookie: cookie }), env))
          .status,
      ).toBe(401);
    } finally {
      clock.mockRestore();
    }
  });
  it("fails closed when secrets are missing and never serves server output", async () => {
    const env = environment();
    expect(
      (await gate.fetch(request(), { ...env, SITE_SESSION_SECRET: "" })).status,
    ).toBe(503);
    const response = await gate.fetch(login(env.SITE_PASSWORD), env);
    const cookie = response.headers.get("Set-Cookie")!.split(";")[0]!;
    expect(
      (await gate.fetch(request("/server/index.js", { Cookie: cookie }), env))
        .status,
    ).toBe(404);
    expect(env.GAME_ASSETS.get).not.toHaveBeenCalled();
  });
});
