import { ITEMS } from "../data/items";
import { DIALOGUE_DURATIONS } from "../audio/dialogue-durations";
import type { Interaction, NarrativeState, Vec3 } from "../core/types";
import type { SimContext } from "../simulation/context";
import { addItem, countItem, removeItem } from "../simulation/inventory";
import { NARRATIVE_AUDIO } from "./content";
import {
  NARRATIVE_INTERACTIONS,
  NARRATIVE_RECIPES,
  NARRATIVE_ROUTES,
  SIDE_QUESTS,
  type NarrativeInteractionDefinition,
} from "./quests";
import { SequenceController } from "./sequence-controller";
import { anchor } from "./sequences";
import { LEAD_REASONS } from "./briefing";
import type {
  FinaleChoice,
  NarrativeAnchor,
  SequenceCue,
  SequenceCueEvent,
  SequenceFrame,
} from "./types";

export type NarrativeContext = Pick<SimContext, "state" | "gen" | "notify"> &
  Partial<Pick<SimContext, "noise" | "doors">>;
const investigation = [
  "medical-record",
  "missing-record",
  "contractor-record",
  "military-record",
];
const motives = [
  "facility-military",
  "facility-research",
  "facility-government",
  "facility-contractor",
];
const legacyRecords: Record<string, string> = {
  clinic: "medical-record",
  fort: "military-record",
  industry: "contractor-record",
};
const ACT_NAMES = [
  "",
  "Act 1 · 未撤离的人",
  "Act 2 · 名字与编号",
  "Act 3 · 归零",
  "Act 4 · 地下八米",
  "Finale · 最后一个人工条件",
];

