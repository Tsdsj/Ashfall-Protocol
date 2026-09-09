import type { GameSettings, Interaction, InventoryData } from "../core/types";
import type { Simulation } from "../simulation/simulation";
import { DIFFICULTIES } from "../simulation/state";
import { ITEMS } from "../data/items";
import { BUILDING_KINDS } from "../data/items";
import {
  countItem,
  moveItem,
  sortInventory,
  splitItem,
  transfer,
  transferAt,
  dimensions,
} from "../simulation/inventory";
import type { SaveEntry } from "../save/storage";
import { icon, escapeHtml } from "./icons";
import { inventoryView, resolveInventory, itemDetail } from "./inventory-view";
import { craftingView, buildingView } from "./crafting-view";
import {
  mapView,
  bodyView,
  vehicleView,
  tradeView,
  structureView,
} from "./world-views";
import {
  mainMenu,
  newGameView,
  loadingView,
  pauseView,
  settingsView,
  savesView,
  creditsView,
  deathView,
  endView,
  brand,
} from "./views";
import { bindInteractiveMap, type InteractiveMap } from "./map";
import { bindInventoryInputGuard } from "./input-guard";
import { narrativeJournal, conversationView } from "./narrative-view";
import { creativeView } from "./creative-view";
export type Screen =
  | "creative"
  | "play"
  | "menu"
  | "newgame"
  | "loading"
  | "inventory"
  | "crafting"
  | "building"
  | "map"
  | "journal"
  | "conversation"
  | "body"
  | "pause"
  | "settings"
  | "saves"
  | "credits"
  | "death"
  | "end"
  | "vehicle"
  | "trade"
  | "structure"
  | "error";
