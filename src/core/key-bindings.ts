/** Ordinary letters avoid browser/OS chords while moving with WASD. */
export function safeBinding(code: string): boolean {
  return /^(Key[A-GI-Z]|Digit[06-9]|Space|Tab|ShiftLeft|ShiftRight|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(
    code,
  );
}
export function keyboardBindings(
  defaults: Record<string, string>,
  saved?: Record<string, string>,
): Record<string, string> {
  const keys: Record<string, string> = {};
  const used = new Set<string>();
  for (const action of Object.keys(defaults)) {
    const key = saved?.[action];
    if (typeof key === "string" && safeBinding(key) && !used.has(key)) {
      keys[action] = key;
      used.add(key);
    }
  }
  for (const [action, fallback] of Object.entries(defaults)) {
    if (keys[action]) continue;
    const key = [
      fallback,
      ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => "Key" + letter),
      "Digit6",
      "Digit7",
      "Digit8",
      "Digit9",
      "Digit0",
      "ShiftLeft",
      "ShiftRight",
      "Space",
      "Tab",
    ].find((key) => safeBinding(key) && !used.has(key));
    if (!key) throw new Error("可用游戏键位不足");
    keys[action] = key;
    used.add(key);
  }
  return keys;
}
export const keyLabel = (code: string) =>
  code.replace("Key", "").replace("Left", "").replace("Right", "");
