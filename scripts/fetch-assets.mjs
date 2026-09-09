import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const defaults = [
  "forest_ground_04",
  "bark_brown_02",
  "asphalt_02",
  "concrete_wall_003",
];
const assets = process.argv.length > 2 ? process.argv.slice(2) : defaults;
const headers = {
  "User-Agent": "AshfallProtocol/2.0 (local CC0 asset preparation)",
};
const manifest = JSON.parse(await readFile("public/textures/manifest.json","utf8").catch(()=>"[]")).filter(entry=>!assets.includes(entry.asset));
for (const asset of assets) {
  const metadata = await fetch("https://api.polyhaven.com/info/" + asset, {
    headers,
  }).then((r) => {
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  });
  const files = await fetch("https://api.polyhaven.com/files/" + asset, {
    headers,
  }).then((r) => r.json());
  await mkdir("public/textures/" + asset, { recursive: true });
  for (const [key, local] of [
    ["Diffuse", "albedo"],
    ["nor_gl", "normal"],
    ["arm", "orm"],
  ]) {
    const file = files[key]["1k"].jpg;
    const response = await fetch(file.url, { headers });
    if (!response.ok) throw new Error(response.statusText);
    const buffer = Buffer.from(await response.arrayBuffer());
    const md5 = createHash("md5").update(buffer).digest("hex");
    if (md5 !== file.md5) throw new Error("Checksum mismatch: " + file.url);
    const path = "public/textures/" + asset + "/" + local + ".jpg";
    await writeFile(path, buffer);
    manifest.push({
      asset,
      name: metadata.name,
      authors: metadata.authors,
      license: "CC0-1.0",
      source: "https://polyhaven.com/a/" + asset,
      url: file.url,
      path,
      md5,
      bytes: buffer.length,
    });
    console.log(path, buffer.length);
  }
}
await writeFile(
  "public/textures/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
