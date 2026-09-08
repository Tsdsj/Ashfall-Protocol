import "./ui/styles.css";
import { Game } from "./core/game";
const game = new Game();
void game.start(sessionStorage.getItem("ashfall-force-webgl") === "true");

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      game.ui.toast("离线缓存暂不可用，在线游戏与本地存档仍可使用。");
    });
  });
}
