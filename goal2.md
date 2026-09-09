# ASHFALL PROTOCOL / 灰烬协议

# 第二阶段：深度品质优化、内容扩充与沉浸感重构任务

> 本阶段不是重新制作游戏，也不是单纯增加更多功能。
>
> 当前项目已经拥有完整基础版本。
>
> 你的任务是基于现有代码、现有玩法、现有世界和现有系统，进行一次系统性的：
>
> **Quality Pass + Gameplay Pass + Animation Pass + Art Pass + Narrative Pass + Immersion Pass**
>
> 目标是显著缩小当前版本与成熟商业第一人称生存游戏之间的体验差距。

---

# 1. 总体任务

首先完整检查当前项目。

不要立刻重构。

必须先：

```text
运行游戏
↓
实际体验现有版本
↓
检查主要系统
↓
识别当前最明显的廉价感来源
↓
检查视觉、动画、操作、AI、剧情、音效、交互
↓
制定内部优化顺序
↓
直接开始修改
↓
持续运行测试
↓
继续发现问题
↓
继续优化
```

不要把本任务理解成：

```text
增加几十个新 Feature
```

而应该理解成：

```text
让已有 Feature 真正达到游戏级品质
```

---

# 2. 本阶段最高优先级

按照以下优先级执行。

```text
P0 第一人称操作与镜头品质

P0 玩家 / 僵尸 / NPC / 物体动画品质

P0 战斗手感

P1 高质量外部美术资产替换

P1 世界环境品质与场景细节

P1 僵尸 AI 与行为表现

P1 游戏内容丰富度

P1 主线剧情完整性

P2 过场动画 / Scripted Sequence

P2 音频与环境反馈

P2 UI / UX 优化

P3 更多高级视觉细节
```

不要优先开发边缘系统。

例如：

如果：

```text
走路镜头像摄像机飘动
```

就不要先跑去开发十种新罐头。

---

# 3. 第一人称体验必须进行重点重构

当前第一人称体验需要持续优化。

这是本阶段最重要的任务之一。

必须主动研究成熟第一人称游戏普遍采用的设计方法，并将合理方案应用到当前游戏。

参考的不是复制某一款游戏的具体参数，而是研究成熟 FPS / 生存游戏普遍存在的：

```text
Camera Motion
Weapon Motion
Body Motion
Input Response
Acceleration
Deceleration
ADS Transition
Sprint Transition
Recoil
Breathing
Landing
Vaulting
Crouching
Leaning
Interaction Feedback
```

目标：

> 玩家移动时应该感觉自己正在控制一个拥有重量、惯性、身体和武器的人类，而不是一个挂着摄像头的 Capsule Collider。

---

# 4. 第一人称移动

重新检查：

```text
Walk
Jog
Sprint
Crouch
Prone
Jump
Fall
Landing
Lean
ADS Movement
Backward Movement
Strafe
Diagonal Movement
```

每种状态都必须具有不同：

```text
Speed
Acceleration
Deceleration
Camera Motion
Weapon Motion
Footstep Rhythm
Stamina Cost
```

禁止：

```text
按 W 后瞬间达到最大速度
松开 W 后瞬间静止
```

增加：

```text
Acceleration Curve
Deceleration Curve
```

但不能做成严重输入延迟。

目标是：

```text
有重量
但仍然灵敏
```

---

# 5. 第一人称镜头系统

重新设计：

```text
FirstPersonCameraController
```

不要仅使用简单：

```text
sin(time) * headBob
```

实现所有移动状态共享的：

```text
Camera Motion State System
```

至少包括：

```text
Idle
Walk
Run
Sprint
Crouch
Prone
Jump
Fall
Land
ADS
Lean
Injured
LowStamina
```

不同状态：

采用不同的：

```text
Amplitude
Frequency
Rotation
Translation
Interpolation
```

---

# 6. Head Bob

Head Bob 必须非常克制。

真实第一人称游戏通常不会让玩家镜头像头顶绑了弹簧。

Head Bob：

更多作用于：

```text
武器
身体
轻微相机
```

而不是大幅摆动整个屏幕。

应实现：

```text
Vertical Bob
Horizontal Bob
Subtle Rotation
Step Rhythm
```

并且：

移动速度越快：

频率变化。

但：

幅度不要简单线性暴涨。

---

# 7. Camera Inertia

增加轻微：

```text
Camera Inertia
```

例如：

玩家快速转向：

身体和武器可以稍微滞后。

但鼠标输入：

必须保持及时响应。

实现原则：

```text
Camera Input = Responsive
Weapon / Body = Slightly Delayed
```

不要：

```text
Camera Input = Delayed
```

否则操作会产生恶心的鼠标延迟感。

---

# 8. Weapon Sway

武器必须拥有独立运动系统。

包括：

```text
Idle Sway
Walk Sway
Sprint Sway
Breathing Sway
Turn Lag
Strafe Lag
Landing Motion
Crouch Motion
ADS Motion
Recoil Motion
```

武器不能：

死死焊在屏幕中央。

