import type { Feedback, GameSettings, Vec3 } from "../core/types";
import type { Simulation } from "../simulation/simulation";
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
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private ambience: GainNode | null = null;
  private effects: GainNode | null = null;
  private wind: GainNode | null = null;
  private rain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private nextAmbient = 0;
  private settings: GameSettings;
  constructor(settings: GameSettings) {
    this.settings = settings;
  }
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.lowpass = this.ctx.createBiquadFilter();
      this.lowpass.type = "lowpass";
      this.lowpass.frequency.value = 20000;
      this.master.connect(this.lowpass);
      this.lowpass.connect(this.ctx.destination);
      this.ambience = this.ctx.createGain();
      this.ambience.connect(this.master);
      this.effects = this.ctx.createGain();
      this.effects.connect(this.master);
      const buffer = this.ctx.createBuffer(
          1,
          this.ctx.sampleRate * 3,
          this.ctx.sampleRate,
        ),
        data = buffer.getChannelData(0);
      let last = 0;
      for (let n = 0; n < data.length; n++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.025 * white) / 1.025;
        data[n] = last * 6;
      }
      this.noiseBuffer = buffer;
      this.wind = this.loopNoise(360, 0.04);
      this.rain = this.loopNoise(4200, 0);
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 45;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 180;
      this.engineOsc.connect(lowpass);
      lowpass.connect(this.engineGain);
      this.engineGain.connect(this.effects);
      this.engineOsc.start();
      this.apply(this.settings);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }
  private loopNoise(freq: number, volume: number): GainNode {
    const ctx = this.ctx!,
      source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambience!);
    source.start();
    return gain;
  }
  apply(settings: GameSettings) {
    this.settings = settings;
    if (!this.ctx) return;
    this.master!.gain.setTargetAtTime(
      settings.masterVolume,
      this.ctx.currentTime,
      0.05,
    );
    this.ambience!.gain.setTargetAtTime(
      settings.ambientVolume,
      this.ctx.currentTime,
      0.05,
    );
    this.effects!.gain.setTargetAtTime(
      settings.effectsVolume,
      this.ctx.currentTime,
      0.05,
    );
  }
  private tone(
    freq: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    position?: Vec3,
  ) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const ctx = this.ctx,
      o = ctx.createOscillator(),
      gain = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      Math.max(10, freq * 0.5),
      ctx.currentTime + duration,
    );
    gain.gain.setValueAtTime(Math.max(0.001, volume), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    o.connect(gain);
    this.connectSpatial(gain, position);
    o.start();
    o.stop(ctx.currentTime + duration);
    o.onended = () => {
      o.disconnect();
      gain.disconnect();
    };
  }
  private burst(
    duration: number,
    volume: number,
    freq: number,
    position?: Vec3,
  ) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const ctx = this.ctx,
      source = ctx.createBufferSource();
    const buffer = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * duration),
        ctx.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    this.connectSpatial(gain, position);
    source.start();
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  private connectSpatial(node: AudioNode, position?: Vec3) {
    if (!position) {
      node.connect(this.effects!);
      return;
    }
    const ctx = this.ctx!,
      p = ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = 3;
    p.maxDistance = 150;
    p.rolloffFactor = 1.15;
    if (p.positionX) {
      p.positionX.value = position.x;
      p.positionY.value = position.y;
      p.positionZ.value = position.z;
    } else p.setPosition(position.x, position.y, position.z);
    node.connect(p);
    p.connect(this.effects!);
    setTimeout(() => p.disconnect(), 2000);
  }
  event(e: Feedback): void {
    if (e.type === "shot") {
      if (e.kind === "melee") {
        this.burst(0.16, 0.2, 700);
        return;
      }
      if (e.kind === "explosion") {
        this.burst(0.9, 1.2, 180, e.position);
        this.tone(60, 0.7, 0.65, "sine", e.position);
        return;
      }
      this.burst(0.16, 0.85, 2200, e.position);
      this.tone(90, 0.13, 0.45, "triangle", e.position);
      this.tone(2900, 0.025, 0.1, "square");
      return;
    }
    if (e.type === "damage") {
      this.burst(0.18, 0.32, 420);
      this.tone(80, 0.2, 0.22);
      return;
    }
    if (e.type === "hit") {
      this.burst(0.08, 0.21, e.kind === "wall" ? 2200 : 700, e.position);
      return;
    }
    if (e.type !== "sound") return;
    const kind = e.kind;
    if (kind === "footstep") {
      const freq =
        e.text === "wood"
          ? 250
          : e.text === "concrete"
            ? 650
            : e.text === "water"
              ? 1600
              : 1100;
      this.burst(0.12, 0.18 * (e.value ?? 1), freq);
      this.tone(75, 0.08, 0.035);
    } else if (kind === "reload") {
      this.burst(0.18, 0.14, 3600);
      this.tone(1200, 0.04, 0.04, "square");
    } else if (kind === "empty") this.tone(900, 0.025, 0.08, "square");
    else if (kind === "growl" || kind === "death")
      this.tone(kind === "growl" ? 65 : 42, 0.6, 0.18, "sawtooth", e.position);
    else if (kind === "door") this.burst(0.25, 0.14, 350);
    else if (kind === "pickup" || kind === "craft") {
      this.burst(0.06, 0.07, 2200);
      this.tone(680, 0.06, 0.045, "triangle");
    } else if (kind === "radio") {
      this.burst(0.5, 0.09, 1900);
      this.tone(930, 0.2, 0.04, "sine");
    } else if (kind === "drink" || kind === "food" || kind === "medical")
      this.burst(0.25, 0.1, kind === "drink" ? 800 : 2400);
    else if (kind === "impact") this.burst(0.2, 0.32, 160);
  }
  update(sim: Simulation, time: number, active: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx,
      p = sim.state.player,
      l = ctx.listener;
    const pos = p.position;
    setListenerPose(l, pos, p.yaw, ctx.currentTime);
    const submerged = sim.gen.isWater(pos.x, pos.z) && p.stance === "prone";
    this.lowpass?.frequency.setTargetAtTime(
      submerged ? 650 : 20000,
      ctx.currentTime,
      0.15,
    );
    this.wind?.gain.setTargetAtTime(
      active ? (sim.indoors ? 0.012 : 0.042) : 0.012,
      ctx.currentTime,
      0.3,
    );
    this.rain?.gain.setTargetAtTime(
      active && ["rain", "storm"].includes(sim.state.weather)
        ? sim.indoors
          ? 0.03
          : 0.1
        : 0,
      ctx.currentTime,
      0.5,
    );
    const v = sim.state.vehicles.find((v) => v.id === p.vehicle);
    this.engineGain?.gain.setTargetAtTime(
      v && active ? 0.075 : 0,
      ctx.currentTime,
      0.1,
    );
    this.engineOsc?.frequency.setTargetAtTime(
      40 + Math.abs(v?.speed ?? 0) * 5,
      ctx.currentTime,
      0.2,
    );
    if (active && time > this.nextAmbient) {
      this.nextAmbient = time + 12 + Math.random() * 15;
      const night = sim.state.time < 6 || sim.state.time > 20;
      const at = {
        x: pos.x + Math.random() * 45 - 22,
        y: pos.y + 8,
        z: pos.z + 25,
      };
      if (sim.state.weather === "storm") {
        this.burst(1.5, 0.25, 120, at);
      } else if (night) {
        this.tone(130, 0.9, 0.04, "triangle", at);
        this.tone(2100, 0.12, 0.018, "sine", at);
      } else {
        this.tone(2100, 0.16, 0.035, "sine", at);
        setTimeout(() => this.tone(2900, 0.14, 0.024, "sine", at), 180);
      }
    }
  }
  async dispose() {
    await this.ctx?.close();
    this.ctx = null;
  }
}
