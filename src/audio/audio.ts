import type { Feedback, GameSettings, Vec3 } from "../core/types";
import type { Simulation } from "../simulation/simulation";
import { weight } from "../simulation/inventory";
import { SOUND_GROUPS, DIALOGUE_FILES } from "./catalog";
import {
  acousticSpace,
  eventCooldown,
  feedbackLayers,
  SPACES,
  variantIndex,
  type AcousticSpace,
  type FoleyContext,
  type SoundLayer,
} from "./palette";

export function setListenerPose(
  listener: AudioListener,
  position: Vec3,
  yaw: number,
  time: number,
): void {
  if (listener.positionX && listener.forwardX && listener.upX) {
    for (const [parameter, value] of [
      [listener.positionX, position.x],
      [listener.positionY, position.y + 1.65],
      [listener.positionZ, position.z],
      [listener.forwardX, Math.sin(yaw)],
      [listener.forwardY, 0],
      [listener.forwardZ, Math.cos(yaw)],
      [listener.upX, 0],
      [listener.upY, 1],
      [listener.upZ, 0],
    ] as const)
      parameter.setValueAtTime(value, time);
  } else {
    listener.setPosition(position.x, position.y + 1.65, position.z);
    listener.setOrientation(Math.sin(yaw), 0, Math.cos(yaw), 0, 1, 0);
  }
}
export interface DialogueCue {
  id: string;
  text: string;
  speaker?: string;
  position?: Vec3;
  radio?: boolean;
  volume?: number;
  offsetSeconds?: number;
}
interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  nodes: AudioNode[];
  priority: number;
}
interface Loop {
  source: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}