也不能：

像橡皮筋一样疯狂乱甩。

---

# 9. ADS

重新优化瞄准过程。

ADS 不允许：

```text
Instant Snap
```

需要：

```text
Position Interpolation
Rotation Interpolation
FOV Interpolation
Weapon Alignment
Camera Alignment
```

不同武器：

拥有不同：

```text
ADS Speed
```

例如：

手枪：

快。

步枪：

中等。

重型武器：

较慢。

---

# 10. Sprint

冲刺必须有完整视觉状态。

进入冲刺：

武器逐渐放低。

退出冲刺：

武器逐渐恢复。

禁止：

```text
按 Shift
↓
武器瞬移
```

需要：

```text
SprintEnter
SprintLoop
SprintExit
```

---

# 11. 跳跃

跳跃需要：

```text
Takeoff
Air
Landing
```

三个阶段。

起跳：

镜头轻微反应。

落地：

根据下降速度决定：

```text
Landing Strength
```

小高度：

轻微缓冲。

高处：

明显：

```text
Camera Compression
Weapon Drop
Sound
Stamina Impact
```

严重坠落：

造成：

```text
Leg Damage
Fracture
```

---

# 12. 玩家身体存在感

第一人称玩家不应该只有：

```text
Camera
+
Floating Weapon
```

增加玩家身体表现。

玩家低头：

至少能够看到：

```text
胸部
手臂
腿
脚
```

如果现有架构允许：

实现：

```text
Full Body First Person
```

否则至少实现：

```text
First Person Body Proxy
```

玩家：

```text
走路
奔跑
蹲下
跳跃
受伤
```

身体动作应该同步。

---

# 13. 第一人称交互动作

常见操作应具有动画过程。

包括：

```text
Open Door
Close Door
Pickup
Use Medical
Drink
Eat
Open Container
Turn On Generator
Light Campfire
Repair
Craft
Interact With Vehicle
```

不要所有操作都是：

```text
按 E
↓
瞬间改变状态
```

---

# 14. 动画系统全面升级

当前所有人物和物体动画都需要进行：

# Animation Quality Pass

检查：

```text
玩家
僵尸
人类 NPC
动物
武器
门
窗
容器
车辆
环境机关
```

任何：

```text
瞬间切换状态
```

都应该优先检查是否需要：

```text
Transition Animation
```

---

# 15. Animation State Machine

所有角色使用明确动画状态机。

例如：

```text
Idle
Walk
Run
Sprint
CrouchIdle
CrouchWalk
Attack
Hit
Stagger
Fall
Death
Climb
Vault
Interact
```

状态之间：

必须：

```text
Blend
```

禁止大量：

```text
Animation.stop()
Animation.play()
```

直接硬切。

---

# 16. Animation Blending

必须重点改善：

```text
Idle → Walk
Walk → Run
Run → Sprint
Sprint → Stop
Walk → Crouch
Aim → Fire
Attack → Hit Reaction
```

加入：

```text
Blend Time
```

以及合理：

```text
Transition Condition
```

---

# 17. 玩家动画

玩家需要拥有：

```text
Idle
Walk
Run
Sprint
Crouch
Prone
Jump
Fall
Landing
Lean
Vault
Climb
Pickup
OpenDoor
UseItem
Heal
Reload
WeaponInspect
Melee
```

能够共享的动画：

合理复用。

---

# 18. 手部动画

第一人称：

重点优化：

```text
Hands
Arms
Weapon
```

手不能：

穿过：

```text
武器
墙
身体
```

尽可能减少：

```text
Clipping
```

---

# 19. 门动画

所有门必须拥有：

```text
Closed
Opening
Open
Closing
Locked
Blocked
Broken
```

状态。

开门不能：

```text
0°
↓
90°
```

瞬间完成。

需要：

```text
0.4 - 1.2 秒
```

左右的动态过程。

根据门类型决定速度。

例如：

```text
轻木门
金属门
大型铁门
车辆门
```

动画速度不同。

---

# 20. 门物理反馈

门打开时：

加入：

```text
Handle Animation
Door Rotation
Sound
Collision Update
```

如果玩家快速推门：

动画更快。

如果门损坏：

可能：

```text
晃动
卡住
产生摩擦声音
```

---

# 21. 门 AI Interaction

僵尸不能永远被门彻底阻挡。

根据类型：

可以：

```text
撞门
攻击门
推门
突破损坏门
```

人类 AI：

可以：

```text
打开门
关门
穿过门
寻找其它路径
```

---

# 22. 僵尸整体品质升级

当前僵尸必须进行完整：

# Zombie Polish Pass

重新检查：

```text
Spawn
Idle
Wander
Detection
Investigation
Chase
Attack
Hit Reaction
Stagger
Fall
Death
Search
Navigation
Door Interaction
Obstacle Interaction
```

---

# 23. 僵尸生成规则

禁止明显：

```text
玩家转身
↓
空气中突然生成一个僵尸
```

生成必须遵循：

