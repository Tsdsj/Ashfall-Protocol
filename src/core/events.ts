import type { Feedback } from "./types";
export class EventBus {
  private listeners = new Set<(event: Feedback) => void>();
  on(fn: (event: Feedback) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(event: Feedback) {
    for (const fn of this.listeners) fn(event);
  }
}
