import { ITEMS } from "../data/items";
const paths: Record<string, string> = {
  knife: "M27 44 38 32 62 8 67 5 65 14 44 39 33 50M25 43l11 9-13 15-9-8z",
  pistol:
    "M10 22h49l8 5v7H38l-3 7H23l-3-9H10z M28 38h10l-3 25H21l4-20 M42 35v10h-9",
  rifle:
    "M7 30h20l5-6h25v6h13v6H41l-4 14h-9l1-13H17l-3 8H7z M39 36l3 16h10l-4-17 M37 23v-5h14v6",
  hatchet: "M30 67 36 20l9 1-8 47z M20 15l20-7 20 5 6 13-23 7-8-12-16 5z",
  crowbar: "M25 67 36 17q2-10 14-9l7 5-6 5-5-2-3 4-10 49z",
  spear: "M23 70 50 20l6 3-27 50z M48 20 63 3 62 26z",
  bow: "M20 8q57 29 0 61M20 8v61M11 38h54m-8-5 9 5-9 5",
  ammo: "M14 24h10v39H14z M14 24l5-13 5 13 M31 19h11v44H31z M31 19l5-13 6 13 M49 29h11v34H49z M49 29l5-12 6 12",
  food: "M19 17q19-8 38 0v42q-19 9-38 0z M19 17q19 10 38 0 M19 57q19 9 38 0 M28 32h20M28 39h14",
  drink: "M28 8h20v9l6 9v38q-16 8-32 0V26l6-9z M28 16h20M23 32h30v20H23",
  medical:
    "M12 22h52v39H12z M27 22v-9h22v9 M33 32h10v8h8v10h-8v8H33v-8h-8V40h8z",
  cloth: "M18 18l17-7 6 8 6-8 15 7-8 17-9-6v37H28V30l-10 6-9-14z",
  armor: "M24 10h8v12h12V10h9l9 19-6 37H20l-6-37z M25 35h25v16H25M26 58h23",
  material:
    "M14 30l28-15 21 11v28L36 69 14 56z M14 30l22 14 27-18 M36 44v25 M23 25l24 15",
  wood: "M12 59 22 22l9-9 25 10-5 13-19 34z M24 23l28 11M28 25 17 58 M35 30l-12 33 M44 34 31 65",
  stone:
    "M9 52 17 27 39 14 61 28 69 54 49 66 25 63z M17 27l23 13 21-12M40 40l9 26M9 52l31-12",
  electronic:
    "M19 18h39v42H19z M27 27h23v24H27z M11 27h8m-8 12h8m-8 12h8m39-24h8m-8 12h8m-8 12h8M29 10v8m12-8v8m12-8v8M29 60v8m12-8v8m12-8v8",
  quest: "M21 7h29l12 12v50H21z M49 7v14h13M29 33h24M29 42h24M29 51h16",
  campfire:
    "M15 63l47-12m-43-1 42 13M38 11c4 17 20 21 17 36-2 14-31 16-34 0-2-9 9-11 9-21 4 4 4 6 6 10 7-5 5-13 2-25z",
  bed: "M12 61V22h7v26h47V34h6v27M21 33h13v12H21z M37 36h26v9H37",
  wall: "M12 14h52v50H12z M12 31h52M12 48h52M29 14v17m19 0v17M29 48v16",
  foundation: "M7 45 38 25l33 20-33 20z M7 45v10l31 19 33-19V45M38 65v9",
  storage: "M11 25h55v37H11z M8 16h60v10H8zM30 25v12h17V25",
  generator:
    "M17 22h46v37H17zM11 16v49m58-49v49M11 16h58M28 31h21v17H28zM50 32h6v15M24 59v7m31-7v7",
  tool: "M51 8c-16-5-25 8-20 19L10 54q-5 11 6 14l25-29c14 3 27-10 21-23l-10 12-12-4 1-10z",
  health: "M10 34h16l7-17 10 39 7-22h17",
  water: "M38 7C28 24 14 37 14 48a24 24 0 0048 0C62 36 46 20 38 7z",
  stamina: "M43 6 19 42h18l-5 30 26-41H40z",
  temp: "M32 14a6 6 0 0112 0v33a13 13 0 11-12 0zM38 24v33",
  backpack:
    "M22 22h32q10 0 10 12v29H12V34q0-12 10-12zM27 22v-8h22v8M20 40h36v16H20M23 29h30",
};
Object.assign(paths, {
  beanie: "M16 45c0-42 44-42 44 0M12 45h52v17H12zM25 22v22m13-29v29m13-22v22",
  jacket:
    "M21 14l10-6 7 11 7-11 11 6 12 23-12 6-8-15v39H28V28l-8 15L8 37zM38 20v46M29 45h-7m25 0h7",
  pants: "M22 9h32l5 58H44l-6-39-6 39H17zM22 17h32M38 9v17",
  boots: "M26 11h21v34l14 7v13H15V52l9-10zM28 23h14m-14 9h14M16 59h43",
  gloves:
    "M24 42V18q0-7 6-3v21-25q5-5 8 0v24-27q6-4 8 2v27-20q6-4 7 2v34q-1 16-14 17H27L12 44q-4-8 4-9z",
  cloth: "M15 18h40l9 41-37 10L12 34zM23 20l10 43M15 36l47 5M54 20l-5 45",
  rope: "M23 58c-18-9-18-38 1-40 24-3 34 36 10 41-28 6-32-32-11-31 17 1 22 26 4 23-13-2-11-15-4-15M39 18l18-8m-5 8 9-6",
  scrap: "M13 15l31-6 13 23-13 32-25-7 6-22zM33 28l14 8-10 13M13 15l12 20",
  nails:
    "M19 10l11 55m-18-52 14-5M46 10l-5 57m-2-57h14M58 26 25 58m28-38 11 12",
  parts:
    "M30 8h16l3 11 10 2 7 14-7 8-1 13-14 8-10-7-12 1-9-14 6-10-2-12 13-6zM28 37a10 10 0 1020 0 10 10 0 10-20 0",
  electronics:
    "M19 18h39v42H19zM27 27h23v24H27zM11 27h8m-8 12h8m-8 12h8m39-24h8m-8 12h8m-8 12h8",
  battery: "M17 21h43v42H17zM23 12h9v9m13-9h9v9M25 38h10m-5-5v10m14-5h10",
  fuel: "M22 19h35v47H17V27zM24 19v-9h24v9M25 29l24 27M49 29 25 56M52 9l12 5-5 13",
  rawmeat:
    "M13 47C3 29 23 13 40 10c19-4 32 17 22 33L45 62c-17 18-26-1-32-15zM22 43c-7-14 2-21 15-23s23 12 15 22L39 54c-8 5-12-2-17-11z",
  cookedmeat:
    "M13 47C3 29 23 13 40 10c19-4 32 17 22 33L45 62c-17 18-26-1-32-15zM24 28l22 19M32 21l23 18M17 37l20 20",
  fish: "M14 37c16-26 41-22 51 0-10 24-35 24-51 0L4 23v28zM47 24v28M55 34h1M26 21l5-10 10 8",
  cookedfish:
    "M14 37c16-26 41-22 51 0-10 24-35 24-51 0L4 23v28zM25 30l12 13m-5-16 12 13m-6-16 12 13",
  bone: "M18 16c-9-10-19 6-8 12l11 1 27 27 1 10c8 14 26 0 13-8 9-10-9-22-14-11L30 29l-1-12c-1-10-13-12-11-1z",
  hide: "M22 9l14 9 17-8 12 13-9 17 8 19-13 10-17-9-16 7L8 55l11-17L9 23z",
  fat: "M17 28l24-15 21 13 5 27-21 12-31-9zM17 28l30 10 15-12M47 38l-1 27",
  mushroom:
    "M8 39c2-39 56-39 60 0zM31 39l-6 24q13 10 26 0l-6-24M21 27h2m18-9h2m11 13h2",
  turnip:
    "M24 33c-22 36 39 47 33 9-2-14-23-20-33-9zM40 32c-19-3-25-22-12-24 8-1 12 15 12 24 0-24 21-26 22-18 2 8-15 14-22 18M35 64l-3 9",
  seeds:
    "M20 12h37l6 55H14zM27 34c15-22 20-3 9 9-14 2-8-9-9-9zM35 43v14M22 19h34",
  grenade:
    "M26 24h24l7 14v19q-19 17-38 0V38zM30 14h16v10M47 14l10 34M30 8h16M23 40h30M23 50h30",
  rice: "M22 9h34l-3 9 9 49H15l10-49zM27 38c3-8 7-8 8 0-4 9-7 8-8 0m13 8c4-8 8-7 8 0-4 9-8 8-8 0",
  energybar:
    "M11 22l7 3 7-3 7 3 7-3 7 3 7-3 10 3v31l-10-3-7 3-7-3-7 3-7-3-7 3-7-3zM22 25v28m33-28v28",
  crackers: "M13 17h50v45H13zM24 29h1m12 0h1m12 0h1M24 44h1m12 0h1m12 0h1",
});
export function icon(name: string, size = 24): string {
  const d = ITEMS[name];
  let key = name;
  if (d) {
    key = d.icon;
    if (d.weapon)
      key = d.weapon.ammo
        ? d.id === "bow"
          ? "bow"
          : ["pistol", "pistol45"].includes(d.id)
            ? "pistol"
            : "rifle"
        : d.id === "machete"
          ? "knife"
          : d.id;
    if (d.category === "clothing") key = "cloth";
    if (d.category === "building") key = d.structure ?? "wall";
    if (d.id === "wood" || d.id === "stone" || d.id === "backpack") key = d.id;
  }
  if (d && paths[d.id]) key = d.id;
  const path = paths[key] ?? paths.material!;
  return `<svg width="${size}" height="${size}" viewBox="0 0 76 76" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}
export const logo = `<svg viewBox="0 0 60 58" aria-hidden="true"><path d="M4 52 30 3 56 52H42L30 29 18 52Z" fill="currentColor"/><path d="M25 46h10v6H25z" fill="currentColor"/></svg>`;
export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