```text
距离规则
视线规则
区域规则
建筑规则
时间规则
噪音规则
世界状态
```

---

# 24. Spawn Visibility Check

生成前进行：

```text
Player FOV Check
Line Of Sight Check
Distance Check
```

除特殊事件外：

不得在：

```text
玩家直接视线内
```

凭空生成敌人。

---

# 25. Spawn Source

优先从合理位置生成。

例如：

```text
建筑内部
树林深处
街道拐角
废弃车辆后方
地下设施
尸堆
POI 区域
```

让玩家产生：

```text
它原本就在这里
```

而不是：

```text
导演刷怪了
```

---

# 26. Persistent Zombies

玩家附近的重要敌人：

尽可能保持世界状态。

例如：

玩家从建筑外看到：

```text
一个僵尸在二楼
```

进入建筑：

它仍然应该在合理位置。

不要由于 Chunk 或 AI 系统：

频繁重置。

---

# 27. 僵尸 Idle

Idle 动作增加：

```text
Standing
Looking Around
Twitch
Breathing
Bent Posture
Feeding
Sitting
Lying
Wall Leaning
```

不要所有僵尸：

直挺挺站在街上。

---

# 28. 僵尸场景状态

在生成时随机分配合理：

```text
Scene Behavior
```

例如：

```text
趴在尸体上进食
靠墙
坐在地上
躺在房间中
缓慢游荡
撞击门
低头站立
```

玩家靠近后：

进入正常 AI 状态。

---

# 29. 僵尸追击

追击过程：

根据：

```text
类型
距离
障碍
受伤状态
```

改变。

僵尸不能：

```text
永远保持完全相同速度
```

可以出现：

```text
短暂爆发
跌跌撞撞
冲刺
失衡
绕障碍
```

---

# 30. 僵尸攻击

攻击必须：

拥有明确：

```text
Windup
Attack
Hit Frame
Recovery
```

伤害：

仅在：

```text
Hit Frame
```

判定。

禁止：

动画刚开始：

玩家已经扣血。

---

# 31. 攻击可读性

玩家必须能够：

通过动作判断：

```text
僵尸即将攻击
```

但不要像 MMORPG：

蓄力三秒。

需要：

真实、快速、仍然可理解。

---

# 32. Hit Reaction

这是本阶段重点。

僵尸受到：

```text
近战
手枪
霰弹枪
步枪
爆炸
```

攻击时：

反应必须不同。

至少考虑：

```text
Hit Direction
Hit Body Part
Damage
Weapon Power
Current Animation
```

---

# 33. Directional Hit Reaction

如果击中：

```text
Left
Right
Front
Back
Head
Leg
Arm
```

使用不同：

```text
Hit Reaction
```

或：

```text
Procedural Reaction
```

---

# 34. Stagger

较强攻击：

可能：

```text
Stagger
```

例如：

```text
霰弹枪近距离
重型近战武器
爆炸冲击
```

---

# 35. Knockdown

高冲击力：

可能：

```text
Knockdown
```

倒地后：

僵尸可能：

```text
重新爬起来
```

增加：

```text
GetUp Animation
```

---

# 36. Limb Damage

如果现有架构允许：

加入：

```text
Limb Damage
```

例如：

腿部严重损伤：

```text
移动速度下降
拖腿
跌倒
```

手臂损伤：

攻击能力降低。

---

# 37. 僵尸死亡

避免：

所有敌人使用同一个死亡动画。

至少根据：

```text
Hit Direction
Damage Type
Body State
```

选择：

多个死亡变化。

可以结合：

```text
Animation
+
Limited Ragdoll
```

---

# 38. Ragdoll

如果技术实现稳定：

死亡后：

允许短时间：

```text
Ragdoll
```

然后：

冻结姿态。

不要永久模拟大量尸体。

---

# 39. AI Navigation

重点测试：

```text
门
楼梯
小房间
森林
车辆
障碍
狭窄走廊
```

修复：

```text
原地打转
卡墙
互相挤压
穿门
悬空
疯狂抖动
```

---

# 40. Crowd Avoidance

多个僵尸追逐玩家时：

不要全部：

完全重合。

增加：

```text
Local Avoidance
Separation
Steering
```

形成：

自然包围。

---

# 41. 攀爬 / 翻越

适当类型的敌人：

可以：

```text
翻越低矮围栏
爬过窗户
跨过障碍
```

不需要所有僵尸具备完整跑酷系统。

但：

明显可以通过的低矮障碍：

不应该成为绝对安全墙。

---

# 42. 高品质公共免费美术资产

当前项目不再坚持：

```text
所有素材必须自己程序生成
```

程序化资源仍然可以使用。

但新的优先级改为：

```text
高品质且授权明确的免费资产
+
自有程序化资产
+
必要时自制资产
```

---

# 43. 外部美术资源原则

如果存在明显比程序化生成效果更好的：

```text
免费
CC0
Public Domain
允许商业使用
授权清晰
```

资源：

优先使用高品质外部资源。

特别是：

