# 生成素材记录

## 松针枝叶透明贴图

- 路径：public/textures/generated/pine-bough.png
- 方式：Codex 内置 imagegen，生成后复制原始 PNG 到项目，保留透明通道。
- 用途：程序化松树的 alpha foliage 纹理，场景中参与风吹顶点变形与动态照明。
- Prompt:

> Use case: photorealistic-natural. Asset type: transparent foliage alpha texture for a realistic 3D first-person forest survival game. Create ONE isolated botanical cutout of a lush, irregular Scots pine bough seen straight from above, with a woody branch entering from the bottom center and dividing into 9 to 14 smaller irregular side branches, each densely covered with real fine pine needles. The composition is approximately square, the full branch fits inside the canvas with at least 6% empty margin. Realistic detailed needles in muted natural olive, forest green and slightly silvery green; dark brown small twigs. Photograph-like leaf surface detail, natural organic asymmetry, no perfect triangular silhouette, no regular repeated ranks. Even overcast neutral diffuse illumination, no directional shadows, suitable as a game diffuse albedo texture that will receive dynamic lighting. Needs a genuinely transparent background with alpha, including all tiny gaps between needles. No ground, no wall, no cast shadow, no checkerboard, no text, no logo, no whole tree. Dense connected foliage but fine feathery edges. 1024 by 1024 or larger square image.

## 程序化素材

- 原始备用材质：src/rendering/materials.ts 的 MaterialFactory，以种子噪声生成 Albedo / Normal / ORM。
- 植被：松针备用纹理、阔叶、草与蕨类图集由 Canvas 绘制。
- 场景与角色：Babylon MeshBuilder、合并几何体、节点 rig、Thin Instances。
- 图标：src/ui/icons.ts 的功能性 SVG。
- 音效：src/audio/audio.ts 的 Web Audio 振荡器、滤波噪音和空间声源。

## 外部素材

详见 ../THIRD_PARTY_ASSETS.md 和 public/textures/manifest.json。
