import type { Settings } from "../game/settings";

export interface Handlers {
  act: (action: string, arg: string, node: HTMLElement) => void;
  setting: (key: string, value: string) => void;
  volume: (value: number) => void;
  lab: (key: string, value: number) => void;
}

export interface HudModel {
  title: string;
  kicker: string;
  polarity: -1 | 1;
  read: string | null;
  slots: { label: string; met: boolean }[];
  hint: string | null;
  coach: boolean;
  settled: boolean;
  lab: boolean;
  presets: { id: string; name: string }[];
  cores: { id: string; label: string }[];
  preset: string;
  core: string;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

export class Shell {
  readonly hud: HTMLElement;
  readonly screen: HTMLElement;
  readonly live: HTMLElement;
  blocking = false;
  private bench = false;

  constructor(
    root: HTMLElement,
    private handlers: Handlers,
  ) {
    this.hud = document.createElement("div");
    this.hud.id = "hud";
    this.screen = document.createElement("div");
    this.screen.id = "screen";
    this.live = document.createElement("div");
    this.live.id = "live";
    this.live.className = "sr-only";
    this.live.setAttribute("aria-live", "polite");
    root.append(this.hud, this.screen, this.live);
  }

  say(text: string): void {
    this.live.textContent = text;
  }

  isControl(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest("button, a, input, label, select, textarea"));
  }

  private paint(html: string, block: boolean): void {
    this.blocking = block;
    this.screen.innerHTML = html;
    this.screen.classList.toggle("open", block && html.length > 0);
    this.bind(this.screen);
  }

