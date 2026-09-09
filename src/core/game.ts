import { type AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { createEngine } from "../rendering/engine";
import { GameRenderer } from "../rendering/renderer";
import { GameUI, type Screen } from "../ui/ui";
import { AudioManager } from "../audio/audio";
import { DIALOGUE_DURATIONS } from "../audio/dialogue-durations";
import { cameraPreferences } from "./camera-settings";
import { measureDisplayCadence } from "./display-cadence";
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
import { interactWorldEvent } from "../simulation/world-events";
import { TRADES } from "../ui/world-views";
import {
  NARRATIVE_AUDIO,
  NARRATIVE_INTERACTIONS,
  type SequenceCueEvent,
} from "../narrative";
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
  private resumeGeneration = 0;
  private lastPerformanceRead = 0;
  private offSim: (() => void) | null = null;
  private frameError = false;
  private lastError = "";
  private consoleOpen = false;
  private autosaving = false;
  private saveQueue: Promise<void> = Promise.resolve();
  private playFrames = 0;
  private frameSamples: number[] = [];
  private simFrameMs = 0;
  private readonly renderFrame = () => this.frame();
  private checkingDisplay = false;
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
    this.installDebug();
  }
  private readSettings(): GameSettings {
    try {
      const data = JSON.parse(
        localStorage.getItem("ashfall-settings") ?? "null",
      ) as Partial<GameSettings> | null;
      return {
        ...structuredClone(DEFAULT_SETTINGS),
        ...data,
        ...cameraPreferences(data),
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
      this.engine.runRenderLoop(this.renderFrame);
      window.addEventListener("resize", () => this.engine.resize());
      this.installDebug();
    } catch (e) {
      console.error(e);
      this.ui.error(e instanceof Error ? e.message : String(e));
    }
  }
  private async setWorld(state: WorldState) {
    this.audio.stopDialogue();
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
    const frameMs = now - this.last;
    this.last = now;
    if (this.loading || !this.renderer || this.frameError) return;
    try {
      const controlsActive =
        this.active &&
        this.ui.screen === "play" &&
        this.input.active &&
        !this.consoleOpen;
      const sessionRunning =
        this.active &&
        ![
          "menu",
          "loading",
          "pause",
          "settings",
          "saves",
          "credits",
          "death",
          "end",
          "error",
          "creative",
        ].includes(this.ui.screen) &&
        (this.ui.screen !== "play" || controlsActive);
      const previousSequence = this.sim.narrative.frame();
      if (sessionRunning) this.sim.narrative.update(dt);
      const sequence = this.sim.narrative.frame();
      if (this.active)
        for (const cue of this.sim.narrative.drainCues())
          this.narrativeCue(cue);
      if (sequence.blocking && !previousSequence.blocking) {
        this.input.clear();
        this.sim.actions.cancel("");
        this.sim.cancelCraft();
        this.sim.combat.cancelReload();
      }
      if (previousSequence.blocking && !sequence.blocking) {
        this.audio.stopDialogue();
        this.input.clear();
        void this.save(true);
        if (previousSequence.id === "finale" && !this.sim.state.ended) {
          this.ui.entityId = "finale";
          this.open("conversation");
        }
      }
      if (this.active && this.sim.state.ended && this.ui.screen !== "end")
        this.open("end");
      const playing =
        this.active &&
        this.ui.screen === "play" &&
        this.input.active &&
        !this.consoleOpen &&
        !sequence.blocking;
      this.renderer.setMenu(!this.active);
      if (playing) {
        this.frameSamples.push(frameMs);
        if (this.frameSamples.length > 600) this.frameSamples.shift();
        this.sim.viewFov = this.settings.fov;
        this.sim.viewAspect =
          this.engine.getRenderWidth() /
          Math.max(1, this.engine.getRenderHeight());
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
          -1.45,
          1.48,
        );
        this.renderer.weapon.mouse(mouse.x, mouse.y);
        const simStart = performance.now();
        this.sim.update(dt, this.input.movement());
        this.simFrameMs = performance.now() - simStart;
        this.renderer.prepareView(
          dt,
          this.input.aiming,
          this.input.down("leanLeft")
            ? -1
            : this.input.down("leanRight")
              ? 1
              : 0,
        );
        if (
          !this.sim.narrative.frame().blocking &&
          (this.input.mouseDown || this.input.attackPressed)
        ) {
          this.sim.actions.cancel("");
          this.sim.cancelCraft();
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
      } else if (sessionRunning && sequence.blocking) {
        this.sim.doors.update(dt);
      } else if (
        this.active &&
        [
          "inventory",
          "crafting",
          "building",
          "map",
          "journal",
          "conversation",
          "body",
          "structure",
          "vehicle",
          "trade",
        ].includes(this.ui.screen)
      ) {
        this.sim.update(dt, {
          forward: 0,
          side: 0,
          sprint: false,
          jump: false,
          brake: false,
        });
      }
      const presentationDt = !this.active || sessionRunning ? dt : 0;
      if (!playing) this.renderer.prepareView(presentationDt, false, 0);
      this.renderer.interactionSource =
        this.ui.screen === "inventory" ? this.ui.nearbySource : "";
      this.renderer.update(presentationDt, playing && this.input.aiming);
      const target = playing ? this.renderer.target() : null;
      this.ui.setInteraction(target);
      if (this.ui.debugVisible && now - this.lastPerformanceRead > 500) {
        this.lastPerformanceRead = now;
        const stats = this.renderer.stats;
        this.ui.performanceDetail = `Render CPU ${stats.sceneMs.toFixed(1)} ms · Sim ${this.simFrameMs.toFixed(1)} ms\nGPU ${stats.gpuMeasurement === "main-pass" ? "主通道" : stats.gpuMeasurement === "frame" ? "整帧" : "未测得"} ${stats.gpuMs?.toFixed(1) ?? "N/A"} ms · ${stats.resolution.join("×")} · 无游戏帧率上限`;
      }
      this.ui.scopeWeight = this.renderer.motion.pose.ads;
      this.ui.update(
        dt,
        this.input.aiming,
        this.engine.getFps(),
        this.renderer.world.chunks.size,
        this.engine._drawCalls?.current ?? 0,
      );
      if (this.sim.building.active) {
        const ghost = this.renderer.placement();
        this.ui.buildingPrompt(ghost.valid, ghost.reason);
      }
      this.audio.update(
        this.sim,
        now / 1000,
        this.active &&
          !["pause", "settings", "saves", "death", "end"].includes(
            this.ui.screen,
          ),
      );
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
      const locked = document.pointerLockElement === this.canvas,
        wasLocked = this.ui.locked;
      if (
        locked &&
        (this.ui.screen !== "play" || !document.hasFocus() || document.hidden)
      ) {
        this.input.unlock();
        return;
      }
      this.ui.setLocked(locked || this.input.fallback);
      if (
        !locked &&
        wasLocked &&
        !this.input.fallback &&
        this.active &&
        this.ui.screen === "play" &&
        !this.consoleOpen
      )
        this.open("pause");
    });
    window.addEventListener("blur", () => {
      if (
        this.active &&
        [
          "play",
          "inventory",
          "crafting",
          "building",
          "map",
          "journal",
          "conversation",
          "body",
          "structure",
          "vehicle",
          "trade",
        ].includes(this.ui.screen)
      )
        this.open("pause");
    });
    document.addEventListener("visibilitychange", () => {
      if (
        document.hidden &&
        this.active &&
        [
          "play",
          "inventory",
          "crafting",
          "building",
          "map",
          "journal",
          "conversation",
          "body",
          "structure",
          "vehicle",
          "trade",
        ].includes(this.ui.screen)
      )
        this.open("pause");
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
    if (
      this.frameError ||
      this.ui.screen === "error" ||
      !document.hasFocus() ||
      document.hidden
    )
      return;
    // Keep browser fullscreen, refresh and OS application switching available.
    if (e.code === "F11" || e.code === "F5" || e.altKey || e.metaKey) return;
    if (e.ctrlKey && !this.input.active) return;
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
    if (
      (typing ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)) &&
      e.code !== "Escape"
    )
      return;
    if (e.repeat && !["Space"].includes(e.code)) return;
    // Escape after browser unlock must never immediately request another lock.
    if (e.code === "Escape" && this.ui.screen === "pause") return;
    if (
      this.active &&
      this.sim.creative &&
      e.code === "F6" &&
      this.ui.screen === "play"
    ) {
      e.preventDefault();
      this.sim.toggleFlight();
      this.ui.toast(
        this.sim.flying
          ? "飞行开启：空格上升，Ctrl下降，Shift加速，F6退出。"
          : "已退出飞行。",
      );
      return;
    }
    if (
      this.active &&
      this.sim.flying &&
      [this.settings.keys.jump, this.settings.keys.crouch].includes(e.code)
    ) {
      e.preventDefault();
      return;
    }
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
      if (
        this.active &&
        [
          "inventory",
          "vehicle",
          "structure",
          "trade",
          "crafting",
          "building",
          "map",
          "journal",
          "body",
          "conversation",
          "creative",
        ].includes(this.ui.screen)
      ) {
        this.sim.actions.cancel();
        this.sim.cancelCraft();
        this.ui.show("play");
        this.ui.setLocked(false);
        this.input.unlock();
        this.audio.pauseDialogue();
        return;
      }
      if (this.sim?.actions.pending) {
        this.sim.actions.cancel();
        return;
      }
      if (this.sim?.craftJob) {
        this.sim.cancelCraft();
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
    if (
      e.code === "F4" &&
      this.active &&
      !this.loading &&
      !this.checkingDisplay &&
      ["play", "pause"].includes(this.ui.screen)
    ) {
      e.preventDefault();
      void this.checkDisplay();
      return;
    }
    if (!this.active || this.loading || this.ui.screen === "pause") return;
    if (
      this.ui.screen === "play" &&
      e.code === "KeyX" &&
      !e.repeat &&
      this.sim.narrative.frame().skippable
    ) {
      e.preventDefault();
      this.skipSequence();
      return;
    }
    if (this.sim.narrative.frame().blocking) return;
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
        if (
          this.ui.screen === screen ||
          (action === "inventory" &&
            [
              "vehicle",
              "structure",
              "trade",
              "crafting",
              "building",
              "map",
              "journal",
              "body",
              "creative",
            ].includes(this.ui.screen))
        )
          void this.resume();
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
        const id = this.sim.state.player.vehicle;
        if (
          Math.abs(
            this.sim.state.vehicles.find((v) => v.id === id)?.speed ?? 0,
          ) > 2
        ) {
          this.sim.notify("先停车再下车", "warning");
          return;
        }
        if (
          this.sim.actions.begin("exit-vehicle", "正在离开驾驶室", 0.7, () =>
            this.sim.vehicles.exit(),
          )
        ) {
          const door = this.sim.doors.get("vehicle:" + id + ":left");
          if (door && !door.target) this.sim.doors.request(door.id);
        }
        return;
      }
      const target = this.renderer.target();
      if (target) this.interact(target);
    }
    if (e.code === this.settings.keys.reload && !e.repeat) {
      if (this.sim.building.active) this.sim.building.rotation += Math.PI / 2;
      else {
        this.sim.actions.cancel("");
        this.sim.cancelCraft();
        this.sim.combat.reload();
      }
    }
    if (e.code === this.settings.keys.flashlight && !e.repeat) {
      if (this.sim.state.player.flashlightCharge <= 0) {
        this.sim.notify("手电没有电量。打开背包为它充电。", "warning");
        return;
      }
      this.sim.state.player.flashlight = !this.sim.state.player.flashlight;
      this.sim.bus.emit({ type: "sound", text: "pickup", kind: "pickup" });
    }
    if (e.code === this.settings.keys.crouch && !e.repeat) {
      e.preventDefault();
      this.sim.setStance(
        this.sim.state.player.stance === "crouch" ? "stand" : "crouch",
      );
    }
    if (e.code === this.settings.keys.prone && !e.repeat)
      this.sim.setStance(
        this.sim.state.player.stance === "prone" ? "stand" : "prone",
      );
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
    if (target.id.startsWith("event:")) {
      this.sim.actions.begin(
        target.type === "npc" ? "heal" : "repair",
        target.name,
        1.4,
        () => {
          const ok = interactWorldEvent(this.sim, target.id);
          if (ok) void this.save(true);
          return ok;
        },
        { target: target.position },
      );
      return;
    }
    if (target.id.startsWith("conversation:")) {
      this.ui.entityId = target.id.slice(13);
      this.open("conversation");
      return;
    }
    if (target.id.startsWith("narrative:")) {
      if (
        target.id === "narrative:facility-control" &&
        this.sim.state.narrative.sequenceFlags.includes("finale-ready")
      ) {
        this.ui.entityId = "finale";
        this.open("conversation");
        return;
      }
      this.sim.actions.begin(
        "interact",
        target.name,
        0.85,
        () => {
          const before = this.sim.state.player.position;
          const success = this.sim.narrative.interact(target.id);
          if (this.sim.state.player.position !== before) {
            this.sim.verticalVelocity = 0;
            this.sim.grounded = true;
            this.sim.locomotion.reset();
          }
          if (success) void this.save(true);
          return success;
        },
        { target: target.position },
      );
      return;
    }
    switch (target.type) {
      case "container": {
        const container = this.sim.state.containers[target.id];
        if (!container) break;
        this.sim.actions.begin(
          "search",
          "正在搜索 " + container.name,
          container.searched ? 0.4 : container.type === "military" ? 2.2 : 1.4,
          () => {
            if (
              !this.sim.collision.visible(
                {
                  ...this.sim.state.player.position,
                  y:
                    this.sim.state.player.position.y +
                    this.renderer.motion.pose.height,
                },
                container.position,
              )
            ) {
              this.sim.notify("无法接触这个容器。", "warning");
              return false;
            }
            this.ui.nearbySource = target.id;
            container.searched = true;
            container.openedAt = this.sim.state.elapsed;
            this.open("inventory");
            return true;
          },
          { target: container.position },
        );
        break;
      }
      case "door":
        this.sim.actions.door(target.id);
        break;
      case "resource":
        if (target.id.startsWith("tree:")) {
          this.sim.actions.cancel("");
          this.sim.cancelCraft();
          this.sim.combat.fire(
            this.renderer.camera.position,
            this.renderer.camera.getForwardRay().direction,
          );
          break;
        }
        this.sim.actions.begin(
          target.resource === "wood" ? "chop" : "pickup",
          "正在采集 " + target.name,
          target.resource === "ore"
            ? 2.4
            : target.resource === "wood"
              ? 1.4
              : 0.65,
          () => this.sim.actions.gather(target),
          { target: target.position },
        );
        break;
      case "corpse":
        this.sim.actions.begin(
          "harvest",
          "正在处理遗体",
          2.2,
          () => {
            if (!this.sim.actions.harvest(target.id)) return false;
            this.ui.nearbySource = "corpse:" + target.id;
            this.open("inventory");
            return true;
          },
          { target: target.position },
        );
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
        this.ui.entityId = "米拉";
        this.open("conversation");
        break;
      case "radio":
        this.ui.entityId = "乔榆";
        this.open("conversation");
        break;
      case "extraction":
        if (
          this.sim.state.narrative.ending === "truth" &&
          this.sim.actions.extract()
        ) {
          this.open("end");
          void this.save(true);
        } else
          this.sim.notify(
            "接应组需要经过核验的档案和公开证词。先完成地下控制台的调查与选择。",
          );
        break;
      case "water":
        if (this.sim.combat.equipped()?.id === "fishingrod")
          this.sim.actions.fish();
        else
          this.sim.actions.begin(
            "pickup",
            "正在收集水",
            1.1,
            () => this.sim.actions.gather({ ...target, resource: "water" }),
            { target: target.position },
          );
        break;
    }
  }
  private skipSequence() {
    const before = this.sim.narrative.frame();
    if (!this.sim.narrative.skipSequence()) return;
    this.audio.stopDialogue();
    this.input.clear();
    for (const cue of this.sim.narrative.drainCues()) this.narrativeCue(cue);
    if (before.id === "finale" && !this.sim.state.ended) {
      this.ui.entityId = "finale";
      this.open("conversation");
    }
    if (this.sim.state.ended) this.open("end");
    void this.save(true);
  }
  private narrativeCue(event: SequenceCueEvent) {
    const cue = event.payload;
    if (cue.type === "audio") {
      const line = NARRATIVE_AUDIO[cue.audioId];
      const delivery = cue.delivery ?? line?.delivery;
      const speakerAnchor =
        delivery === "dialogue"
          ? NARRATIVE_INTERACTIONS.find((d) => d.npc === line?.speaker)?.anchor
          : undefined;
      if (line)
        void this.audio.playDialogue({
          id: cue.audioId,
          text: line.text,
          speaker: line.speaker,
          radio: delivery === "radio" || delivery === "log",
          volume: cue.gain,
          position: cue.anchor
            ? this.sim.narrative.resolveAnchor(cue.anchor)
            : speakerAnchor
              ? this.sim.narrative.resolveAnchor(speakerAnchor)
              : undefined,
        });
      else
        this.audio.event({
          type: "sound",
          text: cue.audioId,
          kind: cue.audioId,
          position: cue.anchor
            ? this.sim.narrative.resolveAnchor(cue.anchor)
            : undefined,
        });
    } else if (cue.type === "door") {
      const data = this.sim.doors.get(cue.doorId);
      if (!data) return;
      data.locked = false;
      if (data.status !== "broken" && cue.state !== "unlocked") {
        data.target = cue.state === "open" ? 1 : 0;
        data.status = data.target ? "opening" : "closing";
        this.sim.state.doors[cue.doorId] = !!data.target;
      }
    } else if (cue.type === "particle")
      this.renderer.effects.sequenceBurst(
        this.sim.narrative.resolveAnchor(cue.anchor),
        cue.effect,
        cue.count,
        cue.duration,
      );
    else if (cue.type === "explosion") {
      const position = this.sim.narrative.resolveAnchor(cue.anchor);
      this.sim.combat.detonate(position, cue.damage / 180, cue.radius);
    } else if (cue.type === "ai") {
      const position = this.sim.narrative.resolveAnchor(cue.anchor);
      if (cue.command === "investigate")
        this.sim.noise(position, cue.radius, "scripted");
      for (const actor of Object.values(this.sim.state.actors)) {
        const distance = Math.hypot(
          actor.position.x - position.x,
          actor.position.z - position.z,
        );
        if (actor.health <= 0 || distance > cue.radius) continue;
        if (cue.command === "hold")
          this.sim.state.cooldowns["ai-hold:" + actor.id] =
            this.sim.state.elapsed + cue.duration;
        if (cue.command === "release")
          delete this.sim.state.cooldowns["ai-hold:" + actor.id];
        if (cue.command === "withdraw" && actor.kind === "raider") {
          this.sim.state.cooldowns["ai-withdraw:" + actor.id] =
            this.sim.state.elapsed + 60;
          actor.attack = null;
          actor.awareness = 0;
          actor.state = "flee";
          actor.target = {
            x:
              actor.position.x +
              ((actor.position.x - position.x) / (distance || 1)) * 75,
            y: actor.position.y,
            z:
              actor.position.z +
              ((actor.position.z - position.z) / (distance || 1)) * 75 +
              10,
          };
        }
      }
    } else if (cue.type === "objective") {
      if (!event.replay && !event.skipped) this.sim.notify(cue.text);
    } else if (cue.type === "animation" || cue.type === "lighting") {
      this.renderer.narrativeWorld.cue(event);
      if (cue.type === "animation" && cue.target === "player")
        this.renderer.sequenceAction(cue.animation, cue.duration);
    }
    if (event.requiresAck) this.sim.narrative.ackCue(event.key);
  }
  private place() {
    const placement = this.renderer.placement();
    if (this.sim.building.place(placement)) {
      this.sim.actions.cleanup();
      void this.save(true);
    }
  }
  open(screen: Screen) {
    if (["pause", "settings", "saves", "death", "end", "menu"].includes(screen))
      this.audio.pauseDialogue();
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
    ++this.resumeGeneration;
    this.ui.show(screen);
    this.input.unlock();
    this.ui.setLocked(false);
  }
  private async resume() {
    if (this.checkingDisplay) return;
    if (
      !this.active ||
      this.frameError ||
      !document.hasFocus() ||
      document.hidden
    )
      return;
    const generation = ++this.resumeGeneration;
    this.ui.show("play");
    const subtitle = this.sim.narrative.frame().subtitle;
    void this.audio.resumeDialogue().then((resumed) => {
      if (
        !resumed &&
        subtitle &&
        this.ui.screen === "play" &&
        this.sim.narrative.frame().subtitle?.audioId === subtitle.audioId &&
        !this.audio.diagnostics().dialogue
      ) {
        const line = NARRATIVE_AUDIO[subtitle.audioId];
        if (line)
          void this.audio.playDialogue({
            id: subtitle.audioId,
            text: line.text,
            speaker: line.speaker,
            radio: line.delivery !== "dialogue",
            offsetSeconds: Math.max(
              0,
              (DIALOGUE_DURATIONS[subtitle.audioId] ?? subtitle.remaining) -
                subtitle.remaining,
            ),
          });
      }
    });
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
      if (generation !== this.resumeGeneration || this.ui.screen !== "play")
        return;
      this.ui.setLocked(this.input.active);
    } catch {
      if (generation !== this.resumeGeneration || this.ui.screen !== "play")
        return;
      this.input.clear();
      this.ui.setLocked(false);
      this.ui.toast(
        "点击继续探索以重新捕获鼠标；Esc 可释放鼠标。右键拖动仅在设置中手动启用。",
      );
    }
  }
  private async checkDisplay() {
    this.checkingDisplay = true;
    const gameFps = this.engine.getFps();
    this.open("pause");
    this.ui.debugVisible = true;
    document.querySelector("#debug-panel")?.classList.remove("hidden");
    this.ui.displayDiagnostic = "正在检测浏览器轻载节拍，请保持窗口在前台…";
    const panel = document.querySelector("#debug-panel");
    if (panel) panel.textContent = this.ui.displayDiagnostic;
    this.ui.toast("检测约 1 秒，游戏已暂停。完成后点击继续探索。");
    this.engine.stopRenderLoop(this.renderFrame);
    try {
      const hz = await measureDisplayCadence();
      this.ui.displayDiagnostic = `检测前 ${Math.round(gameFps)} FPS · 浏览器轻载 ${Math.round(hz)} Hz\n${hz > gameFps * 1.3 ? "轻载明显更快：游戏负载仍有优化空间" : "游戏与轻载节拍接近；若轻载明显低于屏幕设置，再检查浏览器/驱动/电源"}\n轻载采样值不等于显示器规格`;
    } catch (error) {
      this.ui.displayDiagnostic =
        error instanceof Error ? error.message : "检测未完成，请重试。";
    } finally {
      if (panel) panel.textContent = this.ui.displayDiagnostic;
      this.checkingDisplay = false;
      this.last = performance.now();
      this.engine.runRenderLoop(this.renderFrame);
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
      case "cancel-action":
        this.sim.actions.cancel();
        this.sim.cancelCraft();
        break;
      case "charge-flashlight":
        if (this.sim.rechargeFlashlight()) await this.resume();
        break;
      case "skip-sequence":
        this.skipSequence();
        break;
      case "open-trade":
        this.open("trade");
        break;
      case "narrative-interact":
        if (this.sim.narrative.interact(el.dataset.id!)) {
          await this.resume();
          void this.save(true);
        }
        break;
      case "narrative-choice":
        if (
          this.sim.narrative.choose(
            el.dataset.id as "publish" | "destroy" | "shutdown",
          )
        ) {
          await this.resume();
          void this.save(true);
        }
        break;
      case "replay-log":
        this.sim.narrative.replayLog(el.dataset.id!);
        break;
      case "open-creative":
        if (this.sim.creative) this.open("creative");
        break;
      case "creative-give":
        if (
          this.sim.giveCreative(
            el.dataset.id ?? "",
            Number(el.dataset.count ?? 1),
          )
        ) {
          this.ui.toast("已放入背包。");
          this.ui.render();
        } else
          this.ui.toast("无法取物：请确认创造模式并整理背包空间。", "warning");
        break;
      case "track-main-lead":
        if (this.sim.narrative.trackMainLead())
          this.ui.toast("已追踪主线：地图与罗盘会显示目标。");
        break;
      case "quest-waypoint": {
        const entry = NARRATIVE_INTERACTIONS.find(
          (d) => d.id === el.dataset.id,
        );
        if (entry) {
          const p = this.sim.narrative.resolveAnchor(entry.anchor);
          this.sim.narrative.stopTrackingMainLead();
          this.sim.state.waypoint = { ...p };
          this.sim.notify(
            "已标记：" +
              this.sim.gen.pois.find((p) => p.id === entry.anchor.poiId)!.name,
            "success",
          );
        }
        break;
      }
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
        const world = createWorld(seed, name, difficulty, {
          dayLength: clamp(Number(form.get("dayLength") ?? 60), 30, 120),
          lootAmount: clamp(Number(form.get("lootAmount") ?? 1), 0.5, 2),
          enemyDensity: clamp(Number(form.get("enemyDensity") ?? 1), 0.5, 2),
          permadeath: form.get("permadeath") === "on",
        });
        if (form.get("creative") === "on") {
          world.flags.push("creative-mode");
          world.narrative.seenSequences.push("opening");
        }
        await this.setWorld(world);
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
      case "reset-settings": {
        const previousScreen = this.ui.screen,
          quality = this.settings.quality;
        Object.assign(this.settings, structuredClone(DEFAULT_SETTINGS));
        this.persistSettings();
        if (quality !== this.settings.quality) {
          await this.setWorld(this.sim.state);
          this.renderer.setMenu(!this.active);
          this.ui.show(previousScreen);
        } else this.ui.render();
        break;
      }
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
      case "open-building":
        this.open("building");
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
        if (
          this.sim.actions.begin(
            "enter-vehicle",
            "正在进入驾驶室",
            0.8,
            () => {
              if (!this.sim.vehicles.enter(el.dataset.id!)) return false;
              void this.resume();
              return true;
            },
            {
              target: this.sim.state.vehicles.find(
                (v) => v.id === el.dataset.id,
              )!.position,
              range: 4.5,
            },
          )
        ) {
          const door = this.sim.doors.get("vehicle:" + el.dataset.id + ":left");
          if (door && !door.target) this.sim.doors.request(door.id);
          void this.resume();
        }
        break;
      case "service-vehicle":
        this.sim.actions.begin(
          "repair",
          el.dataset.kind === "fuel" ? "正在给车辆加油" : "正在维修车辆",
          el.dataset.kind === "fuel" ? 1.4 : 2.2,
          () =>
            this.sim.vehicles.service(
              el.dataset.id!,
              el.dataset.kind as "fuel",
            ),
        );
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
        this.sim.actions.begin("interact", "正在操作设施", 0.85, () =>
          this.sim.building.interact(el.dataset.id!),
        );
        break;
      case "structure-fuel":
        this.sim.actions.begin("interact", "正在添加燃料", 0.8, () => {
          const result = this.sim.building.fuel(el.dataset.id!);
          if (!result) this.ui.toast("没有足够的燃料。", "warning");
          return result;
        });
        break;
      case "structure-repair":
        this.sim.actions.begin("repair", "正在维修设施", 1.8, () => {
          const result = this.sim.building.repair(el.dataset.id!);
          if (!result) this.ui.toast("维修需要木材 ×2。", "warning");
          return result;
        });
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
        if (!this.sim.narrative.continueSurvival())
          this.sim.state.ended = false;
        void this.save(true);
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
        this.sim.locomotion.reset();
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
        performance: {
          simulationMs: this.simFrameMs,
          physicsQueries: this.sim.collision.queries,
          frameP95: this.frameSamples.length
            ? [...this.frameSamples].sort((a, b) => a - b)[
                Math.floor(this.frameSamples.length * 0.95)
              ]
            : null,
          frameP99: this.frameSamples.length
            ? [...this.frameSamples].sort((a, b) => a - b)[
                Math.floor(this.frameSamples.length * 0.99)
              ]
            : null,
        },
        renderer: this.renderer.stats,
        motion: {
          pose: this.renderer.motion.pose,
          weights: this.renderer.motion.weights,
        },
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
