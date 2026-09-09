# 灰谷叙事模块 · Phase 2

> 本文保留模块设计、接入约定与交接时的验证边界；整体已完成接入，当前真实浏览器与最终验证结果见 [第二阶段验收](ACCEPTANCE.md)。

本模块实现原创中文四幕主线、Finale、Truth / Ash / Survivor 三结局及七条小支线。它负责条件、事务、日志和数据驱动序列；实际镜头、角色外观、门、光照、粒子、音频输出与玩家输入由游戏集成层执行。本文件是模块接口与验收说明，不代表整个 goal2 的完成证明。

## 文件与接入

- `src/narrative/index.ts`：公开导出。
- `content.ts`：45 条完整原创中文广播、NPC 对话与日志。`NARRATIVE_AUDIO[id] = { speaker, title, text, delivery }`，ID 也是 VO 资源键。
- `quests.ts`：42 个 POI 互动锚点、七条支线、三张解锁配方和四条路线。
- `sequences.ts`：十个序列，包含开场、三次关键揭示/进入、Finale、三结局和两次现场事件。
- `sequence-controller.ts`：时间轴、Skip、存档恢复和场景 cue 确认。
- `narrative-system.ts`：真实条件、主线推进、原子任务交付和结局选择。

```ts
import { NarrativeSystem } from "../narrative";

const narrative = new NarrativeSystem(sim); // state/gen/notify 必需，doors/noise 可选
narrative.update(dt);
const targets = narrative.interactions();
narrative.interact(target.id); // 稳定 id 为 narrative:xxx

const frame = narrative.frame();
// frame.blocking 控制输入/生存模拟保护；非抢控制事件为 false。
// frame.camera = { position, lookAt, fov } | null；fov 为角度。
// frame.subtitle = { speaker, text, remaining, audioId } | null。

for (const event of narrative.drainCues()) {
  applyCueIdempotently(event);
  if (event.requiresAck) narrative.ackCue(event.key);
}
narrative.skipSequence();
```

其余 UI 接口：

- `.actTitle`、`.objectives`：当前主线标题与可直接展示的目标文本。
- `.sideQuests`：名称、简介、阶段、当前目标、已完成状态和奖励定义。
- `.audioLogs`、`.replayLog(id)`：已经获得的完整记录与回放。未获得的录音不能通过回放接口解锁。
- `.choices()`：三个选择的 `id / interactionId / title / consequence / ending / available / missing`。
- `.choose('publish' | 'destroy' | 'shutdown')`：与实体控制台共用距离及剧情条件检查；日志按钮不能从世界另一端提交结局。
- `.continueSurvival()`：在结局完成后写入持久 `story-continued` 标记，关闭结局页并允许继续游玩；重载不会重复弹出结局。
- `.unlockedRecipes`、`.isRecipeUnlocked(id)`：制作菜单和 `startCraft` 都必须调用解锁条件，不能只隐藏按钮。
- `.unlockedRoutes`：已解锁路线及实际 POI 路点；可显示地图路线、路牌与目标点。
- `.resolveAnchor(anchor)`、`.ownsInteraction(id)`：锚点解析与交互分发。

## 四幕、高潮与结局

| 阶段               | 实际行动与条件                                                                 | 发展                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Act 1 · 未撤离的人 | 寻找食物；林务站无附近威胁时建立安全点；随后接通站内接收机                     | 十月十四日的“全部撤离”通告仍在循环，十月十七日的孩子和幸存者证明它是谎言。安全点实际更新复活位置并关闭站门。                                       |
| Act 2 · 名字与编号 | 分别核验松谷诊所米拉、要塞作战指挥所、黑岭动力车间与市立医院四份材料           | 医疗批次、军方撤防、提前两年的采购与失踪居民转运形成可交叉核验的证据。军方终端实际提供访问卡。                                                     |
| Act 3 · 归零       | 带着四份证据在要塞雷达控制室解码                                               | ASHFALL 不是救援，是把封锁区居民归零的清理协议。红色控制灯、广播和引擎镜头共同揭示命令。                                                           |
| Act 4 · 地下八米   | 携访问卡进入地下；分别读取军方、研究机构、地方政府、承包商四终端；复制完整档案 | 实验最初针对矿工污染适应，研究者以短暂稳定为由继续试验。军方要污染区士兵与外界安全，政府要医院与供暖，承包商以合同分割责任。各方选择共同造成灾难。 |
| Finale             | 已复制档案并完成揭示；核验承包商回路后切断地表燃料管线；操作最终控制台         | 焚毁范围被限制在地下，玩家仍可离开完成支线，再回来选择能承担的后果。                                                                               |

三种选择都有共同条件：Finale 控制台核验完成、地下四终端全部核验、完整档案已复制且携带在身、谷地清理回路已隔离、尚未作出选择。

