import { endingCopy } from "./narrative-view";
import type { GameSettings, WorldState } from "../core/types";
import { DEFAULT_SETTINGS, DIFFICULTIES } from "../simulation/state";
import type { SaveEntry } from "../save/storage";
import { icon, logo, escapeHtml } from "./icons";
export function brand() {
  return `<div class="brand">${logo}<span class="brand-name">ASHFALL PROTOCOL</span></div>`;
}
export function mainMenu(hasSave: boolean, backend: string): string {
  return `<div class="menu"><div class="menu-top">${brand()}<div class="world-status"><i class="status-dot"></i><span>GREYVALE · 2037</span></div></div><div class="menu-main"><div class="menu-kicker">封锁线内，仍有生命。</div><h1 class="game-title">ASHFALL<span>PROTOCOL</span></h1><div class="chinese-title">灰烬协议</div><p class="menu-description">一张提前盖章的空车回执。<br>一座仍有人活着的封锁谷地。<br>在灰谷，活下去是你自己的协议。</p><nav class="menu-nav" aria-label="游戏主菜单">${hasSave ? '<button class="primary" data-action="continue"><span>▸</span>继续生存<span class="arrow">↗</span></button>' : ""}<button class="${hasSave ? "" : "primary"}" data-action="new-game"><span>${hasSave ? "01" : "▸"}</span>进入灰谷<span class="arrow">↗</span></button><button data-action="load-menu"><span>02</span>读取记录</button><button data-action="settings"><span>03</span>设置</button><button data-action="credits"><span>04</span>关于灰烬协议</button></nav></div><div class="scene-caption"><strong>松谷镇 · 林务站</strong><div class="caption-line"></div><p>2037 年 10 月 · 紧急封锁期间<br>北纬 47° 16′ · 东经 08° 31′</p></div><footer class="menu-footer"><span>单人生存 · 本地存档 · 键盘与鼠标</span><span class="build-tag">${backend} / 1.0 · GREYVALE ARCHIVE</span></footer></div>`;
}
export function newGameView(): string {
  return `<div class="screen-shade"><form id="new-world-form" class="form-dialog"><div class="dialog-header"><h2>进入灰谷</h2><button type="button" class="quiet" data-action="back-menu" aria-label="返回主菜单">×</button></div><div class="form-field"><label for="world-name">生存记录名称</label><input id="world-name" name="name" maxlength="40" value="我的灰谷记录" required autocomplete="off"/></div><div class="form-field"><label for="world-seed">世界种子</label><div style="display:flex;gap:8px"><input id="world-seed" name="seed" maxlength="48" value="GREYVALE-2037" style="flex:1;min-width:0" required autocomplete="off"/><button type="button" class="secondary" data-action="random-seed">随机生成</button></div><p class="field-help">相同种子会生成相同的地形与初始物资。</p></div><div class="form-field"><label for="difficulty">生存难度</label><select id="difficulty" name="difficulty">${Object.entries(
    DIFFICULTIES,
  )
    .map(
      ([id, d]) =>
        `<option value="${id}" ${id === "standard" ? "selected" : ""}>${d.name}</option>`,
    )
    .join(
      "",
    )}</select><p id="difficulty-description" class="difficulty-description">${DIFFICULTIES.standard.description}</p></div><details class="world-options"><summary>世界规则</summary><div class="form-field" style="margin-top:18px"><label for="day-length">一天的现实长度</label><select id="day-length" name="dayLength"><option value="30">30 分钟 · 快节奏</option><option value="60" selected>60 分钟 · 标准</option><option value="90">90 分钟 · 慢节奏</option></select></div><div class="form-field"><label for="loot-amount">物资数量</label><select id="loot-amount" name="lootAmount"><option value="0.65">稀少</option><option value="1" selected>标准</option><option value="1.5">丰富</option></select></div><div class="form-field"><label for="enemy-density">敌人密度</label><select id="enemy-density" name="enemyDensity"><option value="0.6">较少</option><option value="1" selected>标准</option><option value="1.5">密集</option></select></div><label style="display:flex;align-items:center;gap:12px"><input name="permadeath" type="checkbox"/>只有一次生命（灰烬难度强制开启）</label></details><label class="field-help" style="display:flex;gap:10px;align-items:center;margin-top:16px"><input type="checkbox" name="creative"/> 创造练习：可飞行、自由取物、无限体力与免材料建造</label><div class="divider"></div><p class="field-help">你是补运车的随车维修员。26名居民尚未接到，空车回执却已盖章。先去林务站活下来，再到诊所查清名单。</p><div class="dialog-actions"><button type="button" class="secondary" data-action="back-menu">返回</button><button type="submit" class="primary">生成世界并开始</button></div></form></div>`;
}
export function loadingView(stage: string, percent: number) {
  return `<div class="loading"><div class="loading-content">${brand()}<h2>正在进入灰谷</h2><div class="load-track"><i style="width:${percent}%"></i></div><div class="load-meta"><span>${stage}</span><span class="mono">${percent}%</span></div><p class="load-tip">生存提示：枪声可以解决眼前的威胁，也会把更远的感染者带到你面前。</p></div></div>`;
}
export function pauseView(state: WorldState): string {
  return `<div class="screen-shade"><div class="pause-content">${brand()}<h2>稍作停留</h2><div class="pause-buttons"><button class="primary" data-action="resume">继续探索</button><button data-action="save">保存生存记录</button><button data-action="load-menu">读取记录</button><button data-action="settings">设置</button><button class="secondary" data-action="save-menu">保存并返回主菜单</button></div><p class="pause-meta">第 ${state.day} 天 · 已探索 ${state.discovered.length} 处地点<br>暂停期间，灰谷的时间停止流动。</p></div></div>`;
}
export function settingsView(s: GameSettings): string {
  const range = (
    key: keyof GameSettings,
    label: string,
    min: number,
    max: number,
    step: number,
    description = "",
  ) =>
    `<div class="setting-row"><label for="setting-${key}">${label}${description ? `<small>${description}</small>` : ""}</label><div class="range-control"><input id="setting-${key}" data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}"/><output>${Number(s[key]).toFixed(step < 1 ? 2 : 0)}</output></div></div>`;
  const toggle = (key: keyof GameSettings, label: string) =>
    `<div class="setting-row"><label for="setting-${key}">${label}</label><input id="setting-${key}" type="checkbox" data-setting="${key}" ${s[key] ? "checked" : ""}/></div>`;
  const controls: Record<string, string> = {
    forward: "前进",
    backward: "后退",
    left: "左移",
    right: "右移",
    interact: "交互",
    sprint: "冲刺",
    walk: "慢行",
    jump: "跳跃",
    crouch: "蹲下",
    prone: "趴下",
    inventory: "背包",
    crafting: "制作",
    building: "建造",
    map: "地图",
    journal: "日志",
    reload: "换弹 / 清障",
    flashlight: "手电",
    grenade: "投掷",
    leanLeft: "向左侧身",
    leanRight: "向右侧身",
    flight: "创造模式飞行",
    performance: "性能面板",
    displayDiagnostic: "轻载节拍检测",
    skipSequence: "跳过叙事",
  };
  return `<div class="settings-layout"><div class="panel-title"><div><h2>按你的方式生存</h2><p>设置自动保存在当前浏览器。图形质量调整立即生效。</p></div><button class="secondary" data-action="reset-settings">恢复默认</button></div><section class="settings-section"><h3>画面</h3><div><div class="setting-row"><label for="quality">图形质量<small>影响阴影、植被密度与后处理</small></label><select id="quality" data-setting="quality">${[
    ["low", "低 · 性能优先"],
    ["medium", "中 · 均衡"],
    ["high", "高 · 丰富光影"],
    ["ultra", "极高 · 画质优先"],
  ]
    .map(
      ([id, label]) =>
        `<option value="${id}" ${s.quality === id ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></div>${range("resolution", "分辨率比例", 0.5, 1.5, 0.1)}${range("fov", "垂直视野", 45, 105, 1, "默认 60°，宽屏约 91° 水平视野；数值越大，边缘拉伸越明显")}<div class="setting-row"><label>全屏显示</label><button class="secondary" data-action="fullscreen">切换全屏</button></div></div></section><section class="settings-section"><h3>镜头与操作</h3><div>${range("sensitivity", "鼠标灵敏度", 0.2, 3, 0.1)}${toggle("invertY", "反转垂直视角")}${toggle("dragLook", "兼容鼠标模式（右键拖动视角）")}${range("headBob", "走路镜头晃动", 0, 1, 0.05)}${range("cameraShake", "受击与后坐力晃动", 0, 1, 0.05)}${toggle("reducedMotion", "减少动态效果")}</div></section><section class="settings-section"><h3>声音</h3><div>${range("masterVolume", "主音量", 0, 1, 0.05)}${range("ambientVolume", "环境音量", 0, 1, 0.05)}${range("effectsVolume", "音效音量", 0, 1, 0.05)}</div></section><section class="settings-section"><h3>可访问性</h3><div>${toggle("subtitles", "环境与事件字幕")}${range("uiScale", "界面字号比例", 0.9, 1.3, 0.05, "不影响游戏世界和操作视野")}</div></section><section class="settings-section"><h3>键位</h3><div class="key-bindings">${Object.keys(
    DEFAULT_SETTINGS.keys,
  )
    .map(
      (key) =>
        `<div class="keybinding"><span>${controls[key]}</span><button data-action="rebind" data-key="${key}">${s.keys[key]?.replace("Key", "").replace("Left", "")}</button></div>`,
    )
    .join("")}</div></section></div>`;
}
export function savesView(entries: SaveEntry[]): string {
  return `<div class="save-list"><div class="panel-title"><div><h2>生存记录</h2><p>记录保存在当前浏览器，不会上传至服务器。</p></div></div>${entries.length ? entries.map((e, n) => `<article class="save-row"><div class="save-number">${String(n + 1).padStart(2, "0")}</div><div class="save-info"><h3>${escapeHtml(e.name)}</h3><p>第 ${e.day} 天 · ${Math.floor(e.playtime / 60)} 分钟 · ${escapeHtml(e.seed)}<br>${new Date(e.updatedAt).toLocaleString("zh-CN")}</p></div><div class="button-row"><button class="primary" data-action="load-save" data-id="${e.id}">继续记录</button><button class="secondary" data-action="export-save" data-id="${e.id}">导出</button><button class="quiet" data-action="delete-save" data-id="${e.id}">删除</button></div></article>`).join("") : `<div class="nearby-empty">${icon("quest", 48)}<p>还没有生存记录。创建一个世界，第一次保存后就会出现在这里。</p><button class="primary" data-action="new-game">进入灰谷</button></div>`}<div class="button-row" style="margin-top:15px"><button class="secondary" data-action="import-save">导入存档文件</button></div></div>`;
}
export function creditsView() {
  return `<div class="credits">${brand()}<div class="divider"></div><h2>灰烬协议</h2><p>2037 年，灰谷自治区。你并非英雄，只是被遗忘在封锁线内的幸存者。食物、干净饮水、温暖的火光与一个能睡觉的地方，构成最初的目标。</p><h3>在灰谷生活</h3><p>进入建筑搜刮，用背包装备武器和使用补给。在林间采集资源，制作工具并建设营地。感染者会对光线和噪音作出反应。面对危险，有时绕行和撤退更有价值。</p><h3>寻找协议的真相</h3><p>留意林务站的记录、诊所的幸存者、军事基地的访问卡和研究站的终端。广播站可能是让封锁区外听见你的唯一机会。剧情结束后仍可继续生存与建设。</p><h3>技术与素材</h3><p>Babylon.js · TypeScript · Web Audio · IndexedDB。角色与动作采用 Quaternius CC0 资产；场景扫描模型和材质来自 Poly Haven CC0。环境与物体音效含 Kenney 与 OpenGameArt 作者提供的 CC0 素材，剧情文本为本游戏原创，离线中文配音使用本地语音合成。完整许可与修改记录随项目提供。使用系统字体，无需账号或后端。</p><h3>浏览器中的生存记录</h3><p>存档仅保存在当前设备和浏览器中，建议在读取记录页面导出备份。清除网站数据会删除本地记录。</p></div>`;
}
export function deathView(state: WorldState) {
  const permanent = state.rules.permadeath;
  return `<div class="screen-shade"><div style="max-width:560px;text-align:center">${brand()}<h2 class="death-title">灰谷仍然沉默</h2><p class="muted">你在这里生存了 ${Math.floor(state.elapsed / 60)} 分钟，探索 ${state.discovered.length} 处地点。<br>${permanent ? "灰烬难度只有一次生命。这份生存记录已经结束。" : "背包会留在倒下的位置。你可以从最近的营地重新醒来。"}</p><div class="button-row" style="justify-content:center;margin-top:32px">${!permanent ? '<button class="primary" data-action="respawn">在安全点醒来</button>' : ""}<button class="secondary" data-action="save-menu">保存记录并返回</button></div></div></div>`;
}
export function endView(state: WorldState) {
  const copy = endingCopy(state.narrative.ending);
  return `<div class="screen-shade"><div style="max-width:560px;text-align:center"><small class="mono">ASHFALL / ${state.narrative.ending?.toUpperCase() ?? "TRUTH"}</small><h2 class="death-title">${escapeHtml(copy.title)}</h2><p>${escapeHtml(copy.text)}</p><div class="divider"></div><p class="muted">生存 ${state.day} 天 · 探索 ${state.discovered.length} 处地点 · 建立 ${state.structures.filter((s) => s.id.startsWith("build-")).length} 个营地设施</p><div class="button-row" style="justify-content:center;margin-top:28px"><button class="primary" data-action="keep-playing">留在灰谷，继续生存</button><button class="secondary" data-action="save-menu">保存并返回</button></div></div></div>`;
}
