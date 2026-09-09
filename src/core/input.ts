import type { GameSettings } from "./types";
export class InputController {
  readonly held = new Set<string>();
  fallback = false;
  mouseDown = false;
  attackPressed = false;
  aiming = false;
  deltaX = 0;
  deltaY = 0;
  private cancelLock: (() => void) | null = null;
  get active() {
    return (
      !document.hidden &&
      document.hasFocus() &&
      (document.pointerLockElement === this.canvas || this.fallback)
    );
  }
  constructor(
    readonly canvas: HTMLCanvasElement,
    private settings: GameSettings,
  ) {
    window.addEventListener("keydown", (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      )
        return;
      if (
        !this.active ||
        e.metaKey ||
        ["F11", "F5"].includes(e.code) ||
        (e.altKey && ["Tab", "F4", "ArrowLeft", "ArrowRight"].includes(e.code))
      )
        return;
      if (
        Object.values(this.settings.keys).includes(e.code) ||
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space",
          "KeyH",
          "KeyX",
        ].includes(e.code) ||
        /^Digit[1-5]$/.test(e.code)
      )
        e.preventDefault();
      this.held.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
    window.addEventListener("blur", () => this.unlock());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.unlock();
    });
    canvas.addEventListener("mousedown", (e) => {
      if (!this.active) return;
      e.preventDefault();
      if (e.button === 0) {
        this.mouseDown = true;
        this.attackPressed = true;
      }
      if (e.button === 2) this.aiming = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.aiming = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.active) e.preventDefault();
      },
      { passive: false },
    );
    canvas.addEventListener("dragstart", (e) => e.preventDefault());
    canvas.addEventListener("auxclick", (e) => {
      if (this.active) e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (
        this.active &&
        (document.pointerLockElement === canvas ||
          (this.fallback && this.aiming && e.target === canvas))
      ) {
        this.deltaX += e.movementX;
        this.deltaY += e.movementY;
      }
    });
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== canvas) this.clear();
    });
  }
  down(action: string): boolean {
    return this.held.has(this.settings.keys[action] ?? "");
  }
  clear() {
    this.held.clear();
    this.mouseDown = false;
    this.attackPressed = false;
    this.aiming = false;
    this.deltaX = 0;
    this.deltaY = 0;
  }
  movement() {
    return {
      forward: Number(this.down("forward")) - Number(this.down("backward")),
      side: Number(this.down("right")) - Number(this.down("left")),
      sprint: this.down("sprint"),
      walk: this.down("walk"),
      aiming: this.aiming,
      jump: this.down("jump"),
      brake: this.down("jump"),
    };
  }
  mouse() {
    const x = this.deltaX,
      y = this.deltaY;
    this.deltaX = 0;
    this.deltaY = 0;
    return { x, y };
  }
  async lock() {
    this.fallback = false;
    this.canvas.focus();
    if (!document.hasFocus() || document.hidden)
      throw new Error("Page is not focused");
    this.cancelLock?.();
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        document.removeEventListener("pointerlockchange", changed);
        document.removeEventListener("pointerlockerror", failed);
        if (this.cancelLock === cancel) this.cancelLock = null;
        if (error) reject(error);
        else resolve();
      };
      const changed = () => {
        if (document.pointerLockElement === this.canvas) finish();
      };
      const failed = () => finish(new Error("Mouse capture unavailable"));
      const cancel = () => finish(new Error("Mouse capture cancelled"));
      this.cancelLock = cancel;
      document.addEventListener("pointerlockchange", changed);
      document.addEventListener("pointerlockerror", failed);
      try {
        const request = this.canvas.requestPointerLock();
        // Firefox also supports the event-only form of this API.
        request?.catch(failed);
        changed();
      } catch {
        failed();
      }
    });
  }
  unlock() {
    this.cancelLock?.();
    this.fallback = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.clear();
  }
}
