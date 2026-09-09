import type { GameSettings } from "./types";
export class InputController {
  readonly held = new Set<string>();
  fallback = false;
  mouseDown = false;
  attackPressed = false;
  aiming = false;
  deltaX = 0;
  deltaY = 0;
  constructor(
    readonly canvas: HTMLCanvasElement,
    private settings: GameSettings,
  ) {
    window.addEventListener("keydown", (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      this.held.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
    window.addEventListener("blur", () => this.clear());
    canvas.addEventListener("mousedown", (e) => {
      if (document.pointerLockElement !== canvas && !this.fallback) return;
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
    document.addEventListener("mousemove", (e) => {
      if (
        document.pointerLockElement === canvas ||
        (this.fallback && this.aiming)
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
    await this.canvas.requestPointerLock();
  }
  unlock() {
    this.fallback = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.clear();
  }
}
