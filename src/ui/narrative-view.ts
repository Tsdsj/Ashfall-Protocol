import { NARRATIVE_INTERACTIONS, NARRATIVE_AUDIO } from "../narrative";
import type { Simulation } from "../simulation/simulation";
import { ITEMS } from "../data/items";
import { escapeHtml as esc } from "./icons";
import { STORY } from "../world/generator";
export function narrativeJournal(sim: Simulation, id: string): string {
  const legacyId = id.startsWith("legacy:") ? id.slice(7) : id;
  const legacy = sim.state.journal.includes(legacyId)
    ? STORY[legacyId]
    : undefined;
  const logs = sim.narrative.audioLogs,
    selected = logs.find((l) => l.id === id),
    objectives = sim.narrative.objectives;
  const navigation = `<nav class="journal-list" aria-label="任务与录音"><button class="journal-entry ${!selected && !legacy ? "active" : ""}" data-action="journal-entry" data-id="tasks"><small class="mono">FIELD JOURNAL</small><strong>当前任务与支线</strong></button>${logs.map((l, n) => `<button class="journal-entry ${selected?.id === l.id ? "active" : ""}" data-action="journal-entry" data-id="${l.id}"><small class="mono">录音 ${String(n + 1).padStart(2, "0")} · ${esc(l.speaker)}</small><strong>${esc(l.title)}</strong></button>`).join("")}${sim.state.journal
    .filter((id) => STORY[id])
    .map(
      (id) =>
        `<button class="journal-entry ${legacyId === id ? "active" : ""}" data-action="journal-entry" data-id="legacy:${id}"><small class="mono">现场文件</small><strong>${esc(STORY[id]!.title)}</strong></button>`,
    )
    .join("")}</nav>`;
  const content = selected
    ? `<div class="file-meta">GREYVALE / ${esc(selected.speaker)}</div><h2>${esc(selected.title)}</h2><p class="record-transcript">${esc(selected.text)}</p><button class="secondary" data-action="replay-log" data-id="${selected.id}">重播录音</button>`
    : legacy
      ? `<div class="file-meta">GREYVALE / FIELD NOTE</div><h2>${esc(legacy.title)}</h2><p class="record-transcript">${esc(legacy.text)}</p><div class="journal-clue">${esc(legacy.clue)}</div>`
      : `<div class="file-meta">${esc(sim.narrative.actTitle)}</div><h2>未完成的记录</h2><ol class="current-objectives">${objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ol><p class="field-help">与各地幸存者交谈可以取得证词、配方和安全路线。最终选择取决于你已经完成的调查与援助。</p><div class="divider"></div><h3>幸存者的委托</h3><div class="quest-list">${sim.narrative.sideQuests
          .map((q) => {
            const entry = NARRATIVE_INTERACTIONS.find(
                (d) => d.id === q.steps[Math.min(q.stage, 2)]!.interaction,
              )!,
              poi = sim.gen.pois.find((p) => p.id === entry.anchor.poiId)!;
            return `<article class="quest-entry"><div><h4>${esc(q.title)} <small>${q.completed ? "已完成" : q.stage ? "进行中" : "尚未接取"}</small></h4><p>${esc(q.currentObjective)}</p><small>${esc(poi.name)} · ${q.steps.length} 步 · 奖励 ${Object.entries(
              q.reward,
            )
              .map(([id, n]) => `${esc(ITEMS[id]!.name)} ×${n}`)
              .join(
                "、",
              )}</small></div>${!q.completed ? `<button class="quiet" data-action="quest-waypoint" data-id="${entry.id}">标记地点</button>` : ""}</article>`;
          })
          .join(
            "",
          )}</div>${sim.narrative.unlockedRoutes.length ? `<div class="divider"></div><h3>已解锁路线</h3>${sim.narrative.unlockedRoutes.map((r) => `<p><strong>${esc(r.name)}</strong><br>${esc(r.description)}</p>`).join("")}` : ""}${
          sim.state.narrative.act >= 4
            ? `<div class="divider"></div><h3>控制台的三种选择</h3>${sim.narrative
                .choices()
                .map(
                  (c) =>
                    `<article class="quest-entry"><div><h4>${esc(c.title)}</h4><p>${esc(c.consequence)}</p><small>${c.available ? "条件已满足，前往地下控制台确认" : esc(c.missing.join("；"))}</small></div></article>`,
                )
                .join("")}`
            : ""
        }`;
  return `<div class="journal-layout">${navigation}<article class="journal-reader">${content}</article></div>`;
}
export function conversationView(sim: Simulation, name: string): string {
  if (name === "finale")
    return `<section class="conversation"><div class="file-meta">FINAL DECISION / R-07</div><h2>灰谷的未来</h2><p>选择将立即生效并写入当前记录。你可以先离开，完成其他调查与援助后再回来。</p><div class="finale-choices">${sim.narrative
      .choices()
      .map(
        (c) =>
          `<article><h3>${esc(c.title)}</h3><p>${esc(c.consequence)}</p>${c.missing.length ? `<ul>${c.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : '<p class="good">全部条件已满足</p>'}<button class="primary" data-action="narrative-choice" data-id="${c.id}" ${c.available ? "" : "disabled"}>确认：${esc(c.title)}</button></article>`,
      )
      .join("")}</div></section>`;
  const entries = sim.narrative
    .interactions()
    .filter(
      (i) =>
        NARRATIVE_INTERACTIONS.find((d) => "narrative:" + d.id === i.id)
          ?.npc === name,
    );
  return `<section class="conversation"><div class="file-meta">GREYVALE / SURVIVOR</div><h2>${esc(name)}</h2><p>你想谈些什么？</p><div class="conversation-topics">${entries.map((i) => `<button data-action="narrative-interact" data-id="${i.id}"><strong>${esc(i.name)}</strong><span>${esc(i.detail ?? "")}</span></button>`).join("")}${name === "米拉" ? '<button data-action="open-trade"><strong>交换物资</strong><span>用多余的材料换取医疗和补给。</span></button>' : ""}</div></section>`;
}
export function endingCopy(id: string | null): { title: string; text: string } {
  const entry = NARRATIVE_AUDIO["ending-" + (id ?? "truth")];
  return {
    title: entry?.title ?? "封锁线之外",
    text: entry?.text ?? "灰谷之外终于有人听到了你。",
  };
}