```text
角色
动画
植被
石头
家具
垃圾
工具
车辆
建筑 Props
声音
环境材质
```

这些资源如果完全由程序员 Primitive 硬搓：

很容易产生廉价感。

没有必要为了“纯程序生成”给自己增加毫无意义的限制。

---

# 44. 资源获取原则

可以主动寻找：

```text
CC0
Public Domain
Royalty-Free with commercial use
明确允许项目使用的免费素材
```

优先选择：

```text
统一视觉风格
高品质
适合实时游戏
适合 Web
合理 Polygon Count
合理 Texture Size
```

---

# 45. 推荐资产类型

优先外部寻找：

```text
PBR Ground Materials
Concrete
Wood
Metal
Brick
Asphalt
Mud
Rock

Trees
Grass
Bushes

Furniture
Industrial Props
Household Props

Character Animations

Zombie Animations

Ambient Sounds
Footsteps
Doors
Weapons
Environment
```

---

# 46. License

所有外部资源：

必须确认：

```text
License
```

不得：

```text
看到免费下载按钮就直接塞进项目
```

互联网在人类手里已经够混乱了，不需要项目再多一份授权炸弹。

---

# 47. THIRD_PARTY_ASSETS.md

持续维护：

```text
THIRD_PARTY_ASSETS.md
```

记录：

```text
Asset Name
Asset Type
Author
Source
License
Modification
Usage
```

---

# 48. 资源优化

下载的资源：

不能直接无脑使用。

必须根据 Web 游戏需要：

进行：

```text
Mesh Simplification
Texture Resize
Texture Compression
LOD
Material Consolidation
Instance Optimization
```

例如：

```text
8K Texture
```

如果肉眼没有必要：

降到：

```text
2K
1K
```

---

# 49. Asset Style Consistency

不要最后变成：

```text
一棵写实树
+
一个 Low Poly 椅子
+
一个卡通僵尸
+
一个扫描级垃圾桶
```

所有资产：

必须经过：

```text
Material
Lighting
Color
Scale
Roughness
Texture
```

统一处理。

---

# 50. 场景重新美术化

对当前：

```text
森林
住宅
城市
工业区
军事基地
道路
室内
```

进行：

# Environment Art Pass

重点检查：

```text
资产重复
空旷
材质重复
比例错误
缺少生活痕迹
缺少破败痕迹
光照平淡
缺少垂直层次
```

---

# 51. Environment Composition

每个区域：

必须有：

```text
Primary Shape
Secondary Shape
Detail Layer
Story Layer
```

例如：

废弃卧室：

```text
床 + 衣柜
↓
桌椅 + 箱子
↓
书籍 + 衣服 + 瓶子
↓
血迹 + 打翻家具 + 照片 + 文件
```

---

# 52. Environmental Storytelling

继续强化：

```text
无需文字即可理解的故事
```

例如：

一个房子里：

```text
堵住的大门
桌上的食物
地上的血迹
二楼锁住的卧室
卧室里的尸体
旁边空药瓶
```

玩家：

自然产生：

```text
这里发生了什么？
```

---

# 53. 游戏玩法继续丰富

当前玩法已经存在的系统：

不要仅停留在：

```text
存在
```

而要继续提高：

```text
深度
关联
选择
风险
奖励
```

---

# 54. Gameplay Interaction

系统之间增加联系。

例如：

```text
雨
↓
衣服湿
↓
体温下降
↓
需要篝火
↓
篝火产生光
↓
光可能被敌人发现
↓
火产生烟
↓
远处可能看到
```

再例如：

```text
枪战
↓
巨大噪音
↓
附近感染者被吸引
↓
玩家弹药消耗
↓
不得不撤离
```

游戏深度来自：

```text
系统交互
```

而不是：

```text
菜单数量
```

---

# 55. 搜刮体验

Loot 不要：

```text
打开箱子
看到随机列表
关闭
```

增加搜刮过程中的：

```text
视觉反馈
声音反馈
搜索时间
危险感
物品布局
稀有物提示
```

---

# 56. 搜刮逻辑

不同区域：

Loot 差异必须明显。

玩家应该逐渐学习：

```text
想找药
→ 去诊所

想找工具
→ 去车库

想找武器
→ 去警察局 / 军事区域

想找食物
→ 超市 / 民宅
```

---

# 57. 探索奖励

探索应该获得：

```text
装备
资源
故事
新地点
隐藏路线
环境秘密
安全屋
特殊制作配方
```

不要：

每个地点最终都是：

```text
三个罐头 + 两块布
```

---

# 58. Unique Loot

增加少量：

```text
Unique Items
```

例如：

```text
特殊武器
实验设备
故事道具
高级工具
特殊背包
特殊护甲
```

获得方式：

与特定 POI 联系。

---

# 59. 战斗体验

重新测试：

```text
Melee
Pistol
Shotgun
Rifle
```

每种：

必须有不同手感。

优化：

```text
Sound
Animation
Recoil
Impact
Hit Reaction
Camera
Particles
Reload
Weapon Motion
```

---

