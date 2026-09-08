# Ashfall Protocol / 灰烬协议

> Web 端次世代硬核开放世界生存游戏开发规格书
> 文档用途：直接作为 Codex / 自动编程 Agent 的 Goal Mode 总任务输入
> 项目代号：`ASHFALL`
> 游戏类型：开放世界 / 硬核生存 / PvE / 探索 / 搜刮 / 建造 / 制作 / 战斗 / 动态世界
> 目标平台：现代桌面浏览器
> 核心技术：TypeScript + WebGPU + Babylon.js
> 核心原则：高画质、高光照表现、高品质细节、丰富系统、强沉浸感、无需人工准备美术素材、可直接运行

---

# 1. 项目目标

开发一款可以直接运行在现代桌面浏览器中的高品质 3D 开放世界硬核生存游戏。

游戏体验参考以下类型作品所代表的设计方向：

* SCUM
* DayZ
* The Forest
* Sons of the Forest
* Project Zomboid
* Escape from Tarkov 的搜刮与装备部分
* Rust 的部分生存与建造机制

仅参考玩法类型、系统深度、氛围和设计思路。

**禁止直接复制任何现有游戏的：**

* 地图
* 角色
* 名称
* UI
* 剧情
* 图标
* 模型
* 材质
* 音效
* 代码
* 受版权保护的独特设计

游戏必须形成自己的视觉风格、世界观和系统设计。

最终目标不是制作“技术 Demo”，而是完成一个：

> **具有完整游戏循环、足够丰富玩法、高品质画面、可长期扩展的 Web 3D 生存游戏。**

---

# 2. 项目名称

中文名：

# 灰烬协议

英文名：

# Ashfall Protocol

简称：

`AP`

世界观中的“灰烬协议”是灾难发生后某个神秘组织启动的一项封锁与清除计划。

玩家最初并不知道：

* 灾难为什么发生
* 城市为什么被封锁
* 军方为什么撤离
* 某些区域为什么遭到焚毁
* 感染体从何而来
* “灰烬协议”的真正目的是什么

这些内容通过探索逐渐揭露。

---

# 3. 核心卖点

游戏必须围绕以下六个核心卖点开发。

## 3.1 高品质 Web 3D 画面

在浏览器允许的范围内追求高品质画面。

必须实现：

* WebGPU 优先
* WebGL2 自动降级
* PBR 材质
* HDR 环境光
* 动态太阳
* 实时阴影
* SSAO
* Bloom
* Color Grading
* Tone Mapping
* Fog
* Volumetric Fog 或近似实现
* 屏幕空间反射或近似效果
* 水面反射
* 风吹植被
* 云层
* 昼夜变化
* 天气变化
* 室内外光线差异
* 手电筒动态光
* 枪口火焰动态照明

画面不能停留在：

> “几个方块 + 默认材质 + 简单天空盒”

这种廉价技术演示水平。

---

# 4. 技术路线

默认技术栈：

```text
Language:
TypeScript

Build:
Vite

3D Engine:
Babylon.js

Renderer:
WebGPU
WebGL2 fallback

Physics:
Havok Physics
或
Babylon Physics V2

UI:
HTML + CSS + TypeScript

State:
轻量自研 Store
或 Zustand 风格实现

Audio:
Web Audio API
Babylon Audio

Save:
IndexedDB

Worker:
Web Worker

Optional:
OffscreenCanvas

Testing:
Vitest

Formatting:
ESLint
Prettier
```

禁止为了“架构漂亮”引入大量没有必要的 npm 包。

优先：

* 原生 API
* Babylon.js 内置能力
* 小型工具库

---

# 5. 浏览器要求

主要支持：

```text
Chrome 最新版
Edge 最新版
Firefox 最新版
```

优先：

```text
WebGPU
```

如果设备不支持 WebGPU：

```text
自动切换 WebGL2
```

必须实现图形能力检测。

例如：

```text
Ultra
High
Medium
Low
```

根据：

* GPU
* WebGPU 支持
* 最大纹理尺寸
* 显存估算
* 帧率

自动推荐画质。

---

# 6. 游戏世界背景

时间：

2037 年。

地点：

虚构地区：

# Greyvale 灰谷自治区

这是一个面积不大的自治工业地区。

区域拥有：

* 城镇
* 山林
* 军事基地
* 水库
* 工业园
* 农村
* 废弃矿区
* 高速公路
* 地下实验设施

数年前，Greyvale 地区发生未知生物灾害。

政府宣布：

> Greyvale Biological Containment Incident

随后整个地区遭到封锁。

官方宣布：

所有居民均已撤离。

实际上：

并没有。

大量居民：

* 被遗弃
* 被感染
* 被军方击毙
* 成为幸存者
* 加入掠夺者组织

之后：

一个代号为：

# ASHFALL

的秘密计划被启动。

---

# 7. 玩家身份

玩家不是英雄。

不是：

* 特种兵
* 超能力者
* 天选之人

玩家只是灾难中的幸存者。

游戏开始：

玩家在一次运输事故后醒来。

身上只有：

```text
破旧衣服
水瓶
简易背包
小刀
```

没有任务提示告诉玩家：

> 去拯救世界。

玩家第一件事是：

> 活到晚上。

---

# 8. 核心游戏循环

核心循环：

```text
探索
↓
搜刮
↓
获取资源
↓
满足生存需求
↓
获得装备
↓
进入危险区域
↓
获得稀有资源
↓
升级装备
↓
建设安全屋
↓
探索更危险区域
↓
发现世界秘密
↓
重复
```

辅助循环：

```text
狩猎
制作
烹饪
建造
战斗
车辆
农业
医疗
交易
探索
```

玩家必须持续面对：

```text
资源有限
环境危险
敌人威胁
天气变化
身体状态
装备磨损
```

---

# 9. 地图设计

目标世界规模：

约：

```text
4 km × 4 km
```

总面积：

```text
约 16 km²
```

考虑 Web 性能，地图使用：

```text
Chunk Streaming
```

地图划分：

```text
256m × 256m Chunk
```

玩家附近：

```text
高精度
```

远处：

```text
LOD
Impostor
低密度对象
```

---

# 10. 地图区域

世界必须至少包含以下大型区域。

## 10.1 Pine Hollow

森林小镇。

建筑：

* 超市
* 警察局
* 加油站
* 酒吧
* 医院
* 学校
* 消防站
* 汽修厂
* 民宅

特点：

适合新玩家。

资源丰富。

敌人较少。

---

## 10.2 Greyvale City

废弃城市。

包含：

* 商业区
* 公寓
* 地铁
* 医院
* 商场
* 写字楼
* 地下停车场

特点：

高级资源。

感染者密度高。

---

## 10.3 Fort Raven

军事基地。

拥有：

```text
武器
弹药
护甲
战术装备
```

危险程度：

极高。

敌人：

```text
感染士兵
自动防御系统
精英掠夺者
```

---

# 11. Blackridge Industrial Zone

工业区。

包含：

```text
工厂
仓库
铁路
油罐
维修车间
化工厂
```

资源：

```text
机械零件
燃料
电子元件
金属材料
```

---

# 12. Lake Alder

大型水库。

玩法：

* 捕鱼
* 水资源
* 狩猎
* 湖边木屋
* 隐藏宝箱
* 废弃码头

