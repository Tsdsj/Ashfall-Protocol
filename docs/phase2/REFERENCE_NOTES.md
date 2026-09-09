# 参考研究与项目决策

只采用通用方法，不复制他人角色、动画、关卡、剧情、参数或实现代码。

## 第一人称与动作

- [David Therriault, In Your Hands, GDC 2015](https://media.gdcvault.com/gdc2015/presentations/Therriault_David_InYourHands.pdf)：将操作、全身姿态、武器与机械部件、瞄准和 IK 分层处理；使用手部约束保持接触。资料中的脚部约束还用于保持叠加姿态时的地面接触。用于本项目的判断：准星与鼠标输入保持直接关联，惯性施加在武器和身体；双手、机械零件与腿部分别控制，不让一个整体摆动代替全部动作。
- [Epic Games, Blend Spaces](https://dev.epicgames.com/documentation/en-us/unreal-engine/blend-spaces-in-unreal-engine)：使用速度与方向等参数混合姿态，并控制输入或权重的变化。用于本项目的判断：以实际速度、接地位移、姿态、体力和状态驱动权重，保留独立的动作事件层。

本项目继续使用 Babylon 与 TypeScript；没有引入 Unreal 或资料中的商业引擎代码。数值按当前角色尺度与浏览器体验重新调校。

## 已验证的原始缺口

当前版本 14 点生存链路与 12 点主线 / 系统链路通过，但逐帧采样显示：移动从 0 在一帧变为 3.7 m/s；冲刺直接变为 6.3 m/s；松手一帧归零；蹲下眼高从 1.68 m 一帧变为 1.06 m；冲刺武器 roll 从 0 一帧变为 0.14 rad。向下观察时没有胸部、腿或脚。

证据：`evidence/baseline-motion.json`、`screenshots/baseline-body.png`、`evidence/baseline-survival.json`、`evidence/baseline-story.json`。

代码同时确认：旧角色主要靠整体四肢正弦摆动，死亡直接赋固定角度；旧搜刮即时打开列表，主线尚未包含四幕结构、三结局或引擎内过场。这些是本轮需要完成的改动，不视为第一阶段通过就已满足第二阶段。