/** Owns narrative state and atomic quest transactions, never the renderer or input. */
export class NarrativeSystem {
  private lastLeadId = "";
  readonly sequence: SequenceController;
  private transient: SequenceCueEvent[] = [];
  private pending = new Map<string, SequenceCueEvent>();
  private liveDialogue: SequenceFrame["subtitle"] = null;
  constructor(private ctx: NarrativeContext) {
    this.migrateLegacy();
    this.sequence = new SequenceController(ctx.state.narrative, (a) =>
      this.resolveAnchor(a),
    );
    this.restoreWorldCues();
    this.refreshObjectives();
    if (!this.has("guidance-initialized")) {
      this.flag("guidance-initialized");
      if (!this.ctx.state.waypoint) this.flag("tracking-main-lead");
    }
    this.followMainLead();
  }
  private get n(): NarrativeState {
    return this.ctx.state.narrative;
  }
  private has(flag: string): boolean {
    return this.n.sequenceFlags.includes(flag);
  }
  private flag(flag: string): void {
    if (!this.has(flag)) this.n.sequenceFlags.push(flag);
  }
  private done(id: string): boolean {
    return this.has("done:" + id);
  }
  private fail(message: string): false {
    this.ctx.notify(message, "warning");
    return false;
  }
  resolveAnchor(a: NarrativeAnchor): Vec3 {
    const poi = this.ctx.gen.pois.find((p) => p.id === a.poiId);
    if (!poi) throw new Error("Unknown narrative POI: " + a.poiId);
    return {
      x: poi.x + a.offset.x,
      y: this.ctx.gen.poiHeight(poi) + a.offset.y,
      z: poi.z + a.offset.z,
    };
  }
  get actTitle(): string {
    return ACT_NAMES[this.n.act] ?? ACT_NAMES[5]!;
  }
  get objectives(): string[] {
    return [...this.n.objectives];
  }
  get mainLead() {
    if (this.n.ending) return null;
    let id: string;
    if (!this.has("evacuation-lie"))
      id = !this.has("survival-food")
        ? "ranger-supplies"
        : !this.has("survival-shelter")
          ? "ranger-shelter"
          : "ranger-radio";
    else if (investigation.some((key) => !this.done(key)))
      id = investigation.find((key) => !this.done(key))!;
    else if (!this.has("ashfall-known")) id = "ashfall-decode";
    else if (!this.has("facility-access")) id = "facility-enter";
    else if (motives.some((key) => !this.done(key)))
      id = motives.find((key) => !this.done(key))!;
    else if (!this.has("facility-truth")) id = "facility-archive";
    else if (!this.has("cleanup-isolated")) id = "facility-isolate";
    else id = "facility-control";
    const entry = NARRATIVE_INTERACTIONS.find((value) => value.id === id)!;
    const poi = this.ctx.gen.pois.find(
      (value) => value.id === entry.anchor.poiId,
    )!;
    return {
      id,
      title: entry.title,
      reason: LEAD_REASONS[id] ?? entry.description,
      poiName: poi.name,
      position: this.resolveAnchor(entry.anchor),
      underground: entry.anchor.offset.y < 0,
    };
  }
  trackMainLead(): boolean {
    const lead = this.mainLead;
    if (!lead) return false;
    this.flag("tracking-main-lead");
    this.lastLeadId = lead.id;
    this.ctx.state.waypoint = { ...lead.position };
    return true;
  }
  stopTrackingMainLead() {
    this.n.sequenceFlags = this.n.sequenceFlags.filter(
      (flag) => flag !== "tracking-main-lead",
    );
  }
  private followMainLead() {
    const lead = this.mainLead;
    if ((lead?.id ?? "") === this.lastLeadId) return;
    this.lastLeadId = lead?.id ?? "";
    if (this.has("tracking-main-lead"))
      this.ctx.state.waypoint = lead ? { ...lead.position } : null;
  }
  get audioLogs() {
    return this.n.audioLogs
      .map((id) => ({ id, ...NARRATIVE_AUDIO[id]! }))
      .filter((line) => line.text);
  }
  get sideQuests() {
    return SIDE_QUESTS.map((q) => ({
      ...q,
      stage: this.n.quests[q.id]?.stage ?? 0,
      completed: !!this.n.quests[q.id]?.completed,
      currentObjective: this.n.quests[q.id]?.completed
        ? "已完成"
        : (q.steps[this.n.quests[q.id]?.stage ?? 0]?.objective ?? "已完成"),
    }));
  }
  get unlockedRoutes() {
    return NARRATIVE_ROUTES.filter((r) => this.n.quests[r.quest]?.completed);
  }
  get unlockedRecipes() {
    return NARRATIVE_RECIPES.filter(
      (r) => this.n.quests[r.unlockQuest]?.completed,
    );
  }
  isRecipeUnlocked(id: string): boolean {
    return this.unlockedRecipes.some((r) => r.id === id);
  }
  ownsInteraction(id: string): boolean {
    return (
      id.startsWith("narrative:") &&
      NARRATIVE_INTERACTIONS.some((d) => d.id === id.slice(10))
    );
  }
  interactions(): Interaction[] {
    return NARRATIVE_INTERACTIONS.filter((d) => this.visible(d)).map((d) => ({
      id: "narrative:" + d.id,
      type: d.kind === "npc" ? "npc" : d.kind === "radio" ? "radio" : "story",
      name: d.title,
      position: this.resolveAnchor(d.anchor),
      detail:
        d.kind === "choice"
          ? this.choices()
              .find((c) => c.interactionId === "narrative:" + d.id)
              ?.missing.join("；") || d.description
          : d.description,
    }));
  }
  private visible(d: NarrativeInteractionDefinition): boolean {
    if (d.questId) {
      const state = this.n.quests[d.questId];
      return (
        (state?.stage ?? 0) === d.stage || (!!state?.completed && d.stage === 2)
      );
    }
    if (d.kind === "choice") return this.has("finale-ready") && !this.n.choice;
    return true;
  }
  /** All writes, including final choices, require living player proximity to the actual POI. */
  interact(id: string): boolean {
    const key = id.startsWith("narrative:") ? id.slice(10) : id;
    const entry = NARRATIVE_INTERACTIONS.find((d) => d.id === key);
    if (!entry) return false;
    if (this.ctx.state.player.stats.health <= 0)
      return this.fail("当前无法进行交互。");
    if (this.sequence.frame().blocking)
      return this.fail("等待当前过场结束，或按跳过继续。");
    const position = this.resolveAnchor(entry.anchor),
      p = this.ctx.state.player.position;
    if (
      Math.hypot(p.x - position.x, p.z - position.z) > 3.6 ||
      Math.abs(p.y - position.y) > 2.5
    )
      return this.fail("靠近目标后再操作。");
    if (!this.visible(entry)) return this.fail("先完成这条任务的上一步。");
    if (!this.ctx.state.discovered.includes(entry.anchor.poiId))
      this.ctx.state.discovered.push(entry.anchor.poiId);
    if (entry.questId) return this.advanceQuest(entry);
    if (key.startsWith("choice-"))
      return this.commitChoice(
        key.slice(7) as NonNullable<NarrativeState["choice"]>,
      );
    if (this.done(key) && key !== "facility-enter" && key !== "facility-exit") {
      if (entry.audioId) this.speak(entry.audioId);
      else this.ctx.notify("已经完成：" + entry.title);
      return true;
    }
    const inv = this.ctx.state.player.inventory;
    if (key === "ranger-supplies") {
      if (!this.transact({}, { beans: 2, water: 1 })) return false;
      this.flag("survival-food");
    } else if (key === "ranger-shelter") {
      if (
        !this.has("survival-food") &&
        !inv.items.some((i) => ITEMS[i.id]?.category === "food")
      )
        return this.fail("先取得食物；林务员在站内留下了补给。");
      if (
        Object.values(this.ctx.state.actors).some(
          (a) =>
            a.health > 0 &&
            !["deer", "boar"].includes(a.kind) &&
            Math.hypot(a.position.x - p.x, a.position.z - p.z) < 18,
        )
      )
        return this.fail("附近仍有威胁。清理或引开它们，再建立安全点。");
      this.ctx.state.player.spawn = this.resolveAnchor(
        anchor("pine-0", 0, 0, -2),
      );
      this.flag("survival-food");
      this.flag("survival-shelter");
      this.setDoor("pine-0", "closed");
    } else if (key === "ranger-radio") {
      if (!this.has("survival-shelter") || !this.has("survival-food"))
        return this.fail("先找到食物并在林务站建立安全点。");
      this.record("evac-loop");
      this.speak("ranger-warning");
      this.flag("evacuation-lie");
      if (!this.ctx.state.journal.includes("ranger"))
        this.ctx.state.journal.push("ranger");
    } else if (investigation.includes(key)) {
      if (!this.has("evacuation-lie"))
        return this.fail("先在林务站核验撤离广播，确定调查方向。");
      if (
        key === "military-record" &&
        !countItem(inv, "keycard") &&
        !this.transact({}, { keycard: 1 })
      )
        return false;
      if (entry.audioId) this.speak(entry.audioId);
      const old = Object.entries(legacyRecords).find(
        ([, current]) => current === key,
      )?.[0];
      if (old && !this.ctx.state.journal.includes(old))
        this.ctx.state.journal.push(old);
    } else if (key === "mayor-record") {
      this.speak("mayor-session");
    } else if (key === "ashfall-decode") {
      if (!investigation.every((i) => this.done(i)))
        return this.fail(
          "尚缺调查记录：" +
            investigation
              .filter((i) => !this.done(i))
              .map((i) => NARRATIVE_INTERACTIONS.find((d) => d.id === i)!.title)
              .join("、"),
        );
      this.queueSequence("ashfall-reveal");
    } else if (key === "facility-enter") {
      if (!this.has("ashfall-known"))
        return this.fail("先在要塞雷达控制室解码 ASHFALL 命令。");
      if (!countItem(inv, "keycard"))
        return this.fail("地下升降台需要渡鸦访问卡。");
      // Persist the destination before the visual lift cue: skip/reload cannot strand the player between floors.
      this.ctx.state.player.position = this.resolveAnchor(
        anchor("lab-0", 0, -8, -3),
      );
      this.flag("facility-access");
      this.setDoor("facility-lift", "open");
      if (!this.n.seenSequences.includes("facility-entry"))
        this.queueSequence("facility-entry");
      else
        this.emit("lift-down", {
          type: "animation",
          target: "facility-lift",
          animation: "lift-down",
          duration: 2,
          anchor: anchor("lab-0", 0, -8, -3),
        });
    } else if (key === "facility-exit") {
      if (!this.has("facility-access"))
        return this.fail("地下升降台尚未授权。");
      this.ctx.state.player.position = this.resolveAnchor(
        anchor("lab-0", 0, 0, -8),
      );
      this.emit("lift-up", {
        type: "animation",
        target: "facility-lift",
        animation: "lift-up",
        duration: 2,
        anchor: anchor("lab-0", 0, 0, -8),
      });
    } else if (motives.includes(key)) {
      if (!this.has("facility-access"))
        return this.fail("先通过研究站升降台进入地下设施。");
      if (entry.audioId) this.speak(entry.audioId);
    } else if (key === "facility-archive") {
      if (!motives.every((i) => this.done(i)))
        return this.fail("需要分别核验军方、研究、地方政府和承包商四个终端。");
      if (!countItem(inv, "protocol") && !this.transact({}, { protocol: 1 }))
        return false;
      this.flag("archive-complete");
      if (!this.ctx.state.journal.includes("lab"))
        this.ctx.state.journal.push("lab");
      this.queueSequence("facility-reveal");
    } else if (key === "facility-isolate") {
      if (!this.done("facility-contractor"))
        return this.fail("先读取承包商终端，核验隔离阀编号与回路。");
      this.flag("cleanup-isolated");
      this.setDoor("facility-vault", "closed");
      this.emit("isolation-sparks", {
        type: "particle",
        anchor: entry.anchor,
        effect: "sparks",
        count: 20,
        duration: 1,
      });
    } else if (key === "facility-control") {
      if (!this.has("facility-truth") || !this.has("cleanup-isolated"))
        return this.fail("先复制完整档案并切断谷地清理回路。");
      this.queueSequence("finale");
    } else return false;
    this.flag("done:" + key);
    this.refreshObjectives();
    this.ctx.notify("已完成：" + entry.title, "success");
    return true;
  }
  private advanceQuest(entry: NarrativeInteractionDefinition): boolean {
    const quest = SIDE_QUESTS.find((q) => q.id === entry.questId)!;
    const current = this.n.quests[quest.id] ?? { stage: 0, completed: false };
    if (current.completed) {
      if (entry.audioId) this.speak(entry.audioId);
      return true;
    }
    if (current.stage !== entry.stage) return this.fail("先完成任务的上一步。");
    const step = quest.steps[current.stage]!,
      last = current.stage === quest.steps.length - 1;
    if (!this.transact(step.cost ?? {}, last ? quest.reward : {})) return false;
    this.n.quests[quest.id] = { stage: current.stage + 1, completed: last };
    if (entry.audioId) this.speak(entry.audioId);
    if (last) {
      this.flag("quest-complete:" + quest.id);
      if (
        quest.id === "radio" &&
        !this.ctx.state.flags.includes("radio-repaired")
      )
        this.ctx.state.flags.push("radio-repaired");
      if (quest.unlockRecipe) this.flag("recipe:" + quest.unlockRecipe);
      if (quest.unlockRoute) this.flag("route:" + quest.unlockRoute);
      this.restoreWorldCues();
      this.ctx.notify(
        "支线完成：" + quest.title + "。奖励已放入背包。",
        "success",
      );
    } else this.ctx.notify(quest.steps[current.stage + 1]!.objective);
    this.refreshObjectives();
    return true;
  }
  private transact(
    cost: Record<string, number>,
    reward: Record<string, number>,
  ): boolean {
    const next = structuredClone(this.ctx.state.player.inventory);
    const missing = Object.entries(cost).filter(
      ([id, n]) => countItem(next, id) < n,
    );
    if (missing.length)
      return this.fail(
        "还需要：" +
          missing.map(([id, n]) => `${ITEMS[id]?.name ?? id} ×${n}`).join("、"),
      );
    for (const [id, n] of Object.entries(cost))
      if (!removeItem(next, id, n)) return false;
    for (const [id, n] of Object.entries(reward))
      if (!addItem(next, id, n))
        return this.fail(
          "背包空间不足。整理后再交付，物资尚未消耗，奖励会保留。",
        );
    const p = this.ctx.state.player;
    p.inventory.items = next.items;
    p.quickSlots = p.quickSlots.map((uid) =>
      p.inventory.items.some((i) => i.uid === uid) ? uid : null,
    );
    for (const [slot, uid] of Object.entries(p.equipment))
      if (!p.inventory.items.some((i) => i.uid === uid))
        delete p.equipment[slot as keyof typeof p.equipment];
    return true;
  }
  choices(): FinaleChoice[] {
    const common: string[] = [];
    if (!this.has("finale-ready")) common.push("在地下控制台完成最后的核验");
    if (!this.has("archive-complete") || !motives.every((i) => this.done(i)))
      common.push("核验四方终端并复制完整档案");
    if (!this.has("cleanup-isolated")) common.push("切断谷地清理回路");
    if (!countItem(this.ctx.state.player.inventory, "protocol"))
      common.push("携带 ASHFALL 原始档案");
    if (this.n.choice) common.push("最终选择已经确认，无法再次选择");
    const truth = [...common],
      ash = [...common],
      survivor = [...common];
    if (!this.ctx.state.flags.includes("radio-repaired"))
      truth.push("完成乔榆的广播中继修复");
    if (!this.done("mayor-record")) truth.push("找到市政原始会议录音");
    if (!this.n.quests.officer?.completed) truth.push("取得沈维的完整签名证词");
    if (
      new Set(
        this.ctx.state.discovered.filter((id) =>
          this.ctx.gen.pois.some((p) => p.id === id),
        ),
      ).size < 8
    )
      truth.push("实际探索至少 8 处地点");
    if (!countItem(this.ctx.state.player.inventory, "fuel"))
      ash.push("准备燃料 ×1 用于地下定向焚毁");
    if (!this.n.quests.shelter?.completed)
      survivor.push("恢复地下避难所的持续供水");
    if (!this.n.quests.hunter?.completed)
      survivor.push("完成猎人家人的补给并取得巡林退路");
    return [
      {
        id: "publish",
        interactionId: "narrative:choice-publish",
        title: "公开档案与证词",
        consequence:
          "证据送出封锁区，幸存者获得公开接应；原始研究资料仍可能被他人利用。",
        ending: "truth",
        available: !truth.length,
        missing: truth,
      },
      {
        id: "destroy",
        interactionId: "narrative:choice-destroy",
        title: "隔离并销毁",
        consequence:
          "只焚毁地下样本与原始资料，阻止复制实验；部分追责证据永久失去。",
        ending: "ash",
        available: !ash.length,
        missing: ash,
      },
      {
        id: "shutdown",
        interactionId: "narrative:choice-shutdown",
        title: "关闭系统并留下",
        consequence: "停止远程清理，保留低温隔离；你与幸存者轮班维护灰谷。",
        ending: "survivor",
        available: !survivor.length,
        missing: survivor,
      },
    ];
  }
  /** UI choice buttons use the same physical console gate as an in-world interaction. */
  choose(choice: NonNullable<NarrativeState["choice"]>): boolean {
    return this.interact("narrative:choice-" + choice);
  }
  private commitChoice(choice: NonNullable<NarrativeState["choice"]>): boolean {
    const option = this.choices().find((c) => c.id === choice);
    if (!option || !option.available)
      return this.fail(option?.missing.join("；") ?? "无效的最终选择。");
    const cost: Record<string, number> =
      choice === "destroy" ? { protocol: 1, fuel: 1 } : {};
    if (!this.transact(cost, {})) return false;
    this.n.choice = choice;
    this.n.ending = option.ending;
    this.flag("remote-cleanup-stopped");
    if (choice === "publish") {
      if (!this.ctx.state.flags.includes("broadcast"))
        this.ctx.state.flags.push("broadcast");
      if (!this.ctx.state.journal.includes("broadcast"))
        this.ctx.state.journal.push("broadcast");
    }
    this.queueSequence("ending-" + option.ending);
    this.refreshObjectives();
    return true;
  }
  update(dt: number): void {
    if (this.liveDialogue) {
      this.liveDialogue.remaining -= Math.max(0, dt);
      if (this.liveDialogue.remaining <= 0) this.liveDialogue = null;
    }
    this.sequence.update(dt);
    if (
      this.ctx.state.player.inventory.items.some(
        (i) => ITEMS[i.id]?.category === "food",
      )
    )
      this.flag("survival-food");
    if (
      this.n.ending &&
      this.has("ending-complete:" + this.n.ending) &&
      !this.has("story-continued")
    )
      this.ctx.state.ended = true;
    if (!this.n.activeSequence && !this.ctx.state.ended) {
      const queued = this.n.sequenceFlags.find((flag) =>
        flag.startsWith("pending:"),
      );
      if (queued) {
        this.n.sequenceFlags = this.n.sequenceFlags.filter(
          (flag) => flag !== queued,
        );
        this.sequence.start(queued.slice(8));
      } else if (!this.n.seenSequences.includes("opening"))
        this.sequence.start("opening");
      else if (
        this.n.ending &&
        !this.n.seenSequences.includes("ending-" + this.n.ending)
      )
        this.sequence.start("ending-" + this.n.ending);
      else this.triggerNearbyEvent();
    }
    this.refreshObjectives();
    this.followMainLead();
  }
  private queueSequence(id: string): void {
    if (this.n.seenSequences.includes(id) || this.n.activeSequence?.id === id)
      return;
    if (!this.n.activeSequence) {
      this.liveDialogue = null;
      this.sequence.start(id);
    } else this.flag("pending:" + id);
  }
  private triggerNearbyEvent(): void {
    for (const [id, poiId, radius] of [
      ["shelf-collapse", "pine-3", 7],
      ["fort-alarm", "fort-6", 22],
    ] as const) {
      const a = this.resolveAnchor(anchor(poiId)),
        p = this.ctx.state.player.position;
      if (
        !this.n.seenSequences.includes(id) &&
        Math.hypot(p.x - a.x, p.z - a.z) < radius &&
        Math.abs(p.y - a.y) < 4
      ) {
        this.sequence.start(id);
        break;
      }
    }
  }
  skipSequence(): boolean {
    const result = this.sequence.skip();
    if (
      this.n.ending &&
      this.has("ending-complete:" + this.n.ending) &&
      !this.has("story-continued")
    )
      this.ctx.state.ended = true;
    this.refreshObjectives();
    return result;
  }
  continueSurvival(): boolean {
    if (!this.n.ending || !this.has("ending-complete:" + this.n.ending))
      return false;
    this.flag("story-continued");
    this.ctx.state.ended = false;
    return true;
  }
  frame(): SequenceFrame {
    const frame = this.sequence.frame();
    if (!frame.subtitle && this.liveDialogue)
      frame.subtitle = { ...this.liveDialogue };
    return frame;
  }
  drainCues(): SequenceCueEvent[] {
    const result = [
      ...this.sequence.drainCues(),
      ...this.pending.values(),
      ...this.transient,
    ];
    this.transient = [];
    return result;
  }
  ackCue(key: string): void {
    this.sequence.ackCue(key);
    this.pending.delete(key);
  }
  private record(id: string): void {
    if (NARRATIVE_AUDIO[id] && !this.n.audioLogs.includes(id))
      this.n.audioLogs.push(id);
  }
  replayLog(id: string): boolean {
    if (!this.n.audioLogs.includes(id) || !NARRATIVE_AUDIO[id]) return false;
    this.speak(id, true);
    return true;
  }
  private speak(id: string, replay = false): void {
    const audio = NARRATIVE_AUDIO[id];
    if (!audio) return;
    this.record(id);
    const duration = DIALOGUE_DURATIONS[id]
      ? DIALOGUE_DURATIONS[id]! + 0.35
      : Math.max(8, Math.min(34, audio.text.length / 5));
    this.liveDialogue = {
      speaker: audio.speaker,
      text: audio.text,
      audioId: id,
      remaining: duration,
    };
    this.emit("audio:" + id, {
      type: "audio",
      audioId: id,
      gain: 0.9,
      delivery: replay ? "log" : audio.delivery,
    });
    this.emit("dialogue:" + id, {
      type: "dialogue",
      audioId: id,
      speaker: audio.speaker,
      text: audio.text,
      duration,
    });
  }
  private emit(
    key: string,
    payload: SequenceCue,
    persistent = false,
    replay = false,
  ): void {
    const event: SequenceCueEvent = {
      key: "world:" + key,
      sequenceId: "world",
      cueId: key,
      at: this.ctx.state.elapsed,
      payload,
      replay,
      skipped: false,
      requiresAck: persistent,
    };
    if (persistent) this.pending.set(event.key, event);
    else this.transient.push(event);
  }
  private setDoor(
    id: string,
    state: "open" | "closed" | "unlocked",
    replay = false,
  ): void {
    this.emit("door:" + id, { type: "door", doorId: id, state }, true, replay);
    const door = this.ctx.doors?.get(id);
    if (door) {
      door.locked = false;
      if (state !== "unlocked") {
        door.target = state === "open" ? 1 : 0;
        door.status = state === "open" ? "opening" : "closing";
      }
    }
  }
  private restoreWorldCues(): void {
    for (const route of this.unlockedRoutes) {
      if (route.doorId) this.setDoor(route.doorId, "open", true);
      this.emit(
        "route:" + route.id,
        {
          type: "objective",
          text: `路线已解锁：${route.name}。${route.description}`,
        },
        true,
        true,
      );
      if (route.id === "underpass")
        this.emit(
          "raider-withdraw",
          {
            type: "ai",
            command: "withdraw",
            radius: 45,
            duration: 0,
            anchor: anchor("city-3"),
          },
          true,
          true,
        );
    }
    if (this.n.quests.shelter?.completed)
      this.emit(
        "shelter-power",
        {
          type: "lighting",
          target: "city-3",
          color: "#edc68e",
          intensity: 1.2,
          duration: 0,
          anchor: anchor("city-3", 0, 2),
        },
        true,
        true,
      );
    if (this.has("cleanup-isolated"))
      this.setDoor("facility-vault", "closed", true);
  }
  private refreshObjectives(): void {
    if (this.n.ending) {
      this.n.act = 5;
      this.n.objectives = [
        this.has("ending-complete:" + this.n.ending)
          ? `故事完成：${NARRATIVE_AUDIO["ending-" + this.n.ending]!.title}`
          : "最终选择已确认，等待结局播完或跳过。",
      ];
      return;
    }
    if (!this.has("evacuation-lie")) {
      this.n.act = 1;
      this.n.objectives = [
        !this.has("survival-food")
          ? "寻找食物：松谷林务站内有林务员留下的补给"
          : !this.has("survival-shelter")
            ? "清理附近威胁，在松谷林务站建立安全点"
            : "接通林务站接收机，核验仍在循环的撤离通告",
      ];
    } else if (!investigation.every((id) => this.done(id))) {
      this.n.act = 2;
      this.n.objectives = investigation
        .filter((id) => !this.done(id))
        .map(
          (id) =>
            NARRATIVE_INTERACTIONS.find((d) => d.id === id)!.title +
            " · " +
            this.ctx.gen.pois.find(
              (p) =>
                p.id ===
                NARRATIVE_INTERACTIONS.find((d) => d.id === id)!.anchor.poiId,
            )!.name,
        );
    } else if (!this.has("ashfall-known")) {
      this.n.act = 3;
      this.n.objectives = [
        "前往渡鸦要塞雷达控制室，比对四份记录并解码 ASHFALL 命令",
      ];
    } else if (!this.has("facility-truth")) {
      this.n.act = 4;
      this.n.objectives = !this.has("facility-access")
        ? ["携带渡鸦访问卡，从第七研究站升降台进入地下八米的设施"]
        : motives.some((id) => !this.done(id))
          ? motives
              .filter((id) => !this.done(id))
              .map(
                (id) =>
                  "地下核验：" +
                  NARRATIVE_INTERACTIONS.find((d) => d.id === id)!.title,
              )
          : ["在地下档案主机复制完整原始记录"];
    } else {
      this.n.act = 5;
      this.n.objectives = !this.has("cleanup-isolated")
        ? ["在承包商控制回路旁切断谷地清理燃料管线"]
        : !this.has("finale-ready")
          ? ["操作地下最终控制台，核验三种选择与后果"]
          : ["在地下控制台作出最终选择；可在离开前完成任务以解锁其他结果"];
    }
  }
  private migrateLegacy(): void {
    if (this.has("narrative-v2-adapted")) return;
    const s = this.ctx.state;
    // Legacy records retain their proven scope. Old lab access does not invent the new four-party investigation.
    const legacy = s.journal.some((id) =>
      ["ranger", "clinic", "fort", "industry", "lab", "broadcast"].includes(id),
    );
    if (legacy) {
      this.flag("survival-food");
      this.flag("survival-shelter");
      this.flag("evacuation-lie");
      for (const id of ["ranger-supplies", "ranger-shelter", "ranger-radio"])
        this.flag("done:" + id);
      if (!this.n.seenSequences.includes("opening"))
        this.n.seenSequences.push("opening");
      for (const [old, current] of Object.entries(legacyRecords))
        if (s.journal.includes(old)) this.flag("done:" + current);
      for (const id of s.journal) {
        const audioId =
          id === "ranger"
            ? "ranger-warning"
            : id === "clinic"
              ? "mira-cases"
              : id === "fort"
                ? "military-order"
                : id === "industry"
                  ? "contractor-ledger"
                  : null;
        if (audioId) this.record(audioId);
      }
      if (s.flags.includes("radio-repaired") || s.flags.includes("broadcast")) {
        this.n.quests.radio = { stage: 3, completed: true };
        if (!s.flags.includes("radio-repaired")) s.flags.push("radio-repaired");
      }
      if (s.ended && s.flags.includes("extracted")) {
        this.n.choice = "publish";
        this.n.ending = "truth";
        this.flag("ending-complete:truth");
        if (!this.n.seenSequences.includes("ending-truth"))
          this.n.seenSequences.push("ending-truth");
      }
    }
    this.flag("narrative-v2-adapted");
  }
}
