import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  cloneDocument,
  dedup,
  prune,
  weld,
  simplify,
  flatten,
  join,
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const directory = path.resolve("public/assets/environment");
const cache = path.join(os.tmpdir(), "ashfall-environment-source-v2");
const headers = {
  "User-Agent": "AshfallProtocol/2.0 (local CC0 asset preparation)",
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const configs = [
  ["fern", "fern_02", 512, 1, 0.32],
  ["rocks", "rock_moss_set_01", 1024, 0.35, 0.08],
  ["chair", "painted_wooden_chair_01", 512, 1, 0.42],
  ["table", "painted_wooden_table", 1024, 1, 0.5],
  ["trash", "trashbag", 512, 0.65, 0.18],
  ["barrel", "barrel_03", 512, 1, 0.4],
  ["jerrycan", "metal_jerrycan_green", 512, 0.7, 0.2],
  ["carton", "cardboard_box_01", 512, 0.35, 0.1],
  ["wrench", "adjustable_wrench", 256, 0.65, 0.18],
  ["generator", "portable_generator", 1024, 0.5, 0.13],
];
await fs.mkdir(cache, { recursive: true });
await fs.mkdir(directory, { recursive: true });
await MeshoptSimplifier.ready;
async function download(url, limit = 0) {
  const file = path.join(cache, sha256(url) + (limit ? "-" + limit : ""));
  try {
    return await fs.readFile(file);
  } catch {
    /* first acquisition */
  }
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  let data;
  if (limit) {
    const reader = response.body.getReader(),
      chunks = [];
    let length = 0;
    while (length < limit) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
      length += next.value.length;
    }
    await reader.cancel();
    data = Buffer.concat(chunks).subarray(0, limit);
    if (data.length !== limit) throw new Error("Incomplete geometry prefix");
  } else data = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(file, data);
  return data;
}
async function metadata(id) {
  return JSON.parse(await download(`https://api.polyhaven.com/info/${id}`));
}
const report = {
  license: "CC0-1.0",
  licenseUrl: "https://polyhaven.com/license",
  acquired: new Date().toISOString(),
  assets: [],
  files: [],
};
async function source(id, pine = false) {
  const files = JSON.parse(
    await download(`https://api.polyhaven.com/files/${id}`),
  );
  const entry = files.gltf["1k"].gltf;
  const json = JSON.parse(await download(entry.url));
  const resources = {};
  if (pine) {
    // The first two primitives contain the complete scanned trunk / branch structure.
    // Dense modeled needles account for almost all of the 949 MB original buffer.
    json.meshes = [
      { ...json.meshes[0], primitives: json.meshes[0].primitives.slice(0, 2) },
    ];
    json.nodes = [{ name: "greyvale-pine", mesh: 0 }];
    json.scenes = [{ nodes: [0] }];
    json.scene = 0;
    json.accessors = json.accessors.slice(0, 12);
    json.bufferViews = json.bufferViews.slice(0, 12);
    const bytes = Math.max(
      ...json.bufferViews.map((v) => (v.byteOffset ?? 0) + v.byteLength),
    );
    json.buffers[0].byteLength = bytes;
    resources[json.buffers[0].uri] = await download(
      entry.include[json.buffers[0].uri].url,
      bytes,
    );
  }
  for (const buffer of json.buffers ?? [])
    if (!resources[buffer.uri])
      resources[buffer.uri] = await download(entry.include[buffer.uri].url);
  for (const image of json.images ?? []) {
    const item = entry.include[image.uri];
    if (!item) throw new Error("Missing texture " + image.uri);
    resources[image.uri] = await download(item.url);
  }
  const info = await metadata(id);
  report.assets.push({
    id,
    title: info.name,
    authors: info.authors,
    source: `https://polyhaven.com/a/${id}`,
    sourceMetadata: `https://api.polyhaven.com/info/${id}`,
    sourceGeometryBytes: entry.include[json.buffers[0].uri].size,
    acquiredGeometryBytes: resources[json.buffers[0].uri].length,
    sourceSha256: sha256(resources[json.buffers[0].uri]),
    license: "CC0-1.0",
  });
  return { document: await io.readJSON({ json, resources }), files };
}
async function textures(document, size) {
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const pipeline = sharp(Buffer.from(image)).resize(size, size, {
      fit: "inside",
      withoutEnlargement: true,
    });
    const normal = /nor|normal/.test(texture.getURI() + texture.getName());
    const result = await pipeline
      .webp({ quality: normal ? 92 : 84, alphaQuality: 100 })
      .toBuffer();
    texture.setImage(result).setMimeType("image/webp").setURI("");
  }
}
function triangles(document) {
  return document
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce(
      (n, p) =>
        n +
        (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) /
          3,
      0,
    );
}
async function save(document, key, lod, details) {
  await document.transform(prune(), dedup());
  const file = `${key}-${lod}.glb`;
  await io.write(path.join(directory, file), document);
  const bytes = await fs.readFile(path.join(directory, file));
  report.files.push({
    file,
    bytes: bytes.length,
    triangles: triangles(document),
    sha256: sha256(bytes),
    ...details,
  });
  console.log(file, bytes.length, triangles(document));
}
for (const [key, id, size, high, low] of configs) {
  const { document } = await source(id);
  for (const p of document
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives()))
    for (const semantic of p.listSemantics())
      if (/^COLOR|^TEXCOORD_[1-9]/.test(semantic))
        p.setAttribute(semantic, null);
  // Keep the first photographed specimen in sets, avoiding gallery-spaced rock / fern arrangements.
  const nodes = document
    .getRoot()
    .listNodes()
    .filter((n) => n.getMesh());
  if (["rocks", "fern"].includes(key)) {
    for (const node of nodes.slice(1)) node.dispose();
    nodes[0]?.setTranslation([0, 0, 0]);
  }
  await document.transform(prune(), weld(), flatten(), join(), dedup());
  await textures(document, size);
  for (const [lod, ratio] of [
    ["high", high],
    ["low", low],
  ]) {
    const output = cloneDocument(document);
    if (ratio < 1)
      await output.transform(
        simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.015 }),
      );
    if (lod === "low") await textures(output, Math.min(256, size));
    await save(output, key, lod, {
      source: id,
      maxTexture: size,
      modifications:
        "Removed unused data; welded; flattened static nodes; material-compatible mesh join; Meshopt simplification; WebP PBR textures. Runtime normalizes floor pivot and dimensions in metres.",
    });
  }
}
const { document: pine, files: pineFiles } = await source("pine_tree_01", true);
for (const primitive of pine
  .getRoot()
  .listMeshes()
  .flatMap((m) => m.listPrimitives()))
  for (const semantic of primitive.listSemantics())
    if (/^COLOR/.test(semantic)) primitive.setAttribute(semantic, null);
