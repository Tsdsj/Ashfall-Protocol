# 开发说明

## 架构

- `src/core`：应用生命周期、输入、事件总线、配置与共享类型。
- `src/data`：物品、武器、敌人、配方和搜刮表。
- `src/simulation`：独立于渲染的背包事务、角色状态、伤害、弹道、AI、碰撞、建造、车辆和世界调度。
- `src/world`：种子、区域、POI、连续地形采样、植被散布与地形 Worker。
- `src/rendering`：引擎选择、材质、外部资产与程序化补件、分块视图、骨骼与第一人称动作、环境、粒子和必要的 Babylon 注册模块。
- `src/ui`：DOM 界面、物品图标、地图绘制及各个操作面板。
- `src/audio`：本地声音资源、分层枪声、空间声源、状态化 Foley、混响、对白与分类增益。
- `src/narrative`：四幕任务、支线/结局条件、录音内容与可恢复的序列控制器。
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

`SaveSystem` 的写入异步且事务化。App 层串行处理保存请求，退出等待保存成功。当前世界版本为 2；版本 1 迁移保留玩家、物资、已搜容器、旧门状态和世界进度，并补齐角色、门、叙事与 Director 数据。旧 v2 的新增可选字段也会归一化；迁移不能重新填满已经搜空的箱子。

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

## 第二阶段运动与动画

`LocomotionController` 负责实际速度、分步碰撞、体力和接地步相；`FirstPersonMotionController` 只把模拟状态映射为镜头/武器权重。鼠标 yaw/pitch 保持直接响应，不把武器惯性写回输入。`Game.prepareView()` 在本帧输入/模拟后、弹道前更新相机，避免使用上一帧准心。

角色 mesh 与动画分包。`RigAnimator` 以实际状态/速度混合片段，采样后叠加脚部、手部、注视和方向受击。glTF 的导入根节点可能含负缩放；两骨求解必须通过父节点逆矩阵进入局部坐标，不能假定世界 Quaternion 能表达反射。每次重新采样前恢复上次程序修正，避免姿态漂移。近/中/远动画更新与模型 LOD 分别有预算，销毁 rig 时同步移除阴影和命中胶囊引用。

第一人称使用裁剪后的身体与双臂，武器 grip/support/muzzle 等节点来自实际模型。内置弹仓枪械逐发装填，不能套用可拆弹匣动作；瞄具完全举起时隐藏会遮挡视线的近景模型，使用透明镜内区域和实际 FOV。详见 [武器接入](docs/phase2/WEAPONS.md)、[动物](docs/phase2/ANIMALS.md)。

## 交互、AI 与几何约定

`Actions.begin/update/cancel` 是可取消双手动作，资源与奖励在完成回调中再次验证。搜索、食用、医疗、修理、充电和车辆操作不能在进度刚出现时就提交资源。制作仍使用原子库存事务，与双手动作互斥。背包/制作/日志中世界继续运行；Esc、失焦和真正暂停页冻结游戏，取消按钮不得只隐藏进度条。

门以 `DoorState.progress` 驱动门叶和旋转 OBB，布尔 `state.doors` 只保留为兼容目标。建筑、楼梯、地下设施、倒架和事件实体使用共享几何描述。弹丸、手雷、弹壳与角色都必须查当前楼层的 ground，不能拿地表高度替代地下地板。

AI 的 windup → hit frame → recovery 只允许一次伤害，并在命中时重新检查距离、朝向和 LOS。命中区域优先取当前动画骨骼胶囊，远处无 rig 才降级静态区域。普通人口与事件生成必须经过 FOV/LOS、实际空地、最小距离与人口预算；开发 `spawn` 不属于正常生成路径。低矮通行、局部 A*、邻居避让与近身停止共同避免墙角卡住或全部挤到相机。

Director 使用真实射击/受伤、资源/健康、地点危险和最近事件来推进 calm/rising/peak/recovery。`updateWorldEvents()` 每帧调用，以持久 `lastUpdate` 去重，保证护送随玩家停下/离开即时停止；不要退回只在每秒 Director 回调中更新实体位置。见 [Director 与事件](docs/phase2/DIRECTOR.md)。

## 叙事时序与音频

叙事条件、任务交付、结局消耗在 `NarrativeSystem` 中处理；UI 和实体控制台共用距离与资格检查。`SequenceController` 输出 typed cues，集成层将持久 cue 幂等应用到真实门、AI、灯、倒架等状态后确认。Skip 必须提交必要最终状态，暂停必须同时冻结叙事时钟与 presentationDt。新世界/换档先终止旧对白；异步音频恢复返回后才决定 fallback，防止同一句被重复启动。继续生存立即请求保存。见 [叙事接口](docs/phase2/NARRATIVE.md)。

现场 NPC 声音按说话人坐标定位；已获得录音的回放不按远处原 NPC 衰减。地下声学空间用玩家与地表的高度差辨认。音效按需解码且有声部/冷却预算，配音与字幕共用生成后的真实时长；暂停/重载应恢复同一 offset，Skip 不留旧语音。见 [声音模块](docs/phase2/AUDIO.md)。

## 渲染与离线回归注意事项

- Babylon `DynamicTexture.clone()` 不保证复制并上传原 canvas。需要独立湿润车漆时新建 PBR 材质、共享已就绪纹理，避免场景一直等待不就绪的克隆纹理。
- 新增 Babylon 功能时显式登记 side effect 和 shader，并同步 Vite `optimizeDeps`；开发 QA 禁用 HMR 时新增依赖需重新预构建，避免两套模块实例。
- 画质切换和恢复默认都重建相同世界的渲染资源，不能只改设置文本。材质/纹理共享缓存与每世界资源释放分开处理。
- draw calls 应在 `onAfterRenderObservable` 采样。现代 Chrome 的旧整帧 GPU timestamp 接口可能返回 0；本版注明 `gpuMeasurement: main-pass`，不将其称作完整 GPU 帧时间。JS heap 会有 GC 锯齿，需看预热后的同区域资源与回收低点，不能把一次高点直接判为泄漏。
- 环境 GLB 统一经过 `loadEnvironmentAsset()`。发电机玻璃使用透明度与 clear coat，禁用 glTF 的全场景 transmission helper；旧 helper 曾在跨区卸载后保留 13.6 万个已销毁网格，导致长时间 CPU/内存退化。新增带透射扩展的资产必须验证渲染目标列表不会增长，不能为一个小部件隐式增加全场景 pass。
- 生产缓存使用完整版本清单、有限并发与明确 installing/ready/failed 状态。失败保留已有可用缓存，重试不谎报就绪，激活仅清理本游戏拥有的旧缓存。运行资产按需加载与完整离线后台下载是两个不同阶段。

第二阶段正式证据位于 `docs/phase2/evidence/`，覆盖正常伤害生存链路、条件夹具、生产离线与持续运行；具体方法及边界见 [第二阶段验收](docs/phase2/ACCEPTANCE.md)。
