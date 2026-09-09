import "./ui/styles.css";
import { Game } from "./core/game";
import { prepareOffline } from "./offline";
const game = new Game();
void game.start(sessionStorage.getItem("ashfall-force-webgl") === "true");

if (import.meta.env.PROD) window.addEventListener("load", prepareOffline);
