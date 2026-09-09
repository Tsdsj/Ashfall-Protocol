import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/data/items";
import { escapeHtml, icon } from "../src/ui/icons";
import {
  categoryClass,
  categoryLabel,
  shortName,
} from "../src/ui/item-presentation";
const path = (id: string) => icon(id).match(/<path d="([^"]+)"/)![1];

describe("item silhouettes", () => {
  it("gives common supplies recognizable separate outlines", () => {
    const ids = [
      "beans",
      "cannedmeat",
      "water",
      "firstaid",
      "ammo9",
      "shell",
      "arrow",
      "tire",
      "battery",
      "wood",
      "stone",
      "rope",
    ];
    expect(new Set(ids.map(path)).size).toBe(ids.length);
  });
  it("does not draw every tool as a wrench", () => {
    const tools = [
      "pickaxe",
      "hammer",
      "wrench",
      "shovel",
      "fishingrod",
      "torch",
    ];
    expect(new Set(tools.map(path)).size).toBe(tools.length);
    for (const id of tools) expect(path(id)).not.toBe(path("material"));
  });
  it("distinguishes medical supplies and preserves the HUD water symbol", () => {
    const ids = [
      "rag",
      "bandage",
      "tourniquet",
      "painkiller",
      "antibiotics",
      "disinfectant",
      "splint",
      "firstaid",
      "r07_injector",
    ];
    expect(new Set(ids.map(path)).size).toBe(ids.length);
    expect(path("water")).not.toBe(path("hydration"));
  });
  it("never interpolates an unknown id or an invalid size into SVG", () => {
    expect(icon('<script>alert("x")</script>')).toBe(icon("unknown"));
    expect(icon("__proto__")).toBe(icon("unknown"));
    expect(icon("constructor")).toBe(icon("unknown"));
    expect(
      icon("water", '24" onload="alert(1)' as unknown as number),
    ).toContain('width="24"');
    expect(
      icon("water", '24" onload="alert(1)' as unknown as number),
    ).not.toContain("onload");
    expect(escapeHtml('<img title="a&b">\'')).toBe(
      "&lt;img title=&quot;a&amp;b&quot;&gt;&#39;",
    );
  });
});

describe("inventory captions", () => {
  it("uses actual item categories and concise item names", () => {
    expect(shortName("beans")).toBe("白豆罐头");
    expect(shortName("pickaxe")).toBe("镐头");
    expect(shortName("kit_generator")).not.toContain("组件");
    expect(categoryClass("water")).toBe("item-category-drink");
    expect(categoryLabel("firstaid")).toBe("医疗");
    expect(categoryLabel("pickaxe")).toBe("工具");
    for (const item of Object.values(ITEMS)) {
      expect(categoryClass(item.id)).toBe(`item-category-${item.category}`);
      expect(categoryLabel(item.id)).toBeTruthy();
    }
    expect(shortName('<svg onload="x">')).toBe("未知物品");
    expect(categoryClass('<svg onload="x">')).toBe("item-category-material");
  });
});
