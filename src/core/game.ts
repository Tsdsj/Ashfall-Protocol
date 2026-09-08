import { type AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { createEngine } from "../rendering/engine";
import { GameRenderer } from "../rendering/renderer";
import { GameUI, type Screen } from "../ui/ui";
import { AudioManager } from "../audio/audio";
import { SaveSystem, deserialize, serialize } from "../save/storage";
import {
  createWorld,
  DEFAULT_SETTINGS,
  DIFFICULTIES,
} from "../simulation/state";
import { Simulation } from "../simulation/simulation";
import { InputController } from "./input";
import {
  clamp,
  type Difficulty,
  type GameSettings,
  type Interaction,
  type WorldState,
} from "./types";
import { addItem } from "../simulation/inventory";
import { ITEMS } from "../data/items";
import { ENEMIES } from "../data/enemies";
import { spawnActor } from "../simulation/population";
import { TRADES } from "../ui/world-views";
export class Game {
  canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
  readonly settings: GameSettings;
  readonly ui: GameUI;
  input!: InputController;
  readonly audio: AudioManager;
  readonly saves = new SaveSystem();
  engine!: AbstractEngine;
  renderer!: GameRenderer;
  sim!: Simulation;
  private active = false;
  private loading = false;
  private last = performance.now();
  private saveId = "";
  private lastSaved = 0;
  private lowFpsTime = 0;
  private performanceWarned = false;
  private pointerHintShown = false;
  private offSim: (() => void) | null = null;
  private frameError = false;
  private lastError = "";
  private consoleOpen = false;
  private autosaving = false;
  private saveQueue: Promise<void> = Promise.resolve();
  private playFrames = 0;
  constructor() {
    this.settings = this.readSettings();
    this.ui = new GameUI(this.settings);
    this.audio = new AudioManager(this.settings);
    this.ui.onAction = (action, element) => {
      void this.action(action, element).catch((e) =>
        this.ui.toast(
          e instanceof Error ? e.message : "操作失败，请重试。",
          "warning",
        ),
      );
    };
    this.bind();
  }
  private readSettings(): GameSettings {
    try {
      const data = JSON.parse(
        localStorage.getItem("ashfall-settings") ?? "null",
      ) as Partial<GameSettings> | null;
      return {
        ...structuredClone(DEFAULT_SETTINGS),
        ...data,
        keys: { ...DEFAULT_SETTINGS.keys, ...data?.keys },
      };
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }
  async start(forceWebGL = false) {
    this.ui.loading("检查图形设备", 5);
    try {
      const info = await createEngine(this.canvas, forceWebGL);
      this.canvas = info.canvas;
      this.input = new InputController(this.canvas, this.settings);
      this.engine = info.engine;
      this.ui.backend = info.backend;
      if (!localStorage.getItem("ashfall-settings"))
        this.settings.quality = info.recommended;
      this.ui.loading("生成材质与植被", 18);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const menu = createWorld("GREYVALE-2037");
      menu.time = 16.7;
      menu.weather = "cloudy";
      await this.setWorld(menu);
      this.ui.saves = await this.saves.list();
      this.active = false;
      this.renderer.setMenu(true);
      this.ui.show("menu");
      this.last = performance.now();
      this.engine.runRenderLoop(() => this.frame());
      window.addEventListener("resize", () => this.engine.resize());
      this.installDebug();
    } catch (e) {
      console.error(e);
      this.ui.error(e instanceof Error ? e.message : String(e));
    }
  }
  private async setWorld(state: WorldState) {
    this.loading = true;
    this.offSim?.();
    this.renderer?.dispose();
    this.sim = new Simulation(state);
    this.ui.sim = this.sim;
    this.ui.nearbySource = "";
    this.ui.selectedUid = "";
    this.ui.selectedSource = "player";
    this.ui.entityId = "";
    this.ui.journalId = "";
    this.offSim = this.sim.bus.on((e) => {
      this.audio.event(e);
      if (e.type === "info" || e.type === "success" || e.type === "warning") {
        if (e.kind === "region") {
          if (this.active) this.ui.announce(e.text);
        } else if (this.active) this.ui.toast(e.text, e.type);
      }
      if (e.type === "damage") this.ui.damage();
      if (e.type === "death" && this.active) {
        this.open("death");
        void this.save(true);
      }
    });
    this.ui.loading("构建灰谷地形与建筑", 42);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    this.renderer = new GameRenderer(this.engine, this.sim, this.settings);
    this.ui.loading("准备森林、物资与动态光照", 74);
    await this.renderer.initialize();
    this.ui.loading("整理生存记录", 96);
    this.loading = false;
    this.lastSaved = state.elapsed;
    this.frameError = false;
    this.lastError = "";
    this.playFrames = 0;
    this.last = performance.now();
  }
  private frame() {
    const now = performance.now(),
      dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    if (this.loading || !this.renderer || this.frameError) return;
    try {
      const playing =
        this.active &&
        this.ui.screen === "play" &&
        (document.pointerLockElement === this.canvas || this.input.fallback) &&
        !this.consoleOpen;
      this.renderer.setMenu(!this.active);
      if (playing) {
        const mouse = this.input.mouse();
        const sensitivity =
          this.settings.sensitivity * 0.00165 * (this.input.aiming ? 0.55 : 1);
        this.sim.state.player.yaw +=
          mouse.x * sensitivity +
          (Number(this.input.held.has("ArrowRight")) -
            Number(this.input.held.has("ArrowLeft"))) *
            dt *
            1.7;
        this.sim.state.player.pitch = clamp(
          this.sim.state.player.pitch +
            mouse.y * sensitivity * (this.settings.invertY ? -1 : 1) +
            (Number(this.input.held.has("ArrowDown")) -
              Number(this.input.held.has("ArrowUp"))) *
              dt *
              1.1,
          -1.4,
          1.4,
        );
        this.renderer.weapon.mouse(mouse.x, mouse.y);
        this.sim.update(dt, this.input.movement());
        if (this.input.mouseDown || this.input.attackPressed) {
          this.input.attackPressed = false;
          if (this.sim.building.active) {
            this.place();
            this.input.mouseDown = false;
          } else if (this.sim.combat.equipped()?.id === "grenade") {
            this.sim.combat.throw(
              this.renderer.camera.position,
              this.renderer.camera.getForwardRay().direction,
            );
            this.sim.actions.cleanup();
            this.input.mouseDown = false;
          } else
            this.sim.combat.fire(
              this.renderer.camera.position,
              this.renderer.camera.getForwardRay().direction,
              this.input.aiming,
            );
        }
        this.playFrames++;
        if (
          this.sim.state.elapsed - this.lastSaved >= 180 &&
          !this.autosaving
        ) {
          void this.save(true);
        }
        this.lowFpsTime =
          this.engine.getFps() < 35
            ? this.lowFpsTime + dt
            : Math.max(0, this.lowFpsTime - dt);
        if (this.lowFpsTime > 15 && !this.performanceWarned) {
          this.performanceWarned = true;
          this.ui.toast(
            "当前帧率较低，可在设置中降低分辨率比例或画质。",
            "warning",
          );
        }
      } else if (this.ui.screen === "crafting") this.sim.tickCraft(dt);
      this.renderer.update(
        dt,
        playing && this.input.aiming,
        this.input.down("leanLeft") ? -1 : this.input.down("leanRight") ? 1 : 0,
      );
      const target = playing ? this.renderer.target() : null;
      this.ui.setInteraction(target);
      const stats = this.renderer.stats;
      this.ui.update(
        dt,
        this.input.aiming,
        stats.fps,
        stats.chunks,
        stats.drawCalls,
      );
      if (this.sim.building.active) {
        const ghost = this.renderer.placement();
        this.ui.buildingPrompt(ghost.valid, ghost.reason);
      }
      this.audio.update(this.sim, now / 1000, playing);
    } catch (e) {
      this.frameError = true;
      this.input.unlock();
      this.lastError = e instanceof Error ? e.message : String(e);
      console.error(e instanceof Error ? e.stack || e.message : String(e));
      this.ui.error(
        e instanceof Error
          ? e.message
          : "游戏遇到意外问题。最近一次存档仍保留。",
      );
    }
  }
  private bind() {
    document.addEventListener("pointerlockchange", () => {
      const locked = document.pointerLockElement === this.canvas;
      this.ui.setLocked(locked);
      if (
        !locked &&
        !this.input.fallback &&
        this.active &&
        this.ui.screen === "play" &&
        !this.consoleOpen
      )
        this.ui.show("pause");
    });
    window.addEventListener("blur", () => {
      if (this.active && this.ui.screen === "play") this.open("pause");
    });
    window.addEventListener("keydown", (e) => this.key(e));
    document.addEventListener("click", (event) => {
      if (
        event.target === this.canvas &&
        this.active &&
        this.ui.screen === "play" &&
        !document.pointerLockElement &&
        !this.input.fallback
      )
        void this.resume();
    });
    document
      .querySelector("#console-input")
      ?.addEventListener("keydown", (e) => {
        const key = e as KeyboardEvent;
        if (key.key === "Enter") {
          const input = key.target as HTMLInputElement;
          let result: string;
          try {
            result = this.command(input.value);
          } catch (err) {
            result = String(err);
          }
          document.querySelector("#console-output")!.textContent +=
            "\n> " + input.value + "\n" + result;
          input.value = "";
        }
      });
    window.addEventListener("pagehide", () => {
      if (this.active && this.saveId)
        void this.saves.save(this.sim.state, this.saveId).catch(() => {});
    });
  }
  private key(e: KeyboardEvent) {
    if (this.frameError || this.ui.screen === "error") return;
    if (this.ui.binding) {
      if (["Escape", "MetaLeft", "MetaRight"].includes(e.code)) {
        this.ui.binding = null;
        this.ui.render();
        return;
      }
      e.preventDefault();
      const used = Object.entries(this.settings.keys).find(
        ([action, code]) => code === e.code && action !== this.ui.binding,
      );
      if (used) {
        this.ui.toast("这个键位已被其他操作使用。", "warning");
        return;
      }
      this.settings.keys[this.ui.binding] = e.code;
      this.ui.binding = null;
      this.persistSettings();
      this.ui.render();
      return;
    }
    const typing =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement ||
      e.target instanceof HTMLTextAreaElement;
    if (typing && e.code !== "Escape") return;
    if (e.code === "Backquote" && import.meta.env.DEV && this.active) {
      e.preventDefault();
      this.toggleConsole();
      return;
    }
    if (e.code === "Escape") {
      e.preventDefault();
      if (this.consoleOpen) {
        this.toggleConsole();
        return;
      }
      if (this.sim?.building.active) {
        this.sim.building.active = false;
        this.ui.render();
        return;
      }
      if (this.ui.screen === "play") {
        this.open("pause");
      } else if (
        ["menu", "newgame", "loading", "death", "end"].includes(this.ui.screen)
      ) {
        if (this.ui.screen === "newgame") this.ui.show("menu");
      } else void this.action("close-panel", document.createElement("button"));
      return;
    }
    if (!this.active || this.loading) return;
    if (e.code === "F3") {
      e.preventDefault();
      this.ui.debugVisible = !this.ui.debugVisible;
      document
        .querySelector("#debug-panel")
        ?.classList.toggle("hidden", !this.ui.debugVisible);
      return;
    }
    if (this.ui.screen === "inventory" && e.code === "KeyR") {
      e.preventDefault();
      this.ui.rotateSelected();
      return;
    }
    const mappings: [string, Screen][] = [
      ["inventory", "inventory"],
      ["crafting", "crafting"],
      ["building", "building"],
      ["map", "map"],
      ["journal", "journal"],
    ];
    for (const [action, screen] of mappings)
      if (e.code === this.settings.keys[action]) {
        e.preventDefault();
        if (this.ui.screen === screen) void this.resume();
        else if (!["death", "end"].includes(this.ui.screen)) this.open(screen);
        return;
      }
    if (
      this.ui.screen !== "play" ||
      (!document.pointerLockElement && !this.input.fallback)
    )
      return;
    if (e.code === this.settings.keys.interact && !e.repeat) {
      e.preventDefault();
      if (this.sim.building.active) {
        this.place();
        return;
      }
      if (this.sim.state.player.vehicle) {
        this.sim.vehicles.exit();
        return;
      }
      const target = this.renderer.target();
      if (target) this.interact(target);
    }
    if (e.code === this.settings.keys.reload && !e.repeat) {
      if (this.sim.building.active) this.sim.building.rotation += Math.PI / 2;
      else this.sim.combat.reload();
    }
    if (e.code === this.settings.keys.flashlight && !e.repeat) {
      this.sim.state.player.flashlight = !this.sim.state.player.flashlight;
      this.sim.bus.emit({ type: "sound", text: "pickup", kind: "pickup" });
    }
    if (e.code === this.settings.keys.crouch && !e.repeat) {
      e.preventDefault();
      this.sim.state.player.stance =
        this.sim.state.player.stance === "crouch" ? "stand" : "crouch";
    }
    if (e.code === this.settings.keys.prone && !e.repeat)
      this.sim.state.player.stance =
        this.sim.state.player.stance === "prone" ? "stand" : "prone";
    if (e.code === this.settings.keys.grenade && !e.repeat) {
      this.sim.combat.throw(
        this.renderer.camera.position,
        this.renderer.camera.getForwardRay().direction,
      );
      this.sim.actions.cleanup();
    }
    if (e.code === "KeyH" && !e.repeat) this.renderer.weapon.inspect();
    if (/^Digit[1-5]$/.test(e.code) && !e.repeat) {
      this.sim.state.player.selected = Number(e.code.slice(-1)) - 1;
      this.sim.combat.cancelReload();
      const held = this.sim.combat.equipped();
      if (
        held &&
        ["food", "drink", "medical"].includes(ITEMS[held.id]!.category)
      )
        this.sim.actions.use(held.uid);
    }
    if (e.code === this.settings.keys.jump) e.preventDefault();
  }
  private interact(target: Interaction) {
    switch (target.type) {
      case "container":
        this.ui.nearbySource = target.id;
        this.sim.state.containers[target.id]!.searched = true;
        this.sim.state.containers[target.id]!.openedAt = this.sim.state.elapsed;
        this.open("inventory");
        break;
      case "door":
        this.sim.actions.door(target.id);
        break;
      case "resource":
        this.sim.actions.gather(target);
        break;
      case "corpse":
        if (this.sim.actions.harvest(target.id)) {
          this.ui.nearbySource = "corpse:" + target.id;
          this.open("inventory");
        }
        break;
      case "story":
        if (this.sim.actions.read(target.id)) {
          this.ui.journalId = target.id;
          this.open("journal");
          void this.save(true);
        }
        break;
      case "glass":
        if (!this.sim.state.destroyed.includes(target.id)) {
          this.sim.state.destroyed.push(target.id);
          this.sim.noise(target.position, 35, "glass");
          this.sim.bus.emit({
            type: "hit",
            text: "玻璃破碎",
            position: target.position,
            kind: "wall",
          });
          this.sim.notify("玻璃已打碎，小心声音吸引感染者。");
        }
        break;
      case "structure":
        this.ui.entityId = target.id;
        this.open("structure");
        break;
      case "vehicle":
        this.ui.entityId = target.id;
        this.open("vehicle");
        break;
      case "npc":
        this.sim.actions.read("clinic");
        this.open("trade");
        break;
      case "radio":
        if (this.sim.actions.radio()) void this.save(true);
        break;
      case "extraction":
        if (this.sim.actions.extract()) {
          this.open("end");
          void this.save(true);
        }
        break;
      case "water":
        if (this.sim.combat.equipped()?.id === "fishingrod")
          this.sim.actions.fish();
        else this.sim.actions.gather({ ...target, resource: "water" });
        break;
    }
  }
  private place() {
    const placement = this.renderer.placement();
    if (this.sim.building.place(placement)) {
      this.sim.actions.cleanup();
      void this.save(true);
    }
  }
  open(screen: Screen) {
    if (screen === "inventory" && this.ui.nearbySource) {
      const c = this.sim.state.containers[this.ui.nearbySource];
      if (
        c &&
        Math.hypot(
          c.position.x - this.sim.state.player.position.x,
          c.position.z - this.sim.state.player.position.z,
        ) > 5
      )
        this.ui.nearbySource = "";
    }
    if (screen === "settings" || screen === "saves" || screen === "credits")
      this.ui.backScreen = this.active ? "pause" : "menu";
    this.ui.show(screen);
    this.input.unlock();
  }
  private async resume() {
    if (!this.active || this.frameError) return;
    this.ui.show("play");
    this.input.clear();
    if (this.settings.dragLook) {
      this.input.fallback = true;
      this.canvas.focus();
      this.ui.setLocked(true);
      void this.audio.unlock();
      return;
    }
    const lock = this.input.lock();
    void this.audio.unlock();
    try {
      await lock;
      this.ui.setLocked(document.pointerLockElement === this.canvas);
    } catch {
      this.input.fallback = true;
      this.canvas.focus();
      this.ui.setLocked(true);
      if (!this.pointerHintShown) {
        this.pointerHintShown = true;
        this.ui.toast(
          "已启用兼容视角：按住右键拖动观察，方向键也可转向。WASD 移动。",
        );
      }
    }
  }
  private async save(quiet = false): Promise<boolean> {
    if (!this.saveId) return false;
    const state = this.sim.state,
      id = this.saveId,
      actions = this.sim.actions;
    this.autosaving = true;
    const task = this.saveQueue
      .catch(() => {})
      .then(async () => {
        actions.cleanup();
        const savedElapsed = state.elapsed;
        await this.saves.save(state, id);
        if (this.sim.state === state && this.saveId === id)
          this.lastSaved = savedElapsed;
        this.ui.saves = await this.saves.list();
      });
    this.saveQueue = task;
    try {
      await task;
      const indicator = document.querySelector("#save-indicator");
      if (indicator) {
        indicator.textContent = "生存记录已保存";
        setTimeout(() => {
          if (indicator.isConnected) indicator.textContent = "";
        }, 3500);
      }
      if (!quiet) this.ui.toast("生存记录已保存。", "success");
      return true;
    } catch (error) {
      this.ui.toast(
        error instanceof Error
          ? error.message
          : "保存失败，请导出生存记录作为备份。",
        "warning",
      );
      return false;
    } finally {
      if (this.saveQueue === task) this.autosaving = false;
    }
  }
  private persistSettings() {
    localStorage.setItem("ashfall-settings", JSON.stringify(this.settings));
    this.audio.apply(this.settings);
    this.ui.applySettings(this.settings);
    this.renderer?.applySettings();
  }
  private async action(action: string, el: HTMLElement) {
    switch (action) {
      case "new-game":
        this.ui.show("newgame");
        break;
      case "back-menu":
        this.ui.show("menu");
        break;
      case "start-world": {
        const form = new FormData(el as HTMLFormElement),
          seed = String(form.get("seed") ?? "").trim(),
          name = String(form.get("name") ?? "").trim(),
          difficulty = String(form.get("difficulty")) as Difficulty;
        if (!seed || !name || !DIFFICULTIES[difficulty]) return;
        await this.audio.unlock();
        this.input.unlock();
        this.active = false;
        this.saveId = "world-" + Date.now();
        await this.setWorld(
          createWorld(seed, name, difficulty, {
            dayLength: clamp(Number(form.get("dayLength") ?? 60), 30, 120),
            lootAmount: clamp(Number(form.get("lootAmount") ?? 1), 0.5, 2),
            enemyDensity: clamp(Number(form.get("enemyDensity") ?? 1), 0.5, 2),
            permadeath: form.get("permadeath") === "on",
          }),
        );
        this.active = true;
        this.renderer.setMenu(false);
        await this.save(true);
        if (this.frameError) {
          this.ui.error(this.lastError);
          return;
        }
        this.ui.show("play");
        this.ui.setLocked(false);
        this.ui.toast("沿公路寻找林务站。Tab 背包，E 交互，Esc 暂停。");
        break;
      }
      case "continue": {
        const first = (await this.saves.list())[0];
        if (first) await this.load(first.id);
        break;
      }
      case "resume":
        await this.resume();
        break;
      case "settings":
        this.open("settings");
        break;
      case "load-menu":
        this.ui.saves = await this.saves.list();
        this.open("saves");
        break;
      case "credits":
        this.open("credits");
        break;
      case "close-panel":
        if (["settings", "saves", "credits"].includes(this.ui.screen))
          this.ui.show(this.ui.backScreen);
        else if (this.active) await this.resume();
        else this.ui.show("menu");
        break;
      case "save":
        await this.save();
        break;
      case "save-menu":
        if (!(await this.save(true))) return;
        this.active = false;
        this.input.unlock();
        this.sim.building.active = false;
        this.renderer.setMenu(true);
        this.ui.saves = await this.saves.list();
        this.ui.show("menu");
        break;
      case "load-save":
        await this.load(el.dataset.id!);
        break;
      case "delete-save": {
        if (el.dataset.confirm !== "yes") {
          el.dataset.confirm = "yes";
          el.textContent = "确认删除";
          return;
        }
        await this.saves.delete(el.dataset.id!);
        this.ui.saves = await this.saves.list();
        this.ui.render();
        break;
      }
      case "export-save": {
        const state = await this.saves.load(el.dataset.id!);
        const blob = new Blob([serialize(state)], { type: "application/json" });
        const url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download =
          "ashfall-" + state.seed.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 500);
        break;
      }
      case "import-save": {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          void file
            .text()
            .then(async (text) => {
              const state = deserialize(text);
              await this.saves.save(state, "import-" + Date.now());
              this.ui.saves = await this.saves.list();
              this.ui.render();
              this.ui.toast("存档已导入", "success");
            })
            .catch((e) =>
              this.ui.toast(
                e instanceof Error ? e.message : "导入失败",
                "warning",
              ),
            );
        };
        input.click();
        break;
      }
      case "setting": {
        const input = el as HTMLInputElement,
          key = input.dataset.setting!;
        if (key === "quality") {
          this.settings.quality = input.value as GameSettings["quality"];
          const previousScreen = this.ui.screen;
          this.persistSettings();
          await this.setWorld(this.sim.state);
          this.renderer.setMenu(!this.active);
          this.ui.show(previousScreen);
          this.ui.toast("新的画质设置已应用。");
          return;
        } else if (input.type === "checkbox")
          (this.settings as unknown as Record<string, unknown>)[key] =
            input.checked;
        else
          (this.settings as unknown as Record<string, unknown>)[key] = Number(
            input.value,
          );
        this.persistSettings();
        break;
      }
      case "reset-settings":
        Object.assign(this.settings, structuredClone(DEFAULT_SETTINGS));
        this.persistSettings();
        this.ui.render();
        break;
      case "rebind":
        this.ui.binding = el.dataset.key!;
        el.textContent = "按下新键位";
        break;
      case "fullscreen":
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
        break;
      case "open-inventory":
        this.open("inventory");
        break;
      case "open-crafting":
        this.open("crafting");
        break;
      case "choose-building":
        this.sim.building.selected = el.dataset.id!;
        this.sim.building.active = true;
        await this.resume();
        break;
      case "enter-vehicle":
        if (this.sim.vehicles.enter(el.dataset.id!)) await this.resume();
        break;
      case "service-vehicle":
        this.sim.vehicles.service(el.dataset.id!, el.dataset.kind as "fuel");
        this.sim.actions.cleanup();
        this.ui.render();
        break;
      case "open-vehicle-storage":
        this.ui.nearbySource = "vehicle:" + el.dataset.id;
        this.open("inventory");
        break;
      case "open-structure-storage":
        this.ui.nearbySource = "structure:" + el.dataset.id;
        this.open("inventory");
        break;
      case "structure-toggle":
        this.sim.building.interact(el.dataset.id!);
        this.sim.actions.cleanup();
        this.ui.render();
        break;
      case "structure-fuel":
        if (!this.sim.building.fuel(el.dataset.id!))
          this.ui.toast("没有足够的燃料。", "warning");
        this.sim.actions.cleanup();
        this.ui.render();
        break;
      case "structure-repair":
        if (!this.sim.building.repair(el.dataset.id!))
          this.ui.toast("维修需要木材 ×2。", "warning");
        this.sim.actions.cleanup();
        this.ui.render();
        break;
      case "structure-reclaim":
        if (this.sim.building.reclaim(el.dataset.id!)) {
          await this.resume();
          await this.save(true);
        }
        break;
      case "sleep":
        if (this.sim.actions.sleep(el.dataset.id!)) {
          await this.save(true);
          await this.resume();
        }
        break;
      case "trade": {
        const t = TRADES[Number(el.dataset.index)];
        if (t) this.sim.actions.trade(t.pay, t.cost, t.item, t.count);
        this.ui.render();
        break;
      }
      case "respawn":
        if (this.sim.actions.respawn()) {
          await this.setWorld(this.sim.state);
          this.active = true;
          await this.resume();
          await this.save(true);
        }
        break;
      case "keep-playing":
        this.sim.state.ended = false;
        await this.resume();
        break;
      case "retry-webgl":
        sessionStorage.setItem("ashfall-force-webgl", "true");
        location.reload();
        break;
      case "reload-page":
        location.reload();
        break;
    }
  }
  private async load(id: string) {
    const state = await this.saves.load(id);
    if (state.flags.includes("player-dead") && state.rules.permadeath) {
      this.ui.toast(
        "这份灰烬难度记录已经结束。可以创建一个新世界。",
        "warning",
      );
      return;
    }
    this.active = false;
    this.input.unlock();
    this.saveId = id;
    await this.setWorld(state);
    this.active = true;
    this.renderer.setMenu(false);
    await this.audio.unlock();
    this.ui.show(state.flags.includes("player-dead") ? "death" : "play");
    this.ui.setLocked(false);
  }
  private toggleConsole() {
    this.consoleOpen = !this.consoleOpen;
    document
      .querySelector("#console-panel")
      ?.classList.toggle("hidden", !this.consoleOpen);
    if (this.consoleOpen) {
      this.ui.show("pause");
      this.input.unlock();
      (document.querySelector("#console-input") as HTMLInputElement).focus();
    } else void this.resume();
  }
  command(command: string): string {
    if (!import.meta.env.DEV) return "生产版本不支持调试命令。";
    const [op, ...args] = command.trim().split(/\s+/);
    switch (op) {
      case "god":
        this.sim.god = !this.sim.god;
        return "god " + this.sim.god;
      case "give": {
        const id = args[0] ?? "",
          n = Math.floor(Number(args[1] ?? 1));
        if (!Object.hasOwn(ITEMS, id) || n < 1 || n > 1000)
          return "未知物品或数量不合法";
        const added = addItem(this.sim.state.player.inventory, id, n);
        return added ? "已添加 " + id : "背包空间不足";
      }
      case "time": {
        const t = Number(args[0]);
        if (Number.isFinite(t)) this.sim.state.time = ((t % 24) + 24) % 24;
        return String(this.sim.state.time);
      }
      case "weather": {
        const w = args[0];
        if (
          ["clear", "cloudy", "overcast", "rain", "storm", "fog"].includes(
            w ?? "",
          )
        ) {
          this.sim.state.weather = w as WorldState["weather"];
          this.sim.state.nextWeather = this.sim.state.elapsed + 600;
        }
        return this.sim.state.weather;
      }
      case "teleport": {
        let x = Number(args[0]),
          z = Number(args[1]);
        const poi = this.sim.gen.pois.find((p) => p.id === args[0]);
        if (poi) {
          x = poi.x;
          z = poi.z - poi.depth / 2 - 4;
        }
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(z) ||
          Math.abs(x) > 2000 ||
          Math.abs(z) > 2000
        )
          return "坐标无效";
        this.sim.state.player.vehicle = null;
        this.sim.state.player.position = this.sim.gen.position(x, z);
        this.sim.verticalVelocity = 0;
        this.sim.state.player.yaw = 0;
        this.sim.state.player.pitch = 0;
        void this.renderer.world.stream();
        return JSON.stringify(this.sim.state.player.position);
      }
      case "spawn": {
        const kind = args[0] ?? "walker";
        if (!Object.hasOwn(ENEMIES, kind)) return "未知生物";
        const p = this.sim.state.player;
        spawnActor(
          this.sim,
          this.sim.nextId("spawn"),
          kind as keyof typeof ENEMIES,
          this.sim.gen.position(
            p.position.x + Math.sin(p.yaw) * 8,
            p.position.z + Math.cos(p.yaw) * 8,
          ),
        );
        return "已生成 " + kind;
      }
      case "killall":
        for (const a of Object.values(this.sim.state.actors))
          if (!ENEMIES[a.kind].animal) this.sim.ai.hurt(a, 10000);
        return "附近已生成的敌人被移除";
      case "fps":
        return JSON.stringify(this.renderer.stats);
      case "heal":
        this.sim.state.player.stats.health = 100;
        this.sim.state.player.stats.bleeding = 0;
        return "已治疗";
      default:
        return "命令：god / give id count / spawn walker / weather rain / time 22 / teleport x z / teleport pine-0 / killall / heal / fps";
    }
  }
  private installDebug() {
    if (!import.meta.env.DEV) return;
    const api = {
      inspect: () => ({
        ...this.sim.inspect(),
        renderer: this.renderer.stats,
        screen: this.ui.screen,
        locked: document.pointerLockElement === this.canvas,
        inputMode: this.input.fallback ? "drag" : "pointerlock",
        frames: this.playFrames,
        error: this.lastError,
        saveId: this.saveId,
      }),
      command: (text: string) => this.command(text),
      save: () => this.save(true),
      load: () => this.load(this.saveId),
    };
    Object.defineProperties(api, {
      sim: { get: () => this.sim },
      renderer: { get: () => this.renderer },
      ui: { get: () => this.ui },
      game: { get: () => this },
    });
    Object.defineProperty(window, "__game", { configurable: true, value: api });
  }
}
