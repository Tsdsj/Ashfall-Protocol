/* global fetch */
/** Convert Quaternius' author-distributed CC0 OBJ guns into small, articulated GLBs.
 * No Blender, global dependencies, proprietary downloads or paid services required.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Document, NodeIO } from "@gltf-transform/core";
import { dedup, prune, weld } from "@gltf-transform/functions";
import sharp from "sharp";
const ROOT = process.cwd(),
  SOURCE = path.join(ROOT, "output/weapons-source"),
  OUT = path.join(ROOT, "public/assets/weapons");
const PAGE = "https://quaternius.com/packs/ultimategun.html";
const CONFIG = {
  pistol: {
    name: "Pistol_2",
    obj: [
      "12llZNaR14v9Y-Q2l0rQeo4bSdorD7Cqb",
      "ab5d4150082cca3085a07010525c77fafa3d12fd123b52878aa73e0fb9583e49",
    ],
    mtl: [
      "1faP9JIzB13CbvPYvn0butiewcJ64W1BZ",
      "9ffd9bb32ca0e44b758b13df29fb5a0d3305da15cab5a16d421cbf6b5b0912c6",
    ],
    muzzleX: 1.471,
    boreY: 0.5755,
    gripX: 0.01,
    gripY: -0.04,
    muzzleZ: 0.57,
    width: 1,
    slideTravel: 0.055,
  },
  military: {
    name: "AssaultRifle_2",
    obj: [
      "1kBflhIVyhk-H998dHv1eI6iQ5-k0fat7",
      "095ab814defe0855ae23c7111c9fdac260a49dc093272077c39863fdc868251d",
    ],
    mtl: [
      "1SgejkPlxDb4to0j51vII_n37PTGIWdYS",
      "b9e0429254528b93ce6134e513fbb114a8ee40872778f05e91ca1fccb320b1c2",
    ],
    muzzleX: 3.817,
    boreY: 0.5785,
    gripX: 0.03,
    gripY: -0.02,
    muzzleZ: 1.05,
    width: 1.8,
    slideTravel: 0.065,
  },
  rifle: {
    name: "SniperRifle_6",
    obj: [
      "1KHVUBuaaS3n_W1RZEsbh--5_vn7obTq-",
      "4443de0a39820158a8e490918f6843ac0de59a05a471d5fd30332fac336fa636",
    ],
    mtl: [
      "1VJiS1gxKd53zazUXxE4kIKTZMwjXqjo1",
      "9e90c92e0fceabbe2493e17f780c7ea7151f49e05b4c52687c7f77fce3ab2989",
    ],
    muzzleX: 5.2466,
    boreY: 0.297,
    gripX: -0.04,
    gripY: -0.33,
    muzzleZ: 1.18,
    width: 1.5,
    slideTravel: 0.085,
  },
  shotgun: {
    name: "Shotgun_3",
    obj: [
      "1mFvkxFHf6RYBGtkZygc3gH88mv11oRYY",
      "fd7d443f7504c34766d504e05cbbbbcfa6062104c192d40f0487e9ddf3ee4c81",
    ],
    mtl: [
      "1YoiaVqd4xs4TefmaXQ80uAIlmp2XKe_a",
      "748f6e8752bec9cf2080910330e4975fae7265a3ecdfea63214d0d8dd864fd6d",
    ],
    muzzleX: 4.308,
    boreY: 0.2155,
    gripX: 0.06,
    gripY: -0.16,
    muzzleZ: 1.14,
    width: 1.6,
    slideTravel: 0.1,
  },
  smg: {
    name: "SubmachineGun_3",
    obj: [
      "1WY8fQrATsTk7OpdysejeeYbiOC4RTlCr",
      "6f05a2465dad783ac0f0b04506ae14d6c6832794e8ba76ce5add78ad758a0efd",
    ],
    mtl: [
      "1nj7gPirFF3jUNgXnBNJWgXM37IuH_hmD",
      "7df8ef73c3df2107acdc0b4f653f6a091c999655a1a3fbd1d37952355cda40b5",
    ],
    muzzleX: 2.122,
    boreY: 0.4735,
    gripX: -0.055,
    gripY: -0.1,
    muzzleZ: 0.84,
    width: 1.15,
    slideTravel: 0.05,
  },
};
const sha = (data) => crypto.createHash("sha256").update(data).digest("hex");
await fs.mkdir(SOURCE, { recursive: true });
await fs.mkdir(OUT, { recursive: true });
async function source(config, format) {
  const file = path.join(SOURCE, `${config.name}.${format}`),
    [id, expected] = config[format];
  let data;
  try {
    data = await fs.readFile(file);
  } catch {
    const response = await fetch(
      `https://drive.google.com/uc?export=download&id=${id}`,
    );
    if (!response.ok)
      throw new Error(`Download failed: ${response.status} ${config.name}`);
    data = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(file, data);
  }
  if (sha(data) !== expected)
    throw new Error(`Upstream source hash changed: ${config.name}.${format}`);
  return data.toString("utf8");
}
const subtract = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
};
const bounds = (vertices) => ({
  min: [0, 1, 2].map((k) => Math.min(...vertices.map((v) => v[k]))),
  max: [0, 1, 2].map((k) => Math.max(...vertices.map((v) => v[k]))),
});
function parseObj(text) {
  const vertices = [],
    normals = [],
    faces = [];
  let material = "Metal";
  for (const line of text.split(/\r?\n/)) {
    const [tag, ...values] = line.trim().split(/\s+/);
    if (tag === "v") vertices.push(values.slice(0, 3).map(Number));
    else if (tag === "vn") normals.push(values.map(Number));
    else if (tag === "usemtl") material = values[0];
    else if (tag === "f")
      faces.push({
        material,
        refs: values.map((value) => {
          const [v, , n] = value.split("/").map(Number);
          return { v: v < 0 ? vertices.length + v : v - 1, n: n - 1 };
        }),
      });
  }
  const parents = vertices.map((_, i) => i);
  const find = (x) => {
    while (parents[x] !== x) {
      parents[x] = parents[parents[x]];
      x = parents[x];
    }
    return x;
  };
  for (const face of faces)
    for (const r of face.refs.slice(1))
      parents[find(r.v)] = find(face.refs[0].v);
  const connected = new Map();
  for (const face of faces) {
    const key = find(face.refs[0].v);
    if (!connected.has(key)) connected.set(key, []);
    connected.get(key).push(face);
  }
  const components = [...connected.values()]
    .sort((a, b) => b.length - a.length)
    .map((f, index) => ({
      index,
      faces: f,
      ...bounds(f.flatMap((face) => face.refs.map((r) => vertices[r.v]))),
    }));
  return { vertices, normals, faces, components };
}
// Ear-clipping preserves concave OBJ polygons (trigger guards / receiver cutouts).
function triangulate(face, vertices) {
  const points = face.refs.map((r) => vertices[r.v]);
  const normal = cross(
    subtract(points[1], points[0]),
    subtract(points[2], points[0]),
  );
  const omitted = normal
    .map(Math.abs)
    .indexOf(Math.max(...normal.map(Math.abs)));
  const coords = points.map((p) => p.filter((_, i) => i !== omitted));
  const cross2 = (a, b, c) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const area = coords.reduce(
    (sum, p, i) =>
      sum +
      p[0] * coords[(i + 1) % coords.length][1] -
      coords[(i + 1) % coords.length][0] * p[1],
    0,
  );
  const sign = area >= 0 ? 1 : -1,
    remaining = coords.map((_, i) => i),
    triangles = [];
  const inside = (p, a, b, c) =>
    cross2(a, b, p) * sign >= -1e-9 &&
    cross2(b, c, p) * sign >= -1e-9 &&
    cross2(c, a, p) * sign >= -1e-9;
  let guard = 0;
  while (remaining.length > 3 && guard++ < points.length * points.length) {
    let cut = false;
    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[(i + remaining.length - 1) % remaining.length],
        b = remaining[i],
        c = remaining[(i + 1) % remaining.length];
      if (cross2(coords[a], coords[b], coords[c]) * sign < 1e-10) continue;
      if (
        remaining.some(
          (p) =>
            p !== a &&
            p !== b &&
            p !== c &&
            inside(coords[p], coords[a], coords[b], coords[c]),
        )
      )
        continue;
      triangles.push([a, b, c]);
      remaining.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) {
      const collinear = remaining.findIndex(
        (b, i) =>
          Math.abs(
            cross2(
              coords[remaining[(i + remaining.length - 1) % remaining.length]],
              coords[b],
              coords[remaining[(i + 1) % remaining.length]],
            ),
          ) < 1e-8,
      );
      if (collinear >= 0) remaining.splice(collinear, 1);
      else throw new Error("Could not triangulate original polygon");
    }
  }
  if (remaining.length === 3) triangles.push([...remaining]);
  const triangleArea = triangles.reduce(
    (sum, [a, b, c]) => sum + cross2(coords[a], coords[b], coords[c]),
    0,
  );
  if (Math.abs(triangleArea - area) > Math.max(1e-6, Math.abs(area) * 0.001))
    throw new Error("Triangulation area mismatch");
  return triangles.map((indices) => indices.map((i) => face.refs[i]));
}
function parseMtl(text) {
  const result = {};
  let name = "";
  for (const line of text.split(/\r?\n/)) {
    const [type, ...values] = line.trim().split(/\s+/);
    if (type === "newmtl") name = values[0];
    if (type === "Kd") result[name] = values.map(Number);
  }
  return result;
}
async function surfaceTextures(kind) {
  const size = 128,
    albedo = Buffer.alloc(size * size * 3),
    orm = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3,
        n =
          ((Math.imul(x + 31, 374761393) ^ Math.imul(y + 71, 668265263)) >>>
            0) %
          23;
      const grain =
        kind === "wood"
          ? Math.sin(x * 0.52 + Math.sin(y * 0.17) * 1.5) * 7
          : Math.sin(y * 0.72) * 1.5;
      const value = Math.max(0, Math.min(255, 235 + n * 0.6 + grain));
      albedo[i] = albedo[i + 1] = albedo[i + 2] = value;
      orm[i] = 255;
      orm[i + 1] = kind === "wood" ? 224 + n : 186 + n;
      orm[i + 2] = 255;
    }
  return {
    albedo: await sharp(albedo, {
      raw: { width: size, height: size, channels: 3 },
    })
      .png()
      .toBuffer(),
    orm: await sharp(orm, { raw: { width: size, height: size, channels: 3 } })
      .png()
      .toBuffer(),
  };
}
const surfaces = {
  metal: await surfaceTextures("metal"),
  wood: await surfaceTextures("wood"),
};
function addedBox(vertices, faces, center, size, material, part) {
  const start = vertices.length;
  for (const z of [-1, 1])
    for (const y of [-1, 1])
      for (const x of [-1, 1])
        vertices.push([
          center[0] + (x * size[0]) / 2,
          center[1] + (y * size[1]) / 2,
          center[2] + (z * size[2]) / 2,
        ]);
  for (const q of [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ])
    faces.push({
      material,
      part,
      refs: q.map((v) => ({ v: start + v, n: -1 })),
    });
}
const io = new NodeIO(),
  files = [];
for (const [key, c] of Object.entries(CONFIG)) {
  const [obj, mtl] = await Promise.all([source(c, "obj"), source(c, "mtl")]);
  const data = parseObj(obj),
    colors = parseMtl(mtl),
    originalFaces = data.faces.length;
  const scale = (c.muzzleZ - 0.13) / (c.muzzleX - c.gripX),
    originY = 0.105 - c.boreY * scale,
    originZ = 0.13 - c.gripX * scale;
  const runtime = (p) => [
    p[2] * scale * c.width,
    p[1] * scale + originY,
    p[0] * scale + originZ,
  ];
  const partMap = {};
  for (const component of data.components) {
    let part = "body";
    if (
      key === "pistol" &&
      (component.index === 0 ||
        (component.min[1] > 0.418 && component.index >= 8))
    )
      part = "slide";
    if (key === "military" && component.index === 0) part = "magazine";
    if (key === "rifle" && component.index === 0) part = "scope";
    if (key === "rifle" && component.index === 4) part = "bolt";
    if (key === "smg" && component.index === 5) part = "magazine";
    if (key === "shotgun" && component.index === 0) part = "pump";
    for (const face of component.faces) face.part = part;
  }
  // The original pistol has no separate magazine insert; add a fitted hidden insert and visible base plate.
  if (key === "pistol") {
    addedBox(
      data.vertices,
      data.faces,
      [-0.03, -0.08, 0],
      [0.26, 0.66, 0.14],
      "Black",
      "magazine",
    );
    addedBox(
      data.vertices,
      data.faces,
      [-0.03, -0.427, 0],
      [0.35, 0.05, 0.195],
      "Black",
      "magazine",
    );
  } else if (key === "rifle") {
    addedBox(
      data.vertices,
      data.faces,
      [0.25, 0.404, 0],
      [0.22, 0.09, 0.18],
      "Black",
      "sights",
    );
    addedBox(
      data.vertices,
      data.faces,
      [0.25, 0.456, 0],
      [0.15, 0.05, 0.14],
      "Black",
      "sights",
    );
    for (const side of [-1, 1])
      addedBox(
        data.vertices,
        data.faces,
        [0.25, 0.52, side * 0.05],
        [0.045, 0.09, 0.025],
        "Black",
        "sights",
      );
    addedBox(
      data.vertices,
      data.faces,
      [4.93, 0.4, 0],
      [0.13, 0.115, 0.1],
      "Black",
      "sights",
    );
    addedBox(
      data.vertices,
      data.faces,
      [4.93, 0.51, 0],
      [0.04, 0.115, 0.024],
      "Black",
      "sights",
    );
  } else {
    // Independent charging handle/bolt face layered over the source's ejection-port recess.
    const point =
      key === "military"
        ? [0.87, 0.53, 0.082]
        : key === "shotgun"
          ? [0.76, 0.16, 0.119]
          : [0.47, 0.5, 0.162];
    addedBox(
      data.vertices,
      data.faces,
      point,
      [key === "shotgun" ? 0.28 : 0.27, 0.11, 0.038],
      "LightMetal",
      "bolt",
    );
    if (key !== "shotgun")
      addedBox(
        data.vertices,
        data.faces,
        [point[0] + 0.075, point[1], point[2] + 0.07],
        [0.075, 0.065, 0.13],
        "Black",
        "bolt",
      );
  }
  for (const face of data.faces) {
    if (!partMap[face.part]) partMap[face.part] = [];
    partMap[face.part].push(face);
  }
  const document = new Document(),
    buffer = document.createBuffer(),
    scene = document.createScene("weapon-scene"),
    root = document.createNode("weapon-model");
  scene.addChild(root);
  document.getRoot().setDefaultScene(scene);
  const materials = new Map();
  for (const name of new Set(data.faces.map((f) => f.material))) {
    const wood = /Wood/.test(name),
      plastic = /Black|Grey/.test(name);
    const color = colors[name] ?? [0.08, 0.085, 0.078];
    const texture = surfaces[wood ? "wood" : "metal"];
    const albedo = document
      .createTexture(name + "-micro-surface")
      .setImage(texture.albedo)
      .setMimeType("image/png");
    const orm = document
      .createTexture(name + "-roughness")
      .setImage(texture.orm)
      .setMimeType("image/png");
    const material = document
      .createMaterial(name)
      .setBaseColorFactor([
        ...color.map((v) =>
          Math.min(0.4, v * (wood ? 1.6 : plastic ? 2.1 : 1.7)),
        ),
        1,
      ])
      .setMetallicFactor(wood ? 0 : plastic ? 0.12 : 0.78)
      .setRoughnessFactor(wood ? 0.94 : plastic ? 0.94 : 0.69)
      .setBaseColorTexture(albedo)
      .setMetallicRoughnessTexture(orm);
    materials.set(name, material);
  }
  const references = {},
    partDetails = {};
  for (const [part, faces] of Object.entries(partMap)) {
    const all = faces.flatMap((f) => f.refs.map((r) => data.vertices[r.v]));
    const b = bounds(all);
    let pivot = [0, 0, 0];
    if (part !== "body") {
      const top = all.filter((p) => p[1] > b.max[1] - 0.07);
      const sourcePivot =
        part === "magazine"
          ? [top.reduce((s, p) => s + p[0], 0) / top.length, b.max[1], 0]
          : [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, 0];
      pivot = runtime(sourcePivot);
    }
    const node = document
        .createNode("part_" + part)
        .setTranslation([-pivot[0], pivot[1], pivot[2]]),
      mesh = document.createMesh(key + "-" + part);
    root.addChild(node);
    node.setMesh(mesh);
    const groups = new Map();
    for (const face of faces) {
      if (!groups.has(face.material)) groups.set(face.material, []);
      groups.get(face.material).push(face);
    }
    let count = 0;
    for (const [material, group] of groups) {
      const positions = [],
        normals = [],
        uv = [],
        indices = [];
      for (const face of group) {
        const faceNormal = normalize(
          cross(
            subtract(
              data.vertices[face.refs[1].v],
              data.vertices[face.refs[0].v],
            ),
            subtract(
              data.vertices[face.refs[2].v],
              data.vertices[face.refs[0].v],
            ),
          ),
        );
        for (const triangle of triangulate(face, data.vertices))
          for (const ref of triangle) {
            const canonical = runtime(data.vertices[ref.v]),
              n = data.normals[ref.n] ?? faceNormal;
            const normal = normalize([-n[2] / c.width, n[1], n[0]]);
            const pos = [
              -canonical[0] + pivot[0],
              canonical[1] - pivot[1],
              canonical[2] - pivot[2],
            ];
            positions.push(...pos);
            normals.push(...normal);
            indices.push(indices.length);
            const plane =
              Math.abs(normal[1]) > 0.65
                ? [canonical[2], canonical[0]]
                : Math.abs(normal[2]) > 0.65
                  ? [canonical[0], canonical[1]]
                  : [canonical[2], canonical[1]];
            uv.push(plane[0] * 8, plane[1] * 8);
            count++;
          }
      }
      const access = (name, type, array) =>
        document
          .createAccessor(name)
          .setType(type)
          .setArray(array)
          .setBuffer(buffer);
      const primitive = document
        .createPrimitive()
        .setAttribute(
          "POSITION",
          access(part + "-position", "VEC3", new Float32Array(positions)),
        )
        .setAttribute(
          "NORMAL",
          access(part + "-normal", "VEC3", new Float32Array(normals)),
        )
        .setAttribute(
          "TEXCOORD_0",
          access(part + "-uv", "VEC2", new Float32Array(uv)),
        )
        .setIndices(
          access(part + "-indices", "SCALAR", new Uint16Array(indices)),
        )
        .setMaterial(materials.get(material));
      mesh.addPrimitive(primitive);
    }
    partDetails[part] = {
      node: "part_" + part,
      pivot: pivot.map((v) => +v.toFixed(5)),
      triangles: count / 3,
    };
  }
  const allRuntime = data.vertices.map(runtime),
    bb = bounds(allRuntime);
  references.muzzle = [0, 0.105, c.muzzleZ];
  references.rightGrip = [
    Math.max(0.035, (bb.max[0] - bb.min[0]) * 0.45),
    runtime([c.gripX, c.gripY, 0])[1],
    0.13,
  ];
  references.leftGrip =
    key === "pistol"
      ? [-0.052, references.rightGrip[1], 0.14]
      : key === "smg"
        ? runtime([1.5, -0.12, -0.17])
        : key === "shotgun"
          ? runtime([2.1, -0.11, -0.16])
          : key === "rifle"
            ? runtime([2.16, -0.04, -0.18])
            : runtime([1.97, 0.35, -0.17]);
  references.rearSight = runtime(
    key === "pistol"
      ? [-0.12, 0.722, 0]
      : key === "smg"
        ? [-0.1, 0.77, 0]
        : key === "shotgun"
          ? [0.205, 0.38, 0]
          : key === "rifle"
            ? [0.25, 0.565, 0]
            : [0.4, 0.86, 0],
  );
  references.frontSight = runtime(
    key === "pistol"
      ? [1.28, 0.748, 0]
      : key === "smg"
        ? [1.72, 0.77, 0]
        : key === "shotgun"
          ? [3.81, 0.356, 0]
          : key === "rifle"
            ? [4.93, 0.5675, 0]
            : [3.65, 0.86, 0],
  );
  references.magazine =
    partDetails.magazine?.pivot ?? runtime([0.75, -0.12, 0]);
  references.support = references.leftGrip;
  for (const [name, value] of Object.entries(references)) {
    references[name] = value.map((v) => +v.toFixed(5));
    root.addChild(
      document
        .createNode("anchor_" + name)
        .setTranslation([-value[0], value[1], value[2]])
        .setExtras({
          kind: "weapon-anchor",
          space: "Babylon-left-handed-viewmodel",
        }),
    );
  }
  root.setExtras({
    weapon: key,
    forward: "+Z",
    units:
      "compatible viewmodel units; parent WeaponRenderer currently scales 0.68",
  });
  await document.transform(weld(), dedup(), prune({ keepLeaves: true }));
  const filename = key + ".glb",
    filepath = path.join(OUT, filename);
  await io.write(filepath, document);
  const output = await fs.readFile(filepath);
  const reread = await io.read(filepath);
  for (const accessor of reread.getRoot().listAccessors())
    for (const value of accessor.getArray())
      if (!Number.isFinite(value)) throw new Error("Non-finite vertex data");
  const record = {
    id: key,
    file: filename,
    sourceName: c.name,
    author: "Quaternius",
    source: PAGE,
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    sources: ["obj", "mtl"].map((ext) => ({
      file: c.name + "." + ext,
      url: `https://drive.google.com/uc?export=download&id=${c[ext][0]}`,
      sha256: c[ext][1],
    })),
    bytes: output.length,
    sha256: sha(output),
    triangles: Object.values(partDetails).reduce((n, p) => n + p.triangles, 0),
    originalPolygons: originalFaces,
    dimensions: bb.max.map((v, i) => +(v - bb.min[i]).toFixed(5)),
    bounds: {
      min: bb.min.map((v) => +v.toFixed(5)),
      max: bb.max.map((v) => +v.toFixed(5)),
    },
    nativeToView: {
      scale: +scale.toFixed(8),
      widthMultiplier: c.width,
      originY: +originY.toFixed(8),
      originZ: +originZ.toFixed(8),
      direction:
        "source +X becomes runtime +Z; source +Z becomes runtime +X after standard Babylon glTF handedness conversion",
    },
    parts: partDetails,
    anchors: references,
    slideTravel: c.slideTravel,
    magazineTravel: key === "pistol" ? 0.32 : 0.42,
    changes:
      "Converted original OBJ/MTL with concave polygon triangulation; preserved normals and silhouette; topology-based moving parts; added fitted pistol magazine or small bolt/charging handle; muted PBR materials and original procedural micro-surface textures; normalized +Z grip/muzzle anchors; welded and deduplicated.",
  };
  files.push(record);
  console.log(
    key,
    record.bytes,
    record.triangles,
    record.dimensions,
    JSON.stringify(references),
  );
}
const totalBytes = files.reduce((n, f) => n + f.bytes, 0);
if (totalBytes > 3 * 1024 * 1024)
  throw new Error("Weapon package exceeds 3 MiB budget");
await fs.writeFile(
  path.join(OUT, "manifest.json"),
  JSON.stringify(
    {
      version: 1,
      author: "Quaternius",
      license: "CC0-1.0",
      source: PAGE,
      verified: "2026-09-09",
      totalBytes,
      files,
    },
    null,
    2,
  ) + "\n",
);
let license;
try {
  license = await fs.readFile(path.join(SOURCE, "License.txt"));
} catch {
  const r = await fetch(
    "https://drive.google.com/uc?export=download&id=13L56XcV3IlLxMUqoDyqvcYVEfe0y_sie",
  );
  license = Buffer.from(await r.arrayBuffer());
}
await fs.writeFile(path.join(OUT, "LICENSE.txt"), license);
console.log("Total weapon GLBs:", totalBytes);

// Validate the actual Babylon left-handed loader, not just glTF authoring coordinates.
const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
const { Scene } = await import("@babylonjs/core/scene.js");
const { LoadAssetContainerAsync } =
  await import("@babylonjs/core/Loading/sceneLoader.js");
await import("@babylonjs/loaders/glTF/index.js");
const engine = new NullEngine();
const validation = [];
for (const record of files) {
  const scene = new Scene(engine);
  const container = await LoadAssetContainerAsync(
    new Uint8Array(await fs.readFile(path.join(OUT, record.file))),
    scene,
    {
      pluginExtension: ".glb",
      pluginOptions: { gltf: { skipMaterials: true, animationStartMode: 0 } },
    },
  );
  const entries = container.instantiateModelsToScene(
    (name) => "verify:" + name,
    false,
    { doNotInstantiate: true },
  );
  const nodes = [
    ...entries.rootNodes,
    ...entries.rootNodes.flatMap((n) => n.getDescendants()),
  ];
  for (const node of entries.rootNodes) node.setEnabled(true);
  const named = (name) => nodes.find((n) => n.name === "verify:" + name);
  for (const [name, expected] of Object.entries(record.anchors)) {
    const node = named("anchor_" + name);
    if (!node) throw new Error(`Missing runtime anchor ${name}`);
    node.computeWorldMatrix(true);
    const actual = node.getAbsolutePosition().asArray();
    if (actual.some((v, i) => Math.abs(v - expected[i]) > 0.0001))
      throw new Error(`${record.id} handedness/anchor mismatch: ${name}`);
  }
  for (const part of Object.keys(record.parts)) {
    const node = named("part_" + part);
    if (!node) throw new Error(`Missing movable part ${record.id}:${part}`);
    const original = node.position.clone();
    node.computeWorldMatrix(true);
    const start = node.getAbsolutePosition().clone();
    node.position.y -= 0.1;
    node.computeWorldMatrix(true);
    if (Math.abs(node.getAbsolutePosition().y - start.y + 0.1) > 0.0001)
      throw new Error("Part transform did not move locally");
    node.position.copyFrom(original);
  }
  for (const root of entries.rootNodes) root.dispose(false);
  container.dispose();
  if (scene.meshes.length !== 0 || scene.transformNodes.length !== 0)
    throw new Error("Weapon validation left scene nodes behind");
  validation.push({
    id: record.id,
    triangles: record.triangles,
    bytes: record.bytes,
    anchors: true,
    movableParts: true,
    disposed: true,
  });
  scene.dispose();
}
engine.dispose();
await fs.writeFile(
  path.join(SOURCE, "validation.json"),
  JSON.stringify({ totalBytes, files: validation }, null, 2) + "\n",
);
console.log(
  "Babylon coordinate, part movement and disposal checks passed for",
  validation.length,
  "weapons.",
);

// Software geometry inspection image, intentionally labelled separately from in-game evidence.
{
  const W = 1800,
    H = 1140,
    dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const eye = normalize([-0.82, 0.34, -0.38]),
    right = normalize(
      cross(
        eye.map((v) => -v),
        [0, 1, 0],
      ),
    ),
    up = normalize(
      cross(
        right,
        eye.map((v) => -v),
      ),
    ),
    light = normalize([-0.4, 0.85, -0.35]);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#e9e8e2"/><text x="48" y="56" font-family="sans-serif" font-size="30" fill="#28302b">ASHFALL · Quaternius weapon geometry inspection</text><text x="48" y="89" font-family="sans-serif" font-size="17" fill="#60665f">Prepared local GLBs · muted PBR materials · separate moving parts · geometric preview, not an in-game screenshot</text>`;
  for (let k = 0; k < files.length; k++) {
    const entry = files[k],
      document = await io.read(path.join(OUT, entry.file)),
      triangles = [];
    for (const node of document.getRoot().listNodes()) {
      if (
        !node.getMesh() ||
        node.getName() === "part_scope" ||
        node.listParents().some((p) => p.getName() === "part_scope")
      )
        continue;
      const matrix = node.getWorldMatrix();
      const transform = (p) => {
        const out = [0, 1, 2].map(
          (i) =>
            matrix[i] * p[0] +
            matrix[4 + i] * p[1] +
            matrix[8 + i] * p[2] +
            matrix[12 + i],
        );
        out[0] *= -1;
        return out;
      };
      for (const primitive of node.getMesh().listPrimitives()) {
        const positions = primitive.getAttribute("POSITION").getArray(),
          normals = primitive.getAttribute("NORMAL").getArray(),
          indices = primitive.getIndices().getArray(),
          material = primitive.getMaterial();
        for (let i = 0; i < indices.length; i += 3) {
          const ids = [indices[i], indices[i + 1], indices[i + 2]],
            points = ids.map((j) =>
              transform([
                positions[j * 3],
                positions[j * 3 + 1],
                positions[j * 3 + 2],
              ]),
            );
          const normal = normalize(
            [0, 1, 2].map(
              (c) => ids.reduce((sum, j) => sum + normals[j * 3 + c], 0) / 3,
            ),
          );
          normal[0] *= -1;
          const shade = 0.58 + 0.42 * Math.max(0, dot(normal, light)),
            color = material
              .getBaseColorFactor()
              .slice(0, 3)
              .map((v) => Math.round(255 * Math.pow(v, 1 / 2.2) * shade));
          triangles.push({
            points: points.map((p) => [dot(p, right), dot(p, up)]),
            depth: points.reduce((sum, p) => sum + dot(p, eye), 0) / 3,
            color,
          });
        }
      }
    }
    const all = triangles.flatMap((t) => t.points),
      min = [0, 1].map((i) => Math.min(...all.map((p) => p[i]))),
      max = [0, 1].map((i) => Math.max(...all.map((p) => p[i]))),
      cx = 48 + (k % 2) * 895,
      cy = 145 + Math.floor(k / 2) * 320,
      scale = Math.min(770 / (max[0] - min[0]), 230 / (max[1] - min[1]));
    svg += `<text x="${cx}" y="${cy}" font-family="sans-serif" font-size="24" fill="#303831">${entry.id.toUpperCase()} · ${entry.triangles} triangles</text>`;
    triangles.sort((a, b) => a.depth - b.depth);
    for (const triangle of triangles)
      svg += `<polygon points="${triangle.points.map((p) => `${cx + 28 + (p[0] - min[0]) * scale},${cy + 260 - (p[1] - min[1]) * scale}`).join(" ")}" fill="rgb(${triangle.color})"/>`;
    svg += `<text x="${cx}" y="${cy + 292}" font-family="sans-serif" font-size="15" fill="#636c63">${Object.keys(
      entry.parts,
    )
      .filter((p) => p !== "body")
      .join(
        " / ",
      )} · +Z muzzle ${entry.anchors.muzzle[2]} · ${(entry.bytes / 1024).toFixed(1)} KiB</text>`;
  }
  svg += "</svg>";
  await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, "inspection.png"));
}

const runtimeManifest = JSON.parse(
  await fs.readFile(path.join(OUT, "manifest.json"), "utf8"),
);
const runtimeFields = [
  "id",
  "file",
  "dimensions",
  "anchors",
  "slideTravel",
  "magazineTravel",
];
await fs.writeFile(
  path.join(ROOT, "src/data/weapon-assets.json"),
  JSON.stringify(
    {
      files: runtimeManifest.files.map((entry) =>
        Object.fromEntries(runtimeFields.map((key) => [key, entry[key]])),
      ),
    },
    null,
    2,
  ) + "\n",
);