---

# 13. Old Mine

废弃矿场。

拥有：

```text
地下矿洞
秘密实验区入口
```

主要资源：

```text
矿石
工业材料
特殊剧情物品
```

---

# 14. Underground Research Facility

最终高级区域。

具有：

```text
实验室
隔离区
服务器中心
冷冻仓
生物实验室
```

这是游戏世界谜团的核心。

---

# 15. 世界生成方式

不要完全依赖人工制作地图。

采用：

```text
程序化生成
+
手工规则布置
```

组合方式。

自然环境使用：

```text
Noise
Heightmap
Biome Rules
Scatter System
```

生成：

* 地形
* 山坡
* 森林
* 草地
* 石头
* 灌木
* 小溪

城市部分：

通过模块化建筑生成。

---

# 16. 美术素材策略

这是本项目非常重要的一项要求。

# 不允许因为没有美术素材而停止开发。

Agent 必须自主解决素材问题。

优先级：

```text
程序化素材
>
自生成素材
>
明确允许使用的 CC0 素材
>
免费授权素材
```

不得使用授权不清晰的网络资源。

---

# 17. 程序化 3D 模型

基础环境模型通过：

```text
Babylon MeshBuilder
+
CSG
+
Procedural Geometry
```

生成。

例如：

```text
箱子
木板
柜子
桌子
货架
路障
围栏
石头
木头
道路
建筑
墙体
屋顶
楼梯
门
窗
管道
电线杆
垃圾
废弃车辆基础模型
```

复杂对象应通过：

```text
多个 Primitive
+
材质
+
细节 Mesh
```

组合。

避免出现：

```text
大量纯立方体
```

而没有视觉细节。

---

# 18. 程序化纹理

使用：

```text
Canvas
Noise
Shader
SVG
```

生成纹理。

必须建立：

```text
ProceduralMaterialFactory
```

能够生成：

```text
木材
金属
生锈金属
混凝土
砖墙
道路
泥土
岩石
布料
塑料
皮革
玻璃
血迹
污渍
划痕
```

PBR 至少生成：

```text
Albedo
Normal
Roughness
Metallic
AO
```

纹理需要：

* 颜色变化
* 污渍
* 边缘磨损
* 微小噪点
* 粗糙度差异

避免：

```text
单色 PBR
```

---

# 19. Decal 系统

世界细节大量使用 Decal。

包括：

```text
血迹
泥浆
弹孔
墙面裂纹
污渍
涂鸦
警告标识
漏水痕迹
破损
轮胎痕迹
```

通过 Decal 提升：

> 环境信息密度。

---

# 20. 环境小物件

每个大型场景必须大量存在环境小物件。

例如住宅：

```text
书
纸箱
垃圾
瓶子
椅子
盘子
照片
衣服
药瓶
垃圾袋
破碎玻璃
```

工业区：

```text
工具
电缆
桶
钢管
托盘
螺丝
零件
箱子
安全帽
```

道路：

```text
垃圾
石头
树枝
废弃路牌
轮胎
路障
```

大量对象必须：

```text
Thin Instance
```

或：

```text
Instance
```

避免性能灾难。

毕竟浏览器已经够辛苦了，不必再让几万个独立 Draw Call 给它举行葬礼。

---

# 21. 植被系统

植被必须包含：

```text
草
野花
灌木
蕨类
小树
大树
枯树
倒木
蘑菇
```

通过：

```text
GPU Instancing
Thin Instances
```

批量渲染。

Shader 实现：

```text
风吹效果
```

草和树叶：

随风摆动。

不同植物：

摆动频率不同。

---

# 22. LOD

所有复杂环境对象必须支持：

```text
LOD0
LOD1
LOD2
```

例如：

```text
0-30m
30-80m
80m+
```

远距离：

* 降低几何复杂度
* 减少阴影
* 使用 Billboard
* 使用 Impostor

---

# 23. 光照系统

游戏视觉重点之一。

建立：

```text
LightingManager
```

统一控制。

包括：

```text
太阳
月亮
天空
环境光
雾
天气
曝光
室内光
局部灯光
```

---

# 24. 太阳光

使用：

```text
Directional Light
```

太阳角度随时间变化。

太阳高度影响：

```text
光线颜色
光照强度
阴影角度
天空颜色
雾颜色
```

清晨：

暖黄色。

中午：

偏白。

黄昏：

橙红色。

夜晚：

月光。

---

# 25. 阴影

使用：

```text
Cascaded Shadow Maps
```

主要阴影对象：

```text
玩家
树木
建筑
敌人
车辆
重要物品
```

远处小物体关闭阴影。

画质设置影响：

```text
Shadow Map Size
Cascade Count
Shadow Distance
```

---

# 26. 室内照明

室内不能像户外一样亮。

进入建筑：

自动调整：

```text
Exposure
Ambient Lighting
Fog
```

没有电力的建筑：

非常黑暗。

玩家需要：

```text
手电筒
火把
油灯
发电机
```

---

# 27. 后处理

必须建立完整 PostProcess Pipeline。

包含：

```text
SSAO
Bloom
FXAA / TAA
Chromatic Aberration（极轻微）
Color Grading
Vignette（轻微）
Depth of Field（可选）
Tone Mapping
Film Grain（极轻微）
```

禁止为了所谓“电影感”把：

```text
Bloom
Chromatic Aberration
Vignette
Motion Blur
```

全部开到像廉价短视频滤镜一样。

---

# 28. 天气系统

天气类型：

```text
晴天
多云
阴天
小雨
暴雨
雾天
雷暴
```

天气动态变化。

实现：

```text
WeatherController
```

控制：

```text
CloudDensity
FogDensity
RainIntensity
Wind
LightIntensity
SkyColor
Wetness
```

---

# 29. 雨

雨天表现：

```text
雨滴粒子
地面湿润
PBR Roughness 改变
积水
水面波纹
环境变暗
风增强
雷声
```

雨水影响：

玩家：

```text
Wetness
Temperature
```

衣服湿透后：

体温下降更快。

---

# 30. 雾

雾天：

能见度下降。

影响：

```text
探索
射击
敌人感知
气氛
```

夜间森林大雾必须具有明显压迫感。

---

# 31. 昼夜循环

默认：

```text
现实 60 分钟
=
游戏 24 小时
```

可配置。

阶段：

```text
Dawn
Morning
Noon
Afternoon
Sunset
Night
Midnight
```

夜晚必须真正黑暗。

不能出现：

> 半夜两点还能清楚数树林里每一根草。

---

# 32. 玩家控制

第一人称为主。

支持：

```text
WASD
鼠标
冲刺
跳跃
蹲下
趴下
侧身
互动
攻击
瞄准
换弹
投掷
快捷栏
背包
地图
手电筒
```

移动状态：

```text
Walk
Run
Sprint
Crouch
Prone
Jump
Fall
Climb
Swim
```

---

# 33. 第一人称相机

必须实现：

```text
Head Bob
Landing Camera
Sprint Camera
Weapon Sway
Breathing Sway
FOV Change
Damage Shake
Recoil
```

全部效果都应：

适度。

必须提供设置：

```text
Head Bob 0-100%
Camera Shake 0-100%
Motion Blur On/Off
```

---

# 34. 玩家身体系统

玩家至少拥有：