# 60. 枪械声音

枪械声音不能只有单层：

```text
Bang.wav
```

应组合：

```text
Mechanical
Muzzle
Tail
Environment Reflection
Indoor / Outdoor Difference
```

如果资源允许：

室内射击：

必须明显更震撼。

---

# 61. Bullet Impact

不同材质：

```text
Wood
Metal
Concrete
Dirt
Glass
Flesh
```

需要不同：

```text
Sound
Particle
Decal
```

---

# 62. Melee Impact

近战命中：

加入：

```text
Weapon Motion
Hit Stop 极轻微
Camera Reaction
Sound
Blood / Impact
Enemy Reaction
```

让玩家明确感受到：

```text
击中了
```

---

# 63. 故事线完整重构

当前游戏世界观：

```text
Ashfall Protocol
Greyvale
Biological Incident
Containment
Secret Research
```

必须发展成：

# 完整主线剧情

不是：

```text
散落几张文件
↓
最后打开实验室
```

---

# 64. 主线剧情结构

至少设计：

```text
Act 1
Act 2
Act 3
Act 4
Finale
```

---

# 65. Act 1

主题：

```text
生存
```

玩家刚进入 Greyvale。

目标：

```text
寻找食物
建立安全点
理解环境
寻找广播信号
```

剧情：

发现：

政府所谓的：

```text
完全撤离
```

明显是谎言。

---

# 66. Act 2

主题：

```text
调查
```

玩家找到：

```text
军方记录
医疗文件
失踪人员
研究资料
```

发现：

事件并非普通疾病。

---

# 67. Act 3

主题：

```text
Ashfall
```

玩家了解到：

```text
ASHFALL PROTOCOL
```

并不是：

救援计划。

而是：

```text
Containment Cleanup Protocol
```

---

# 68. Act 4

主题：

```text
真相
```

进入：

```text
地下研究设施
```

了解到：

灾难源于：

```text
失败的人体适应性实验
```

但加入更复杂：

```text
军方
研究机构
当地政府
私人承包商
```

之间的关系。

不要：

把剧情写成简单：

```text
邪恶博士造病毒
```

---

# 69. Finale

最终：

玩家面对：

至少一个重大选择。

例如：

```text
公开研究资料

销毁所有资料

启动 Ashfall 最终程序

关闭系统并留在 Greyvale
```

选择影响：

```text
Ending
```

---

# 70. 多结局

至少设计：

```text
3 个结局
```

例如：

```text
Truth Ending
Ash Ending
Survivor Ending
```

根据：

```text
探索程度
关键任务
最终选择
```

触发。

---

# 71. Side Story

增加：

```text
5-10 条
```

小型故事线。

例如：

```text
失踪的医生
猎人一家
被遗弃的检查站
掠夺者首领
广播电台幸存者
地下避难所
军官日志
```

---

# 72. Narrative Delivery

剧情呈现方式组合：

```text
Environmental Storytelling
Notes
Computers
Radio
Audio Logs
NPC
Scripted Events
Cinematics
```

不要完全依赖：

文字文件。

---

# 73. 过场动画

允许新增：

```text
Cinematic System
```

但过场动画：

不应该频繁打断玩家。

---

# 74. Cinematic 类型

优先：

```text
In-Engine Cinematic
```

不要制作预渲染视频。

使用游戏实际：

```text
Camera
Character
Lighting
Animation
Audio
```

完成。

---

# 75. 过场动画场景

建议至少：

```text
Opening
First Major Discovery
Ashfall Reveal
Research Facility Reveal
Finale
Ending
```

---

# 76. Opening

新游戏开始：

可以增加短过场。

例如：

```text
黑屏
↓
事故声音
↓
闪烁灯光
↓
玩家缓慢恢复意识
↓
运输车辆残骸
↓
远处烟柱
↓
控制权交给玩家
```

时间控制：

```text
30-90 秒
```

不要十分钟电影开局。

---

# 77. In-Game Scripted Events

比传统 Cutscene 更重要。

例如：

玩家进入超市：

```text
远处货架倒下
↓
声音吸引感染者
```

进入军事基地：

```text
警报突然启动
↓
应急灯开启
↓
大量感染者被吸引
```

---

# 78. Scripted Sequence System

建立：

```text
SequenceController
```

支持：

```text
Camera
Audio
Dialogue
Animation
Lighting
AI Trigger
Door
Explosion
Particle
Objective
```

便于：

后续制作剧情。

---

# 79. Cutscene Skip

所有过场：

必须支持：

```text
Skip
```

已经观看的过场：

可立即跳过。

---

# 80. 音频品质升级

完整检查：

```text
Footsteps
Weapons
Doors
Zombie
Environment
Weather
UI
Vehicles
Indoor
Outdoor
```

---

# 81. Footstep

脚步：

必须根据：

```text
Surface
Speed
Player Weight
Stance
```

变化。

---

# 82. Zombie Audio

僵尸声音：

根据状态：

```text
Idle
Alert
Search
Chase
Attack
Hit
Death
```

