# Director 与可完成的动态事件

> 本文保留模块设计、接入约定与交接时的验证边界；整体已完成接入，当前真实浏览器与最终验证结果见 [第二阶段验收](ACCEPTANCE.md)。

本次范围：`src/simulation/population.ts`、`src/simulation/world-events.ts`、`src/data/loot.ts`、两个 `phase2-director*.test.ts`；`core/types.ts` 仅增加 DirectorState/WorldEvent 的可选扩展。没有修改 AI、Simulation、Game、UI 或渲染模块。

## 父任务接入 API

原 `population.director(ctx)` 调用保留。它负责采样节奏与触发后续事件。父任务在 `Simulation.update()` 中逐帧维护 `updateWorldEvents(ctx)`，使护送在停下或遇敌时立即停住；该方法以持久的 `lastUpdate` 计算增量，同一时间戳重复调用不重复计时。Director 中的调用保留给独立使用与测试。

```ts
import {
  worldEventScenes,
  worldEventInteractions,
  interactWorldEvent,
} from "../simulation/world-events";

const sceneDescriptions = worldEventScenes(sim);
const interactions = worldEventInteractions(sim);
// 优先按 event: 前缀分流，避免把 NPC/story 转给旧剧情处理器。
const ok = interactWorldEvent(sim, target.id);
```

互动 ID 为 `event:<event-id>:<action>`。返回标准 `Interaction`，其中包含可直接展示的 name/detail。接入现有 `Actions.begin()` 时可按操作使用约 0.8–2.2 秒的动作；在完成回调中调用 `interactWorldEvent`，它会再次检查阶段、当前楼层/距离、LOS、威胁、工具与材料。

`worldEventScenes(ctx)` 是拉取式的期望场景状态。重复调用或重载不会生成参与者、车辆或奖励。每个 scene 返回：

- `id / kind / title / description / stage / outcome`。
- `sourceAnchor: { poiId, offset:{x,y,z} }`，基于当前生成器的真实 POI，不假设固定 seed。
- `entities`：稳定实体 ID、模型类型、世界位置、旋转、期望状态、可选 dimensions 和 vehicleId。
- `colliders`：无人机残骸与车队货舱的金属碰撞体。父任务按稳定 ID 注册/替换，不能每次查询追加一个副本；事件已不再展示时移除对应实体/碰撞。货舱互动点位于舱门前方，避免自身碰撞体挡住交付。

实体模型映射：

| model          | 需要执行的场景表现                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| survivor       | 受伤季砚使用现有人形模型；wounded=跪坐/扶伤，walking=按返回的实际世界位置行走，waiting=安全点待交谈，dead=倒地。头顶或面板可显示事件剩余目标与伤势。 |
| vehicle        | 两辆车已实际加入 `state.vehicles`，已有车辆渲染器会创建；`vehicleId` 是对现有车辆的引用，不能再创建视觉克隆。                                        |
| cargo          | 车队实体货舱，locked/open 控制盖子状态。它不是提前装满奖励的通用容器，只有事件事务能发奖。                                                           |
| drone-wreck    | 约 5.5×1.4×3.5 m 的坠毁军用无人机、断裂机翼与受损机身，不能用一只普通木箱代替。                                                                      |
| warning-beacon | 求救标灯或车队警报灯；active/inactive 与事件阶段同步。                                                                                               |
| smoke / sparks | 故障电池的烟与电弧；电池隔离后停用，危险范围与可见反馈需对齐。                                                                                       |

事件各实体位置会沿地形求高。营救路线在创建前逐段检查通行，车队位置会检查两辆车的占地，不在墙、树或其它车辆中生成。可缓存静态模型，仅对 walking 的幸存者更新位置。

## 真实节奏输入与持久状态

`updateDirectorPacing(ctx)` 返回可供调试/UI 检查的 pacing。它读取实际世界数据：

- shot/damage EventBus 事件即时记录 lastCombat；短至 0.25 秒的噪声不会因每秒采样而漏记。
- 45 m 内正在 chase/attack/windup/recover 的敌人数量、近期枪声/爆炸、玩家掉血与击杀增量。
- 健康、食物/饮水储备、能量/水分状态，以及当前枪械弹匣和备用弹药。
- 最近 POI 的 danger、夜晚、雾/暴风雨、附近其它强噪声。
- 最近五次事件类型，重复类型降权；当前未结束事件数量、上次事件时间和冷却。