const weatherNames = {
  clear: "晴",
  cloudy: "多云",
  overcast: "阴",
  rain: "雨",
  storm: "雷暴",
  fog: "雾",
};
const tabs: [Screen, string][] = [
  ["inventory", "装备与背包"],
  ["crafting", "制作"],
  ["building", "建造"],
  ["body", "身体"],
  ["map", "地图"],
  ["journal", "日志"],
];
export class GameUI {
  private errorHtml = "";
  screen: Screen = "loading";
  sim: Simulation | null = null;
  backScreen: Screen = "menu";
  nearbySource = "";
  selectedUid = "";
  selectedSource = "player";
  craftFilter = "全部";
  selectedRecipe = "";
  journalId = "";
  entityId = "";
  saves: SaveEntry[] = [];
  backend = "WebGL2";
  locked = false;
  binding: string | null = null;
  debugVisible = false;
  performanceDetail = "";
  displayDiagnostic = "F4 检测浏览器轻载节拍（约 1 秒）";
  creativeFilter = "全部";
  scopeWeight = 0;
  private root: HTMLElement;
  private layer: HTMLElement;
  private hud: HTMLElement;
  private notices: HTMLElement;
  private interaction: Interaction | null = null;
  private lastHud = 0;
  private mapControls: InteractiveMap | null = null;
  private drag: {
    uid: string;
    source: string;
    rotated: boolean;
    grabX: number;
    grabY: number;
  } | null = null;
  private dragPoint: { grid: HTMLElement; x: number; y: number } | null = null;
  private lastJob = "";
  private actionRevision = 0;
  private regionTimeout = 0;
  onAction: (action: string, element: HTMLElement) => void = () => {};
  constructor(private settings: GameSettings) {
    this.root = document.querySelector("#app")!;
    this.root.innerHTML = `<div id="hud-root" class="hidden"></div><div id="ui-layer"></div><div class="toasts" aria-live="polite"></div><div class="damage-overlay"></div><div id="region-layer"></div><div id="debug-panel" class="debug hidden"></div><div id="console-panel" class="console hidden"><div>开发控制台 · god / give item [count] / time 22 / weather rain / teleport x z / spawn walker / killall</div><pre id="console-output"></pre><input id="console-input" autocomplete="off" placeholder="输入命令，Enter 执行" aria-label="开发控制台命令"/></div><div id="screen-reader-status" class="sr-only" aria-live="polite"></div>`;
    this.layer = document.querySelector("#ui-layer")!;
    this.hud = document.querySelector("#hud-root")!;
    this.notices = document.querySelector(".toasts")!;
    this.root.insertAdjacentHTML(
      "beforeend",
      `<div id="action-progress" class="action-progress hidden" role="status"><div><span id="action-label"></span><span id="action-time" class="mono"></span></div><progress id="action-meter" max="1" value="0" aria-label="操作进度"></progress><button data-action="cancel-action" class="quiet">取消 <kbd>Esc</kbd></button></div>`,
    );
    bindInventoryInputGuard(this.root);
    this.bind();
    this.root.insertAdjacentHTML(
      "beforeend",
      `<div id="sequence-overlay" class="sequence-overlay hidden"><div class="sequence-title" id="sequence-title"></div><div class="sequence-subtitle"><strong id="sequence-speaker"></strong><p id="sequence-text"></p></div><button id="sequence-skip" class="quiet" data-action="skip-sequence">跳过 <kbd>X</kbd></button></div>`,
    );
  }
  private bind() {
    this.root.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-action]",
      );
      if (!el || (el instanceof HTMLButtonElement && el.disabled)) return;
      const action = el.dataset.action!;
      if (action === "select-item" && (e as MouseEvent).shiftKey) {
        this.quickTransfer(el.dataset.source!, el.dataset.uid!);
        return;
      }
      if (this.handleLocal(action, el)) return;
      this.onAction(action, el);
    });
    this.root.addEventListener("dblclick", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(
        '[data-action="select-item"]',
      );
      if (!el) return;
      if (el.dataset.source === "player") this.handleLocal("use-item", el);
      else this.quickTransfer(el.dataset.source!, el.dataset.uid!);
    });
    this.root.addEventListener("change", (e) => {
      const el = e.target as HTMLInputElement;
      if (el.id === "difficulty") {
        document.querySelector("#difficulty-description")!.textContent =
          DIFFICULTIES[el.value as keyof typeof DIFFICULTIES].description;
      }
      if (el.dataset.setting) this.onAction("setting", el);
    });
    this.root.addEventListener("input", (e) => {
      const el = e.target as HTMLInputElement;
      if (el.type === "range" && el.dataset.setting) {
        const output = el.nextElementSibling;
        if (output)
          output.textContent = Number(el.value).toFixed(
            Number(el.step) < 1 ? 2 : 0,
          );
        this.onAction("setting", el);
      }
    });
    this.root.addEventListener("submit", (e) => {
      e.preventDefault();
      if ((e.target as HTMLElement).id === "new-world-form")
        this.onAction("start-world", e.target as HTMLElement);
    });
    this.root.addEventListener("dragstart", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(
        "[draggable=true]",
      );
      if (!el || !e.dataTransfer) return;
      this.drag = {
        uid: el.dataset.uid!,
        source: el.dataset.source!,
        rotated: false,
        grabX: 0,
        grabY: 0,
      };
      const stack = resolveInventory(this.sim!, this.drag.source)?.items.find(
          (i) => i.uid === this.drag!.uid,
        ),
        rect = el.getBoundingClientRect();
      if (stack) {
        const [w, h] = dimensions(stack);
        this.drag.grabX = Math.max(
          0,
          Math.floor(((e.clientX - rect.left) / rect.width) * w),
        );
        this.drag.grabY = Math.max(
          0,
          Math.floor(((e.clientY - rect.top) / rect.height) * h),
        );
      }
      e.dataTransfer.setData("text/plain", JSON.stringify(this.drag));
      e.dataTransfer.effectAllowed = "move";
      this.selectedUid = this.drag.uid;
      this.selectedSource = this.drag.source;
    });
    this.root.addEventListener("dragover", (e) => {
      const grid = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-grid]",
      );
      if (!grid || !this.drag) return;
      e.preventDefault();
      grid.classList.add("drop-active");
      this.previewDrop(grid, e.clientX, e.clientY);
    });
    this.root.addEventListener("dragleave", (e) => {
      const grid = (e.target as HTMLElement).closest("[data-grid]");
      if (
        grid &&
        !(e.relatedTarget instanceof Node && grid.contains(e.relatedTarget))
      ) {
        grid.classList.remove("drop-active");
        grid.querySelector(".drop-preview")?.remove();
        this.dragPoint = null;
      }
    });
    this.root.addEventListener("dragend", () => {
      this.drag = null;
      this.dragPoint = null;
      this.root.querySelectorAll(".drop-preview").forEach((e) => e.remove());
      this.root
        .querySelectorAll(".drop-active")
        .forEach((e) => e.classList.remove("drop-active"));
    });
    this.root.addEventListener("drop", (e) => {
      e.preventDefault();
      const target = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-grid]",
      );
      if (!target || !this.drag || !this.sim) return;
      const from = resolveInventory(this.sim, this.drag.source),
        to = resolveInventory(this.sim, target.dataset.grid!);
      if (!from || !to) return;
      const rect = target.getBoundingClientRect(),
        x =
          Math.floor(((e.clientX - rect.left) / rect.width) * to.width) -
          this.drag.grabX,
        y =
          Math.floor(((e.clientY - rect.top) / rect.height) * to.height) -
          this.drag.grabY;
      const result = transferAt(
        from,
        to,
        this.drag.uid,
        x,
        y,
        this.drag.rotated,
      );
      if (result.ok) {
        this.sim.actions.cleanup();
        this.sim.bus.emit({ type: "sound", text: "pickup", kind: "pickup" });
        if (result.merged)
          this.toast("已合并 " + result.merged + " 个物资。", "success");
      } else this.toast(result.reason, "warning");
      this.drag = null;
      this.render();
    });
  }
  private previewDrop(grid: HTMLElement, clientX: number, clientY: number) {
    if (!this.drag || !this.sim) return;
    this.dragPoint = { grid, x: clientX, y: clientY };
    this.root.querySelectorAll(".drop-preview").forEach((el) => {
      if (el.parentElement !== grid) el.remove();
    });
    const from = resolveInventory(this.sim, this.drag.source),
      to = resolveInventory(this.sim, grid.dataset.grid!);
    if (!from || !to) return;
    const stack = from.items.find((i) => i.uid === this.drag!.uid);
    if (!stack) return;
    const candidate = {
        ...stack,
        rotated: this.drag.rotated ? !stack.rotated : stack.rotated,
      },
      [w, h] = dimensions(candidate),
      rect = grid.getBoundingClientRect();
    const x =
        Math.floor(((clientX - rect.left) / rect.width) * to.width) -
        Math.min(w - 1, this.drag.grabX),
      y =
        Math.floor(((clientY - rect.top) / rect.height) * to.height) -
        Math.min(h - 1, this.drag.grabY);
    const sourceCopy = structuredClone(from),
      targetCopy = from === to ? sourceCopy : structuredClone(to),
      result = transferAt(
        sourceCopy,
        targetCopy,
        this.drag.uid,
        x,
        y,
        this.drag.rotated,
      );
    let preview = grid.querySelector<HTMLElement>(".drop-preview");
    if (!preview) {
      preview = document.createElement("div");
      preview.className = "drop-preview";
      grid.appendChild(preview);
    }
    preview.classList.toggle("invalid", !result.ok);
    preview.classList.toggle("merging", result.merged > 0);
    preview.style.left = (x / to.width) * 100 + "%";
    preview.style.top = (y / to.height) * 100 + "%";
    preview.style.width = (w / to.width) * 100 + "%";
    preview.style.height = (h / to.height) * 100 + "%";
    preview.textContent = result.ok
      ? result.merged
        ? "合并 " + result.merged
        : "可放置"
      : "无法放置";
  }
  private handleLocal(action: string, el: HTMLElement): boolean {
    if (action === "tab") {
      this.show(el.dataset.screen as Screen);
      return true;
    }
    if (action === "random-seed") {
      (document.querySelector("#world-seed") as HTMLInputElement).value =
        "GREYVALE-" + Math.random().toString(36).slice(2, 9).toUpperCase();
      return true;
    }
    const sim = this.sim;
    if (!sim) return false;
    if (action === "creative-filter") {
      this.creativeFilter = el.dataset.filter ?? "全部";
      this.render();
      return true;
    }
    if (action === "cancel-action") {
      sim.actions.cancel();
      sim.cancelCraft();
      return true;
    }
    const uid = el.dataset.uid ?? "";
    if (action === "select-item") {
      if (!uid) return true;
      this.selectedUid = uid;
      this.selectedSource = el.dataset.source ?? "player";
      this.layer
        .querySelectorAll<HTMLElement>(".grid-item")
        .forEach((item) =>
          item.classList.toggle("selected", item.dataset.uid === uid),
        );
      const detail = this.layer.querySelector(".selected-detail");
      if (detail)
        detail.outerHTML = itemDetail(
          resolveInventory(sim, this.selectedSource)?.items.find(
            (i) => i.uid === uid,
          ),
          this.selectedSource,
          sim.state.player.inventory,
        );
      return true;
    }
    if (action === "use-item") {
      const i = sim.state.player.inventory.items.find((i) => i.uid === uid);
      if (i && ITEMS[i.id]?.structure) this.show("building");
      else {
        sim.actions.use(uid);
        this.render();
      }
      return true;
    }
    if (action === "drop-item") {
      sim.actions.drop(uid);
      this.render();
      return true;
    }
    if (action === "split-item") {
      if (!splitItem(sim.state.player.inventory, uid))
        this.toast("无法拆分：需要数量大于 1 且有空位。", "warning");
      this.render();
      return true;
    }
    if (action === "rotate-item") {
      const inv =
        resolveInventory(sim, this.selectedSource) ??
        sim.state.player.inventory;
      const i = inv.items.find((i) => i.uid === uid);
      if (i && !moveItem(inv, uid, i.x, i.y, true))
        this.toast("旋转后空间不足。", "warning");
      this.render();
      return true;
    }
    if (action === "sort-inventory") {
      if (!sortInventory(sim.state.player.inventory))
        this.toast("当前排列已经非常紧凑，无法自动整理。");
      this.render();
      return true;
    }
    if (action === "repair-item") {
      sim.actions.repairItem(uid);
      this.render();
      return true;
    }
    if (action === "assign-slot") {
      sim.actions.assign(uid, Number(el.dataset.slot));
      this.render();
      return true;
    }
    if (action === "detach") {
      sim.actions.detach(uid, el.dataset.id!);
      this.render();
      return true;
    }
    if (action === "take-item") {
      this.quickTransfer(el.dataset.source!, uid);
      return true;
    }
    if (action === "take-all") {
      const inv = resolveInventory(sim, el.dataset.source!);
      if (inv) {
        for (const item of [...inv.items]) {
          if (!this.transferItem(inv, item.uid)) break;
        }
        this.markSearched(el.dataset.source!);
        this.render();
      }
      return true;
    }
    if (action === "craft-filter") {
      this.craftFilter = el.dataset.filter!;
      this.selectedRecipe = "";
      this.render();
      return true;
    }
    if (action === "select-recipe") {
      this.selectedRecipe = el.dataset.id!;
      this.render();
      return true;
    }
    if (action === "craft") {
      sim.startCraft(el.dataset.id!);
      this.render();
      return true;
    }
    if (action === "open-crafting-building") {
      this.craftFilter = "营地建造";
      this.selectedRecipe = "";
      this.show("crafting");
      return true;
    }
    if (action === "journal-entry") {
      this.journalId = el.dataset.id!;
      this.render();
      return true;
    }
    return false;
  }
  private transferItem(inv: InventoryData, uid: string): boolean {
    const sim = this.sim!,
      i = inv.items.find((i) => i.uid === uid);
    if (!i) return false;
    const name = ITEMS[i.id]!.name;
    if (!transfer(inv, sim.state.player.inventory, uid)) {
      this.toast("背包空间不足，剩余物品留在容器中。", "warning");
      return false;
    }
    sim.bus.emit({ type: "sound", text: "pickup", kind: "pickup" });
    sim.notify("取得 " + name, "success");
    return true;
  }
  private markSearched(source: string) {
    const c = this.sim?.state.containers[source];
    if (c) {
      c.searched = true;
      c.openedAt = this.sim!.state.elapsed;
    }
  }
  quickTransfer(source: string, uid: string) {
    const sim = this.sim;
    if (!sim) return;
    const inv = resolveInventory(sim, source);
    if (!inv) return;
    if (source === "player") {
      const to = resolveInventory(sim, this.nearbySource);
      if (!to || !transfer(inv, to, uid)) {
        this.toast("附近没有容器或空间不足。", "warning");
        return;
      }
      sim.actions.cleanup();
    } else {
      this.transferItem(inv, uid);
      this.markSearched(source);
    }
    this.render();
  }
  rotateSelected() {
    if (this.drag) {
      this.drag.rotated = !this.drag.rotated;
      [this.drag.grabX, this.drag.grabY] = [this.drag.grabY, this.drag.grabX];
      if (this.dragPoint)
        this.previewDrop(
          this.dragPoint.grid,
          this.dragPoint.x,
          this.dragPoint.y,
        );
      return;
    }
    const el = document.createElement("button");
    el.dataset.uid = this.selectedUid;
    this.handleLocal("rotate-item", el);
  }
  show(screen: Screen) {
    const changed = screen !== this.screen;
    const animate =
      !this.settings.reducedMotion &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (changed && screen === "play" && animate) {
      const old = this.layer.querySelector(".panel-shell");
      if (old) {
        const fading = old.cloneNode(true) as HTMLElement;
        fading
          .querySelectorAll("[id]")
          .forEach((el) => el.removeAttribute("id"));
        fading.setAttribute("aria-hidden", "true");
        fading.classList.add("panel-closing");
        this.root.appendChild(fading);
        fading.addEventListener("animationend", () => fading.remove(), {
          once: true,
        });
      }
    }
    this.screen = screen;
    this.render();
    if (changed && animate)
      this.layer.querySelector(".panel-shell")?.classList.add("panel-entering");
  }
  render() {
    this.mapControls?.();
    this.mapControls = null;
    this.root.dataset.screen = this.screen;
    this.root.classList.toggle("in-panel", this.screen !== "play");
    const scroll = this.layer.querySelector(".panel-body")?.scrollTop ?? 0;
    this.hud.classList.toggle("hidden", this.screen !== "play");
    this.layer.innerHTML = this.view();
    const body = this.layer.querySelector(".panel-body");
    if (body) body.scrollTop = scroll;
    if (this.screen === "map" && this.sim) {
      const canvas = this.layer.querySelector<HTMLCanvasElement>("#world-map");
      if (canvas) {
        this.mapControls = bindInteractiveMap(canvas, this.sim);
        for (const button of this.layer.querySelectorAll<HTMLElement>(
          "[data-map-control]",
        ))
          button.onclick = () => {
            const action = button.dataset.mapControl;
            if (action === "center") this.mapControls?.centerPlayer();
            else if (action === "reset") this.mapControls?.reset();
            else this.mapControls?.zoomBy(action === "in" ? 1.4 : 1 / 1.4);
          };
      }
    }
    if (this.screen === "play") this.hud.innerHTML = this.hudHTML();
    this.applyScale();
  }
  private panel(content: string): string {
    const gameTabs = [
      "inventory",
      "crafting",
      "building",
      "body",
      "map",
      "journal",
      "vehicle",
      "trade",
      "structure",
    ].includes(this.screen);
    return `<div class="panel-shell"><header class="panel-header">${brand()}${gameTabs ? `<nav class="panel-tabs" aria-label="生存手册">${tabs.map(([screen, name]) => `<button class="${this.screen === screen ? "active" : ""}" data-action="tab" data-screen="${screen}">${name}</button>`).join("")}</nav>` : `<span class="muted">${{ settings: "设置", saves: "生存记录", credits: "关于" }[this.screen as "settings"] ?? ""}</span>`}<button class="panel-close" data-action="close-panel"><span>返回</span><kbd>Esc</kbd></button></header><main class="panel-body">${content}</main><footer class="panel-footer"><span>${this.sim?.creative ? `<button class="quiet" data-action="open-creative">创造物资 · F6 ${this.sim.flying ? "退出飞行" : "飞行"}</button>` : ""}${gameTabs ? "<kbd>Tab</kbd> 背包  <kbd>C</kbd> 制作  <kbd>M</kbd> 地图" : "ASHFALL PROTOCOL · 灰谷自治区"}</span><span>${gameTabs ? "手册中世界继续运转；返回后按 Esc 暂停" : "你的设置和生存记录仅保存在本机"}</span></footer></div>`;
  }
  private view(): string {
    const sim = this.sim;
    switch (this.screen) {
      case "error":
        return this.errorHtml;
      case "play":
        return this.locked
          ? ""
          : `<div class="resume-prompt"><button data-action="resume"><strong>继续探索</strong><small>点击进入第一人称 · Esc 暂停</small></button></div>`;
      case "menu":
        return mainMenu(this.saves.length > 0, this.backend);
      case "newgame":
        return newGameView();
      case "loading":
        return loadingView("初始化世界", 5);
      case "settings":
        return this.panel(settingsView(this.settings));
      case "saves":
        return this.panel(savesView(this.saves));
      case "credits":
        return this.panel(creditsView());
      case "pause":
        return sim
          ? pauseView(sim.state)
          : mainMenu(this.saves.length > 0, this.backend);
      case "death":
        return deathView(sim!.state);
      case "end":
        return endView(sim!.state);
      case "inventory":
        return this.panel(
          inventoryView(
            sim!,
            this.nearbySource,
            this.selectedUid,
            this.selectedSource,
          ),
        );
      case "creative":
        return this.panel(creativeView(sim!, this.creativeFilter));
      case "crafting":
        return this.panel(
          craftingView(sim!, this.craftFilter, this.selectedRecipe),
        );
      case "building":
        return this.panel(buildingView(sim!));
      case "map":
        return this.panel(mapView(sim!));
      case "journal":
        return this.panel(narrativeJournal(sim!, this.journalId));
      case "conversation":
        return this.panel(conversationView(sim!, this.entityId));
      case "body":
        return this.panel(bodyView(sim!));
      case "vehicle":
        return this.panel(vehicleView(sim!, this.entityId));
      case "trade":
        return this.panel(tradeView());
      case "structure":
        return this.panel(structureView(sim!, this.entityId));
    }
  }
  loading(stage: string, percent: number) {
    this.screen = "loading";
    this.hud.classList.add("hidden");
    this.layer.innerHTML = loadingView(stage, percent);
  }
  private hudHTML(): string {
    return `<div class="hud"><div id="scope-mask" class="scope-mask hidden" aria-hidden="true"><div class="scope-aperture"><i class="reticle-h"></i><i class="reticle-v"></i><b></b></div></div><div class="hud-top"><div class="hud-context"><div class="location" id="hud-location">松谷镇</div><div class="hud-time" id="hud-time">DAY 01  15:24</div></div><div class="hud-objective"><div class="small-title">生存手记 <kbd>J</kbd></div><div id="hud-objective">沿公路寻找松谷林务站</div></div></div><div class="compass"><span id="compass-left">NW</span><span>·</span><span class="bearing" id="compass-heading">N</span><span>·</span><span id="compass-right">NE</span></div><div id="hud-waypoint" class="hud-waypoint"></div><div class="crosshair" id="crosshair"></div><div id="interaction-prompt" class="interaction-prompt hidden"></div><div class="vitals">${[
      ["health", "生命", "health"],
      ["stamina", "体力", "stamina"],
      ["hydration", "水分", "hydration"],
      ["energy", "能量", "food"],
    ]
      .map(
        ([key, label, img]) =>
          `<div class="vital" id="vital-${key}" title="${label}"><div class="vital-top">${icon(img!, 18)}<span id="value-${key}">100</span></div><div class="meter"><i id="meter-${key}" style="width:100%"></i></div></div>`,
      )
      .join(
        "",
      )}<div class="temperature">${icon("temp", 18)}<span id="hud-temp">36.8°C</span></div></div><div class="conditions" id="conditions"></div><div class="quickbar" id="quickbar"></div><div class="weapon-readout"><div class="weapon-name" id="weapon-name"></div><div class="ammo-count" id="ammo-count"></div><div class="weapon-detail" id="weapon-detail"></div></div><div class="controls-strip"><span class="key-hint"><kbd>Tab</kbd> 背包</span><span class="key-hint"><kbd>C</kbd> 制作</span><span class="key-hint"><kbd>M</kbd> 地图</span></div><div id="build-instruction" class="build-instruction hidden"></div><div id="save-indicator" class="save-indicator"></div></div>`;
  }
  setInteraction(interaction: Interaction | null) {
    this.interaction = interaction;
  }
  update(
    dt: number,
    aiming: boolean,
    fps: number,
    chunkCount: number,
    drawCalls: number,
  ): void {
    const sim = this.sim;
    if (!sim) return;
    this.lastHud += dt;
    if (this.lastHud < 0.1) return;
    this.lastHud = 0;
    const $ = (id: string) => document.getElementById(id);
    const p = sim.state.player,
      s = p.stats;
    const sequence = sim.narrative.frame();
    const subtitle = this.settings.subtitles ? sequence.subtitle : null;
    const showSequence =
      !!(sequence.id || subtitle) &&
      ["play", "journal", "conversation"].includes(this.screen);
    $("sequence-overlay")?.classList.toggle("hidden", !showSequence);
    $("sequence-overlay")?.classList.toggle("cinematic", sequence.blocking);
    if (showSequence) {
      $("sequence-title")!.textContent = sequence.blocking
        ? sequence.title
        : "";
      $("sequence-speaker")!.textContent = subtitle?.speaker ?? "";
      $("sequence-text")!.textContent = subtitle?.text ?? "";
      $("sequence-skip")!.classList.toggle("hidden", !sequence.skippable);
    }
    this.hud.classList.toggle("cinematic-hidden", sequence.blocking);
    this.root.classList.toggle("in-cinematic", sequence.blocking);
    const pending =
      sim.actions.pending ??
      (sim.craftJob
        ? {
            label:
              "正在制作 " +
              (sim.recipes.find((r) => r.id === sim.craftJob!.id)?.name ?? ""),
            total: sim.craftJob.total,
            remaining: sim.craftJob.remaining,
          }
        : null);
    const actionProgress = $("action-progress");
    actionProgress?.classList.toggle(
      "hidden",
      !pending ||
        [
          "menu",
          "newgame",
          "loading",
          "pause",
          "settings",
          "saves",
          "death",
          "end",
        ].includes(this.screen),
    );
    if (pending) {
      $("action-label")!.textContent = pending.label;
      $("action-time")!.textContent = pending.remaining.toFixed(1) + "s";
      ($("action-meter") as HTMLProgressElement).value =
        1 - pending.remaining / pending.total;
    }
    if (this.actionRevision !== sim.actions.revision) {
      this.actionRevision = sim.actions.revision;
      if (
        ["inventory", "body", "structure", "vehicle", "crafting"].includes(
          this.screen,
        )
      )
        this.render();
    }
    if (this.screen === "crafting") {
      const job = sim.craftJob;
      const signature = job?.id ?? "";
      if (signature !== this.lastJob) {
        this.lastJob = signature;
        this.render();
      }
      if (job) {
        const progress = $("craft-progress");
        if (progress)
          progress.style.width = (1 - job.remaining / job.total) * 100 + "%";
      }
    }
    if (this.screen !== "play") return;
    for (const key of ["health", "stamina", "hydration", "energy"] as const) {
      const value = s[key];
      const txt = $("value-" + key),
        meter = $("meter-" + key),
        vital = $("vital-" + key);
      if (txt) txt.textContent = Math.ceil(value).toString();
      if (meter) meter.style.width = value + "%";
      vital?.classList.toggle("low", value < 25);
    }
    const hours = Math.floor(sim.state.time),
      mins = Math.floor((sim.state.time % 1) * 60);
    $("hud-time")!.textContent =
      `第 ${String(sim.state.day).padStart(2, "0")} 天  ${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}  ${weatherNames[sim.state.weather]}`;
    $("hud-location")!.textContent = sim.gen.regionAt(
      p.position.x,
      p.position.z,
    ).name;
    $("hud-temp")!.textContent = s.temperature.toFixed(1) + "°C";
    const heading = ((((p.yaw * 180) / Math.PI) % 360) + 360) % 360,
      dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    $("compass-heading")!.innerHTML =
      `${dirs[Math.round(heading / 45) % 8]} <span class="mono" style="font-size:9px">${Math.round(heading)}°</span>`;
    $("compass-left")!.textContent = dirs[(Math.round(heading / 45) + 7) % 8]!;
    $("compass-right")!.textContent = dirs[(Math.round(heading / 45) + 1) % 8]!;
    $("conditions")!.textContent = [
      s.bleeding > 0 ? "流血 · 血量 " + Math.floor(s.blood) + "%" : "",
      s.fracture ? "骨折" : "",
      s.poison > 0 ? "中毒" : "",
      s.oxygen < 90 ? "氧气 " + Math.floor(s.oxygen) + "%" : "",
      s.temperature < 35 ? "体温偏低" : "",
      s.wetness > 60 ? "衣物湿透" : "",
      p.stance !== "stand" ? (p.stance === "crouch" ? "蹲行" : "匍匐") : "",
      p.flashlight ? "手电 " + Math.ceil(p.flashlightCharge) + "%" : "",
    ]
      .filter(Boolean)
      .join("  ");
    const waypoint = sim.state.waypoint;
    $("hud-waypoint")!.textContent = waypoint
      ? "◇ 标记 " +
        Math.round(
          Math.hypot(waypoint.x - p.position.x, waypoint.z - p.position.z),
        ) +
        " m"
      : "";
    const lead = sim.narrative.mainLead;
    $("hud-objective")!.textContent = lead
      ? `${lead.poiName}${lead.underground ? " · 地下" : ""} · ${Math.round(Math.hypot(lead.position.x - p.position.x, lead.position.z - p.position.z))}m · ${lead.title}（J 查看缘由）`
      : (sim.narrative.objectives[0] ?? "探索灰谷");
    $("quickbar")!.innerHTML = p.quickSlots
      .map((uid, n) => {
        const i = p.inventory.items.find((i) => i.uid === uid);
        return `<div class="quick-slot ${n === p.selected ? "selected" : ""}" title="${i ? ITEMS[i.id]!.name : "空快捷栏"}"><span class="number">${n + 1}</span>${i ? icon(i.id, 34) : ""}</div>`;
      })
      .join("");
    const gun = sim.combat.equipped(),
      d = gun && ITEMS[gun.id],
      w = d?.weapon;
    $("weapon-name")!.textContent = d?.name ?? "空手";
    $("ammo-count")!.innerHTML = w?.ammo
      ? `${gun!.ammo} <span>/ ${countItem(p.inventory, w.ammo)}</span>`
      : `<span>${w ? "近战武器" : d && ["food", "drink", "medical"].includes(d.category) ? "按 " + (p.selected + 1) + " 使用" : "未装备"}</span>`;
    $("weapon-detail")!.textContent =
      sim.combat.reloadRemaining > 0
        ? "换弹中…"
        : sim.combat.jammed
          ? "卡壳 · R 清障"
          : w?.ammo
            ? (w.interval < 0.15 ? "自动" : "单发") +
              " · " +
              ITEMS[w.ammo]!.name
            : w
              ? "耐久 " + Math.round(gun!.durability) + "%"
              : "";
    $("crosshair")?.classList.toggle("aiming", aiming);
    const scoped =
      !!gun?.attachments.includes("scope") && this.scopeWeight > 0.55;
    $("scope-mask")?.classList.toggle("hidden", !scoped);
    if ($("scope-mask"))
      $("scope-mask")!.style.opacity = String(
        Math.max(0, Math.min(1, (this.scopeWeight - 0.55) / 0.37)),
      );
    $("crosshair")?.classList.toggle("hidden", scoped);
    const target = this.interaction,
      pr = $("interaction-prompt")!;
    pr.classList.toggle("hidden", !target || sim.building.active);
    if (target) {
      const label =
        target.type === "container"
          ? "搜索"
          : target.type === "door"
            ? "开关"
            : target.type === "resource"
              ? target.id.startsWith("tree:")
                ? "砍伐"
                : "采集"
              : target.type === "corpse"
                ? "搜索 / 处理"
                : target.type === "story"
                  ? "阅读"
                  : target.type === "water"
                    ? "取水 / 垂钓"
                    : "交互";
      pr.innerHTML = `<div class="prompt-main"><kbd>${target.id.startsWith("tree:") ? "左键" : "E"}</kbd><span>${escapeHtml(target.name)}</span></div><small>${label}${target.detail ? " · " + escapeHtml(target.detail) : ""}</small>`;
    }
    if (this.debugVisible) {
      const debug = $("debug-panel")!;
      debug.textContent = `${this.backend} · ${Math.round(fps)} FPS\n${this.performanceDetail}\nFrame ${(1000 / fps).toFixed(1)} ms · Draw ${drawCalls}\nChunks ${chunkCount} · AI ${sim.inspect().actors}\nPosition ${p.position.x.toFixed(1)} ${p.position.y.toFixed(1)} ${p.position.z.toFixed(1)}\nTime ${sim.state.time.toFixed(2)} · Day ${sim.state.day}\n${this.displayDiagnostic}`;
    }
  }
  buildingPrompt(valid: boolean, reason: string) {
    const el = document.querySelector<HTMLElement>("#build-instruction");
    if (!el || !this.sim) return;
    el.classList.toggle("hidden", !this.sim.building.active);
    if (this.sim.building.active)
      el.innerHTML = `<div class="${valid ? "good" : "warning"}">${valid ? "可以放置：" + (BUILDING_KINDS.find((p) => p[0] === this.sim!.building.selected)?.[1] ?? "组件") : reason}</div><div class="button-row"><span class="key-hint"><kbd>E</kbd> 放置</span><span class="key-hint"><kbd>R</kbd> 旋转</span><span class="key-hint"><kbd>Esc</kbd> 取消</span></div>`;
  }
  toast(text: string, type = "info") {
    const toast = document.createElement("div");
    toast.className = "toast " + type;
    toast.textContent = text;
    this.notices.append(toast);
    while (this.notices.childElementCount > 5)
      this.notices.firstElementChild?.remove();
    setTimeout(() => toast.remove(), 4300);
  }
  damage() {
    const el = document.querySelector(".damage-overlay")!;
    el.classList.add("hit");
    setTimeout(() => el.classList.remove("hit"), 170);
  }
  announce(text: string) {
    const el = document.querySelector("#region-layer")!;
    clearTimeout(this.regionTimeout);
    el.innerHTML = `<div class="region-announcement"><small>GREYVALE AUTONOMOUS REGION</small><strong>${escapeHtml(text)}</strong></div>`;
    this.regionTimeout = window.setTimeout(() => (el.innerHTML = ""), 4200);
  }
  setLocked(locked: boolean) {
    this.locked = locked;
    if (this.screen === "play")
      this.layer.innerHTML = locked ? "" : this.view();
  }
  applySettings(settings: GameSettings) {
    this.settings = settings;
    this.applyScale();
  }
  private applyScale() {
    document.documentElement.style.setProperty(
      "--ui-scale",
      String(this.settings.uiScale),
    );
    document.documentElement.style.fontSize = 14 * this.settings.uiScale + "px";
  }
  error(message: string) {
    this.screen = "error";
    this.hud.classList.add("hidden");
    this.errorHtml = `<div class="screen-shade"><div class="error-panel"><h2>暂时无法进入灰谷</h2><p>${escapeHtml(message)}</p><div class="button-row"><button class="primary" data-action="retry-webgl">使用兼容渲染重试</button><button class="secondary" data-action="reload-page">重新加载</button></div></div></div>`;
    this.layer.innerHTML = this.errorHtml;
  }
}
