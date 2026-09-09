export interface HostingEnvironment {
  SITE_PASSWORD: string;
  SITE_SESSION_SECRET: string;
  SITE_ORIGIN: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const COOKIE = "__Host-ashfall-access";
const SESSION_SECONDS = 24 * 60 * 60;
const encoder = new TextEncoder();
const privateHeaders = { "Cache-Control": "private, no-store" };

function loginPage(message = "", status = 200) {
  return new Response(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>访问验证 · 灰烬协议</title><style>
  :root{color-scheme:dark;font-family:system-ui,-apple-system,"PingFang SC",sans-serif;background:#0b1113;color:#e5e9e5}body{margin:0;min-height:100svh;display:grid;place-items:center}main{width:min(360px,calc(100% - 48px));padding:32px 0}small{color:#c09368;letter-spacing:.16em}h1{font-size:28px;margin:14px 0 12px}p{color:#aebbb8;line-height:1.7;font-size:16px}label{display:block;margin:28px 0 10px;font-size:16px}input,button{box-sizing:border-box;width:100%;min-height:48px;border-radius:6px;font:inherit}input{background:#152022;border:1px solid #54635f;color:#fff;padding:10px 12px}input:focus{outline:2px solid #dba266;outline-offset:2px}button{margin-top:18px;background:#bd8751;color:#111a18;border:0;font-weight:650;cursor:pointer}.error{color:#efb0a4;min-height:27px}button:focus-visible{outline:2px solid #fff;outline-offset:3px}</style></head><body><main><small>ASHFALL PROTOCOL</small><h1>灰烬协议</h1><p>输入访问密码，进入灰谷。</p><form method="post" action="/__access/login"><label for="password">访问密码</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="128" required autofocus><button type="submit">进入游戏</button><p class="error" role="status">${message}</p></form></main></body></html>`,
    {
      status,
      headers: {
        ...privateHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

function base64url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function signingKey(env: HostingEnvironment) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SITE_SESSION_SECRET + "\0" + env.SITE_PASSWORD),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function equalPassword(input: string, expected: string) {
  const [a, b] = await Promise.all(
    [input, expected].map((value) =>
      crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
  const left = new Uint8Array(a),
    right = new Uint8Array(b);
  let different = 0;
  for (let i = 0; i < left.length; i++) different |= left[i]! ^ right[i]!;
  return different === 0;
}

async function authenticated(request: Request, env: HostingEnvironment) {
  const values = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((x) => x.trim())
    .filter((x) => x.startsWith(COOKIE + "="));
  if (values.length !== 1) return false;
  const token = values[0]!.slice(COOKIE.length + 1);
  const match = /^(\d{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(
    token,
  );
  if (!match) return false;
  const expiry = Number(match[1]),
    now = Math.floor(Date.now() / 1000);
  if (expiry <= now || expiry > now + SESSION_SECONDS) return false;
  const encoded = match[3]!.replaceAll("-", "+").replaceAll("_", "/");
  const signature = Uint8Array.from(atob(encoded + "="), (char) =>
    char.charCodeAt(0),
  );
  return crypto.subtle.verify(
    "HMAC",
    await signingKey(env),
    signature,
    encoder.encode(match[1] + "." + match[2]),
  );
}

async function formPassword(request: Request): Promise<string | null> {
  if (
    !request.headers
      .get("Content-Type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 2048) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  const value = new URLSearchParams(new TextDecoder().decode(bytes)).get(
    "password",
  );
  return value && value.length <= 128 ? value : null;
}

export default {
  async fetch(request: Request, env: HostingEnvironment): Promise<Response> {
    if (
      !env.SITE_PASSWORD ||
      !env.SITE_SESSION_SECRET ||
      env.SITE_SESSION_SECRET.length < 32 ||
      !env.SITE_ORIGIN
    )
      return new Response("访问验证暂未就绪，请稍后再试。", {
        status: 503,
        headers: privateHeaders,
      });
    const url = new URL(request.url);
    if (url.pathname === "/__access/login" && request.method === "POST") {
      if (request.headers.get("Origin") !== env.SITE_ORIGIN)
        return new Response("请求来源不匹配。", {
          status: 403,
          headers: privateHeaders,
        });
      const password = await formPassword(request);
      if (!password || !(await equalPassword(password, env.SITE_PASSWORD)))
        return loginPage("密码不正确，请重新输入。", 401);
      const nonce = base64url(
        crypto.getRandomValues(new Uint8Array(16)).buffer,
      );
      const message = `${Math.floor(Date.now() / 1000) + SESSION_SECONDS}.${nonce}`;
      const signature = base64url(
        await crypto.subtle.sign(
          "HMAC",
          await signingKey(env),
          encoder.encode(message),
        ),
      );
      return new Response(null, {
        status: 303,
        headers: {
          ...privateHeaders,
          Location: "/",
          "Set-Cookie": `${COOKIE}=${message}.${signature}; Path=/; Max-Age=${SESSION_SECONDS}; Secure; HttpOnly; SameSite=Lax`,
        },
      });
    }
    if (!(await authenticated(request, env))) {
      if (
        request.method === "GET" &&
        (url.pathname === "/" ||
          url.pathname === "/index.html" ||
          url.pathname === "/__access/login" ||
          request.headers.get("Sec-Fetch-Mode") === "navigate")
      )
        return loginPage();
      return new Response("需要访问密码。", {
        status: 401,
        headers: privateHeaders,
      });
    }
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...privateHeaders, Allow: "GET, HEAD" },
      });
    if (
      url.pathname.startsWith("/__access/") ||
      url.pathname.startsWith("/.openai/") ||
      url.pathname.startsWith("/server/")
    )
      return new Response("Not found", {
        status: 404,
        headers: privateHeaders,
      });
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-cache");
    headers.set("X-Ashfall-Access", "verified");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
