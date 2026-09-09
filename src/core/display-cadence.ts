/** Measures this foreground tab's delivered rAF cadence with the game loop stopped. */
export function measureDisplayCadence(): Promise<number> {
  return new Promise((resolve, reject) => {
    const intervals: number[] = [];
    let frame = 0,
      start = 0,
      previous = 0;
    const finish = (error?: string) => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
      if (error) reject(new Error(error));
      else
        resolve(
          (1000 * intervals.length) / intervals.reduce((a, b) => a + b, 0),
        );
    };
    const cancel = () => finish("检测中断：请保持游戏窗口在前台。");
    const visibility = () => {
      if (document.hidden) cancel();
    };
    const tick = (now: number) => {
      if (document.hidden || !document.hasFocus()) {
        cancel();
        return;
      }
      if (!start) start = now;
      if (previous && now - start > 200) intervals.push(now - previous);
      previous = now;
      if (now - start >= 1000) {
        finish(
          intervals.length < 8
            ? "样本不足，请检查浏览器后台或节能限制。"
            : undefined,
        );
      } else frame = requestAnimationFrame(tick);
    };
    const timeout = setTimeout(
      () => finish("浏览器未及时提供刷新回调，请检查焦点与节能设置。"),
      2500,
    );
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    frame = requestAnimationFrame(tick);
  });
}
