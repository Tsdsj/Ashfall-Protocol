import { describe, expect, it, vi } from "vitest";
import gate, { type HostingEnvironment } from "../src/hosting/password-gate";

function environment() {
  return {
    SITE_PASSWORD: "test-password-only",
    SITE_SESSION_SECRET: "test-signing-secret-not-a-production-value",
    SITE_ORIGIN: "https://game.example",
    ASSETS: { fetch: vi.fn(async () => new Response("game asset")) },
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
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
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
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
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
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
});