| 选择                      | 额外条件                                                                                  | 确定的结果                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 公开档案 · Truth          | 广播中继已修复；取得旧办公楼的市政原始录音；完成沈维军官证词；实际发现至少 8 个生成器 POI | 档案和可核验的证词发往封锁区外，保留原始档案，接应开始按姓名登记。                         |
| 隔离并销毁 · Ash          | 携带燃料 ×1                                                                               | 原子消耗档案 ×1、燃料 ×1；焚毁地下样本和原始资料，地表幸存者不会被清理。失去部分追责证据。 |
| 关闭系统并留下 · Survivor | 完成猎人家属任务，取得退路；完成避难所供水任务                                            | 关闭远程清理并保留本地低温隔离；幸存者有水和退路，玩家留下值守。                           |

选择一旦成功即保存 `choice / ending`，必要终局 cue 在播放完成或 Skip 时写入 `ending-complete:*` 并结束故事。再次操作不能切换结局或重复消耗。继续生存保留原结局和世界后果。

## 七条完整支线

每条都包含委托、另一处 POI 的实际行动和返回交付。任务状态是 `narrative.quests[id] = { stage: 0..3, completed }`。奖励使用现有稳定物品，不引入需要额外注册才能载入的物品 ID。

| ID / 故事                   | 路径与交付                                                                      | 奖励及世界变化                                                                        |
| --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| doctor / 没有回来的医生     | 松谷诊所米拉 → 矿场诊所韩医生，交绷带 ×2 → 返回米拉交底单                       | 抗生素 ×2、急救包 ×1；解锁韩医生急救包配方。                                          |
| hunter / 湖边的家人         | 钓鱼小屋罗岚 → 林边住宅许禾母子，交炖肉罐头 ×1、水 ×1 → 返回罗岚                | 钓竿 ×1、烤鱼 ×2；解锁三道斜杠巡林路；Survivor 条件之一。                             |
| checkpoint / 没有发出的口粮 | 围墙哨所阿衡 → 后勤仓库核验封条 → 返回阿衡                                      | 防刺背心 ×1、白豆罐头 ×2；实际打开检查站侧门。                                        |
| raider / 一锅人的份量       | 车站旅馆陈娅 → 工业区值班宿舍唐砾，交白豆罐头 ×2 → 返回陈娅                     | 消声器 ×1、净水片 ×3；地铁门打开，输出拦路队撤离 cue，开放旅馆至地铁通道。            |
| radio / 有人在另一端吗      | 北岭广播站乔榆 → 黑岭变电站，交收发器 ×1、电子元件 ×3、蓄电池 ×1 → 返回确认频率 | 蓄电池 ×1；解锁低耗收发器配方；持久 `radio-repaired`；Truth 条件之一。                |
| shelter / 地下还有灯        | 地铁入口许弥 → 水库值班站，交净水片 ×2、电子元件 ×1 → 回许弥交燃料 ×1           | 饮用水 ×4、净水片 ×2；循环净水配方、避难所供水路线、灯光与门状态；Survivor 条件之一。 |
| officer / 不删掉我的名字    | 哨兵宿舍沈维 → 医疗营房核验叩击录音 → 返回取得签名证词                          | 5.56 弹药 ×30、绷带 ×3；Truth 条件之一。                                              |

事务在背包副本上同时验证所有消耗与奖励容量，全部成功才提交库存、阶段和解锁。满包时任务停在可交付阶段，既不扣物资，也不领取部分奖励。重复对话可以再次听内容，但不会再发奖。

配方由 `NARRATIVE_RECIPES` 导出，均沿用现有制作 station：急救包为 hand；低耗收发器为 workbench；循环净水为 fire。集成层必须保留原有制作时间、工作站和原子消耗检查。

## 引擎序列与可靠交付

Opening 约 42 秒，可跳过。对白时长读取声音模块生成的 `DIALOGUE_DURATIONS`：按整段录音扩展原时间轴，后续对白、字幕、camera cut、必要提交点和总时长一起后移；不会通过单独拉长结尾来掩盖中间对白重叠。

十种 typed cue：

| type      | 数据与引擎执行含义                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| camera    | 真实世界 `position / lookAt / fov`；可选 `moveFrom`；在 frame 中按时间插值。只供 blocking 序列使用。                         |
| audio     | 稳定音频 `audioId / gain / loop / anchor`。此 cue 负责发声。                                                                 |
| dialogue  | `audioId / speaker / text / duration`，供字幕与阅读，不应再播放一次同名声音。                                                |
| animation | 玩家起身、指向、倒架、升降台上下、操作控制台；指定 target 和必要 anchor。                                                    |
| lighting  | 指定目标、色值、强度、过渡时间；可按最终状态幂等设置。                                                                       |
| ai        | hold / release / investigate / withdraw，以及作用锚点、半径与时长。withdraw 指支线停战的掠夺者；不要让无关感染者也永久消失。 |
| door      | 指定 doorId 的 open / closed / unlocked，按目标状态设置，不能实现成 toggle。                                                 |
| explosion | 指定位置、半径、强度、伤害；Ash 的受控地下点火 damage=0，不是误杀地表玩家的战斗爆炸。                                        |
| particle  | dust / sparks / smoke / embers，位置、数量、持续时间。                                                                       |
| objective | 可显示文本、必要 flag、必须保留的 audioLogs。任务推进由叙事模块保存，展示层不要再次发奖。                                    |