```text
Health
Blood
Stamina
Energy
Hydration
Temperature
Fatigue
Wetness
Pain
Weight
```

---

# 35. 饥饿

食物拥有：

```text
Calories
Protein
Fat
Carbohydrates
Water
```

第一版本不需要模拟到医学论文级别。

重点体现：

```text
不同食物价值不同
长期不吃会虚弱
```

---

# 36. 水分

饮水来源：

```text
瓶装水
河流
湖泊
水井
雨水
```

自然水源：

可能被污染。

需要：

```text
煮沸
净水片
过滤器
```

---

# 37. 体温

体温受：

```text
天气
时间
衣服
湿度
运动
环境
火源
```

影响。

低温：

```text
体力恢复降低
移动减慢
生命危险
```

---

# 38. 睡眠

疲劳持续增长。

玩家可以：

```text
床
睡袋
沙发
临时营地
```

休息。

睡眠：

恢复疲劳。

但可能：

遭遇危险。

---

# 39. 医疗系统

伤害类型：

```text
Cut
Bleeding
Fracture
Burn
Infection
Poison
Bullet
Blunt
```

不同伤害使用不同治疗方式。

---

# 40. 出血

出血等级：

```text
Minor
Medium
Severe
```

治疗：

```text
布条
绷带
止血带
医疗绷带
```

严重出血：

持续减少 Blood。

---

# 41. 骨折

骨折影响：

```text
移动速度
瞄准
体力消耗
```

治疗：

```text
Splint
```

---

# 42. 感染

伤口未处理：

存在感染概率。

感染阶段：

```text
Stage 1
Stage 2
Stage 3
```

可通过：

```text
抗生素
医疗处理
```

治疗。

---

# 43. 物品系统

所有物品统一继承：

```text
ItemDefinition
```

基本字段：

```ts
interface ItemDefinition {
    id: string
    name: string
    description: string

    category: ItemCategory

    weight: number
    size: number

    maxStack: number

    durability?: number

    rarity: ItemRarity

    icon: string
}
```

---

# 44. 物品分类

```text
Weapon
Ammo
Food
Drink
Medical
Tool
Material
Clothing
Armor
Container
Electronic
Quest
Misc
```

---

# 45. 稀有度

```text
Common
Uncommon
Rare
Military
Experimental
```

稀有度影响：

```text
掉落概率
区域分布
价值
```

不能简单：

> 金色装备永远比白色装备伤害高十倍。

本游戏不是刷光柱的 MMORPG。

---

# 46. 背包系统

背包采用：

```text
Grid Inventory
```

类似真实空间占用。

每件物品拥有：

```text
width
height
```

支持：

```text
旋转物品
堆叠
拆分
拖拽
快速转移
快捷栏
```

---

# 47. 容器

世界中：

```text
柜子
箱子
尸体
汽车后备箱
保险箱
仓库
冰箱
背包
```

均可作为 Container。

---

# 48. 装备槽

玩家拥有：

```text
Head
Face
Chest
Hands
Legs
Feet
Back
Vest
PrimaryWeapon
SecondaryWeapon
Holster
```

衣服可以提供额外空间。

---

# 49. 重量

携带重量影响：

```text
移动速度
冲刺速度
体力消耗
噪音
```

严重超重：

禁止冲刺。

---

# 50. 制作系统

制作系统分：

```text
基础制作
工具制作
武器制作
医疗制作
烹饪
建筑
机械
电子
```

---

# 51. 基础制作

例如：

```text
布条
绳子
火把
木矛
石刀
木箱
篝火
睡袋
```

---

# 52. 工具

```text
锤子
斧头
锯
扳手
撬棍
铲子
```

不同工具：

用于：

```text
采集
拆解
建造
维修
开锁
```

---

# 53. 武器

武器分类：

```text
Melee
Pistol
Shotgun
SMG
Rifle
Sniper
Bow
Improvised
```

---

# 54. 近战武器

例如：

```text
Knife
Axe
Baseball Bat
Crowbar
Machete
Spear
```

拥有：

```text
Damage
AttackSpeed
Reach
StaminaCost
Durability
```

---

# 55. 枪械系统

枪械不能只是：

```text
点击敌人 → 扣血
```

必须包含：

```text
弹匣
子弹
换弹
后坐力
扩散
弹道
枪口速度
伤害衰减
穿透
枪械耐久
故障概率
```

---

# 56. 弹道

使用：

```text
Projectile Ballistics
```

考虑：

```text
BulletVelocity
Gravity
Drag 简化
```

中远距离：

需要提前量。

---

# 57. 枪械部件

支持：

```text
Scope
Red Dot
Suppressor
Flashlight
Laser
Magazine
Grip
```

安装后影响：

```text
ADS
Recoil
Weight
Ergonomics
```

---

# 58. 枪械状态

枪拥有：

```text
Durability
Dirtiness
```

状态差：

可能出现：

```text
Jam
```

卡壳。

玩家需要：

执行清障动作。

---

# 59. 后坐力

后坐力：

不能纯随机乱跳。

组成：

```text
Vertical
Horizontal
Camera
Weapon Model
Recovery
```

不同武器明显不同。

---

# 60. 命中系统

身体部位：

```text
Head
Chest
Stomach
Arm
Leg
```

不同区域：

不同伤害倍率。

腿部受伤：

影响移动。

手臂受伤：

影响瞄准。

---

# 61. 护甲

护甲拥有：

```text
Protection
Coverage
Durability
```

防弹衣：

仅保护覆盖区域。

---

# 62. 狩猎

动物：

```text
Deer
Boar
Rabbit
Wolf
Bear
```

第一版至少实现：

```text
鹿
野猪
狼
```

动物行为：

```text
Idle
Eat
Drink
Flee
Attack
Sleep
```

---

# 63. 动物资源

猎杀后：

可以获得：

```text
肉
皮
骨
脂肪
```

尸体需要：

```text
刀
```

进行处理。

---

# 64. 烹饪

食物状态：

```text
Raw
Cooked
Burned
Rotten
```

烹饪方式：

```text
Campfire
Stove
Grill
```

---

# 65. 食物腐败

食品拥有：

```text
Freshness
```

随时间降低。

环境温度影响：

腐败速度。

冰箱：

需要电力。

---

# 66. 建造系统

玩家可以建设：

```text
临时营地
安全屋
大型基地
```

建筑部件：

```text
Foundation
Wall
Door
Window
Floor
Roof
Stairs
Fence
Gate
Storage
Workbench
Bed
Campfire
Generator
Light
```

---

# 67. 建造操作

支持：

```text
Ghost Preview
Snap
Rotate
Collision Check
Placement Validation
```

颜色提示：

```text
可放置
不可放置
```

---

# 68. 建筑耐久

建筑：

可被：

```text
敌人
爆炸
玩家
天气事件
```

破坏。

必须维修。

---

# 69. 电力系统

后期基地支持：

```text
Generator
Fuel
Battery
Wire
Light
Refrigerator
Workbench
Security
```

形成简单电力网络。

---

# 70. 发电机

需要：

```text
Fuel
```

启动后：

产生噪音。

可能：

吸引感染者。

---

# 71. AI 系统

所有 AI 建立统一：

```text
AIController
```

采用：

```text
State Machine
+
Utility AI
```

---

# 72. 感染者

