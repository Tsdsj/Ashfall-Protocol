# 开发说明

## 架构

- `src/core`：应用生命周期、输入、事件总线、配置与共享类型。
- `src/data`：物品、武器、敌人、配方和搜刮表。
- `src/simulation`：独立于渲染的背包事务、角色状态、伤害、弹道、AI、碰撞、建造、车辆和世界调度。
- `src/world`：种子、区域、POI、连续地形采样、植被散布与地形 Worker。
- `src/rendering`：引擎选择、材质、程序化模型、分块视图、角色 rig、第一人称物品、环境、粒子和必要的 Babylon 注册模块。
- `src/ui`：DOM 界面、物品图标、地图绘制及各个操作面板。
- `src/audio`：Web Audio 合成、空间声源、环境音、分类增益与水下低通。
- `src/save`：版本化 JSON、校验、兼容旧字段和 IndexedDB 事务。

模拟内核持有 `WorldState`。渲染器只观察世界状态，输入与界面通过模拟系统改变世界。UI 不维护第二份背包、血量或容器状态。

Babylon 的 `Vector3` 通过 getter 暴露坐标。将渲染坐标交给持久状态时，必须显式复制 `{ x: v.x, y: v.y, z: v.z }`，不能使用对象展开。该问题有真实弹丸命中回归测试。

## 背包与制作

物品定义在 `src/data/items.ts`。增加物品时，为其指定类别、重量、尺寸、堆叠上限和相关行为字段，再在图标、掉落或配方中引用它。

背包使用明确的行列坐标。添加、跨容器转移和制作会先在副本上验证完整事务，失败时不消耗输入。移动和旋转均执行边界、占位与碰撞检查。装备与快捷栏使用物品 UID，消耗和转移后需调用 `Actions.cleanup()` 清理失效引用。

制作配方在 `src/data/recipes.ts`。设施条件包括徒手、火源、工作台和通电工作台。完成时再次检查材料和设施，失败则保留材料。

## 世界与碰撞

`WorldGenerator.height(x,z)` 是角色、地形网格、建筑基座和交互物的共同高度来源。相邻分块使用同一世界坐标采样，避免边界裂缝。

树木的渲染与碰撞都由 `scatterTrees()` 生成，禁止独立抽样两套树位置。渲染仅保留玩家周围九个分块；卸载时移除阴影引用并释放 Mesh / Geometry，材质和纹理由当前世界统一缓存。

角色和车辆使用确定性的分步运动与几何碰撞；高速移动分步处理以避免穿墙。枪弹使用逐帧运动和线段相交，门、玻璃、车体、建筑结构和树干参与遮挡。没有依赖完整刚体物理世界。

## 渲染维护

`registrations.ts` 显式启用动态纹理、MRT、阴影、PrePass、粒子和 Thin Instances。`shader-registry.ts` 预先注册使用到的 GLSL / WGSL 渲染路径，避免后处理初始化时异步 shader import 的竞态。

当前锁定 Babylon 8.56.2。该版本的 WebGPU CSM 最低过滤档有无效 WGSL 分支，因此采用两级联和中等 PCF 过滤；不要直接改回最低档。升级依赖后需要重新做 WebGPU 和 WebGL2 的完整浏览器检查。

独立的薄实例分块必须 `makeGeometryUnique()` 后再设置 matrix buffer，否则共享 Geometry 可能导致 WebGPU 实例数量与 buffer 大小不一致。

材质优先复用。程序化材质生成 Albedo / Normal / ORM；本地摄影纹理加载后替换对应通道。松针材质使用本地透明贴图及风吹顶点位移。第一人称模型独立渲染组避免贴墙时被裁切。

## 浏览器输入与音频

Firefox 的 AudioListener 可能只提供 setPosition / setOrientation，setListenerPose() 对现代 AudioParam 与旧版方法分别处理。

Scene.preventDefaultOnPointerDown 显式设为 false，避免 Firefox 在 pointerdown 被取消后不再发送兼容 mouse 事件。短按攻击用 attackPressed 保留到下一帧，避免低帧率下丢失快速点击。

渲染失败会进入独立错误状态，后续暂停或继续动作不会覆盖错误。初次准备场景时预先创建角色和手持物材质。

## 存档

`SaveSystem` 的写入异步且事务化。App 层串行处理保存请求，退出等待保存成功。版本 1 兼容初期缺少世界规则、氧气、导航标记和武器保养字段的记录。

导入前验证数字、位置、物品 ID、背包尺寸、堆叠、引用、武器状态、装备类别和世界结构。修改 schema 时必须保持旧存档兼容或明确增加版本迁移，并补充测试。

## 调试

开发模式下按反引号打开控制台：

```text
god
give wood 10
give pistol
give ammo9 24
spawn walker
spawn deer
weather rain
time 22
teleport pine-0
teleport 100 200
killall
heal
fps
```

`window.__game.inspect()` 提供只读快照；`command()` 执行同一套开发命令。生产构建不暴露这个调试接口，也不响应作弊控制台热键。

## 验证

- 单元测试：背包守恒、制作原子性、物品引用、种子与内容、伤害、气候、生存、真实坐标弹丸、存档事务和关键退化案例。
- 浏览器链路：`scripts/qa/survival-flow.txt` 是可交给 `playwright-cli run-code` 的实际界面操作流程。移动与瞄准的快速定位使用开发接口，物品、战斗、制作、建造、睡眠与保存使用鼠标或键盘。
- 本地 QA 可用 `ASHFALL_QA=1 npm run dev` 禁用 HMR，避免长时间验收被源码更新重置。普通 `npm run dev` 仍保留 HMR。
- 产物缓存由 `scripts/create-precache.mjs` 根据构建目录内容生成，生产 Service Worker 缓存该版本全部资源。

验收截图与机器可读记录放在 `output/playwright/`。这些临时证据不属于运行依赖；正式交付截图可保存到 `docs/screenshots/`。

## 资源再获取

项目已包含游戏所需纹理，无需执行下载脚本。需要重取 CC0 纹理时可运行 `npm run assets`；脚本验证上游 MD5，并更新文件来源清单。图像生成记录见 `docs/GENERATED_ASSETS.md`。