`SequenceCueEvent.key` 稳定，包含 `sequenceId / cueId / at / payload / replay / skipped / requiresAck`。协议：

1. 必要状态由 `activeSequence.applied` 和完成后的 `seenSequences` 记账。Skip 补齐 persistent cue，保留主线旗标与日志。
2. `drainCues()` 对 persistent cue 持续返回，直到消费者成功执行后调用 `ackCue(key)`。不能取出队列就视作已经执行。
3. 重载从 persisted applied/seen 重建最终场景 setter；`replay=true` 表示幂等恢复，不能重复奖励、弹出旧任务提示或重播已经结束的爆炸/VO。
4. 瞬时音频、粒子和爆炸不是 persistent；Skip 删除尚未展示的瞬时 cue。镜头直接退出，必要门/光/物体最终姿态仍会送达。
5. 倒架 `animation` 若 `replay` 或 `skipped`，应立即落到倒下后的最终姿态并同步碰撞；不能每次重载都重新摔一次。
6. 跨设备持久化保存整个现有 `narrative` 字段即可，无须新增 core schema。

两次现场事件均 `blocking=false`，不会抢控制：

- 乡村超市 `pine-3`：玩家接近时货架倒下、扬尘并输出附近 AI 调查噪声，露出撤离后孩子仍在此生活的生日刻痕。
- 围墙哨所 `fort-6`：警报、红灯与周界广播把附近感染者引向检查站，证实救援车不会入区。

## 地下入口与锚点

所有锚点以 `gen.pois` 的实际坐标和 `gen.poiHeight(p)` 解析，不硬编码 seed 坐标。

地下与地面均依附 `lab-0`：

| Interaction ID（加 narrative: 前缀） | offset (x,y,z)      |
| ------------------------------------ | ------------------- |
| facility-enter                       | (0, 0, -7)          |
| facility-exit                        | (0, -8, -3)         |
| facility-military                    | (-3, -8, -2)        |
| facility-research                    | (3, -8, -2)         |
| facility-government                  | (-3, -8, 2)         |
| facility-contractor                  | (3, -8, 2)          |
| facility-archive                     | (0, -8, 2)          |
| facility-isolate                     | (3, -8, 0)          |
| facility-control                     | (0, -8, 3)          |
| choice-publish / destroy / shutdown  | (-1 / 0 / 1, -8, 3) |

地下入口授权成功后，模块先将玩家权威位置设为 `(0,-8,-3)` 再发升降表现 cue，Skip 或立即保存不能丢失到达楼层。出口将位置设为 `(0,0,-8)`。集成层应同步摄像机、碰撞楼层和垂直速度，不能再把当前位置额外减 8。真实地下 floor、入口与出口可达性须由父任务的 Babylon 场景与碰撞实现并实测。

米拉的主线和支线共享 `pine-1 + (-2,0,-2)`。应按 NPC 名称和锚点生成一个模型，由话题面板列出当前可用任务、主线和交易，不为每条 dialogue 创建一个同名人物。

## 旧存档兼容

首次接入写入 `narrative-v2-adapted`。已有 ranger/clinic/fort/industry 等旧记录保留其能证明的生存与调查进度，跳过重复开场；旧实验室记录不凭空补齐新增四方调查。已有 protocol 不重复发放。旧 `radio-repaired / broadcast` 映射为已修复中继，不再收一次材料或发一次支线奖励。已经 extracted 且 ended 的存档保留完成状态并标记 Truth。尚未撤离的旧存档可以继续补齐新增主线与其他结局条件。

## 已执行验证与集成边界

命令：`npx vitest run tests/phase2-narrative.test.ts tests/phase2-narrative-sequence.test.ts`，27 项通过。另已通过叙事目录 ESLint。覆盖主线缺条件拒绝、三结局、所有七支线、POI seed 解析、库存回滚、重复奖励防护、地下返回与重载、旧存档、继续生存、Skip 必需提交、ack 重发、对白实际时长与不重叠。

本子任务未操作浏览器。真实 NPC 模型、对白播放、楼层碰撞、镜头恢复、侧门与停战 AI、配方门禁和世界地图路线的实际效果由父任务统一集成及浏览器验收，不能仅据模块测试视为已完成这些实机场景验证。