await pine.transform(prune(), weld(), dedup());
await textures(pine, 1024);
for (const [lod, ratio] of [
  ["high", 0.045],
  ["low", 0.011],
]) {
  const output = cloneDocument(pine);
  await output.transform(
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.04 }),
    prune(),
    dedup(),
  );
  if (lod === "low") await textures(output, 256);
  await save(output, "pine-wood", lod, {
    source: "pine_tree_01",
    maxTexture: lod === "high" ? 1024 : 256,
    modifications:
      "Extracted first scanned trunk and branch primitives by streaming only the first 3.18 MB; removed original 6.8-million-vertex needles. Runtime rebuilds crowns using CC0 photographed twig alpha cards.",
  });
}
const diffuse = await download(pineFiles.twig_diff["1k"].jpg.url),
  alpha = await download(pineFiles.twig_alpha["1k"].png.url);
// Materialize the registered 1024px channels before any crop/resize. Sharp applies
// only the last resize in a pipeline; combining both stages silently misaligns alpha.
const registered = await sharp(diffuse)
  .joinChannel(await sharp(alpha).greyscale().raw().toBuffer(), {
    raw: { width: 1024, height: 1024, channels: 1 },
  })
  .png()
  .toBuffer();
const croppedSprig = await sharp(registered)
  .extract({ left: 28, top: 24, width: 196, height: 424 })
  .resize(256, 512, { fit: "fill" })
  .png()
  .toBuffer();
// The atlas leaves opaque UV-dilation islands outside the selected twig's black
// background. Retain the connected photographed sprig, not those unrelated islands.
const { data: sprigPixels, info: sprigInfo } = await sharp(croppedSprig)
  .raw()
  .toBuffer({ resolveWithObject: true });
