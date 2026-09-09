import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname, join, relative } from "node:path";

// Credentials arrive through stdin, never arguments, source files or logs.
const config = JSON.parse(readFileSync(0, "utf8"));
if (!/^[a-f0-9]{16}$/.test(config.version)) throw new Error("Invalid asset version");
const origin = new URL(config.origin);
if (origin.protocol !== "https:" || !origin.hostname.endsWith(".chatgpt.site")) throw new Error("Invalid Sites origin");
const root = join("output/sites-assets", config.version);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8" };
async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const name = join(directory, entry.name);
    result.push(...(entry.isDirectory() ? await walk(name) : [name]));
  }
  return result;
}
const files = await walk(root), uploaded = [];
let next = 0;
async function queue() {
  while (next < files.length) {
    const path = files[next++], key = relative(root, path).replaceAll("\\", "/"), bytes = await readFile(path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const url = new URL("/__access/upload", origin);
    url.searchParams.set("version", config.version); url.searchParams.set("key", key);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const headers = { Authorization: "Bearer " + config.deploySecret, "X-Asset-Sha256": sha256, "Content-Type": types[extname(path)] ?? "application/octet-stream" };
        if (config.privateToken) headers["OAI-Sites-Authorization"] = "Bearer " + config.privateToken;
        const response = await fetch(url, { method: "PUT", headers, body: bytes, signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error(`Asset ${key}: HTTP ${response.status}`);
        const saved = await response.json();
        if (saved.sha256 !== sha256 || saved.bytes !== bytes.length) throw new Error("Stored asset checksum mismatch: " + key);
        uploaded.push({ key, bytes: bytes.length, sha256 });
        if (uploaded.length % 25 === 0 || uploaded.length === files.length) console.log(`Uploaded and verified ${uploaded.length}/${files.length} assets`);
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
}
await Promise.all(Array.from({ length: 6 }, queue));
await mkdir("output/sites", { recursive: true });
await writeFile("output/sites/upload-verification.json", JSON.stringify({ version: config.version, count: uploaded.length, bytes: uploaded.reduce((n,x)=>n+x.bytes,0), files: uploaded }, null, 2));
console.log("All private game assets verified.");
