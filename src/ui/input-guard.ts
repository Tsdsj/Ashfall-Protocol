/** Keep Shift quick-transfer from extending a previous text selection. */
export function bindInventoryInputGuard(root: HTMLElement): void {
  const itemTarget = (target: EventTarget | null) => {
    const element =
      target instanceof Element
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
    if (
      !element ||
      element.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
      )
    )
      return false;
    return !!element.closest('[data-action="select-item"]');
  };
  root.addEventListener("mousedown", (event) => {
    if (event.button === 0 && event.shiftKey && itemTarget(event.target))
      event.preventDefault();
  });
  root.addEventListener("selectstart", (event) => {
    if (itemTarget(event.target)) event.preventDefault();
  });
}