不是传统慢动作木桩。

状态：

```text
Idle
Wander
Investigate
Alert
Chase
Attack
Search
Return
```

---

# 73. AI 感知

包含：

```text
Vision
Hearing
Damage
```

视觉考虑：

```text
距离
角度
光线
遮挡
玩家姿态
```

听觉考虑：

```text
枪声
奔跑
玻璃破碎
车辆
发电机
```

---

# 74. 噪音系统

建立：

```text
NoiseSystem
```

每个声音事件拥有：

```text
position
radius
intensity
type
```

例如：

```text
脚步 8m
跑步 15m
玻璃破碎 30m
枪声 250m
爆炸 500m
```

AI 可以调查噪音来源。

---

# 75. 感染者种类

至少包含：

```text
Walker
Runner
Bloated
Armored
Stalker
```

---

# 76. Walker

普通感染者。

数量多。

速度较慢。

---

# 77. Runner

快速感染者。

生命较低。

攻击性强。

---

# 78. Bloated

体型较大。

生命高。

死亡可能：

释放毒性区域。

---

# 79. Armored

感染士兵。

拥有残破防弹装备。

身体部分区域拥有防御。

---

# 80. Stalker

夜间特殊感染者。

行为：

```text
躲避光线
绕后
观察玩家
偷袭
```

---

# 81. 人类敌人

掠夺者 AI。

拥有：

```text
巡逻
搜寻
掩体
射击
撤退
包抄
抢劫
```

---

# 82. 掩体系统

人类 AI 可以：

寻找附近：

```text
CoverPoint
```

根据：

```text
玩家方向
距离
危险程度
```

选择掩体。

---

# 83. NPC

少量幸存 NPC。

可以：

```text
交易
对话
任务
提供线索
```

不要把世界塞满发感叹号的 NPC。

重点：

> 孤独感。

---

# 84. 动态事件

世界随机产生：

```text
空投
飞机残骸
军方车队残骸
幸存者求救
感染群迁徙
掠夺者营地
森林火灾
雷暴
毒气泄漏
```

---

# 85. 世界搜刮

Loot 必须根据：

```text
建筑类型
区域危险
世界位置
随机种子
```

生成。

例如：

医院：

```text
药品
绷带
医疗器械
```

警察局：

```text
手枪
弹药
防弹衣
```

汽修厂：

```text
工具
机油
汽车零件
```

---

# 86. Loot Respawn

避免无限刷物资。

采用：

```text
区域冷却
+
概率刷新
```

某区域被搜刮后：

一段时间内资源减少。

---

# 87. 车辆

至少实现：

```text
Pickup Truck
SUV
```

车辆拥有：

```text
Fuel
Engine
Battery
Tire
Durability
Storage
```

---

# 88. 车辆启动

废弃车辆不一定能开。

可能缺少：

```text
Battery
Fuel
Tire
EnginePart
```

玩家必须维修。

---

# 89. 驾驶

实现：

```text
Acceleration
Brake
Steering
Suspension
Collision
```

车辆：

高速撞击感染者会造成伤害。

同时车辆自身：

损坏。

---

# 90. 车辆声音

发动机声音会：

吸引大量感染者。

因此车辆：

既是优势，也是风险。

---

# 91. 潜行

潜行受到：

```text
姿态
移动速度
环境光
衣服
地面
噪音
```

影响。

---

# 92. 脚步声音

不同表面：

```text
Grass
Wood
Metal
Concrete
Water
Mud
Glass
```

播放不同声音。

并生成不同：

```text
Noise Radius
```

---

# 93. UI 设计

整体风格：

```text
极简
军事工业
冷色
低干扰
```

HUD 不应该：

满屏数字。

---

# 94. HUD

显示：

```text
Health
Blood
Stamina
Hydration
Energy
Temperature
Quick Slots
Ammo
Fire Mode
```

状态正常时：

部分 HUD 自动淡出。

---

# 95. 交互 UI

准星指向物品：

显示：

```text
名称
状态
交互按钮
```

例如：

```text
[E] Open
[F] Take
```

---

# 96. 背包 UI

左侧：

玩家装备。

中央：

玩家背包。

右侧：

附近容器。

支持：

```text
Drag
Drop
Rotate
Stack
Split
Quick Move
```

---

# 97. 地图

地图不是 GPS。

初始：

地图未探索区域模糊。

玩家探索后：

逐步解锁。

可使用：

```text
地图
指南针
路标
```

确定位置。

---

# 98. 音频设计

音频是重要沉浸元素。

必须实现：

```text
3D Spatial Audio
Distance Attenuation
Occlusion 简化
Indoor Reverb
Outdoor Reverb
```

---

# 99. 环境声音

森林：

```text
风
鸟
树叶
昆虫
```

城市：

```text
风吹铁皮
远处金属碰撞
建筑异响
```

夜晚：

```text
虫鸣
远处感染者
狼叫
```

---

# 100. 音频素材问题

如果没有现成音效：

优先使用：

```text
Web Audio Procedural Audio
```

生成：

* UI 声
* 风声
* 低频环境声
* 简单机械音

复杂声音允许使用：

明确 CC0 授权资源。

不得因为缺少音频：

留空整个声音系统。

---

# 101. 动画

角色与敌人：

需要：

```text
Idle
Walk
Run
Attack
Hit
Death
```

如果没有人物模型：

第一阶段可以采用：

```text
程序化 Character Rig
```

构建人体。

身体由多个 Mesh 组成：

```text
Head
Torso
UpperArm
LowerArm
Hand
UpperLeg
LowerLeg
Foot
```

建立骨架动画或节点动画。

不得简单使用：

胶囊体敌人。

---

# 102. 第一人称武器

武器模型可通过：

```text
Procedural Mesh
```

制作。

必须至少表现：

```text
枪管
机匣
弹匣
枪托
瞄具
扳机区域
护木
```

然后：

通过 PBR 材质赋予：

```text
金属
聚合物
木材
```

不同视觉效果。

---

# 103. 武器动画

包含：

```text
Idle
Walk
Sprint
ADS
Fire
Reload
Inspect
Melee
Jam
ClearJam
```

---

# 104. 开门系统

门不是静态装饰。

支持：

```text
Open
Close
Locked
Broken
Barricaded
```

玩家可以：

```text
开锁
破坏
撬门
```

---

# 105. 玻璃

玻璃支持：

```text
破碎
```

破碎后：

生成：

```text
声音事件
碎片效果
```

可能：

吸引感染者。

---

# 106. 可破坏环境

部分环境支持破坏：

```text
木门
木板
窗户
箱子
路障
```

不要尝试让整座城市全部物理破坏。

那是在浏览器里主动寻找痛苦。

---

# 107. 交互系统

统一：

```ts
interface Interactable {
    getInteractionText(): string
    canInteract(player: Player): boolean
    interact(player: Player): void
}
```

所有：

```text
门
物品
箱子
车辆
NPC
工作台
床
火堆
```

使用统一交互系统。

---

# 108. Save System

游戏必须支持：

```text
Save
Load
Auto Save
```

数据存储：

```text
IndexedDB
```

保存：

```text
玩家位置
玩家状态
背包
装备
任务
世界时间
天气
基地
容器
Loot 状态
车辆
敌人关键状态
世界事件
```

---

# 109. 自动保存