const pixelCount = sprigInfo.width * sprigInfo.height,
  visited = new Uint8Array(pixelCount);
let main = [];
for (let pixel = 0; pixel < pixelCount; pixel++) {
  if (visited[pixel] || sprigPixels[pixel * 4 + 3] < 24) continue;
  const component = [pixel];
  visited[pixel] = 1;
  for (let i = 0; i < component.length; i++) {
    const at = component[i],
      x = at % sprigInfo.width,
      y = Math.floor(at / sprigInfo.width);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        next = ny * sprigInfo.width + nx;
      if (
        nx < 0 ||
        ny < 0 ||
        nx >= sprigInfo.width ||
        ny >= sprigInfo.height ||
        visited[next] ||
        sprigPixels[next * 4 + 3] < 24
      )
        continue;
      visited[next] = 1;
      component.push(next);
    }
  }
  if (component.length > main.length) main = component;
}
const keep = new Uint8Array(pixelCount);
for (const pixel of main)
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = (pixel % sprigInfo.width) + dx,
        y = Math.floor(pixel / sprigInfo.width) + dy;
      if (x >= 0 && x < sprigInfo.width && y >= 0 && y < sprigInfo.height)
        keep[y * sprigInfo.width + x] = 1;
    }
for (let pixel = 0; pixel < pixelCount; pixel++)
  if (!keep[pixel]) sprigPixels[pixel * 4 + 3] = 0;
const sprig = await sharp(sprigPixels, {
  raw: { width: sprigInfo.width, height: sprigInfo.height, channels: 4 },
})
  .png()
  .toBuffer();
const rgba = await sharp(sprig)
  .webp({ quality: 92, alphaQuality: 100 })
  .toBuffer();
await fs.writeFile("public/textures/phase2-environment/pine-twig.webp", rgba);
report.files.push({
  file: "/textures/phase2-environment/pine-twig.webp",
  bytes: rgba.length,
  sha256: sha256(rgba),
  source: "pine_tree_01",
  maxTexture: 512,
  modifications:
    "Registered original diffuse/alpha at 1024px, materialized RGBA before cropping the isolated photographed sprig, resized to 256x512. Prevents Sharp multi-resize alpha misregistration.",
});
// A branch photograph atlas needs several naturally sized sprigs, rather than one
// giant metre-long needle. Author a denser bough from the licensed source sprig.
const layers = [];
const stem = Buffer.from(
  '<svg width="1024" height="1024"><path d="M512 986 Q494 570 512 72" stroke="#514d35" fill="none" stroke-width="10"/></svg>',
);
layers.push({ input: stem, left: 0, top: 0 });
for (let level = 0; level < 7; level++)
  for (const side of [-1, 1]) {
    const rootY = 220 + level * 100,
      angle = side * (32 + level * 7),
      height = 230 + level * 37,
      width = Math.round(height / 2);
    const input = await sharp(sprig)
      .resize(width, height)
      .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const meta = await sharp(input).metadata();
    const radians = (angle * Math.PI) / 180,
      centreX = 512 + Math.sin(radians) * height * 0.5,
      centreY = rootY - Math.cos(radians) * height * 0.5;
    layers.push({
      input,
      left: Math.round(centreX - meta.width / 2),
      top: Math.round(centreY - meta.height / 2),
    });
  }
const top = await sharp(sprig).resize(130, 260).png().toBuffer();
layers.push({ input: top, left: 447, top: 5 });
const bough = await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(layers)
  .webp({ quality: 90, alphaQuality: 100 })
  .toBuffer();
await fs.writeFile("public/textures/phase2-environment/pine-bough.webp", bough);
report.files.push({
  file: "/textures/phase2-environment/pine-bough.webp",
  bytes: bough.length,
  sha256: sha256(bough),
  source: "pine_tree_01",
  maxTexture: 1024,
  modifications:
    "Authored 15-sprig branch atlas from the aligned CC0 needle photograph, with a minimal connective stem; used on radial, predominantly horizontal branch cards.",
});
await fs.writeFile(
  path.join(directory, "manifest.json"),
  JSON.stringify(report, null, 2) + "\n",
);