阶段为 `calm → rising → peak → recovery`：高压达到阈值后 peak 最长 26 秒，然后进入至少 85 秒恢复；危急身体/资源压力会提前转入恢复。恢复并不会删除已经在场的敌人，但会暂停新增居民敌对人口，不追加新的狼/野猪压力；恢复事件主要转向补给。普通定居点与动态敌对遭遇共享玩家附近 22 名敌人的生成预算。最多同时存在 3 个尚未结束的世界事件。

`DirectorState.pacing?` 保存：

```text
phase, phaseSince, peakUntil, lastSample, lastHealth, lastKills,
resourcePressure, locationDanger, eventCooldownUntil,
highestIntensity, recentKinds
```

existing `tension / lastCombat / recoveryUntil / lastEvent / encounters` 现在都有实际更新和使用。最高经历强度、峰值截止、恢复截止和事件冷却全部跨存档，重载不能刷掉恢复/高压限制。旧 v2 存档没有 pacing 时初始化，不更改世界版本。

## 生成约束

- NPC、车队与残骸源自 420 m 内符合种类的 POI 外围；来源区域与事件相符。
- 事件距离玩家至少 85 m，离玩家出生/安全位置至少 65 m，离床/篝火至少 40 m。
- FOV 与 LOS 会检查多个覆盖场景范围和顶部的点；正面无遮挡时不生成。原敌人生成也移除了 190 m 以外不再查可见性的旧例外。
- 无合格地点时延后尝试，不在玩家面前降级生成。
- 地下、引擎过场期间不新增地表随机遭遇；已有事件仍按保存的世界时间推进。
- 每个 POI 每种事件只使用一次。残骸全世界只出现一次，需已生存至少 900 秒且发现至少 10 个真实 POI；默认权重约为普通事件的几十分之一，恢复/高压阶段不出残骸。

## 三类完整事件

### 营救 · 还有一个人

初始现场有受伤季砚、求救标灯及实际隐藏生成的感染者。靠近后仍不援救，伤势会在附近威胁压力下加重，可能死亡；离得远时伤势缓慢恶化，事件 720 秒后失效。

1. `stabilize`：18 m 内威胁已驱离/消灭；消耗绷带 ×1、饮用水 ×1。
2. 季砚沿已检查的约 13 m 路线走向背风处，实际随行约 8 秒。玩家离他超过 22 m 或威胁重新靠近时等待。位置和阶段时间可跨存档恢复。
3. `rescue-reward`：在安全点交谈，取得急救包 ×1、抗生素 ×1、电子元件 ×2，结果为 success 并进入短暂恢复。

如果伤者死亡，outcome=failed、模型倒地，没有成功奖励；超时 outcome=expired，也不能补领奖。不是“救援名义的医疗箱”。

### 停摆车队 · 响个不停的警报

现场加入两辆真实 VehicleData：前方皮卡可在完成事件后修复，后方越野车保持损坏；均保留普通驾驶、储物和碰撞语义。警报每 6 秒发声并吸引附近感染者。

1. `disable-alarm`：持有扳手，消耗电子元件 ×1，静默断电。也可 `force-cargo`：持有撬棍、不扣元件，但发出 220 m 级噪声、提高紧张度，并使附近威胁调查现场。
2. `unlock-cargo`：驱离/清除 22 m 内威胁，解开机械锁。
3. `convoy-reward`：原子领取机械零件 ×3、燃料 ×2、9mm 弹药 ×24；前车恢复到可行驶的轮胎、电池、引擎、燃油和车况。

奖励事务成功之前不修车，不提前填充车辆库存；背包满时不出现“车辆已经修好但补给丢了一半”。

### 罕见信号 · 军用无人机残骸

受损机体、断翼、金属碰撞、烟和电弧；未隔离时靠近电池危险区会受到实际电弧伤害。