触发：

```text
每 3 分钟
睡眠
退出
重要事件
```

保存过程：

不得造成明显卡顿。

使用：

```text
异步写入
```

---

# 110. 数据驱动设计

物品、武器、食物、敌人等：

必须配置化。

例如：

```text
src/data/items/
src/data/weapons/
src/data/enemies/
src/data/recipes/
src/data/loot/
```

禁止：

在逻辑代码里硬编码几十种物品。

---

# 111. 项目架构

推荐目录：

```text
src/
├─ core/
│  ├─ Game.ts
│  ├─ Engine.ts
│  ├─ EventBus.ts
│  ├─ GameLoop.ts
│  └─ Config.ts
│
├─ world/
│  ├─ World.ts
│  ├─ WorldGenerator.ts
│  ├─ TerrainSystem.ts
│  ├─ ChunkManager.ts
│  ├─ BiomeSystem.ts
│  ├─ WeatherSystem.ts
│  ├─ TimeSystem.ts
│  └─ WorldStreamer.ts
│
├─ rendering/
│  ├─ LightingManager.ts
│  ├─ PostProcessManager.ts
│  ├─ MaterialFactory.ts
│  ├─ ProceduralTextureFactory.ts
│  ├─ VegetationRenderer.ts
│  ├─ DecalManager.ts
│  └─ LODManager.ts
│
├─ player/
│  ├─ Player.ts
│  ├─ PlayerController.ts
│  ├─ PlayerCamera.ts
│  ├─ PlayerStats.ts
│  ├─ PlayerHealth.ts
│  └─ PlayerInteraction.ts
│
├─ inventory/
│  ├─ Inventory.ts
│  ├─ Item.ts
│  ├─ Equipment.ts
│  ├─ Container.ts
│  └─ InventoryGrid.ts
│
├─ combat/
│  ├─ Weapon.ts
│  ├─ Firearm.ts
│  ├─ Ballistics.ts
│  ├─ DamageSystem.ts
│  ├─ ArmorSystem.ts
│  └─ RecoilSystem.ts
│
├─ ai/
│  ├─ AIController.ts
│  ├─ AISenses.ts
│  ├─ NoiseSystem.ts
│  ├─ ZombieAI.ts
│  ├─ AnimalAI.ts
│  └─ RaiderAI.ts
│
├─ survival/
│  ├─ HungerSystem.ts
│  ├─ HydrationSystem.ts
│  ├─ TemperatureSystem.ts
│  ├─ MedicalSystem.ts
│  └─ FatigueSystem.ts
│
├─ crafting/
│  ├─ CraftingSystem.ts
│  ├─ Recipe.ts
│  └─ Workbench.ts
│
├─ building/
│  ├─ BuildingSystem.ts
│  ├─ BuildingPiece.ts
│  ├─ SnapSystem.ts
│  └─ PowerSystem.ts
│
├─ vehicle/
│  ├─ Vehicle.ts
│  ├─ VehicleController.ts
│  └─ VehicleDamage.ts
│
├─ audio/
│  ├─ AudioManager.ts
│  ├─ AmbientAudio.ts
│  └─ ProceduralAudio.ts
│
├─ ui/
│  ├─ HUD.ts
│  ├─ InventoryUI.ts
│  ├─ MenuUI.ts
│  ├─ SettingsUI.ts
│  └─ MapUI.ts
│
├─ save/
│  ├─ SaveSystem.ts
│  └─ SaveSchema.ts
│
├─ data/
│  ├─ items/
│  ├─ weapons/
│  ├─ loot/
│  ├─ enemies/
│  └─ recipes/
│
└─ main.ts
```

---

# 112. Event Bus

大型系统禁止互相乱引用。

建立：

```text
EventBus
```

事件例如：

```text
PLAYER_DAMAGED
PLAYER_DIED
ITEM_PICKED
WEAPON_FIRED
NOISE_CREATED
WEATHER_CHANGED
TIME_CHANGED
ENEMY_KILLED
BUILDING_PLACED
```

---

# 113. Object Pool

以下对象使用对象池：

```text
子弹
弹壳
血液粒子
雨滴
枪口火焰
弹孔
伤害数字（如果存在）
临时特效
```

避免频繁：

```text
new / dispose
```

---

# 114. Chunk Streaming

世界必须支持动态加载。

例如：

```text
玩家所在 Chunk
+
周围 2~3 层 Chunk
```

加载。

远处：

卸载。

Chunk 数据：

```text
Terrain
Buildings
Vegetation
Loot
Enemies
Props
```

分开管理。

---

# 115. 性能目标

目标硬件：

```text
RTX 3060 / RX 6600
16GB RAM
1080p
```

High：

```text
60 FPS
```

最低合理配置：

```text
GTX 1660
```

Medium：

目标：

```text
45-60 FPS
```

---

# 116. 性能预算

同时活动：

```text
感染者 <= 40
动物 <= 20
人类 AI <= 12
```

附近高精度植被：

约：

```text
20,000 - 80,000 instances
```

通过 GPU Instancing。

Draw Calls：

理想：

```text
< 1500
```

尽量：

```text
< 800
```

---

# 117. AI LOD

远距离 AI：

不执行完整逻辑。

例如：

```text
0-80m:
完整 AI

80-200m:
简化 AI

200m+:
模拟状态
```

---

# 118. Physics LOD

远距离对象：

关闭：

```text
RigidBody
Collision
```

仅玩家附近：

启用物理。

---

# 119. 设置菜单

图形：

```text
Resolution Scale
Texture Quality
Shadow Quality
Shadow Distance
Vegetation Density
View Distance
SSAO
Bloom
Fog
Reflection
Anti Aliasing
```

---

# 120. 控制设置

支持：

```text
Mouse Sensitivity
ADS Sensitivity
Invert Y
Key Bindings
Toggle Crouch
Toggle Aim
```

---

# 121. 音频设置

```text
Master
Music
Environment
Effects
UI
```

---

# 122. 可访问性

至少实现：

```text
字幕
字幕大小
准星大小
FOV
Head Bob
Camera Shake
色弱辅助基础选项
```

---

# 123. 主菜单

主菜单：

```text
ASHFALL PROTOCOL

CONTINUE
NEW GAME
LOAD GAME
SETTINGS
CREDITS
```

背景：

实时渲染游戏场景。

例如：

```text
雨夜废弃加油站
```

---

# 124. 新游戏

允许设置：

```text
Difficulty
World Seed
Day Length
Loot Amount
Enemy Density
Permadeath
```

---

# 125. 难度

## Survivor

较简单。

## Standard

默认。

## Hardcore

资源稀少。

伤害高。

疾病严重。

## Ashfall

极端硬核。

---

# 126. 死亡

普通模式：

死亡后：

掉落背包。

玩家在安全点重生。

Hardcore：

可配置：

```text
Permadeath
```

---

# 127. 安全屋

玩家可以：

占领部分建筑。

通过：

```text
清理敌人
封门
放置床
```

设为安全屋。

---

# 128. 世界故事

剧情不通过：

大量过场动画。

而通过：

```text
文件
电脑
广播
录音
环境
尸体
军方记录
研究资料
```

展现。

---

# 129. Environmental Storytelling

例如：

医院：

```text
封锁病房
血迹
临时手术室
大量尸袋
军方弹壳
```

