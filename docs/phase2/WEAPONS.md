# 第二阶段外部武器资产

> 本文保留模块设计、接入约定与交接时的验证边界；整体已完成接入，当前真实浏览器与最终验证结果见 [第二阶段验收](ACCEPTANCE.md)。

## 选择结论

选择原作者 Quaternius 的 [Ultimate Guns Pack](https://quaternius.com/packs/ultimategun.html)，许可 CC0-1.0。已实际比较原作者预览、下载的 OBJ 侧投影和转换后 GLB 几何预览：源模型具有扳机护圈、滑套、枪口、准星、曲形弹匣、护木、泵把与伸缩枪托等明确轮廓，适合替换现有由近似方块拼成的枪械。没有采用较偏科幻造型的 Kenney Blaster Kit，也没有导出或下载任何付费、登录受限或许可不明的模型。

这是有真实枪型结构的低多边形资源，不是写实扫描高模。原作者枪身占绝大部分几何；项目补了必要的可动枪机小件、手枪弹匣和猎枪机械准星支座，并添加低饱和 PBR 材质与轻微程序化表面纹理。

[查看转换后检查图](../../public/assets/weapons/inspection.png)。此图是 GLB 几何投影，明确标注并非游戏截图；不能替代最终第一人称画面验收。

## 文件、装备映射与体积

| 游戏装备 ID | 文件 | 原作者模型 | 三角形 | 文件字节 |
| --- | --- | --- | ---: | ---: |
| pistol / pistol45 | pistol.glb | Pistol_2 | 1,221 | 137,024 |
| military | military.glb | AssaultRifle_2 | 1,322 | 144,512 |
| rifle | rifle.glb | SniperRifle_6 | 1,442 | 155,212 |
| shotgun | shotgun.glb | Shotgun_3 | 990 | 120,912 |
| smg | smg.glb | SubmachineGun_3 | 1,590 | 130,832 |

五个 GLB 合计 **688,492 bytes（约 672.36 KiB）**，总三角形 6,565。包含检查图、清单与许可后的目录约 1 MiB，低于首批 3 MiB 预算。纹理已嵌入 GLB，没有跨域或额外纹理请求。未增加 npm、全局工具或 Blender 依赖。

特意区分 `rifle` 的 5 发民用猎枪与 `military` 的制式自动步枪，未将两者都替换成同一把 AK 轮廓。`pistol45` 暂共用手枪几何，声音仍通过低音高区分。

## 加载接口

`src/rendering/weapon-assets.ts` 导出：

- `WeaponAssetLibrary`：`preload(itemIds?)`、`ready(itemId)`、`pending`、`failures`、`instantiate(itemId, parent, instanceId?, attachments?)`、`dispose()`。
- `WeaponAssetInstance`：`root`、`meshes`、`parts`、`restPositions`、`anchors`、`info`、`resetParts()`、`dispose()`。
- `WEAPON_ASSET_INFO`：静态文件、尺寸、枪口、握点、准星与动作行程。
- `weaponAssetKind(itemId)`：装备 ID 到实际 GLB 类别的映射，不适用的近战/工具返回 null。

```ts
const library = new WeaponAssetLibrary(scene);
await library.preload();
const rig = library.instantiate(itemId, heldModel, `held-${itemId}`, equipped.attachments);
if (rig) {
  // 已经设为第一人称 renderingGroupId=1，默认不可被射线选中。
  rig.root.setEnabled(true);
  // 可直接用原有 reload / recoil 曲线驱动独立部件：
  if (rig.parts.magazine && rig.restPositions.magazine) {
    rig.parts.magazine.position.copyFrom(rig.restPositions.magazine);
    rig.parts.magazine.position.y -= reloadPull * rig.info.magazineTravel;
  }
  const reciprocating = rig.parts.slide ?? rig.parts.pump ?? rig.parts.bolt;
  if (reciprocating) {
    const rest = rig.restPositions.slide ?? rig.restPositions.pump ?? rig.restPositions.bolt;
    reciprocating.position.z = rest!.z - actionPull * rig.info.slideTravel;
  }
}
```

加载失败时由调用者保留现有程序化模型作为降级。实例销毁不销毁共享材质；库 `dispose()` 负责共享容器。下载完成前实例化返回 null，调用者在 `ready()` 转为 true 后重建持枪模型。库还会在关闭后到达的异步加载回调中释放资源。

`rifle` 的 `scope` 只在传入 `attachments.includes('scope')` 时显示，并隐藏额外机械准星 `sights`，避免双重瞄具。其他武器的可选配件继续由已有附件系统补充。不要同时保留重复的程序化镜体与此镜体。

## 坐标与握持

所有文件已离线归一到当前 `WeaponRenderer` 使用的第一人称局部尺度，适合挂在其 `model` 下面，继续沿用上级 `root.scaling = 0.68`。这些数值是兼容现有视图模型的单位，不是现实物体的绝对米制尺寸。

枪口均位于本地 **+Z**，枪管中心为 Y=0.105；握把纵向基准为 Z=0.13。转换关系：原 OBJ +X → 游戏局部 +Z，原 OBJ +Z → 游戏局部 +X。GLB 使用标准右手约定，Babylon 默认左手加载器的 `__root__` 自动处理侧向镜像；**保留该导入根节点，不再额外旋转 Y 180°，也不要删除其 scale/Quaternion**。实际 Babylon NullEngine 加载已经验证下表坐标。

| 装备 | 全尺寸 X×Y×Z | 枪口 XYZ | 右手握点 XYZ | 左手握点 XYZ |
| --- | --- | --- | --- | --- |
| pistol | .09734×.36172×.54794 | 0, .105, .57 | .04380, -.08037, .13 | -.052, -.08037, .14 |
| military | .13775×.38903×1.31712 | 0, .105, 1.05 | .06199, -.04040, .13 | -.07434, .04949, .60130 |
| rifle | .14705×.30155×1.43122 | 0, .105, 1.18 | .06617, -.01953, .13 | -.05363, .03807, .56695 |
| shotgun | .09939×.22413×1.37541 | 0, .105, 1.14 | .04473, .01572, .13 | -.06087, .02761, .61503 |
| smg | .17113×.49659×1.30376 | 0, .105, .84 | .07701, -.08204, .13 | -.06376, -.08856, .63714 |

全尺寸包含拉机柄/可选镜体等最外侧部件；不要用全尺寸宽度代替枪托或握把宽度。握点是初始接入参考，需在真实持枪手模型上检查拇指、食指与护木接触。

`info.anchors` 给出已转换到游戏局部坐标的数值。`anchors.*` 是随武器/相机变换的实际场景节点，获取世界位置应调用 `computeWorldMatrix(true)` 后取 `getAbsolutePosition()`；不要直接读 glTF 节点局部 X 当作游戏局部 X。

每把武器另有 `rearSight` / `frontSight` / `magazine` / `support` 锚点。后准星 Y 分别约 .14912 / .17339 / .15823 / .14411 / .20170；现有程序化枪械统一约 .205 的 ADS 高度需要按这些数据重新校准。枪口特效也应跟随 `muzzle`，不继续使用全部长枪统一 Z=1.12 的硬编码。

## 可动部件

| 模型 | 可动节点 | 来源与动作 |
| --- | --- | --- |
| pistol | part_slide、part_magazine | 原作者独立滑套、准星与防滑纹随套筒移动；新增适配握把的弹匣插入体与底板；滑套行程 .055、弹匣抽出 .32 |
| military | part_magazine、part_bolt | 原作者曲形弹匣；独立补充枪机面与拉机柄；行程 .065、弹匣抽出 .42 |
| rifle | part_bolt、part_scope、part_sights | 原作者拉机柄/枪机和完整镜体独立保留；新增机械准星；枪机行程 .085 |
| shotgun | part_pump、part_bolt | 原作者泵把独立保留；补充枪机面；泵动行程 .10 |
| smg | part_magazine、part_bolt | 原作者直弹匣；补充独立枪机面/拉机柄；行程 .05、弹匣抽出 .42 |

`rifle` 和 `shotgun` 没有假造可抽出的盒式弹匣；对应现有填弹/拉机柄流程时，避免硬套手枪的抽弹匣表现。父任务可用现有左手动作与枪机/泵把完成闭环。

所有 part 旋转已离线烘焙；加载类清空可动 part 的 `rotationQuaternion`，允许现有 `rotation.z` 等 Euler 动画生效。导入 `__root__` 的 Quaternion 保留。

## 来源与许可附录

原作者主页：https://quaternius.com/packs/ultimategun.html

该页面直接链接的官方公开下载目录：https://drive.google.com/drive/folders/12V-mHNB6bnW2WzgpJfRBQd-TG4pOO3yx

原包 `License.txt` 已原样保存到 `public/assets/weapons/LICENSE.txt`，声明 CC0 1.0 Universal。逐文件作者、原始 OBJ/MTL 下载地址、源 SHA-256、输出 SHA-256、转换方式、几何/部件/握点写入 `public/assets/weapons/manifest.json`。来源下载不依赖登录。信用署名非强制，仍保留 Quaternius 作者信息。

新增 PBR 微表面由项目脚本自行生成；没有引用第三方贴图或字体文件。几何修改包括凹多边形耳切三角化、材质归一、轻微厚度调整以符合当前第一人称手模型、按原始连通拓扑拆件、补充机械小件和机械准星；没有将原作者素材标为项目完全原创。

## 复现与检查

```sh
node scripts/prepare-weapons.mjs
npx eslint scripts/prepare-weapons.mjs src/rendering/weapon-assets.ts
npx tsc --noEmit
```

准备脚本优先复用被 Git 忽略的 `output/weapons-source`，缺失时从固定官方公开文件下载，并校验源 hash。它会重新输出五个 GLB、清单、许可、几何检查图，并执行 Babylon NullEngine 验证：

- 凹多边形三角化的面积保持，所有顶点/法线有限数值。
- 总 GLB <3 MiB；输出可重新由 glTF-Transform 读取。
- 实际 Babylon 左手加载后的 7 个锚点逐项符合清单，误差 <0.0001。
- 每个可动节点的局部位移生效，所有实例和容器释放后场景无残留 Mesh / TransformNode。

本子任务未修改 `weapon.ts`、renderer、characters 或 `package.json`，也未抢占浏览器焦点。独立模块 ESLint 与全量 TypeScript 检查已通过。需父任务集成后检查实际手持接触、ADS 对齐、枪口与抛壳位置、换弹与检视全过程，以及与当前环境光的材质一致性。