1. `ground-battery`：持有扳手，消耗废金属 ×2，隔离故障电池，烟/电弧停止。
2. `decode-box`：周围无威胁，消耗电子元件 ×2，恢复黑匣子校验。
3. `wreck-reward`：领取四倍瞄准镜 ×1、巡逻防弹背心 ×1、5.56 弹药 ×30；保存 `route:military-airway`，把第七研究站标记为航线终点。

这份航线是新的探索成果，不会伪造已完成的主线调查或直接解锁结局。

其它现有事件保留各自有效内容：迁徙群实际沿路线调查、侦察队使用真实 raider、林火仍有火焰/灼伤、泄漏仍有毒性、雷暴改变天气。基础补给取空、侦察队被击退或迁徙结束时会置 resolved；过期事件也会退出未完成列表。

## 原子事务与幂等

每次交付先在完整背包副本上校验材料和全部奖励容量，再同时提交库存、阶段与结果。`WorldEvent.encounter?` 保存：

```text
version:1, stage, stageAt, outcome, hostileIds, survivorHealth,
lastUpdate, rewardClaimed, poiId, approach
```

成功奖励同时保存 `event-reward:<eventId>` ledger；现场创建保存 `event-site:<kind>:<poiId>`。模型查询和重载都是只读恢复；删除过期场景记录不删除已用地点/已领奖记账。

旧事件没有 encounter 时保持旧语义，不凭空补发三类新任务奖励。父任务应在 `save/storage.ts` 对可选 pacing/encounter 字段增加完整校验：字段缺失允许；存在时检查有限数值、合法 phase/outcome、真实数组、stage 范围与 approach 枚举。无需 v3 迁移。

## 区域物资与关键资源保底

`lootTier(danger)`：低危险 `<2.5` 主要基础物资和民用装备，不随机给重甲、高阶步枪/消声器；中危险 `2.5–<4` 扩充装备与弹药；高危险 `≥4` 提供来源相关的标志性收获，例如军械步枪、实验室急救包、动力设备电池，以及更高弹药量。物品类型仍按实际 medical/military/industrial/store 等来源划分；容器名称也对应其内容。

`GUARANTEED_POI_SUPPLIES` 先占位，再加入随机物品，不会被随机大武器挤掉。保底不随 lootAmount 降低而减少：

| POI 容器      | 关键用途                                |
| ------------- | --------------------------------------- |
| pine-0:0 / :1 | 原有开局食物、医疗、工具、手枪与材料    |
| pine-1:0      | 医生任务绷带与消毒/感染治疗             |
| pine-3:0      | 家属与分水任务所需罐头和水              |
| fort-0:0      | 访问卡与军用弹药                        |
| industry-0:0  | 收发器、电子元件 ×4、蓄电池、扳手、燃料 |
| industry-7:0  | 电子元件 ×3、蓄电池、撬棍               |
| lake-1:0      | 净水片 ×4、电子元件 ×2                  |
| mine-0:0      | 燃料、零件与过滤面罩                    |
| lab-0:0       | 最终选择所需燃料，以及维护元件          |

移除了“离开 360 m 超过一小时后自动重刷搜空容器”的旧路径。访问卡、保底任务物资、完成事件不会借此无限补领。已有存档中的库存不被覆盖；仍可通过其它未探索地点、制作和有限事件取得资源。

## 验证与边界

执行 `npx vitest run tests/phase2-director.test.ts tests/phase2-director-events.test.ts`：21 项通过，覆盖真实短促战斗事件、四阶段/峰值恢复、资源与区域影响、冷却跨存档、隐藏地点、稀有权重、关键资源保底、禁重复刷新、三类完整事件、护送等待、伤者死亡、车队驾驶、两种处置代价、电弧风险、满背包回滚和事件重载。

`tests/core.test.ts` 的 26 项通过。一次全局相关回归中，旧 AI 可见生成测试的固定九个采样点均被当前环境遮挡，失败发生在调用 canSpawnAt 前；已通知父任务更新测试视线样本，不能通过放松生成保护解决。

子任务未启动或操作浏览器。NPC/货舱/残骸实体视觉、现场碰撞注册、交互入口与完整正常模式游玩由父任务统一接入并验收；不能仅凭上述模块测试宣称实机效果已通过。
