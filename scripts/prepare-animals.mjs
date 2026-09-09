import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  cloneDocument,
  compactPrimitive,
  dedup,
  prune,
  resample,
  simplify,
  weld,
  textureCompress,
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import "@babylonjs/loaders/glTF/index.js";
import "@babylonjs/core/Animations/animatable.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import {
  Matrix,
  Quaternion,
  Vector3,
} from "@babylonjs/core/Maths/math.vector.js";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const directory = path.resolve("public/assets/animals"),
  cache = path.join(os.tmpdir(), "ashfall-animal-sources");
await fs.mkdir(directory, { recursive: true });
await fs.mkdir(cache, { recursive: true });
await MeshoptSimplifier.ready;
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const sources = {
  deer: {
    file: "Stag.gltf",
    url: "https://drive.google.com/uc?export=download&id=1URNoFeIFblJXPFOV6qwPrxZr5dLZ3YGx",
    author: "Quaternius",
    source: "https://quaternius.com/packs/ultimateanimatedanimals.html",
    licenseEvidence:
      "https://www.patreon.com/quaternius/posts/ultimate-animals-53427821",
    scale: 0.43,
  },
  wolf: {
    file: "Wolf.gltf",
    url: "https://drive.google.com/uc?export=download&id=1lFQoQ9ln2Z2wGuFFWObj9i5jHqUl_ftG",
    author: "Quaternius",
    source: "https://quaternius.com/packs/ultimateanimatedanimals.html",
    licenseEvidence:
      "https://www.patreon.com/quaternius/posts/ultimate-animals-53427821",
    scale: 0.34,
  },
  boar: {
    file: "boar.blend",
    url: "https://opengameart.org/sites/default/files/boar_0.blend",
    author: "Teh_Bucket",
    source: "https://opengameart.org/content/boar",
    licenseEvidence: "https://opengameart.org/content/boar",
    scale: 0.5,
  },
};
for (const source of Object.values(sources)) {
  const file = path.join(cache, source.file);
  try {
    await fs.access(file);
  } catch {
    const response = await fetch(source.url, {
      headers: { "User-Agent": "AshfallProtocol/2.0 (CC0 animal preparation)" },
    });
    if (!response.ok) throw new Error(response.status + ": " + source.url);
    await fs.writeFile(file, new Uint8Array(await response.arrayBuffer()));
  }
}
const boarGlb = path.join(cache, "boar-converted-v3.glb");
try {
  await fs.access(boarGlb);
} catch {
  const python = process.env.ASHFALL_BPY_PYTHON;
  if (!python)
    throw new Error(
      "Set ASHFALL_BPY_PYTHON to a Python 3.11 environment with bpy 4.5 installed for the one-time source .blend conversion.",
    );
  const conversion = String.raw`
import bpy, math, os
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=os.environ['ASHFALL_BOAR_INPUT'],load_ui=False,use_scripts=False)
scene=bpy.context.scene
scene.render.fps=30
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.data.objects if o.type=='MESH')
# Restore the author's neutral keyed pose before normalizing the asset.
arm.animation_data.action=bpy.data.actions['default']
scene.frame_set(0)
material=bpy.data.materials.new('boar-photopainted-fur')
material.use_nodes=True
nodes=material.node_tree.nodes
bsdf=nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value=.92
bsdf.inputs['Metallic'].default_value=0
texture=nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images['boar']
uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
material.node_tree.links.new(uv.outputs['UV'],texture.inputs['Vector'])
material.node_tree.links.new(texture.outputs['Color'],bsdf.inputs['Base Color'])
mesh.data.materials.clear();mesh.data.materials.append(material)
mesh.data.validate(clean_customdata=False)
bpy.context.view_layer.objects.active=mesh
mesh.select_set(True)
# Apply the source mirror, edge split and triangulation while retaining skinning.
# Otherwise glTF exports only the right half of this old 2015 source mesh.
for modifier in list(mesh.modifiers):
 if modifier.type != 'ARMATURE': bpy.ops.object.modifier_apply(modifier=modifier.name)
for polygon in mesh.data.polygons: polygon.use_smooth=True
# Preserve the original multi-joint quadruped rig and evaluated IK actions.
for action in bpy.data.actions: action.use_fake_user=True
# The author's +Y-forward Blender mesh becomes +Z-forward after this Z turn.
root=bpy.data.objects.new('AnimalScaleRoot',None);scene.collection.objects.link(root)
for obj in [arm,mesh]:
 if obj.parent is None:
  obj.parent=root
root.rotation_euler.z=math.pi
root.scale=(.5,.5,.5)
bpy.context.view_layer.update()
depsgraph=bpy.context.evaluated_depsgraph_get()
evaluated=mesh.evaluated_get(depsgraph)
low=min((evaluated.matrix_world@v.co).z for v in evaluated.data.vertices)
root.location.z=-low
bpy.context.view_layer.update()
scene.frame_set(0)
bpy.ops.export_scene.gltf(filepath=os.environ['ASHFALL_BOAR_OUTPUT'],export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,export_force_sampling=True,export_skins=True,export_materials='EXPORT',export_yup=True,export_apply=False,export_anim_single_armature=True)
print('EXPORTED',os.environ['ASHFALL_BOAR_OUTPUT'])
`;
  execFileSync(python, ["-c", conversion], {
    env: {
      ...process.env,
      ASHFALL_BOAR_INPUT: path.join(cache, "boar.blend"),
      ASHFALL_BOAR_OUTPUT: boarGlb,
    },
    stdio: "inherit",
  });
}
function accessor(document, name, type, array) {
  return document
    .createAccessor(name)
    .setType(type)
    .setArray(array)
    .setBuffer(document.getRoot().listBuffers()[0]);
}
const report = {
  license: "CC0-1.0",
  orientation: "+Z forward, +Y up, metre units, y=0 floor",
  prepared: new Date().toISOString(),
  sources: [],
  animals: {},
  files: [],
};
const clipMaps = {
  deer: {
    Idle: "Idle",
    Idle_2: "IdleLook",
    Eating: "Eat",
    Walk: "Walk",
    Gallop: "Run",
    Attack_Headbutt: "Attack",
    Attack_Kick: "Kick",
    Idle_HitReact1: "Hit",
    Idle_HitReact2: "HitAlt",
    Death: "Death",
    Gallop_Jump: "Jump",
  },
  wolf: {
    Idle: "Idle",
    Idle_2: "IdleLook",
    Eating: "Eat",
    Walk: "Walk",
    Gallop: "Run",
    Attack: "Attack",
    Idle_HitReact1: "Hit",
    Idle_HitReact2: "HitAlt",
    Death: "Death",
    Gallop_Jump: "Jump",
  },
  boar: { default: "Idle", walk: "Walk", attack: "Attack" },
};
function disposeAnimation(animation) {
  const samplers = [...animation.listSamplers()];
  animation.listChannels().forEach((c) => c.dispose());
  samplers.forEach((s) => s.dispose());
  animation.dispose();
}
function cloneClip(document, source, name, durationScale = 1) {
  const animation = document.createAnimation(name);
  for (const channel of source.listChannels()) {
    const sampler = channel.getSampler(),
      time = new Float32Array(sampler.getInput().getArray());
    for (let i = 0; i < time.length; i++) time[i] *= durationScale;
    const copy = document
      .createAnimationSampler()
      .setInterpolation(sampler.getInterpolation())
      .setInput(accessor(document, name + "-time", "SCALAR", time))
      .setOutput(sampler.getOutput());
    animation
      .addSampler(copy)
      .addChannel(
        document
          .createAnimationChannel()
          .setTargetNode(channel.getTargetNode())
          .setTargetPath(channel.getTargetPath())
          .setSampler(copy),
      );
  }
  return animation;
}
function addTrack(document, animation, node, type, times, values) {
  for (const previous of [...animation.listChannels()])
    if (
      previous.getTargetNode() === node &&
      previous.getTargetPath() === type
    ) {
      const sampler = previous.getSampler();
      previous.dispose();
      sampler.dispose();
    }
  const sampler = document
    .createAnimationSampler()
    .setInterpolation("LINEAR")
    .setInput(
      accessor(
        document,
        animation.getName() + "-time",
        "SCALAR",
        new Float32Array(times),
      ),
    )
    .setOutput(
      accessor(
        document,
        animation.getName() + "-" + type,
        type === "rotation" ? "VEC4" : "VEC3",
        new Float32Array(values),
      ),
    );
  animation
    .addSampler(sampler)
    .addChannel(
      document
        .createAnimationChannel()
        .setTargetNode(node)
        .setTargetPath(type)
        .setSampler(sampler),
    );
}
async function groundedDeath(document, kind) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const container = await LoadAssetContainerAsync(
    await io.writeBinary(document),
    scene,
    {
      pluginExtension: ".glb",
      pluginOptions: { gltf: { animationStartMode: 0 } },
    },
  );
  container.addAllToScene();
  const nodes = new Map(
    [...container.meshes, ...container.transformNodes].map((n) => [n.name, n]),
  );
  const rest = [...nodes.values()].map((node) => ({
    node,
    position: node.position.clone(),
    rotation: node.rotationQuaternion?.clone(),
    scale: node.scaling.clone(),
  }));
  const root = nodes.get("AnimalActionRoot"),
    head = nodes.get(kind === "boar" ? "head" : "Head");
  const referenceHead = head.computeWorldMatrix(true).clone();
  const group = container.animationGroups.find((g) => g.name === "Death");
  const animation = document
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === "Death");
  const fps = group.targetedAnimations[0].animation.framePerSecond,
    duration = (group.to - group.from) / fps;
  group.start(false, 0);
  group.pause();
  const times = [],
    translations = [],
    headRotations = [],
    evidence = [];
  let standingBounds;
  const bounds = () => {
    for (const node of nodes.values()) node.computeWorldMatrix(true);
    scene.incrementRenderId();
    for (const skeleton of container.skeletons) skeleton.prepare(true);
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of container.meshes) {
      if (!mesh.getTotalVertices()) continue;
      const p = mesh.getPositionData(true, false),
        m = mesh.computeWorldMatrix(true);
      for (let i = 0; i < p.length; i += 3) {
        const v = Vector3.TransformCoordinates(
          Vector3.FromArray(p, i),
          m,
        ).asArray();
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], v[k]);
          max[k] = Math.max(max[k], v[k]);
        }
      }
    }
    return { min, max };
  };
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    root.position.setAll(0);
    group.goToFrame(group.from + (group.to - group.from) * t, false);
    for (const node of nodes.values()) node.computeWorldMatrix(true);
    if (kind === "deer") {
      // Let the long neck keep the skull upright as the body falls, so antlers
      // remain rigidly attached to the head instead of being pushed through soil.
      const parent = head.parent,
        local = referenceHead.multiply(
          Matrix.Invert(parent.computeWorldMatrix(true)),
        ),
        desired = Quaternion.Identity();
      local.decompose(undefined, desired);
      const u = Math.max(0, Math.min(1, (t - 0.23) / 0.38)),
        blend = u * u * (3 - 2 * u);
      head.rotationQuaternion = Quaternion.Slerp(
        head.rotationQuaternion,
        desired,
        blend,
      );
      headRotations.push(...head.rotationQuaternion.asArray());
    }
    const before = bounds(),
      offset = 0.005 - before.min[1];
    if (i === 0) standingBounds = before;
    root.position.y += offset;
    times.push(t * duration);
    translations.push(...root.position.asArray());
    if (i % 8 === 0)
      evidence.push({
        phase: t,
        uncorrectedMinY: before.min[1],
        rootY: root.position.y,
      });
  }
  addTrack(
    document,
    animation,
    document
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === "AnimalActionRoot"),
    "translation",
    times,
    translations,
  );
  if (kind === "deer")
    addTrack(
      document,
      animation,
      document
        .getRoot()
        .listNodes()
        .find((n) => n.getName() === "Head"),
      "rotation",
      times,
      headRotations,
    );
  group.stop();
  const hoofGrounding = {};
  for (const source of container.animationGroups) {
    if (
      ![
        "Idle",
        "IdleLook",
        "Walk",
        "Run",
        "Attack",
        "Hit",
        "HitAlt",
        "Eat",
      ].includes(source.name)
    )
      continue;
    for (const pose of rest) {
      pose.node.position.copyFrom(pose.position);
      if (pose.rotation) pose.node.rotationQuaternion.copyFrom(pose.rotation);
      pose.node.scaling.copyFrom(pose.scale);
    }
    source.start(false, 0);
    source.pause();
    const clip = document
        .getRoot()
        .listAnimations()
        .find((a) => a.getName() === source.name),
      seconds =
        (source.to - source.from) /
        source.targetedAnimations[0].animation.framePerSecond;
    const times = [],
      values = [];
    let maximum = 0;
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      root.position.setAll(0);
      source.goToFrame(source.from + (source.to - source.from) * t, false);
      const low = bounds().min[1],
        correction = Math.max(0, 0.004 - low);
      maximum = Math.max(maximum, correction);
      times.push(t * seconds);
      values.push(
        root.position.x,
        root.position.y + correction,
        root.position.z,
      );
    }
    if (maximum > 0.0005)
      addTrack(
        document,
        clip,
        document
          .getRoot()
          .listNodes()
          .find((n) => n.getName() === "AnimalActionRoot"),
        "translation",
        times,
        values,
      );
    hoofGrounding[source.name] = maximum;
    source.stop();
  }
  scene.dispose();
  engine.dispose();
  return { samples: evidence, bounds: standingBounds, hoofGrounding };
}
function poseOffset(document, animation, name, times, angles, axis = 0) {
  const node = document
    .getRoot()
    .listNodes()
    .find((node) => node.getName() === name);
  if (!node) throw new Error("Missing authored pose bone: " + name);
  const previous = animation
    .listChannels()
    .find(
      (channel) =>
        channel.getTargetNode() === node &&
        channel.getTargetPath() === "rotation",
    );
  const base = previous
    ? Array.from(previous.getSampler().getOutput().getArray()).slice(0, 4)
    : node.getRotation();
  if (previous) {
    const sampler = previous.getSampler();
    previous.dispose();
    sampler.dispose();
  }
  const multiply = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
  const values = angles.flatMap((angle) => {
    const delta = [0, 0, 0, Math.cos(angle / 2)];
    delta[axis] = Math.sin(angle / 2);
    return multiply(base, delta);
  });
  addTrack(document, animation, node, "rotation", times, values);
}
function normalizedRoot(document, scale = 1) {
  const scene = document.getRoot().listScenes()[0];
  const root = document.createNode("AnimalActionRoot");
  for (const child of [...scene.listChildren()]) {
    scene.removeChild(child);
    root.addChild(child);
  }
  if (scale !== 1) {
    const norm = document
      .createNode("AnimalScaleRoot")
      .setScale([scale, scale, scale]);
    for (const child of [...root.listChildren()]) {
      root.removeChild(child);
      norm.addChild(child);
    }
    root.addChild(norm);
  }
  scene.addChild(root);
  return root;
}
function smoothCoat(document) {
  for (const mesh of document.getRoot().listMeshes()) {
    if (/Horn/.test(mesh.getName())) continue;
    const normalMap = new Map();
    const key = (p, i) =>
      `${Math.round(p[i] * 1e5)},${Math.round(p[i + 1] * 1e5)},${Math.round(p[i + 2] * 1e5)}`;
    for (const primitive of mesh.listPrimitives()) {
      const p = primitive.getAttribute("POSITION").getArray(),
        n = primitive.getAttribute("NORMAL")?.getArray();
      if (!n) continue;
      for (let i = 0; i < p.length; i += 3) {
        const k = key(p, i),
          sum = normalMap.get(k) ?? [0, 0, 0];
        sum[0] += n[i];
        sum[1] += n[i + 1];
        sum[2] += n[i + 2];
        normalMap.set(k, sum);
      }
    }
    for (const primitive of mesh.listPrimitives()) {
      const p = primitive.getAttribute("POSITION").getArray(),
        normal = new Float32Array(p.length);
      for (let i = 0; i < p.length; i += 3) {
        const sum = normalMap.get(key(p, i)) ?? [0, 1, 0],
          length = Math.hypot(...sum) || 1;
        normal.set(
          sum.map((v) => v / length),
          i,
        );
      }
      primitive.setAttribute(
        "NORMAL",
        accessor(document, "smooth-coat-normal", "VEC3", normal),
      );
    }
  }
}
function furPixels() {
  const size = 256,
    pixels = Buffer.alloc(size * size * 3);
  let seed = 73543;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const strand = Math.sin((x + Math.sin(y * 0.018) * 9) * 1.7) * 6;
      const value = Math.round(
        220 + strand + (rng() - 0.5) * 24 + Math.sin(x * 0.07 + y * 0.017) * 4,
      );
      pixels[(y * size + x) * 3] = value;
      pixels[(y * size + x) * 3 + 1] = value;
      pixels[(y * size + x) * 3 + 2] = value;
    }
  return sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .webp({ quality: 83 })
    .toBuffer();
}
const furImage = await furPixels();
for (const [kind, source] of Object.entries(sources)) {
  const sourceBytes = await fs.readFile(path.join(cache, source.file));
  report.sources.push({
    ...source,
    bytes: sourceBytes.length,
    sha256: sha256(sourceBytes),
    license: "CC0-1.0",
  });
  const document = await io.read(
    kind === "boar" ? boarGlb : path.join(cache, source.file),
  );
  if (kind === "deer") {
    // Reduce the stylized cream eye socket to the natural coat colour while
    // retaining the original small dark eye geometry and all skin weights.
    const coat = document
      .getRoot()
      .listMaterials()
      .find((m) => m.getName() === "Material");
    for (const mesh of document.getRoot().listMeshes())
      for (const primitive of [...mesh.listPrimitives()]) {
        if (primitive.getMaterial()?.getName() !== "Material.003") continue;
        const positions = primitive.getAttribute("POSITION").getArray(),
          indices = primitive.getIndices().getArray(),
          keep = [],
          socket = [];
        for (let i = 0; i < indices.length; i += 3) {
          const vertices = [indices[i], indices[i + 1], indices[i + 2]],
            c = [0, 0, 0];
          for (const v of vertices)
            for (let a = 0; a < 3; a++) c[a] += positions[v * 3 + a] / 3;
          const group =
            Math.abs(c[0]) > 0.18 &&
            c[1] > 3.62 &&
            c[1] < 4.08 &&
            c[2] > 2.17 &&
            c[2] < 2.8
              ? socket
              : keep;
          group.push(...vertices);
        }
        if (socket.length) {
          const natural = primitive
            .clone()
            .setMaterial(coat)
            .setIndices(
              accessor(
                document,
                "natural-eye-socket",
                "SCALAR",
                new Uint32Array(socket),
              ),
            );
          compactPrimitive(natural);
          mesh.addPrimitive(natural);
          primitive.setIndices(
            accessor(document, "cream-coat", "SCALAR", new Uint32Array(keep)),
          );
          compactPrimitive(primitive);
        }
      }
  }
  const actionRoot = normalizedRoot(
    document,
    kind === "boar" ? 1 : source.scale,
  );
  for (const animation of [...document.getRoot().listAnimations()]) {
    const mapped = clipMaps[kind][animation.getName()];
    if (!mapped) {
      disposeAnimation(animation);
      continue;
    }
    animation.setName(mapped);
    if (mapped === "Idle" && kind === "boar")
      for (const sampler of animation.listSamplers()) {
        const output = sampler.getOutput(),
          value = Array.from(output.getArray()).slice(
            0,
            output.getElementSize(),
          );
        sampler
          .setInput(
            accessor(
              document,
              "boar-idle-time",
              "SCALAR",
              new Float32Array([0, 3]),
            ),
          )
          .setOutput(
            accessor(
              document,
              "boar-idle-hold",
              output.getType(),
              new Float32Array([...value, ...value]),
            ),
          );
      }
  }
  if (kind === "boar") {
    const walk = document
      .getRoot()
      .listAnimations()
      .find((a) => a.getName() === "Walk");
    cloneClip(document, walk, "Run", 0.55);
    const idle = document
      .getRoot()
      .listAnimations()
      .find((a) => a.getName() === "Idle");
    for (const [name, duration, sign] of [
      ["Hit", 0.42, 1],
      ["HitAlt", 0.46, -1],
    ]) {
      const clip = cloneClip(document, idle, name, duration / 3);
      const times = [0, duration * 0.28, duration * 0.64, duration],
        rot = [];
      for (const angle of [0, sign * 0.12, -sign * 0.035, 0])
        rot.push(0, 0, Math.sin(angle / 2), Math.cos(angle / 2));
      addTrack(document, clip, actionRoot, "rotation", times, rot);
      addTrack(
        document,
        clip,
        actionRoot,
        "translation",
        times,
        [0, 0, 0, 0, 0.025, -0.06, 0, 0.008, -0.025, 0, 0, 0],
      );
      poseOffset(document, clip, "head", times, [0, -0.13, 0.045, 0], 0);
    }
    const death = cloneClip(document, idle, "Death", 1.05 / 3);
    const times = [0, 0.18, 0.43, 0.7, 1.05],
      angles = [0, 0.08, 0.65, 1.4, 1.52];
    addTrack(
      document,
      death,
      actionRoot,
      "rotation",
      times,
      angles.flatMap((angle) => [
        0,
        0,
        Math.sin(angle / 2),
        Math.cos(angle / 2),
      ]),
    );
    // The action root pivots at the hoof plane; rising during the roll keeps the low side above ground.
    addTrack(
      document,
      death,
      actionRoot,
      "translation",
      times,
      [
        0, 0, 0, -0.02, 0.01, 0, -0.1, 0.19, 0.02, -0.25, 0.35, 0.03, -0.28,
        0.35, 0.03,
      ],
    );
    for (const side of ["L", "R"]) {
      poseOffset(
        document,
        death,
        "body.001_" + side + ".001",
        [0, 0.25, 0.55, 1.05],
        [0, 0.08, 0.35, 0.45],
        0,
      );
      poseOffset(
        document,
        death,
        "body.001_" + side + ".003",
        [0, 0.25, 0.55, 1.05],
        [0, -0.12, -0.72, -0.92],
        0,
      );
      poseOffset(
        document,
        death,
        "body_" + side + ".001",
        [0, 0.25, 0.55, 1.05],
        [0, -0.08, -0.4, -0.52],
        0,
      );
      poseOffset(
        document,
        death,
        "body_" + side + ".003",
        [0, 0.25, 0.55, 1.05],
        [0, 0.1, 0.6, 0.8],
        0,
      );
    }
    poseOffset(
      document,
      idle,
      "body.001",
      [0, 0.75, 1.5, 2.25, 3],
      [0, 0.009, 0, -0.009, 0],
      0,
    );
    poseOffset(
      document,
      idle,
      "head",
      [0, 0.75, 1.5, 2.25, 3],
      [0, 0.022, 0, -0.018, 0],
      2,
    );
  }
  smoothCoat(document);
  if (kind !== "boar") {
    const fur = document
      .createTexture(kind + "-subtle-fur")
      .setImage(furImage)
      .setMimeType("image/webp");
    for (const material of document.getRoot().listMaterials()) {
      const color = material.getBaseColorFactor(),
        mean = (color[0] + color[1] + color[2]) / 3;
      material
        .setBaseColorFactor([
          color[0] * 0.72 + mean * 0.28,
          color[1] * 0.72 + mean * 0.28,
          color[2] * 0.72 + mean * 0.28,
          1,
        ])
        .setMetallicFactor(0)
        .setRoughnessFactor(mean < 0.04 ? 0.42 : 0.94)
        .setDoubleSided(true);
      if (mean > 0.05) material.setBaseColorTexture(fur);
    }
    for (const mesh of document.getRoot().listMeshes())
      for (const primitive of mesh.listPrimitives()) {
        const p = primitive.getAttribute("POSITION").getArray(),
          uv = new Float32Array((p.length / 3) * 2);
        for (let i = 0; i < p.length / 3; i++) {
          uv[i * 2] = p[i * 3 + 2] * 0.72 + p[i * 3] * 0.31;
          uv[i * 2 + 1] = p[i * 3 + 1] * 0.85;
        }
        primitive.setAttribute(
          "TEXCOORD_0",
          accessor(document, "fur-uv", "VEC2", uv),
        );
      }
  } else {
    for (const texture of document.getRoot().listTextures()) {
      const image = await sharp(Buffer.from(texture.getImage()))
        .resize(512, 512, { fit: "inside" })
        .modulate({ saturation: 0.62 })
        .webp({ quality: 89 })
        .toBuffer();
      texture.setImage(image).setMimeType("image/webp");
    }
  }
  await document.transform(weld(), resample(), prune(), dedup());
  const deathGrounding = await groundedDeath(document, kind);
  await document.transform(resample(), prune(), dedup());
  await io.write(path.join(cache, kind + "-full-preview.glb"), document);
  const profile = {
    source: source.source,
    scale: source.scale,
    sourceScale: source.scale,
    runtimeScale: 1,
    forward: "+Z",
    groundY: 0,
    animations: {},
    deathGrounding: deathGrounding.samples,
    hoofGrounding: deathGrounding.hoofGrounding,
    bounds: deathGrounding.bounds,
    joints: document.getRoot().listSkins()[0]?.listJoints().length ?? 0,
    bones:
      kind === "boar"
        ? {
            head: "head",
            body: "Hips",
            frontLeft: "body.001_L.002",
            frontRight: "body.001_R.002",
            backLeft: "body_L.002",
            backRight: "body_R.002",
          }
        : {
            head: "Head",
            body: "Body",
            frontLeft: "FrontLowerLeg.L",
            frontRight: "FrontLowerLeg.R",
            backLeft: "BackLowerLeg.L",
            backRight: "BackLowerLeg.R",
          },
    modifications:
      kind === "boar"
        ? "Original CC0 Blender rig and walk/attack baked to glTF. Idle is the author neutral pose; Run is a retimed original walk; Hit/HitAlt/Death are authored action-root transitions."
        : "Original quadruped skin and animations retained; metre scale; coincident-vertex coat normals smoothed; desaturated original coat colours; subtle authored fur grain.",
  };
  for (const animation of document.getRoot().listAnimations())
    profile.animations[animation.getName()] = {
      duration: Math.max(
        ...animation.listSamplers().map((s) => s.getInput().getMax([])[0]),
      ),
      loop: !["Attack", "Kick", "Death", "Hit", "HitAlt", "Jump"].includes(
        animation.getName(),
      ),
      provenance:
        kind === "boar" &&
        ["Idle", "Run", "Hit", "HitAlt", "Death"].includes(animation.getName())
          ? "derived / authored for Ashfall"
          : "original author animation",
    };
  profile.animations.Attack.hitPhase = { deer: 0.46, wolf: 0.3, boar: 0.4 }[
    kind
  ];
  profile.animations.Attack.contactNote =
    "Annotated from sampled authored windup, forward head/tusk strike and recovery. Runtime piecewise-remaps this phase to ActorAttack.hitTime.";
  report.animals[kind] = profile;
  const motion = cloneDocument(document);
  for (const node of motion.getRoot().listNodes()) {
    node.setMesh(null);
    node.setSkin(null);
  }
  await motion.transform(prune(), dedup());
  async function save(file, doc) {
    await io.write(path.join(directory, file), doc);
    const bytes = await fs.readFile(path.join(directory, file));
    const triangles = doc
      .getRoot()
      .listMeshes()
      .flatMap((m) => m.listPrimitives())
      .reduce((n, p) => n + p.getIndices().getCount() / 3, 0);
    report.files.push({
      file,
      bytes: bytes.length,
      triangles,
      sha256: sha256(bytes),
      kind,
    });
    console.log(file, bytes.length, triangles);
  }
  await save(kind + "-motion.glb", motion);
  for (const animation of [...document.getRoot().listAnimations()])
    disposeAnimation(animation);
  await document.transform(prune(), dedup());
  for (const [lod, ratio] of [
    ["high", 1],
    ["low", 0.52],
  ]) {
    const output = cloneDocument(document);
    if (ratio < 1)
      await output.transform(
        simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }),
        textureCompress({
          encoder: sharp,
          targetFormat: "webp",
          resize: [128, 128],
          quality: 85,
        }),
        prune(),
        dedup(),
      );
    await save(kind + "-" + lod + ".glb", output);
  }
}
await fs.writeFile(
  path.join(directory, "manifest.json"),
  JSON.stringify(report, null, 2) + "\n",
);
