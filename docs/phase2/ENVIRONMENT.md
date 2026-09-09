# Phase 2 environment asset and composition pass

> 本文保留模块设计、接入约定与交接时的验证边界；整体已完成接入，当前真实浏览器与最终验证结果见 [第二阶段验收](ACCEPTANCE.md)。

This document describes the environment subtask. It does not declare `goal2.md` or the game's final visual audit complete.

## Direction and sources

Greyvale retains its cold grey/green, abandoned rural and industrial palette. New props use one consistent realistic PBR source library rather than mixing scan-like surfaces with cartoon props. Poly Haven states that its assets are original staff or contributor work, licensed **CC0**, including commercial use and redistribution: [official asset license](https://polyhaven.com/license), [CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/).

Acquisition and optimization are reproducible with `node scripts/prepare-environment.mjs`. The script uses the public API with the project User-Agent, caches source downloads in a system temporary directory, and writes only optimized runtime assets to `public/assets/environment`. Individual authors, original geometry size, acquired prefix size, source SHA-256, output SHA-256, exact output triangle count, modifications, and source/API URLs are in `public/assets/environment/manifest.json`.

| Runtime asset | Original asset / author | High / low triangles | High / low bytes |
|---|---|---:|---:|
| Scanned fern | [Fern 02](https://polyhaven.com/a/fern_02), Rob Tuytel / Rico Cilliers | 2,384 / 762 | 134,496 / 49,112 |
| Moss stones | [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01), Kless Gyzen | 3,848 / 880 | 499,928 / 54,948 |
| Worn chair | [Painted Wooden Chair 01](https://polyhaven.com/a/painted_wooden_chair_01), Kuutti Siitonen | 724 / 366 | 128,192 / 57,744 |
| Worn table | [Painted Wooden Table](https://polyhaven.com/a/painted_wooden_table), Kirill Sannikov | 600 / 300 | 272,432 / 38,092 |
| Rubbish bag | [Trashbag](https://polyhaven.com/a/trashbag), Benny Weimer | 2,912 / 806 | 199,848 / 68,932 |
| Fuel drum | [Barrel 03](https://polyhaven.com/a/barrel_03), Serhii Khromov | 1,473 / 588 | 157,164 / 55,048 |
| Green fuel can | [Metal Jerrycan Green](https://polyhaven.com/a/metal_jerrycan_green), Ulan Cabanilla | 6,744 / 1,925 | 354,912 / 116,896 |
| Open cardboard box | [Cardboard Box 01](https://polyhaven.com/a/cardboard_box_01), Rahul Chaudhary | 5,932 / 1,694 | 257,508 / 78,192 |
| Maintenance tool | [Adjustable Wrench](https://polyhaven.com/a/adjustable_wrench), Mateusz Sadek | 3,503 / 1,000 | 185,600 / 102,592 |
| Standby generator | [Portable Generator](https://polyhaven.com/a/portable_generator), James Ray Cock | 13,189 / 4,984 | 1,124,260 / 332,304 |
| Scanned pine trunk and branches | [Pine Tree 01](https://polyhaven.com/a/pine_tree_01), Rob Tuytel / Rico Cilliers | 4,657 / 1,145 | 1,587,308 / 137,332 |

All assets retain their PBR textures. High texture limits are 256–1024 px according to object size; low textures are at most 256 px. Maps are WebP. Geometry is welded, simplified using Meshopt, and static compatible meshes are joined. There is no runtime Meshopt decompression dependency and no 4K/8K runtime download. A selected fern and stone specimen is used from the source sets; it is rotated and scaled in-world rather than displaying an entire source gallery arrangement.

The original pine buffer is **948,849,556 bytes**. The acquisition script reads only its first **3,175,876 bytes** containing the photographed trunk and branches, then cancels the response. It deliberately does not ship the original multi-million-vertex modeled needles. Crowns use the official photographed twig diffuse and alpha maps, with the isolated needle sprig resized to **256 × 512 RGBA WebP**, and three explicitly authored geometry LODs. This is a hybrid authored tree asset, not an unmodified scan. The original trunk pivot is retained so the scanned tree stays aligned with the existing tree collider.

**Total runtime pack: 6,464,862 bytes. Forest preload: 2,888,254 bytes**, including both geometry LODs and the bough alpha (the retained 46,892-byte source sprig is not requested at runtime). Household, medical and industrial props are loaded only when a requested world chunk contains POIs that use them. The global service worker currently installs the complete game's offline pack in the background; that separate offline policy is not changed by this subtask.

## Composition and environmental stories

- **Forest:** scanned trunk/branch primary silhouettes, three irregular needle crown variants, photographed ferns and moss ground stones, short meadow grass, occasional windblown leaf litter. Stones stay below step height; no new large rock obstruction is silently placed without collision.
- **Homes / forestry / small town:** photographed worn tables and chairs replace the old block furniture. One chair has fallen beside the table; open and packed cartons, remaining tea, left-behind coats, rolled bedding, tagged supplies and discarded evacuation registers imply an interrupted departure. The central room and entrance remain usable.
- **City:** the existing street and multi-storey building layout stays stable. Four restrained facade tints, lower paint courses, skirting, weather streaks, mismatched boarded windows, drainpipes and rubbish against the outer walls break up the identical wall treatment.
- **Industrial / military:** drums, a backup generator, spare fuel, a maintenance wrench, storage labels, electrical distribution switches, pipe clamps and lockout / isolation signs establish specific use. Big exterior props use shared placement colliders.
- **Medical / laboratory:** retained bed geometry gains gurney legs, wheels and rails, IV supplies, discarded dressings, clinical waste, triage supply cartons, transfer-stop instructions and restrained old blood residue. These support the narrative rather than adding unrelated readable lore.
- **Road edge / building approach:** weathered plinths, runoff, asymmetric window boarding, documents, fuel and discarded bags provide intermediate-scale detail around the existing road/entrance composition. Existing road, door, glass, POI positions and interactive container logic are retained.

Architecture, shelves, beds, rails and small story fixtures are authored geometry using the established materials. Photosourced props replace the most conspicuous rough objects. Grass remains the established authored foliage card; this pass does not claim every surface or object was replaced with an external asset.

## Streaming, LOD and motion

`EnvironmentAssetLibrary` owns shared containers, textures and hidden normalized templates. Chunk instances clone geometry before uploading thin-instance buffers, avoiding shared WebGPU instance-buffer mutation. Static props are batched by asset/material and chunk. Chunk removal disposes scene instances; cached source templates are disposed with the renderer. The normal 256 m / nine-chunk world streaming architecture is unchanged.

| Detail | High | Reduced | Cull |
|---|---:|---:|---:|
| Pine wood | <64 m | 64–390 m | 390 m |
| Needle crown | <70 m, 1,080 triangles | 70–175 m, 308 triangles; 175–390 m, 192 triangles | 390 m |
| Fern | <28 m | 28–85 m | 85 m |
| Moss stone | <40 m | 40–165 m | 165 m |
| Household / industrial props | <45 m | 45–155 m | 155 m |
| Small wrench | <18 m | 18–40 m | 40 m |
| Grass | — | 60–96 m depending on density | Beyond density-scaled radius |
| Suspended fixtures | Smooth pendulum <55 m | No distant animation | 55 m |

Distance selection runs on the existing 0.6-second streaming tick. Buffers are only replaced when the selected instance set changes. Door animation still runs each frame from `DoorSystem.progress`, including rattle, reverse, broken state and parented handle.

Ambient motion uses **26 persistent pooled meshes**: 12 windblown paper/leaf fragments, 8 roof drips and 6 soft steam billboards. Roof drips run only during rain/storm, steam only at a nearby industrial/lab service location, and scraps are suppressed inside the closest building. Nearby source selection runs every 0.75 seconds. Paper origins stay fixed in world space until the pool is reused. No effect creates a growing mesh/particle list. Suspended room lamps pivot from their actual upper hook, using restrained two-axis motion.

## Collision and integration contract

`src/rendering/environment-props.ts` has no Babylon import and exports:

- `environmentPlacements(p)`: relative floor pivot, physical metre dimensions, yaw/pitch/roll, source asset, stable ID and whether the object is solid.
- `environmentPropColliders(p, floorY)`: conservative bounds from all eight rotated box corners for every solid placement.

The generator should include `out.push(...environmentPropColliders(p, y))` in `collidersFor(p)`. The shared renderer uses the same data. The original table position `(p.x + 3, p.z + 1.8)` and story page at `floorY + .945` are maintained; the new tabletop is at `floorY + .92` and continues using the existing table collider. Large props do not intrude into the centre corridor. Smaller shelf/table items are supported by already-solid furniture. No new interaction IDs or loot rules are introduced.

The parent task owns underground layout, underground collision and narrative actions. It can extend `world-renderer.ts` / `BuildingLibrary` after this environment handoff. No underground completion claim is made here.

## Verification and limits

`npx vitest run tests/phase2-environment.test.ts`: **7 / 7 passed**. Tests verify all 22 GLBs through the real Babylon importer with NullEngine, nonempty meshes and ready textures, resource SHA-256, triangle/texture/file budgets, actual lower geometry in each low LOD, collider/placement coverage across every generated POI, clear central corridors and fallen-chair bounds.

Targeted ESLint passes for all environment source files and the new test. The full `npx tsc --noEmit` check passed at handoff. Environment and door suites together pass **13 / 13 tests**. The final integrated build must still be rerun after the parent task finishes its ongoing work.

**NullEngine is not a visual or GPU acceptance test.** The parent task must inspect the actual forest crown density/shape, indoor furniture scale and facing, nighttime flashlight response, rainy gutters, industrial steam, chunk unloading/reloading and frame-time/draw-call behaviour in the running game. No browser focus or development service was changed by this subtask. World art remains constrained by the original single-room POI shell and existing terrain layout, and this pass alone does not prove the complete game's final commercial-quality target.


## Screenshot-driven correction and opening set

The actual `fabric-adjust.png` / `grip-pistol.png` captures exposed two concrete problems. The first texture pipeline performed two Sharp resizes around a channel merge; only the final resize was effective, leaving diffuse colours and alpha out of registration. The corrected pipeline materializes registered RGBA before crop/resize. A connected-component mask also removes opaque UV-dilation islands around the photographed sprig. The isolated source sprig is retained at 256 × 512; a **1024 × 1024, 425,130-byte bough atlas** joins 15 naturally sized photographed sprigs. Crown cards are now radial and predominantly horizontal, with a second oblique layer near the camera. Source transparency and output dimensions are tested, and the corrected atlas was visually inspected independently.

The second problem was using the tree clearance rule for all plants. That prohibited vegetation within 12 m of roads and 12 m of every house, creating the large empty sandy foreground in the captures. Ground cover now has its own shared exclusion rule: actual asphalt, occupied room footprint, doorway and approach paths. Seeded grass/fern pockets run along shoulders and wall bases. The baseline candidate count is 7,100 per chunk, with bounded verge/yard pockets; distance culling remains in place. Large terrain colour variation uses restrained grey-green values rather than the yellow multiplier. `environmentApproaches` produces matching worn footpaths and plant exclusions that connect front doors to reachable road edges. Existing tree locations, tree collision, road widths and POI locations remain unchanged.

The opening camera at **(-14, .8, -28)** looks toward an actual sideways evacuation transport truck, rather than an empty road. The fixed scene extends the established pickup cab/chassis into a passenger transport body with empty benches, broken side glazing, a displaced emergency exit, transport identifiers, a third axle, scattered safety glass, skid marks and tagged luggage. It uses existing authored vehicle geometry and materials; no new external license is involved.

`OPENING_WRECK` defines the body at **(-10.4, 1.34, -19.8)** with yaw **.17** and roll **1.38**. `openingWreckColliders()` exports one body and three luggage colliders, to be added once to the collision world's static set. It is not a driveable or lootable vehicle. The renderer creates it only in chunk (-1, -1), and its root and child wheel meshes unload with that chunk. Tests retain clear space at the recovery position (-14, 0, -28) and its immediate walking exits.

At correction handoff: environment + door suites **13 / 13 passed**, complete TypeScript and targeted ESLint passed. Parent task is responsible for reloading and capturing the same in-game camera angle to assess the corrected tree silhouettes, ground continuity and actual wreck framing; this note does not substitute asset inspection for that check.

## 最终长测后的材质适配

外部发电机的玻璃使用 `loadEnvironmentAsset()` 转为 alpha/clear coat。加载时禁用 glTF transmission helper，避免为小部件渲染整个世界以及跨区卸载后的网格保留；GLB 本体、原始许可和文件 hash 未改。回归测试实际读取发电机 GLB 并反复创建/销毁网格，确认没有 `opaqueSceneTexture`。完整持续运行证据见 [性能记录](PERFORMANCE.md)。