玩家自然推测：

这里曾发生什么。

---

# 130. 游戏目标

玩家可以只生存。

但存在主线秘密：

逐步调查：

```text
Ashfall Protocol
```

最终发现：

Greyvale 并不是事故。

而是：

一个失败的生物适应性实验区域。

“灰烬协议”的目标也并不是救援。

而是：

```text
彻底销毁实验痕迹
```

---

# 131. 长期玩法

主线结束后：

世界继续运行。

玩家可以：

```text
建设基地
收集装备
探索地点
挑战高危区域
完善车辆
狩猎
生存
```

---

# 132. 动态难度

不要简单随着等级：

提高敌人血量。

危险度根据：

```text
地点
时间
天气
噪音
玩家行为
```

变化。

---

# 133. 区域危险等级

```text
Tier 1
Tier 2
Tier 3
Tier 4
Tier 5
```

越危险：

资源越好。

---

# 134. POI 系统

至少生成：

```text
50+
```

兴趣点。

包含：

```text
民宅
农场
猎人营地
军事检查站
汽车旅馆
加油站
仓库
废弃营地
通信塔
地下室
小型掩体
事故现场
```

---

# 135. 随机建筑内部

建筑室内：

使用：

```text
Room Template
+
Furniture Spawn Rules
```

随机布置。

避免：

每栋房子完全一样。

---

# 136. Shader

至少创建：

```text
Vegetation Wind Shader
Water Shader
Wet Surface Shader
Damage Overlay Shader
Fog Shader
```

---

# 137. 水面

湖泊与河流：

必须拥有：

```text
反射
法线波浪
Fresnel
深度颜色
岸边透明变化
```

玩家：

可以游泳。

---

# 138. 水下

水下：

```text
Color Shift
Fog
Audio Lowpass
Reduced Visibility
```

---

# 139. 火

篝火：

包含：

```text
Particle
Light
Heat
Sound
Smoke
```

火焰动态：

轻微改变 Point Light。

---

# 140. 血液效果

受到攻击：

可以：

```text
Blood Particle
Blood Decal
Weapon Blood
```

但避免：

廉价夸张喷泉效果。

---

# 141. 尸体

尸体存在时间：

根据距离管理。

远距离：

自动转为：

```text
简单状态
```

避免大量物理尸体长期存在。

---

# 142. 调试系统

开发模式：

按：

```text
F3
```

显示：

```text
FPS
Frame Time
Draw Calls
Triangles
Active AI
Loaded Chunks
Physics Bodies
Memory
Player Position
World Time
```

---

# 143. Developer Console

按：

```text
`
```

打开开发控制台。

命令例如：

```text
god
give item
spawn zombie
spawn animal
weather rain
time 22
teleport
killall
fps
```

生产模式：

默认关闭作弊功能。

---

# 144. 错误处理

任何系统错误：

不能直接导致整个游戏崩溃。

实现：

```text
ErrorBoundary
SafeFallback
```

例如：

资源加载失败：

使用程序化替代资源。

Shader 编译失败：

回退基础材质。

WebGPU 初始化失败：

切 WebGL2。

---

# 145. Loading Screen

加载：

显示：

```text
加载进度
当前阶段
随机生存提示
```

阶段：

```text
Initializing Engine
Generating World
Building Terrain
Loading Materials
Generating Vegetation
Spawning World
```

---

# 146. 首次启动

第一次进入游戏：

不要下载数 GB 内容。

核心包控制在合理范围。

大量环境内容：

通过：

```text
程序生成
```

降低资源体积。

---

# 147. 代码质量要求

必须：

```text
TypeScript strict
```

禁止：

```text
大量 any
```

禁止：

```text
一个 Game.ts 10000 行
```

每个系统：

独立模块。

---

# 148. 注释

注释：

解释：

```text
为什么这么做
复杂算法
性能优化
```

不要写：

```ts
// increase health
health++;
```

这种人类看了也只能怀疑自己为什么点开源码的注释。

---

# 149. 测试

至少编写单元测试：

```text
Inventory
Item Stack
Damage
Loot Generation
Save Serialization
Crafting
Player Stats
World Seed
```

---

# 150. 自动检查

必须保证：

```bash
npm install
npm run build
npm run test
npm run lint
```

可以成功执行。

---

# 151. 游戏启动

开发：

```bash
npm install
npm run dev
```

然后浏览器打开：

```text
http://localhost:5173
```

即可游戏。

不得要求：

```text
Unity
Unreal
Blender
数据库
Docker
额外后端
```

才能运行。

---

# 152. Offline First

游戏主体：

必须可以：

```text
纯客户端运行
```

无需服务器。

后续多人模式：

另行扩展。

---

# 153. 第一阶段必须真正完成的玩法

最终版本至少需要实现以下可玩链路：

```text
启动游戏
↓
创建世界
↓
进入第一人称角色
↓
探索森林
↓
进入建筑
↓
搜索物资
↓
获得食物
↓
获得饮水
↓
使用背包
↓
装备物品
↓
制作工具
↓
遭遇感染者
↓
近战战斗
↓
获取枪械
↓
枪械战斗
↓
受伤
↓
治疗
↓
狩猎动物
↓
烹饪
↓
天黑
↓
使用手电
↓
建立篝火
↓
建造营地
↓
睡觉
↓
保存
↓
重新加载继续
```

如果这些链路无法完整进行：

则项目不能算完成。

---

# 154. Minimum Content Requirement

至少提供：

```text
30+ Items
8+ Weapons
5+ Firearms
8+ Foods
5+ Drinks
8+ Medical Items
20+ Recipes
5+ Clothing
3+ Armor
5+ Enemy Types
3+ Animals
10+ Building Pieces
20+ Loot Container Types
30+ Building Interiors
50+ POI
```

---

# 155. 武器初始内容

例如：

```text
Improvised Knife
Hatchet
Crowbar
Wood Spear

