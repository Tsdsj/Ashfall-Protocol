import type { GameSettings } from "./types";
export class InputController {
  readonly held = new Set<string>();
  fallback = false;
  mouseDown = false;
  attackPressed = false;
  aiming = false;
  deltaX = 0;
  deltaY = 0;
  private fallbackPoint: { x: number; y: number } | null = null;
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
        e.ctrlKey ||
        e.altKey ||
        /^F\d+$/.test(e.code)
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
    canvas.addEventListener("pointerdown", (event) => {
      if (this.fallback && event.button === 2)
        this.canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener("pointercancel", () => this.clear());
    canvas.addEventListener("mousedown", (e) => {
      if (!this.active) return;
      e.preventDefault();
      if (e.button === 0) {
        this.mouseDown = true;
        this.attackPressed = true;
      }
      if (e.button === 2) {
        this.aiming = true;
        this.fallbackPoint = { x: e.clientX, y: e.clientY };
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (this.active && (e.button === 2 || e.button >= 3)) e.preventDefault();
      if (e.button === 2) {
        this.aiming = false;
        this.fallbackPoint = null;
      }
    });
    // Cancel browser back/forward buttons before their default navigation.
    canvas.addEventListener("pointerdown", (e) => {
      if (this.active && e.button >= 3) e.preventDefault();
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
      if (!this.active) return;
      let x = e.movementX,
        y = e.movementY;
      if (document.pointerLockElement !== canvas) {
        if (!this.fallback || !this.aiming || e.target !== canvas) {
          this.fallbackPoint = null;
          return;
        }
        const previous = this.fallbackPoint;
        this.fallbackPoint = { x: e.clientX, y: e.clientY };
        if (!previous) return;
        // Unlocked movementX units vary by browser / display scaling. Use the
        // actual cursor position for the explicitly selected drag mode.
        x = e.clientX - previous.x;
        y = e.clientY - previous.y;
      }
      if (Number.isFinite(x) && Number.isFinite(y)) {
        this.deltaX += x;
        this.deltaY += y;
      }
    });
    document.addEventListener("pointerlockchange", () => this.clear());
  }
  down(action: string): boolean {
    return this.held.has(this.settings.keys[action] ?? "");
  }
  clear() {
    this.fallbackPoint = null;
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
      descend: this.down("crouch"),
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
    this.clear();
    this.fallback = false;
    this.canvas.focus();
    if (!document.hasFocus() || document.hidden)
      throw new Error("Page is not focused");
    this.cancelLock?.();
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let promiseBased = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        document.removeEventListener("pointerlockchange", changed);
        document.removeEventListener("pointerlockerror", failed);
        if (this.cancelLock === cancel) this.cancelLock = null;
        if (error) reject(error);
        else resolve();
      };
      const changed = () => {
        if (document.pointerLockElement === this.canvas) finish();
      };
      const failed = () => {
        // Promise APIs provide the precise reason, including raw-input support.
        if (!promiseBased) finish(new Error("Mouse capture unavailable"));
      };
      const cancel = () => finish(new Error("Mouse capture cancelled"));
      this.cancelLock = cancel;
      document.addEventListener("pointerlockchange", changed);
      document.addEventListener("pointerlockerror", failed);
      const requestCapture = (raw: boolean) => {
        if (settled) return;
        const rejected = (error: unknown) => {
          if (settled) return;
          if (
            raw &&
            error instanceof Error &&
            error.name === "NotSupportedError"
          ) {
            requestCapture(false);
          } else
            finish(
              error instanceof Error
                ? error
                : new Error("Mouse capture unavailable"),
            );
        };
        try {
          const request = raw
            ? this.canvas.requestPointerLock({ unadjustedMovement: true })
            : this.canvas.requestPointerLock();
          promiseBased = !!request;
          request?.catch(rejected);
          changed();
        } catch (error) {
          rejected(error);
        }
      };
      requestCapture(true);
    });
  }
  unlock() {
    this.cancelLock?.();
    this.fallback = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.clear();
  }
}