不同。

不要：

每三秒重复同一个：

```text
ZombieGroan01
```

---

# 83. Audio Variation

同类型声音：

准备多个 Variation。

同时加入：

```text
Pitch Randomization
Volume Randomization
Cooldown
```

避免重复感。

---

# 84. 环境混响

重点区域：

```text
Small Room
Large Room
Hallway
Tunnel
Outdoor
Forest
```

使用不同：

```text
Reverb / Audio Processing
```

---

# 85. UI UX Polish

重新检查：

```text
HUD
Inventory
Interaction
Crafting
Map
Settings
Damage Feedback
Status Feedback
```

原则：

```text
信息清楚
动画自然
响应快速
视觉统一
```

---

# 86. UI Animation

菜单：

不要：

```text
display:none
↓
display:block
```

所有核心 UI：

加入适度：

```text
Fade
Slide
Scale
```

动画。

持续时间：

短。

不要拖慢操作。

---

# 87. Inventory Feedback

移动物品：

需要：

```text
Hover
Drag
Drop
Invalid
Stack
Split
Equip
```

视觉反馈。

---

# 88. Damage Feedback

受到攻击：

不仅减少 HUD 数字。

加入：

```text
Sound
Camera Reaction
Character Reaction
Status Icon
Blood Effect
```

---

# 89. 世界细节

继续主动增加：

```text
树叶掉落
风吹垃圾
路牌晃动
灯泡闪烁
电线晃动
远处鸟群
乌鸦
烟柱
灰尘
雾气
飞虫
水滴
漏水
蒸汽
```

但：

必须通过：

```text
Distance Culling
LOD
Pooling
```

控制性能。

---

# 90. Weather Detail

雨天：

进一步增加：

```text
Roof Rain Sound
Metal Rain Sound
Window Rain
Water Drip
Puddle
Wet Material
Vehicle Wetness
Weapon Wetness
```

---

# 91. 夜晚品质

重点优化：

```text
Flashlight
Moon
Fog
Enemy Silhouette
Interior Darkness
Light Contrast
```

夜晚：

应该危险。

但：

不能黑到完全无法游戏。

---

# 92. Flashlight

手电：

优化：

```text
Beam
Falloff
Shadow
Fog Interaction
Battery
Animation
Sound
```

可以增加：

```text
Light Flicker
```

用于：

低电量。

---

# 93. 安全感与危险感

世界应该存在明显节奏：

```text
Safe
↓
Tension
↓
Danger
↓
Combat
↓
Recovery
```

不要：

每平方米都塞三只僵尸。

持续战斗：

反而失去恐怖感。

---

# 94. World Director 优化

调整：

```text
Game Director
```

参考：

```text
玩家最近战斗频率
资源情况
健康
位置
时间
噪音
最近事件
```

控制：

```text
Enemy Activity
Ambient Event
Special Encounter
```

---

# 95. 随机事件丰富

继续增加：

```text
远处枪声
幸存者遇袭
感染者群迁徙
车辆警报
野兽追逐
军事无人机残骸
火灾
雷击
广播信号
求救信号
```

---

# 96. Rare Events

少量低概率事件：

增加：

```text
不可预测感
```

例如：

```text
远处坠机
大型感染者袭击安全区
特殊广播
罕见天气
隐藏军方行动
```

---

# 97. Quality Audit

完成以上工作后：

不要立即结束。

再次完整体验游戏。

至少覆盖：

```text
New Game

白天森林

小镇

室内

枪战

近战

雨天

夜晚

建筑

狩猎

驾驶

主线任务

地下设施

结局
```

---

# 98. 主动发现廉价感

在体验过程中：

专门寻找：

```text
瞬移
硬切动画
重复素材
糟糕比例
穿模
无反馈
静态场景
AI 卡死
音效重复
动作僵硬
UI 突兀
镜头怪异
光照平淡
过于空旷
剧情断裂
```

发现之后：

直接修复。

---

# 99. 不接受的结果

本阶段完成后：

不能再存在大量：

```text
僵尸像木偶
门瞬间打开
武器焊死在镜头
走路镜头机械摇摆
敌人空气生成
中枪毫无反应
人物状态瞬间切换
房间只有几个程序化方块
所有敌人同一种死亡动画
所有枪械几乎相同
故事只有几张文档
```

---

# 100. 性能原则

升级视觉品质：

不得无视性能。

持续测试：

```text
FPS
Frame Time
Draw Calls
GPU Time
Memory
Active Animation
AI Count
Physics
```

---

# 101. Desktop Quality Target

目标平台仍然：

```text
现代桌面浏览器
```

不要为了支持：

```text
十年前的办公笔记本
```

牺牲整个项目的视觉目标。

继续提供：

```text
Low
Medium
High
Ultra
```

不同画质。

---

# 102. High / Ultra

高端设备：

优先允许：

```text
更高 Shadow Distance
更高 Vegetation Density
更高 Resolution
更高 SSAO
更多 Dynamic Light
更高 LOD Distance
更高 Particle Count
```