9mm Pistol
.45 Pistol
Pump Shotgun
Civilian Rifle
Military Rifle
```

名称必须原创。

不要直接使用现实商业品牌。

---

# 156. 物品示例

食物：

```text
Canned Beans
Canned Meat
Energy Bar
Crackers
Rice
Raw Meat
Cooked Meat
Mushroom
```

饮料：

```text
Water Bottle
Soda
Energy Drink
Dirty Water
Boiled Water
```

医疗：

```text
Rag
Bandage
Tourniquet
Painkiller
Antibiotics
Disinfectant
Splint
First Aid Kit
```

---

# 157. 随机世界种子

World Seed 影响：

```text
Terrain
Vegetation
Weather Seed
Loot
POI variation
```

同 Seed：

生成相同基础世界。

---

# 158. 环境随机细节

每次世界创建：

建筑内部：

略有变化。

例如：

```text
家具
垃圾
Loot
血迹
门状态
敌人
```

---

# 159. 游戏反馈

玩家执行动作必须有反馈。

例如：

捡东西：

```text
Sound
UI Notification
Animation
```

开箱：

```text
Animation
Sound
UI
```

开枪：

```text
Recoil
Muzzle Flash
Smoke
Shell
Sound
Light
Impact
```

---

# 160. Micro Detail

高品质来自大量微小细节。

必须主动增加：

```text
灰尘粒子
风吹纸张
灯光闪烁
电线摆动
远处鸟群
昆虫
水滴
室内灰尘
火花
烟雾
破布摆动
道路落叶
```

这些系统：

根据距离动态启停。

---

# 161. Ambient Events

例如：

```text
远处枪声
狼叫
雷鸣
飞机飞过
建筑倒塌声
感染者尖叫
广播干扰
```

让世界感觉：

即使玩家不行动：

世界仍然存在。

---

# 162. Immersion Rules

禁止：

```text
敌人凭空出现在玩家面前
物品明显 Pop-in
天气瞬间变化
太阳突然跳动
AI 穿墙
枪械无后坐力
夜晚像白天
房间空空荡荡
树林只有三种树
```

---

# 163. 世界状态

World State 持续记录：

```text
时间
天气
清理区域
已开启容器
破坏建筑
玩家基地
车辆位置
重要敌人
事件
```

---

# 164. 随机事件调度器

建立：

```text
WorldEventDirector
```

根据：

```text
玩家位置
游戏时间
危险区域
近期事件
```

生成事件。

避免：

连续疯狂触发。

必须存在：

```text
Cooldown
```

---

# 165. Director System

实现简单：

```text
Game Director
```

观察：

```text
玩家健康
弹药
敌人数量
最近战斗
探索时间
```

然后调整：

```text
环境事件
敌人活动
```

目的：

营造节奏。

不是作弊。

---

# 166. 新手设计

不要大量教程弹窗。

通过：

```text
环境
简短提示
初始物品
```

教学。

例如：

玩家第一次流血：

提示：

```text
You are bleeding.
Use a bandage.
```

随后不再重复。

---

# 167. 首小时体验

前 60 分钟推荐节奏：

```text
0-10min
探索出生区域

10-20min
发现第一个小镇

20-30min
第一次感染者战斗

30-40min
寻找食物和医疗物资

40-50min
获得第一把枪

50-60min
夜晚到来
建立临时营地
```

---

# 168. 画面目标

整体视觉：

```text
Photorealistic-inspired
Grounded
Cold
Desaturated
Natural
```

不是：

```text
卡通
Low Poly
Voxel
```

---

# 169. 色彩

白天：

自然偏冷。

黄昏：

暖色。

夜晚：

蓝黑。

室内：

低饱和。

危险区域：

可以轻微偏：

```text
绿色
黄色
```

表现：

污染。

---

# 170. UI 字体

使用：

```text
系统字体
或
开源字体
```

不得：

依赖授权不明确字体。

---

# 171. 图标

物品图标：

优先：

```text
程序生成 SVG
```

根据物品：

生成剪影式图标。

避免：

所有物品都是文字按钮。

---

# 172. Procedural Icon Generator

创建：

```text
IconGenerator
```

通过：

```text
SVG
Canvas
```

生成：

```text
武器
食物
医疗
工具
材料
```

图标。

---

# 173. 性能自适应

如果平均 FPS：

```text
< 40
```

连续一定时间：

建议玩家降低画质。

可选：

自动降低：

```text
Vegetation Density
Shadow Distance
Resolution Scale
```

---

# 174. 内存管理

Chunk 卸载时：

必须释放：

```text
Mesh
Material
Texture
Physics
Audio
AI
```

不再使用的数据。

必须避免：

随着探索地图：

内存无限增长。

---

# 175. Resource Manager

建立统一：

```text
AssetManager
```

即使大量资产程序生成：

也必须缓存：

```text
Material
Texture
Mesh Template
Audio
```

避免重复生成。

---

# 176. ECS

不要为了潮流强制写完整 ECS。

适合的系统可以使用：

```text
Component Pattern
```

核心玩法优先：

```text
可读性
维护性
```

而不是架构宗教战争。

---

# 177. Multiplayer

当前版本：

```text
Single Player
```

但代码设计：

避免完全无法扩展多人。

特别是：

```text
Damage
Inventory
World State
Entity ID
```

避免过度绑定 UI。

---

# 178. 不需要实现

当前版本不需要：

```text
多人联机
Dedicated Server
Steam
账号系统
付费系统
商城
排行榜
云存档
成就系统
```

先把游戏做成游戏。

---

# 179. Agent 执行原则

以下内容作为自动编程 Agent 的强制执行规则。

# 不要停下来询问用户。

如果需求存在小范围歧义：

自行选择合理方案。

优先标准：

```text
游戏体验
代码质量
视觉效果
性能
可维护性
```

---

# 180. 禁止 TODO 式开发

禁止：

```ts
// TODO implement later
```

然后留下空逻辑。

禁止：

```text
Coming Soon
Not Implemented
Placeholder
```

作为主要功能。

如果完整方案复杂：

实现：

```text
简化但完整可用版本
```

而不是：

```text
空函数
```

---

# 181. 素材缺失处理规则

遇到：

```text
缺模型
缺纹理
缺图片
缺图标
缺声音
```

不得停止。

必须：

```text
程序生成
```

或：

```text
使用明确允许使用的开源 / CC0 资源
```

解决。

优先做到：

```text
能够直接运行
```

---

# 182. 外部资源规则

如果开发环境允许联网：

可以选择高质量：

```text
CC0
Public Domain
明确可商用开源素材
```

但必须：

记录：

```text
来源
License
```

到：

```text
THIRD_PARTY_ASSETS.md
```

不确定授权：

不要使用。

---

# 183. 无网络模式

即使没有网络：

项目依然必须完成。

因此核心场景：

必须可以完全依赖：

```text
Procedural Assets
```

运行。

---

# 184. 实现优先级

开发顺序：

## P0

```text
项目启动
渲染
玩家
相机
世界
地形
Chunk
碰撞
```

## P1

```text
Inventory
Items
Loot
Interaction
```

## P2

```text
AI
Combat
Weapons
Damage
```

## P3

```text
Survival
Medical
Food
Water
```

## P4

```text
Crafting
Building
Camp
```

## P5

```text
Weather
DayNight
Lighting
PostFX
```

## P6

```text
Animals
Hunting
Cooking
```

## P7

```text
Vehicles
POI
Story
Dynamic Events
```

## P8

```text
Optimization
Polish
Testing
```

---

# 185. 但最终任务必须一次完成

上述优先级：

只是内部实现顺序。

Agent 不得：

做到 P2 就结束。

必须一直执行：

直到整个可交付版本：

完成。

---

# 186. 每个阶段完成条件

任何功能必须满足：

```text
可以触发
可以操作
有反馈
有状态变化
能够保存
不会明显报错
```

才能算完成。

---

# 187. 视觉验收

最终场景至少达到：

森林白天：

```text
动态植被
阳光阴影
雾
PBR
环境细节
远景
```

城市黄昏：

```text
暖色阳光
长阴影
废墟
车辆
垃圾
室内暗部
```

雨夜：

```text
雨
湿地
反射
手电
雾
灯光
```

室内：

```text
黑暗
局部灯
阴影
家具
杂物
```

---

# 188. 战斗验收

枪械必须具有：

```text
Fire
ADS
Reload
Ammo
Recoil
Projectile
Damage
Impact
Audio
Muzzle Flash
Shell
```

近战必须具有：

```text
Swing
Hit Detection
Damage
Stamina
Impact
```

---

# 189. AI 验收

感染者必须：

```text
可以闲逛
可以听见声音
可以看见玩家
可以追逐
可以攻击
会丢失目标
会搜索
会死亡
```

人类 AI：

至少：

```text
射击
寻找掩体
追击
```

---

# 190. 生存验收

玩家：

```text
长时间不喝水
→ 脱水
→ 状态下降
→ 最终死亡
```

```text
受伤
→ 流血
→ 使用绷带
→ 停止流血
```

```text
下雨
→ 衣物湿
→ 体温下降
```

这些链路：

必须实际工作。

---

# 191. 建造验收

玩家能够：

```text
收集木材
↓
制作建筑材料
↓
放置地基
↓
放墙
↓
放门
↓
放屋顶
↓
放箱子
↓
放床
```

重新加载后：

基地仍然存在。

---

# 192. Save 验收

保存后退出浏览器。

再次打开：

```text
玩家位置
装备
背包
基地
时间
车辆
关键世界状态
```

正确恢复。

---

# 193. 高品质细节验收

最终世界中：

不能出现明显：

```text
大片空旷地形
无家具房间
纯色建筑
重复树阵
完全静态环境
无光影变化
```

---

# 194. 优化验收

运行：

至少持续：

```text
30 分钟
```

不断：

```text
探索
战斗
加载 Chunk
卸载 Chunk
```

不能出现：

```text
明显持续内存泄漏
FPS 持续下降
大量 console error
```

---

# 195. Console 要求

正式运行：

Console 中：

不得充满：

```text
Error
Warning
Missing Asset
Shader Failure
Unhandled Promise
```

无法避免的降级：

仅记录一次。

---

# 196. README

最终必须生成：

```text
README.md
```

包含：

```text
项目说明
安装
启动
操作方式
技术架构
画质设置
系统要求
游戏玩法
```

---

# 197. DEVELOPMENT.md

生成：

```text
DEVELOPMENT.md
```

包含：

```text
项目架构
核心系统
扩展方法
调试方式
性能说明
```

---

# 198. LICENSE / ATTRIBUTION

如果使用外部资源：

生成：

```text
THIRD_PARTY_ASSETS.md
```

详细记录：

```text
Asset
Source
Author
License
```

---

# 199. 最终交付

项目目录必须完整。

最终执行：

```bash
npm install
npm run test
npm run lint
npm run build
```

全部通过。

---

# 200. 最终运行检查

必须实际启动项目并检查：

```text
主菜单能够打开
New Game 可用
世界成功生成
玩家可移动
地面碰撞正常
建筑可进入
Loot 可拾取
Inventory 可操作
敌人可战斗
枪械可使用
天气工作
昼夜工作
生存系统工作
建造工作
保存工作
读取工作
```

---

# 201. Bug 修复规则

最终阶段：

主动测试并修复：

```text
卡墙
穿地
掉出地图
无限物品
重复 Loot
AI 卡死
无限子弹
存档异常
UI 错位
Chunk 裂缝
内存泄漏
```

禁止：

明知存在核心 Bug：

仍然宣布完成。

---

# 202. 完成定义

只有当玩家能够：

> 从出生开始，在一个拥有天气、昼夜、森林、建筑、敌人、动物、资源、武器、生存状态和动态光照的开放世界中连续游玩，并完成探索、搜刮、战斗、生存、医疗、制作、建造、狩猎、烹饪和存档读取完整循环，

项目才算：

# DONE

---

# 203. 最终 Goal Mode 指令

执行本项目时：

```text
你是该项目的首席游戏程序员、技术美术、关卡设计师、玩法设计师、UI 设计师和 QA。