const MAX_VOICES = 36;
const MAX_DECODED_BYTES = 64 * 1024 * 1024;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private ambience: GainNode | null = null;
  private effects: GainNode | null = null;
  private dialogue: GainNode | null = null;
  private wet: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private failed = new Set<string>();
  private abort = new AbortController();
  private voices = new Set<Voice>();
  private loops = new Map<string, Loop>();
  private variants = new Map<string, number>();
  private cooldowns = new Map<string, number>();
  private impulses = new Map<AcousticSpace, AudioBuffer>();
  private space: AcousticSpace = "outdoors";
  private foley: FoleyContext = { speed: 0, stance: "stand", load: 0 };
  private actorKinds = new Map<string, string>();
  private listenerPosition: Vec3 = { x: 0, y: 0, z: 0 };
  private nextAmbient = 0;
  private nextRoof = 0;
  private lastFlashlight: boolean | null = null;
  private nextFoleyContext = 0;
  private active = false;
  private dialogueSerial = 0;
  private dialogueVoice: Voice | null = null;
  private dialogueSpeaking = false;
  private dialogueCue: DialogueCue | null = null;
  private dialoguePaused = false;
  private dialogueOffset = 0;
  private dialogueStartedAt = 0;
  private usingSpeech = false;
  private engineVehicle: string | null = null;
  private settings: GameSettings;

  constructor(settings: GameSettings) {
    this.settings = settings;
  }
  async unlock() {
    if (!this.ctx) {
      this.abort = new AbortController();
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.lowpass = ctx.createBiquadFilter();
      this.lowpass.type = "lowpass";
      this.lowpass.frequency.value = 20000;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -9;
      limiter.knee.value = 8;
      limiter.ratio.value = 10;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.18;
      const headroom = ctx.createGain();
      headroom.gain.value = 0.78;
      this.master.connect(this.lowpass);
      this.lowpass.connect(limiter);
      limiter.connect(headroom);
      headroom.connect(ctx.destination);
      this.ambience = ctx.createGain();
      this.effects = ctx.createGain();
      this.dialogue = ctx.createGain();
      this.ambience.connect(this.master);
      this.effects.connect(this.master);
      this.dialogue.connect(this.master);
      this.reverb = ctx.createConvolver();
      this.wet = ctx.createGain();
      this.reverb.connect(this.wet);
      this.wet.connect(this.effects);
      this.setSpace("outdoors", true);
      this.apply(this.settings);
      // Local game assets; asynchronous and bounded. Gameplay never waits on a remote service.
      void this.preload();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }
  private async load(file: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(file)) return this.buffers.get(file)!;
    if (this.failed.has(file) || !this.ctx) return null;
    if (this.loading.has(file)) return this.loading.get(file)!;
    const ctx = this.ctx;
    const signal = this.abort.signal;
    const task = (async () => {
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}audio/${file}`,
          { signal, cache: "force-cache" },
        );
        if (!response.ok) throw new Error(`Audio ${response.status}`);
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (this.ctx !== ctx || ctx.state === "closed") return null;
        const bytes = buffer.length * buffer.numberOfChannels * 4;
        let used = this.decodedBytes();
        // Dialogue is streamed cue by cue; evict old decoded dialogue first.
        for (const [key, old] of this.buffers) {
          if (used + bytes <= MAX_DECODED_BYTES) break;
          if (key.startsWith("dialogue/")) {
            this.buffers.delete(key);
            used -= old.length * old.numberOfChannels * 4;
          }
        }
        if (used + bytes <= MAX_DECODED_BYTES) this.buffers.set(file, buffer);
        return buffer;
      } catch {
        if (!signal.aborted && this.ctx === ctx) this.failed.add(file);
        return null;
      } finally {
        if (this.ctx === ctx) this.loading.delete(file);
      }
    })();
    this.loading.set(file, task);
    return task;
  }
  private async preload() {
    const ctx = this.ctx;
    const queue = [...new Set(Object.values(SOUND_GROUPS).flat())];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (queue.length && this.ctx === ctx)
          await this.load(queue.shift()!);
      }),
    );
  }
  private decodedBytes() {
    return [...this.buffers.values()].reduce(
      (n, b) => n + b.length * b.numberOfChannels * 4,
      0,
    );
  }
  diagnostics() {
    return {
      activeVoices: this.voices.size,
      loops: this.loops.size,
      loaded: this.buffers.size,
      failed: [...this.failed],
      decodedBytes: this.decodedBytes(),
      space: this.space,
      dialogue: this.dialogueSpeaking,
      dialoguePaused: this.dialoguePaused,
      dialogueOffset:
        this.dialogueOffset +
        (this.dialogueVoice && this.ctx
          ? this.ctx.currentTime - this.dialogueStartedAt
          : 0),
    };
  }
  apply(settings: GameSettings) {
    this.settings = settings;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master?.gain.setTargetAtTime(
      Math.max(0, Math.min(1, settings.masterVolume)),
      t,
      0.04,
    );
    this.effects?.gain.setTargetAtTime(settings.effectsVolume, t, 0.08);
    this.dialogue?.gain.setTargetAtTime(settings.effectsVolume, t, 0.08);
    this.ambience?.gain.setTargetAtTime(
      settings.ambientVolume * (this.dialogueSpeaking ? 0.48 : 1),
      t,
      0.2,
    );
  }
  private setSpace(space: AcousticSpace, force = false) {
    if (
      !this.ctx ||
      !this.reverb ||
      !this.wet ||
      (!force && space === this.space)
    )
      return;
    const ctx = this.ctx,
      profile = SPACES[space];
    this.space = space;
    if (!this.impulses.has(space)) {
      const length = Math.ceil(
        ctx.sampleRate * (profile.decay + profile.delay),
      );
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        let previous = 0;
        for (
          let i = Math.floor(profile.delay * ctx.sampleRate);
          i < length;
          i++
        ) {
          previous +=
            (Math.random() * 2 - 1 - previous) *
            Math.min(0.8, profile.cutoff / ctx.sampleRate);
          data[i] = previous * Math.pow(1 - i / length, 3) * 0.65;
        }
      }
      this.impulses.set(space, impulse);
    }
    this.reverb.buffer = this.impulses.get(space)!;
    this.wet.gain.setTargetAtTime(profile.wet, ctx.currentTime, 0.25);
  }
  private release(voice: Voice) {
    if (!this.voices.delete(voice)) return;
    for (const node of voice.nodes) node.disconnect();
    if (this.dialogueVoice === voice) {
      this.dialogueVoice = null;
      if (!this.dialoguePaused) this.dialogueCue = null;
      this.duck(false);
    }
  }
  private play(
    buffer: AudioBuffer,
    layer: SoundLayer,
    position?: Vec3,
    priority = 1,
    dialogue = false,
    offsetSeconds = 0,
  ): Voice | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return null;
    const offset = Math.max(0, Math.min(buffer.duration, offsetSeconds));
    if (buffer.duration - offset < 0.008) return null;
    if (this.voices.size >= MAX_VOICES) {
      const victim = [...this.voices].find((v) => v.priority < priority);
      if (!victim) return null;
      victim.source.stop();
      this.release(victim);
    }
    const source = ctx.createBufferSource(),
      gain = ctx.createGain(),
      filter = ctx.createBiquadFilter();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(
      0.4,
      Math.min(
        2,
        (layer.rate ?? 1) * (dialogue ? 1 : 0.97 + Math.random() * 0.06),
      ),
    );
    filter.type = "lowpass";
    filter.frequency.value = layer.cutoff ?? 15500;
    const t = ctx.currentTime + (layer.delay ?? 0),
      duration = (buffer.duration - offset) / source.playbackRate.value;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(
      layer.volume * (dialogue ? 1 : 0.92 + Math.random() * 0.08),
      t + 0.003,
    );
    gain.gain.setValueAtTime(
      layer.volume,
      t + Math.max(0.004, duration - 0.035),
    );
    gain.gain.linearRampToValueAtTime(0, t + duration);
    source.connect(filter);
    filter.connect(gain);
    const nodes: AudioNode[] = [source, filter, gain];
    let output: AudioNode = gain;
    if (position) {
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 3;
      panner.maxDistance = 150;
      panner.rolloffFactor = 1.2;
      if (panner.positionX) {
        panner.positionX.value = position.x;
        panner.positionY.value = position.y;
        panner.positionZ.value = position.z;
      } else panner.setPosition(position.x, position.y, position.z);
      gain.connect(panner);
      output = panner;
      nodes.push(panner);
    }
    output.connect(dialogue ? this.dialogue! : this.effects!);
    if (!dialogue) output.connect(this.reverb!);
    const voice = { source, gain, nodes, priority };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    source.start(t, offset);
    return voice;
  }
  private layer(layer: SoundLayer, position?: Vec3, priority = 1) {
    const files = SOUND_GROUPS[layer.group];
    if (!files?.length) return;
    const index = variantIndex(
      files.length,
      this.variants.get(layer.group) ?? -1,
    );
    this.variants.set(layer.group, index);
    const file = files[index]!;
    const buffer = this.buffers.get(file);
    if (buffer) this.play(buffer, layer, position, priority);
    else {
      const started = this.ctx?.currentTime ?? 0;
      void this.load(file).then((decoded) => {
        // Drop late one-shots; a delayed footstep/gunshot is misleading feedback.
        if (decoded && this.ctx && this.ctx.currentTime - started < 0.18)
          this.play(decoded, layer, position, priority);
      });
    }
  }
  event(event: Feedback): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    const key = `${event.type}:${event.kind}:${event.actorId ?? "player"}:${event.kind === "growl" ? event.text : ""}`;
    const now = this.ctx.currentTime;
    if (now - (this.cooldowns.get(key) ?? -Infinity) < eventCooldown(event))
      return;
    this.cooldowns.set(key, now);
    if (this.cooldowns.size > 256)
      for (const [id, at] of this.cooldowns)
        if (now - at > 12) this.cooldowns.delete(id);
    while (this.cooldowns.size > 512)
      this.cooldowns.delete(this.cooldowns.keys().next().value!);
    if (
      event.position &&
      Math.hypot(
        event.position.x - this.listenerPosition.x,
        event.position.z - this.listenerPosition.z,
      ) > 155
    )
      return;
    const animal =
      event.actorId &&
      ["deer", "boar", "wolf"].includes(
        this.actorKinds.get(event.actorId) ?? "",
      );
    const layers =
      animal && event.kind === "growl"
        ? [
            {
              group: "animal",
              volume: 0.15,
              rate: this.actorKinds.get(event.actorId!) === "wolf" ? 0.8 : 1.15,
            },
          ]
        : feedbackLayers(event, this.foley);
    for (const layer of layers)
      this.layer(
        layer,
        event.position,
        event.type === "shot"
          ? layer.group.startsWith("tail-")
            ? 1
            : layer.group === "mechanical"
              ? 2
              : 3
          : event.type === "damage"
            ? 2
            : 1,
      );
  }
  private loop(
    name: string,
    group: string,
    volume: number,
    rate = 1,
    cutoff = 14000,
  ) {
    if (!this.ctx || !this.ambience) return;
    const ctx = this.ctx;
    let loop = this.loops.get(name);
    if (!loop) {
      if (volume <= 0) return;
      const file = SOUND_GROUPS[group]?.[0];
      const buffer = file && this.buffers.get(file);
      if (!buffer) return;
      const source = ctx.createBufferSource(),
        gain = ctx.createGain(),
        filter = ctx.createBiquadFilter();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      filter.type = "lowpass";
      source.connect(filter);
      filter.connect(gain);
      gain.connect(name === "engine" ? this.effects! : this.ambience);
      source.start(0, name === "engine" ? 0 : Math.random() * buffer.duration);
      loop = { source, gain, filter };
      this.loops.set(name, loop);
    }
    loop.gain.gain.setTargetAtTime(
      volume,
      ctx.currentTime,
      name === "engine" ? 0.18 : 0.65,
    );
    loop.source.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.3);
    loop.filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.4);
  }
  update(sim: Simulation, time: number, active: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.active && !active) this.pauseDialogue();
    if (!this.active && active && this.dialoguePaused)
      void this.resumeDialogue();
    this.active = active;
    const p = sim.state.player,
      position = p.position;
    this.listenerPosition = position;
    setListenerPose(ctx.listener, position, p.yaw, ctx.currentTime);
    const submerged =
      sim.gen.isWater(position.x, position.z) && p.stance === "prone";
    this.lowpass?.frequency.setTargetAtTime(
      submerged ? 650 : 20000,
      ctx.currentTime,
      0.15,
    );
    const region = sim.gen.regionAt(position.x, position.z).id;
    this.setSpace(
      position.y < sim.gen.height(position.x, position.z) - 3
        ? "underground"
        : acousticSpace(
            position,
            sim.gen.pois,
            sim.indoors,
            region,
            sim.gen.roadDistance(position.x, position.z),
          ),
    );
    if (time > this.nextFoleyContext) {
      this.nextFoleyContext = time + 0.3;
      this.foley = {
        speed: sim.speed,
        stance: p.stance,
        load: weight(p.inventory),
      };
      this.actorKinds.clear();
      for (const actor of Object.values(sim.state.actors))
        this.actorKinds.set(actor.id, actor.kind);
    }
    if (
      this.lastFlashlight !== null &&
      this.lastFlashlight !== p.flashlight &&
      active
    )
      this.event({
        type: "sound",
        kind: "flashlight",
        text: p.flashlight ? "on" : "off",
      });
    this.lastFlashlight = p.flashlight;
    const lamp = p.inventory.items.find((i) => i.id === "flashlight");
    if (p.flashlight && lamp && lamp.durability < 15 && active)
      this.event({ type: "sound", kind: "flashlight-low", text: "low" });
    const raining = ["rain", "storm"].includes(sim.state.weather),
      night = sim.state.time < 6 || sim.state.time > 20;
    this.loop(
      "wind",
      "wind",
      active ? (sim.indoors ? 0.022 : 0.105) : 0,
      0.96,
      sim.indoors ? 720 : 6500,
    );
    this.loop(
      "forest",
      "forest",
      active && !sim.indoors && !night && !raining
        ? this.space === "forest"
          ? 0.105
          : 0.035
        : 0,
      1,
      7000,
    );
    this.loop(
      "rain",
      "rain",
      active && raining ? (sim.indoors ? 0.055 : 0.15) : 0,
      1,
      sim.indoors ? 1700 : 10500,
    );
    this.loop(
      "roof",
      "rain-roof",
      active && raining && sim.indoors ? 0.06 : 0,
      1,
      4800,
    );
    const vehicle = sim.state.vehicles.find((v) => v.id === p.vehicle);
    const throttle = Math.min(1, Math.abs(vehicle?.speed ?? 0) / 15);
    this.loop(
      "engine",
      "engine",
      vehicle && active ? 0.12 + throttle * 0.065 : 0,
      0.85 + throttle * 1.05,
      400 + throttle * 1800,
    );
    if (p.vehicle && p.vehicle !== this.engineVehicle && active)
      this.layer({ group: "mechanical", volume: 0.17, rate: 0.6 });
    this.engineVehicle = p.vehicle;
    if (active && raining && sim.indoors && time > this.nextRoof) {
      this.nextRoof = time + 1.4 + Math.random() * 2.4;
      this.layer(
        {
          group: /large|underground/.test(this.space)
            ? "hit-metal"
            : "hit-wood",
          volume: 0.016,
          rate: 1.4,
          cutoff: 2500,
        },
        { ...position, y: position.y + 3.5 },
      );
    }
    if (active && time > this.nextAmbient) {
      this.nextAmbient = time + 18 + Math.random() * 22;
      const at = {
        x: position.x + 12 + Math.random() * 20,
        y: position.y + 6,
        z: position.z + 10,
      };
      if (sim.state.weather === "storm")
        this.layer(
          { group: "thunder", volume: 0.23, rate: 0.86, cutoff: 1500 },
          at,
        );
      else if (!sim.indoors && !night)
        this.layer({ group: "birds", volume: 0.08 }, at);
      else if (!sim.indoors && night)
        this.layer({ group: "animal", volume: 0.045, rate: 0.88 }, at);
    }
  }
  private duck(enabled: boolean) {
    this.dialogueSpeaking = enabled;
    this.apply(this.settings);
  }
  async playDialogue(cue: DialogueCue): Promise<boolean> {
    this.stopDialogue();
    const serial = this.dialogueSerial;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || !cue.text.trim()) return false;
    this.dialogueCue = { ...cue };
    this.dialogueOffset = Math.max(0, cue.offsetSeconds ?? 0);
    const file = DIALOGUE_FILES[cue.id];
    if (file) {
      const buffer = await this.load(file);
      if (serial !== this.dialogueSerial || ctx !== this.ctx) return false;
      if (buffer) {
        this.duck(true);
        this.dialogueStartedAt = ctx.currentTime;
        this.dialogueVoice = this.play(
          buffer,
          {
            group: "dialogue",
            volume: Math.min(0.9, cue.volume ?? 0.72),
            cutoff: cue.radio ? 3800 : 13000,
          },
          cue.radio ? undefined : cue.position,
          5,
          true,
          this.dialogueOffset,
        );
        if (!this.dialogueVoice) {
          this.dialogueCue = null;
          this.duck(false);
        }
        return !!this.dialogueVoice;
      }
    }
    // Accessible fallback only. No OS voice is exported or bundled with the game.
    if (
      typeof speechSynthesis === "undefined" ||
      typeof SpeechSynthesisUtterance === "undefined"
    )
      return false;
    const voices = speechSynthesis.getVoices();
    const voice = voices.find((v) => /^zh/.test(v.lang) && v.localService);
    if (!voice) return false;
    this.usingSpeech = true;
    const utterance = new SpeechSynthesisUtterance(cue.text);
    utterance.voice = voice;
    utterance.lang = "zh-CN";
    utterance.rate = 0.94;
    utterance.volume =
      this.settings.masterVolume * this.settings.effectsVolume * 0.75;
    utterance.onend = utterance.onerror = () => {
      if (serial === this.dialogueSerial) {
        this.usingSpeech = false;
        this.dialogueCue = null;
        this.duck(false);
      }
    };
    this.duck(true);
    speechSynthesis.speak(utterance);
    return true;
  }
  /** Pause without advancing the narrative cursor. Pending decodes cannot start late. */
  pauseDialogue(): boolean {
    if (!this.dialogueCue || this.dialoguePaused) return false;
    this.dialoguePaused = true;
    if (this.usingSpeech && typeof speechSynthesis !== "undefined")
      speechSynthesis.pause();
    else {
      this.dialogueSerial++;
      if (this.dialogueVoice && this.ctx) {
        this.dialogueOffset += Math.max(
          0,
          this.ctx.currentTime - this.dialogueStartedAt,
        );
        const voice = this.dialogueVoice;
        voice.source.stop();
        this.release(voice);
      }
    }
    this.duck(false);
    return true;
  }
  async resumeDialogue(): Promise<boolean> {
    if (!this.dialoguePaused || !this.dialogueCue) return false;
    if (this.usingSpeech && typeof speechSynthesis !== "undefined") {
      this.dialoguePaused = false;
      speechSynthesis.resume();
      this.duck(true);
      return true;
    }
    return this.playDialogue({
      ...this.dialogueCue,
      offsetSeconds: this.dialogueOffset,
    });
  }
  stopDialogue() {
    this.dialogueSerial++;
    this.dialoguePaused = false;
    this.dialogueCue = null;
    this.dialogueOffset = 0;
    if (this.dialogueVoice) {
      this.dialogueVoice.source.stop();
      this.release(this.dialogueVoice);
      this.dialogueVoice = null;
    }
    if (this.usingSpeech && typeof speechSynthesis !== "undefined")
      speechSynthesis.cancel();
    this.usingSpeech = false;
    this.duck(false);
  }
  async dispose() {
    this.stopDialogue();
    this.abort.abort();
    for (const voice of [...this.voices]) {
      voice.source.stop();
      this.release(voice);
    }
    for (const loop of this.loops.values()) {
      loop.source.stop();
      loop.source.disconnect();
      loop.gain.disconnect();
      loop.filter.disconnect();
    }
    this.loops.clear();
    this.buffers.clear();
    this.loading.clear();
    this.failed.clear();
    this.impulses.clear();
    this.cooldowns.clear();
    this.variants.clear();
    this.actorKinds.clear();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") await ctx.close();
  }
}