---

# 103. 动画性能

远距离角色：

减少：

```text
Animation Update Rate
```

例如：

```text
0-30m
Full

30-80m
Reduced

80m+
Very Low / Simulation
```

---

# 104. 资产加载

外部资源增加后：

必须避免：

首次加载巨大。

通过：

```text
Lazy Loading
Asset Bundle
Chunk Asset Loading
Compression
```

优化。

---

# 105. 不要重写稳定系统

如果现有：

```text
Inventory
Save
World Streaming
Crafting
```

已经稳定：

不要为了“更优雅”整体重写。

本阶段重点：

```text
玩家能实际感受到的提升
```

---

# 106. 工作原则

每次修改都问自己：

```text
玩家能不能明显感觉更好？
```

如果答案：

```text
不能
```

优先级降低。

---

# 107. 优化优先原则

优先：

```text
Moment-to-Moment Experience
```

也就是玩家每一分钟都能感受到的：

```text
移动
镜头
动画
声音
战斗
光线
AI
交互
```

这些系统：

比：

```text
很深但玩家很少看到的后台架构
```

重要得多。

---

# 108. 使用外部参考

允许研究成熟游戏：

```text
第一人称镜头设计
FPS Weapon Animation
Zombie Animation
Hit Reaction
Door Interaction
Environmental Storytelling
Survival Gameplay Loop
```

但：

只学习通用设计方法。

禁止：

```text
直接复制代码
复制资源
复制独特 UI
复制剧情
复制地图
复制特定作品标志性内容
```

---

# 109. 动画资产优先级

如果项目当前动画明显不足：

优先寻找：

```text
授权明确
允许商业使用
质量较高
```

的人形动画资产。

包括：

```text
Walk
Run
Sprint
Crouch
Attack
Hit
Death
Vault
Climb
Interact
```

之后：

通过：

```text
Retargeting
Animation Blend
Procedural Adjustment
```

适配角色。

---

# 110. Procedural Animation

现成动画无法解决的部分：

使用程序化调整。

例如：

```text
IK
Head Look
Foot Placement
Weapon Aim
Hand Placement
Hit Reaction
Recoil
Breathing
```

---

# 111. IK

如果当前实现条件允许：

增加：

```text
Foot IK
Hand IK
Look IK
Weapon IK
```

改善：

```text
脚悬空
手穿武器
角色看向奇怪方向
```

---

# 112. 动作不能阻塞操作

动画优先真实。

但不要：

为了真实性：

让所有操作都慢得痛苦。

例如：

玩家打开普通门：

无需：

```text
3 秒完整电影动画
```

目标：

```text
Fluid
Responsive
Physical
```

---

# 113. Player Control Preservation

任何镜头、动画优化：

不能损害：

```text
Input Precision
Mouse Response
Combat Accuracy
Player Agency
```

这是硬规则。

---

# 114. 最终目标视觉

最终打开游戏：

玩家首先应该看到：

```text
成熟的光影
丰富的环境
自然的动画
真实的移动
有重量的武器
合理的 AI
```

而不是：

```text
这是 Babylon.js 做的 Demo
```

---

# 115. 最终目标体验

目标不是：

```text
功能非常多
```

而是：

```text
世界可信
动作自然
战斗有反馈
探索有动力
生存有压力
剧情有吸引力
环境有故事
```

---

# 116. Final Quality Pass

所有优化完成后：

执行最后一次：

# Final Quality Pass

按照以下顺序逐项检查：

```text
1. First Person Camera
2. Player Movement
3. Weapon Feel
4. Player Animation
5. Zombie Animation
6. Hit Reaction
7. Zombie AI
8. Door / Object Animation
9. Environment Assets
10. Lighting
11. Audio
12. Gameplay Depth
13. Story
14. Cinematics
15. UI
16. Performance
17. Bugs
```

每一个项目：

必须实际进入游戏验证。

---

# 117. 最终验收问题

完成前逐项回答：

```text
走路是否自然？

跑步是否具有重量？

镜头是否舒服？

武器是否有重量？

ADS 是否自然？

开枪是否有冲击力？

僵尸是否像一个存在于世界中的实体？

僵尸攻击是否具有动作过程？

僵尸中枪是否具有明显受击反馈？

不同方向命中是否存在差异？

门是否真正有打开和关闭过程？

角色动画之间是否平滑？

环境是否仍明显存在程序员美术感？

是否已经合理采用高质量免费资产？

场景是否具有足够细节？

探索是否具有足够奖励？

游戏中期是否还有事情可做？

主线是否完整？

玩家是否能够理解 Ashfall Protocol 的真相？

剧情是否具有高潮？

是否存在至少一个令人印象深刻的 Scripted Sequence？

是否存在完整 Ending？

30 分钟游戏后性能是否稳定？

是否存在明显穿模？

是否存在敌人凭空刷脸？

是否存在严重 Animation Snap？
```

存在明显问题：

继续优化。

---

# 118. Goal Mode 最终执行指令