你的目标不是生成规划，而是完成整个游戏项目。

直接操作代码仓库。

自行创建所有必要文件。

自行安装合理依赖。

自行设计缺失内容。

自行解决美术素材。

自行生成程序化模型、纹理、UI 图标和环境素材。

自行运行项目。

自行检查浏览器运行效果。

自行修复编译错误、运行错误和玩法问题。

自行优化性能。

不要因为任务量大而只交付 Demo。

不要询问用户应该如何处理普通技术决策。

不要留下 TODO。

不要用静态假界面代替真实游戏逻辑。

不要使用空实现冒充系统完成。

任何复杂功能如果无法做到理想方案，应实现一个完整、稳定、可玩的简化方案，而不是删除该功能。

所有核心系统必须真正互相连接。

Inventory 中取得的武器必须能够装备。

装备的武器必须能够攻击。

攻击必须对 AI 造成 Damage。

Damage 必须能够导致 Bleeding / Death 等状态。

Loot 必须来自世界 Container。

Container 状态必须可以保存。

建造结果必须进入 Save System。

天气必须影响视觉和玩家状态。

时间必须影响太阳、天空和夜间环境。

声音必须能够被 AI Hearing System 感知。

不同系统之间禁止成为互不关联的技术 Demo。

持续开发、运行、测试、修复，直到达到本文档定义的 DONE 标准。
```

---

# 204. 额外强化目标

如果基础版本已经稳定：

继续主动增加以下细节。

```text
枪械检查动画
呼吸效果
冷空气呼气
雨滴落在武器表面
镜头雨滴
泥地脚印
雪/泥表面痕迹
子弹穿透
不同材质弹孔
室内声音混响
雷电瞬时动态光
远处闪电
动物足迹
血迹追踪
夜间昆虫
风吹门
摆动路牌
破损灯管闪烁
汽车灯光
远处城市火灾
烟柱
鸟群惊飞
感染者撞门
敌人翻越障碍
森林落叶
水面漂浮物
```

但强化细节不得牺牲：

```text
稳定性
FPS
核心玩法
```

---

# 205. WebGPU 高级效果

如果当前设备支持 WebGPU：

优先启用：

```text
更高质量阴影
更高植被密度
GPU Particles
高级水面
更高 SSAO
更远 Draw Distance
更高 Resolution Scale
```

WebGL2：

自动降低部分效果。

---

# 206. 推荐高级实现

可以根据 Babylon.js 当前能力选择性使用：

```text
Node Material
GPU Particle System
Thin Instances
Cascaded Shadow Generator
Environment Texture
PBRMaterial
Physics V2
WebGPU Compute
```

但：

如果高级能力引起兼容问题：

优先稳定。

---

# 207. Final Polish Pass

全部系统完成后：

必须进行专门的：

# Polish Pass

依次检查：

```text
Lighting
Materials
Environment Density
Animations
Audio
UI
Feedback
Particles
Camera
Weapon Feel
AI
Performance
```

每一项：

主动改善明显粗糙部分。

---

# 208. Screenshot Quality Standard

最终游戏任意正常场景截图：

不能让人第一眼认为：

```text
这是一个程序员 Demo
```

而应该至少具有：

```text
完整游戏
独立游戏
高品质 Web 游戏
```

的视觉观感。

---

# 209. 最终核心原则

整个项目始终遵循：

```text
Playable > Paper Design

Complete > Perfect

Polished > Feature Spam

Atmosphere > UI Clutter

System Interaction > Isolated Features

Procedural Quality > Missing Assets

Performance > Pointless Complexity
```

最终产品目标：

# 在浏览器里做出一款真正能玩的硬核开放世界生存游戏，而不是一张会走路的技术演示地图。

游戏名称：

# ASHFALL PROTOCOL

中文：

# 灰烬协议