  private bind(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>("[data-act]").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.handlers.act(node.dataset.act ?? "", node.dataset.arg ?? "", node);
      });
    });
    root.querySelectorAll<HTMLElement>("[data-setting]").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.handlers.setting(node.dataset.setting ?? "", node.dataset.value ?? "");
      });
    });
    root.querySelectorAll<HTMLInputElement>("input[data-volume]").forEach((node) => {
      node.addEventListener("input", () => this.handlers.volume(Number(node.value)));
    });
    root.querySelectorAll<HTMLInputElement>("input[data-lab]").forEach((node) => {
      node.addEventListener("input", () => this.handlers.lab(node.dataset.lab ?? "", Number(node.value)));
    });
  }

  title(): void {
    this.hud.innerHTML = "";
    this.paint(
      `<div class="scrim title-scrim">
        <div class="copy">
          <p class="eyebrow">Lodestone Institute</p>
          <h1>Magnet Ball</h1>
          <p class="lede">You do not steer the probe. You change what the room does to it.</p>
          <button class="btn primary" data-act="enter">Enter the institute</button>
          <p class="fine">Tap to flip polarity. Opposite poles attract.</p>
        </div>
      </div>`,
      true,
    );
  }

  map(model: {
    wings: {
      id: number;
      wing: string;
      name: string;
      summary: string;
      sealed: boolean;
      unlocked: boolean;
      cleared: number;
      total: number;
    }[];
    lab: boolean;
    daily: boolean;
    dailyDone: boolean;
    dailyName: string;
  }): void {
    this.hud.innerHTML = "";
    const wings = model.wings
      .map((wing) => {
        const locked = wing.sealed || !wing.unlocked;
        const meta = wing.sealed
          ? "Still dark"
          : wing.unlocked
            ? `${wing.cleared} / ${wing.total}`
            : "Sealed until the previous wing is further along";
        return `<button class="plate ${locked ? "locked" : ""}" data-act="world" data-arg="${wing.id}" ${locked ? "disabled" : ""}>
          <span class="eyebrow">${esc(wing.wing)}</span>
          <span class="plate-name">${esc(wing.name)}</span>
          <span class="fine">${esc(wing.summary)}</span>
          <span class="meta">${esc(meta)}</span>
        </button>`;
      })
      .join("");
    this.paint(
      `<div class="scrim scroll">
        <div class="copy wide">
          <p class="eyebrow">The institute</p>
          <h2>Wings</h2>
          <div class="plates">${wings}</div>
          <div class="row">
            ${model.lab ? `<button class="btn" data-act="lab">Laboratory</button>` : ""}
            ${model.daily ? `<button class="btn" data-act="daily">${model.dailyDone ? "Today’s trial · kept" : esc(model.dailyName)}</button>` : ""}
            <button class="btn" data-act="codex">Research</button>
            <button class="btn" data-act="notes">Field notes</button>
            <button class="btn" data-act="settings">Settings</button>
          </div>
        </div>
      </div>`,
      true,
    );
  }

  world(model: {
    wing: string;
    name: string;
    summary: string;
    levels: { id: string; index: number; name: string; unlocked: boolean; pips: boolean[] }[];
  }): void {
    this.hud.innerHTML = "";
    const levels = model.levels
      .map((level) => {
        const pips = level.pips.map((on) => `<i class="${on ? "on" : ""}"></i>`).join("");
        return `<button class="node ${level.unlocked ? "" : "locked"}" data-act="level" data-arg="${esc(level.id)}" ${level.unlocked ? "" : "disabled"}>
          <span class="idx">${level.index}</span>
          <span>
            <span class="plate-name">${esc(level.name)}</span>
            <span class="pips">${pips}</span>
          </span>
        </button>`;
      })
      .join("");
    this.paint(
      `<div class="scrim scroll">
        <div class="copy wide">
          <button class="texty" data-act="map">← Wings</button>
          <p class="eyebrow">${esc(model.wing)}</p>
          <h2>${esc(model.name)}</h2>
          <p class="lede">${esc(model.summary)}</p>
          <div class="nodes">${levels}</div>
        </div>
      </div>`,
      true,
    );
  }

  intro(model: { wing: string; name: string; summary: string }): void {
    this.paint(
      `<div class="scrim center-card">
        <div class="card">
          <p class="eyebrow">${esc(model.wing)}</p>
          <h2>${esc(model.name)}</h2>
          <p class="lede">${esc(model.summary)}</p>
          <button class="btn primary" data-act="begin">Begin</button>
        </div>
      </div>`,
      true,
    );
  }

  settings(settings: Settings): void {
    const opt = (key: string, value: string, label: string, current: string) =>
      `<button class="chip ${current === value ? "on" : ""}" data-setting="${key}" data-value="${value}">${label}</button>`;
    this.paint(
      `<div class="scrim scroll">
        <div class="copy wide">
          <button class="texty" data-act="back">← Back</button>
          <p class="eyebrow">Instrument</p>
          <h2>Settings</h2>
          <fieldset>
            <legend>Path preview</legend>
            <div class="row">
              ${opt("trajectory", "off", "Off", settings.trajectory)}
              ${opt("trajectory", "short", "Short", settings.trajectory)}
              ${opt("trajectory", "long", "Long", settings.trajectory)}
            </div>
          </fieldset>
          <fieldset>
            <legend>Shake</legend>
            <div class="row">
              ${opt("shake", "full", "Full", settings.shake)}
              ${opt("shake", "reduced", "Reduced", settings.shake)}
              ${opt("shake", "off", "Off", settings.shake)}
            </div>
          </fieldset>
          <fieldset>
            <legend>Particles</legend>
            <div class="row">
              ${opt("particles", "full", "Full", settings.particles)}
              ${opt("particles", "reduced", "Reduced", settings.particles)}
            </div>
          </fieldset>
          <label class="check"><input type="checkbox" data-check="haptics" ${settings.haptics ? "checked" : ""}/> Haptics</label>
          <label class="check"><input type="checkbox" data-check="reducedMotion" ${settings.reducedMotion ? "checked" : ""}/> Reduced motion</label>
          <label class="check"><input type="checkbox" data-check="contrast" ${settings.contrast ? "checked" : ""}/> Higher contrast</label>
          <label class="slider">Volume <input data-volume type="range" min="0" max="1" step="0.01" value="${settings.volume}"/></label>
          <p class="fine">North is a triangle. South is a ring. Color is never the only signal. Space flips. R restarts.</p>
        </div>
      </div>`,
      true,
    );
    // Checkboxes above use click via data-setting on the input — click may not fire for checkbox the way we want.
    this.screen.querySelectorAll<HTMLInputElement>("input[data-check]").forEach((node) => {
      node.addEventListener("change", (event) => {
        event.stopPropagation();
        this.handlers.setting(node.dataset.check ?? "", node.checked ? "on" : "off");
      });
    });
  }

  codex(entries: { title: string; body: string }[], locked: number): void {
    const cards = entries
      .map(
        (entry) => `<article class="card slim"><h3>${esc(entry.title)}</h3><p>${esc(entry.body)}</p></article>`,
      )
      .join("");
    this.paint(
      `<div class="scrim scroll">
        <div class="copy wide">
          <button class="texty" data-act="map">← Wings</button>
          <p class="eyebrow">Research</p>
          <h2>What the rooms taught</h2>
          <div class="stack">${cards || `<p class="lede">Nothing filed yet. The first room will write the first note.</p>`}</div>
          ${locked ? `<p class="fine">${locked} notes are still in the dark.</p>` : ""}
        </div>
      </div>`,
      true,
    );
  }

  notes(rows: { name: string; attempts: number; wins: number; fails: number; best: string }[]): void {
    const body = rows
      .map(
        (row) =>
          `<tr><td>${esc(row.name)}</td><td>${row.attempts}</td><td>${row.wins}</td><td>${row.fails}</td><td>${esc(row.best)}</td></tr>`,
      )
      .join("");
    this.paint(
      `<div class="scrim scroll">
        <div class="copy wide">
          <button class="texty" data-act="map">← Wings</button>
          <p class="eyebrow">Notebook</p>
          <h2>Field notes</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Room</th><th>Tries</th><th>Clears</th><th>Falls</th><th>Best</th></tr></thead>
              <tbody>${body || `<tr><td colspan="5">No attempts yet.</td></tr>`}</tbody>
            </table>
          </div>
          <button class="btn" data-act="export">Export notes</button>
        </div>
      </div>`,
      true,
    );
  }

  play(model: HudModel): void {
    this.blocking = false;
    this.screen.innerHTML = "";
    this.screen.classList.remove("open");
    const polarity = model.polarity === 1 ? "North" : "South";
    const presets = model.presets
      .map(
        (preset) =>
          `<button class="chip ${preset.id === model.preset ? "on" : ""}" data-act="preset" data-arg="${esc(preset.id)}">${esc(preset.name)}</button>`,
      )
      .join("");
    const cores = model.cores
      .map(
        (core) =>
          `<button class="chip ${core.id === model.core ? "on" : ""}" data-act="core" data-arg="${esc(core.id)}">${esc(core.label)}</button>`,
      )
      .join("");
    this.hud.innerHTML = `
      <header class="top">
        <button class="icon" data-act="pause" aria-label="Pause">II</button>
        <div class="titles">
          <p class="eyebrow" id="hud-kicker"></p>
          <h2 id="hud-title"></h2>
          <div class="pips" id="hud-pips"></div>
        </div>
        <button class="icon ${model.settled ? "settled" : ""}" id="hud-restart" data-act="restart" aria-label="Restart">↺</button>
      </header>
      <p class="hint" id="hud-hint" hidden></p>
      ${
        model.lab
          ? `<div class="bench ${this.bench ? "open" : ""}" id="bench">
              <button class="texty" data-act="bench">${this.bench ? "Close bench" : "Bench"}</button>
              <div class="bench-body">
                <div class="row">${presets}</div>
                <div class="row">${cores}</div>
                <label class="slider">Gravity <input data-lab="gravity" type="range" min="0.35" max="1.8" step="0.05" value="1"/></label>
                <label class="slider">Mass <input data-lab="mass" type="range" min="0.45" max="2.2" step="0.05" value="1"/></label>
                <label class="slider">Field <input data-lab="magnet" type="range" min="0.4" max="1.8" step="0.05" value="1"/></label>
                <label class="slider">Bounce <input data-lab="bounce" type="range" min="0.2" max="1.8" step="0.05" value="1"/></label>
                <button class="btn" data-act="restart">Reset probe</button>
              </div>
            </div>`
          : ""
      }
      <div class="dock">
        <button class="polarity ${model.polarity === 1 ? "north" : "south"} ${model.coach ? "coach" : ""}" id="hud-flip" data-act="flip" aria-label="Polarity ${polarity}. Tap to flip.">
          <span class="mark" aria-hidden="true">${model.polarity === 1 ? "▲" : "◯"}</span>
          <span><strong id="hud-pole">${polarity}</strong><small id="hud-read"></small></span>
        </button>
      </div>`;
    this.bind(this.hud);
    this.update(model);
  }

  update(model: HudModel): void {
    const title = this.hud.querySelector("#hud-title");
    const kicker = this.hud.querySelector("#hud-kicker");
    const pips = this.hud.querySelector("#hud-pips");
    const hint = this.hud.querySelector("#hud-hint");
    const pole = this.hud.querySelector("#hud-pole");
    const read = this.hud.querySelector("#hud-read");
    const flip = this.hud.querySelector("#hud-flip");
    const restart = this.hud.querySelector("#hud-restart");
    if (title) title.textContent = model.title;
    if (kicker) kicker.textContent = model.kicker;
    if (pips) {
      pips.innerHTML = model.slots
        .map((slot) => `<i class="${slot.met ? "on" : ""}" title="${esc(slot.label)}"></i>`)
        .join("");
    }
    if (hint) {
      hint.textContent = model.hint ?? "";
      hint.toggleAttribute("hidden", !model.hint);
    }
    if (pole) pole.textContent = model.polarity === 1 ? "North" : "South";
    if (read) read.textContent = model.read ?? "";
    if (flip) {
      flip.classList.toggle("north", model.polarity === 1);
      flip.classList.toggle("south", model.polarity !== 1);
      flip.classList.toggle("coach", model.coach);
      const mark = flip.querySelector(".mark");
      if (mark) mark.textContent = model.polarity === 1 ? "▲" : "◯";
      flip.setAttribute(
        "aria-label",
        `Polarity ${model.polarity === 1 ? "North" : "South"}. Tap to flip.`,
      );
    }
    if (restart) restart.classList.toggle("settled", model.settled);
  }

  toggleBench(): void {
    this.bench = !this.bench;
    this.hud.querySelector("#bench")?.classList.toggle("open", this.bench);
    const button = this.hud.querySelector("#bench .texty");
    if (button) button.textContent = this.bench ? "Close bench" : "Bench";
  }

  pause(): void {
    this.paint(
      `<div class="scrim center-card">
        <div class="card">
          <p class="eyebrow">Held</p>
          <h2>Paused</h2>
          <div class="row">
            <button class="btn primary" data-act="resume">Resume</button>
            <button class="btn" data-act="restart">Restart</button>
            <button class="btn" data-act="settings">Settings</button>
            <button class="btn" data-act="quit">Leave room</button>
          </div>
        </div>
      </div>`,
      true,
    );
  }

  results(model: {
    title: string;
    success: string | null;
    slots: { label: string; met: boolean }[];
    detail: string;
    chain: number;
    next: boolean;
  }): void {
    const slots = model.slots
      .map(
        (slot) =>
          `<li class="${slot.met ? "met" : ""}"><span>${esc(slot.label)}</span><b>${slot.met ? "Kept" : "Open"}</b></li>`,
      )
      .join("");
    this.paint(
      `<div class="scrim center-card">
        <div class="card">
          <p class="eyebrow">Exit reached</p>
          <h2>${esc(model.title)}</h2>
          ${model.success ? `<p class="lede">${esc(model.success)}</p>` : ""}
          <ul class="grades">${slots}</ul>
          <p class="fine">${esc(model.detail)}${model.chain >= 3 ? ` · Chain ${model.chain}` : ""}</p>
          <div class="row">
            ${model.next ? `<button class="btn primary" data-act="next">Continue</button>` : `<button class="btn primary" data-act="quit">Return</button>`}
            <button class="btn" data-act="watch">Watch</button>
            <button class="btn" data-act="restart">Retry</button>
          </div>
        </div>
      </div>`,
      true,
    );
  }

  clearOverlay(): void {
    this.blocking = false;
    this.screen.innerHTML = "";
    this.screen.classList.remove("open");
  }
}