```text
当前项目已经完成第一阶段开发。

现在进入第二阶段品质升级。

不要重新从零搭建项目。

首先运行并完整检查当前游戏。

将自己视为：

Lead Gameplay Programmer
Lead Technical Artist
Animation Programmer
AI Programmer
Environment Artist
Narrative Designer
Cinematic Designer
Audio Designer
QA

本阶段目标不是增加 Feature 数量，而是提高整个游戏的商业作品完成度。

第一优先级优化第一人称玩家体验，包括 Camera、Movement、Weapon Motion、ADS、Sprint、Landing、Crouch、Lean、Interaction 和 Full Body Presence。

重点研究成熟第一人称游戏中通用的镜头与操作设计方式，并结合当前游戏实现合理方案。

玩家相机保持快速响应，惯性主要体现在武器、身体和辅助镜头运动，不允许制造明显 Mouse Input Lag。

全面优化 Animation。

所有角色、僵尸、NPC、武器、门、容器和可交互对象都应该尽可能拥有自然的动作过程。

禁止大量瞬间状态切换。

使用 Animation State Machine、Animation Blending、IK、Procedural Animation 等方式提高品质。

重点重构 Zombie AI、Spawn、Attack、Hit Reaction、Stagger、Knockdown、Death 和 Navigation。

僵尸禁止直接在玩家视野中凭空生成。

敌人攻击必须存在 Windup、Hit Frame 和 Recovery。

受击反应必须尽可能考虑命中方向、身体区域、伤害和武器冲击力。

合理增加 Stagger、Knockdown、GetUp 和不同死亡变化。

当前项目允许主动寻找并使用高品质公开免费资产。

优先寻找 CC0、Public Domain 或其它明确允许当前项目使用的免费资产。

不要为了坚持纯程序化资产而保留明显廉价的模型、纹理、动画或声音。

下载资源后必须检查 License，并维护 THIRD_PARTY_ASSETS.md。

所有资源需要根据 Web 实时游戏进行 Texture、Mesh、LOD 和 Loading 优化。

继续进行 Environment Art Pass，替换明显粗糙资产，并增加家具、垃圾、植被、破坏细节、Decal、生活痕迹和 Environmental Storytelling。

继续丰富 Gameplay，但重点增加系统之间的关联，而不是单纯堆功能。

继续完善搜刮、生存、战斗、建造、狩猎、天气、动态事件等玩法，使玩家在游戏中期和后期仍然拥有明确目标。

重新整理并完整实现 Ashfall Protocol 主线剧情。

剧情至少包含 Act 1、Act 2、Act 3、Act 4 和 Finale。

增加 Side Story、Environmental Storytelling、Radio、Audio Log、NPC、Scripted Event 和必要的 In-Engine Cinematic。

允许加入过场动画，但优先使用实时游戏引擎内 Cinematic，不使用预渲染视频。

过场动画必须可跳过。

至少实现 Opening、Major Discovery、Ashfall Reveal、Research Facility Reveal、Finale 和 Ending 中合理的一部分。

最终形成完整主线和至少三个不同结局。

持续优化声音、枪械反馈、脚步、门、环境声、室内外混响、天气和 Zombie Audio。

每完成一个明显阶段都必须重新运行游戏测试。

不要因为代码已经可以运行就认为任务完成。

主动寻找：

程序员美术感
机械镜头
僵硬动画
Animation Snap
穿模
AI 卡墙
敌人刷脸
重复音频
空旷环境
廉价战斗反馈
剧情断裂
UI 突兀

发现后直接解决。

稳定的底层系统不要为了架构洁癖整体重写。

优先进行玩家能够真实感受到的品质升级。

所有修改必须保持 Build、Test 和运行稳定。

持续开发、运行、检查、修复和优化。

只有当整个游戏从“功能完整的 Web 生存游戏”明显提升到“具有较高独立商业游戏完成度的 Web 第一人称生存游戏”时，本阶段才能结束。
```

---

# 119. 本阶段 DONE 标准

只有同时达到以下条件才允许结束：

```text
第一人称移动明显自然

镜头不再具有机械 Head Bob

玩家操作仍然灵敏

武器具有惯性和重量

ADS / Sprint / Reload 具有自然 Transition

人物状态切换具有动画过程

门具有完整开关过程

僵尸生成合理

僵尸追击自然

僵尸攻击拥有完整动作过程

僵尸受击具有方向与冲击反馈

僵尸拥有多个死亡表现

多人形动画过渡自然

免费高质量资产已经合理应用

环境明显减少程序化廉价感

场景细节和环境故事得到增强

战斗反馈明显提升

游戏内容更加丰富

玩法系统之间存在更多联系

主线剧情完整

剧情拥有明确发展、高潮和结局

拥有合理 Scripted Events

拥有必要的 In-Engine Cinematics

声音体验明显提升

连续游玩性能稳定

核心玩法不存在严重 Bug
```

最终目标：

# 不再满足于“这居然能在网页里跑”。

而应该进一步做到：

# “这居然是一款网页游戏。”
