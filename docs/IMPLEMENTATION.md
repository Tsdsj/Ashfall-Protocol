# Ashfall Protocol Implementation Plan

**Goal:** 完整连接并验证 goal.md 的单人开放世界生存循环。
**Architecture:** 数据驱动、纯 TypeScript 模拟内核，Babylon 渲染视图，独立 DOM 界面与 IndexedDB 存档。稳定种子生成 4096m 世界、256m 分块；角色和 AI 使用确定性的碰撞与射线，避免高成本全场景刚体模拟。
**Tech Stack:** Vite, TypeScript strict, Babylon.js, WebGPU/WebGL2, Web Audio, IndexedDB, Vitest, ESLint。

用户已授权直接实现及常规自主决策，按批次执行与验收，无设计审批等待。保留原规格，不通过缩减原文改写完成标准。

- [x] 数据与状态：物品、武器、配方、POI、网格背包、装备、存档 schema 与回归测试。
- [x] 世界：地形、分块、原创程序化 PBR、植被、建筑内外、容器、道路、湖泊、地标。
- [x] 角色与模拟：移动碰撞、姿态、噪音、AI、弹道、受伤、生存、天气、昼夜。
- [x] 可玩系统：制作、烹饪、基地、电力、农业、狩猎、交易、车辆、剧情与撤离。
- [x] 表现与交互：第一人称武器、粒子、空间音频、菜单、背包、地图、日志、设置。
- [x] 验收：单元测试、lint、build、真实浏览器操作、存档重载、视觉打磨、持续运行检查。

验收证据与精简实现边界记录在 docs/ACCEPTANCE.md。完成勾选只依据实际证据。
