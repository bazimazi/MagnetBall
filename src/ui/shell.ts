import type { Settings } from "../game/settings";

export interface Handlers {
  act: (action: string, arg: string, node: HTMLElement) => void;
  setting: (key: string, value: string) => void;
  volume: (value: number) => void;
  lab: (key: string, value: number) => void;
}

export interface HudSlot {
  id: string;
  label: string;
  met: boolean;
  /** Live tally, e.g. "1 / 2", shown beside the label. */
  live: string | null;
}

export interface HudModel {
  title: string;
  kicker: string;
  polarity: -1 | 1;
  read: string | null;
  slots: HudSlot[];
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

const svg = (body: string, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICON = {
  pause: svg(`<path d="M9 5v14M15 5v14"/>`),
  restart: svg(`<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>`),
  back: svg(`<path d="M15 18l-6-6 6-6"/>`, 18),
  lock: svg(`<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`, 18),
  check: svg(`<path d="M5 12.5l4.5 4.5L19 7.5"/>`, 16),
  play: svg(`<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>`, 18),
  flask: svg(`<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/>`, 18),
  sun: svg(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`, 18),
  book: svg(`<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/>`, 18),
  notes: svg(`<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>`, 18),
  gear: svg(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`, 18),
  eye: svg(`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`, 18),
  next: svg(`<path d="M5 12h14M13 6l6 6-6 6"/>`, 18),
  flip: svg(`<path d="M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4"/>`, 14),
  clock: svg(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`, 14),
  link: svg(`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`, 14),
};

/** The emblem: a probe split into its two poles. */
const EMBLEM = `<svg class="emblem" viewBox="0 0 120 120" aria-hidden="true">
  <defs>
    <radialGradient id="em-body" cx="38%" cy="32%" r="70%">
      <stop offset="0" stop-color="#fffaf0"/><stop offset=".45" stop-color="#cdbfa8"/><stop offset="1" stop-color="#27221c"/>
    </radialGradient>
  </defs>
  <circle class="em-orbit" cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 7"/>
  <circle cx="60" cy="60" r="36" fill="url(#em-body)"/>
  <path d="M60 38a22 22 0 0 0 0 44z" fill="var(--north)"/>
  <path d="M60 38a22 22 0 0 1 0 44z" fill="var(--south)"/>
  <path d="M49 52l6 11h-12z" fill="#fff8ec"/>
  <circle cx="68" cy="60" r="5" fill="none" stroke="#fff8ec" stroke-width="2.4"/>
</svg>`;

function slotIcon(id: string): string {
  if (id === "switches") return ICON.flip;
  if (id === "time") return ICON.clock;
  if (id === "shards") return `<i class="diamond" aria-hidden="true"></i>`;
  return `<i class="dot" aria-hidden="true"></i>`;
}

export class Shell {
  readonly hud: HTMLElement;
  readonly screen: HTMLElement;
  readonly live: HTMLElement;
  blocking = false;
  private bench = false;
  private lastPolarity: -1 | 1 | 0 = 0;

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
    this.screen.querySelector<HTMLElement>(".btn.primary")?.focus({ preventScroll: true });
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
        <div class="copy title-copy">
          <div class="brand rise" style="--i:0">${EMBLEM}<p class="eyebrow">Lodestone Institute</p></div>
          <h1 class="rise" style="--i:1">Magnet<br/><span>Ball</span></h1>
          <p class="lede rise" style="--i:2">You do not steer the probe. You change what the room does to it.</p>
          <div class="rise" style="--i:3">
            <button class="btn primary big" data-act="enter">${ICON.play}<span>Enter the institute</span></button>
          </div>
          <p class="keys rise" style="--i:4"><kbd>Tap</kbd> or <kbd>Space</kbd> flip polarity <span class="sep">·</span> <kbd>R</kbd> restart <span class="sep">·</span> <kbd>Esc</kbd> pause</p>
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
      .map((wing, i) => {
        const locked = wing.sealed || !wing.unlocked;
        const pct = wing.total ? Math.round((wing.cleared / wing.total) * 100) : 0;
        const done = !locked && wing.total > 0 && wing.cleared >= wing.total;
        const meta = wing.sealed
          ? `<span class="meta dim">${ICON.lock} Still dark</span>`
          : wing.unlocked
            ? `<span class="meta">${done ? ICON.check : ""}${wing.cleared} / ${wing.total} rooms</span>
               <span class="bar"><i style="width:${pct}%"></i></span>`
            : `<span class="meta dim">${ICON.lock} Clear more of the previous wing</span>`;
        const letter = wing.wing.replace(/^Wing\s+/i, "");
        return `<button class="plate rise ${locked ? "locked" : ""} ${done ? "done" : ""}" style="--i:${i + 2}" data-act="world" data-arg="${wing.id}" ${locked ? "disabled" : ""}>
          <span class="badge">${esc(letter)}</span>
          <span class="plate-body">
            <span class="plate-name">${esc(wing.name)}</span>
            <span class="fine">${esc(wing.summary)}</span>
            ${meta}
          </span>
        </button>`;
      })
      .join("");
    this.paint(
      `<div class="scrim scroll">
        <div class="copy wide">
          <header class="screen-head rise" style="--i:0">
            <div>
              <p class="eyebrow">The institute</p>
              <h2>Wings</h2>
            </div>
            <nav class="toolbar">
              ${model.lab ? `<button class="btn ghost" data-act="lab" aria-label="Laboratory">${ICON.flask}<span>Laboratory</span></button>` : ""}
              ${model.daily ? `<button class="btn ghost ${model.dailyDone ? "kept" : ""}" data-act="daily" aria-label="${model.dailyDone ? "Today’s trial, kept" : esc(model.dailyName)}">${ICON.sun}<span>${model.dailyDone ? "Today’s trial · kept" : esc(model.dailyName)}</span></button>` : ""}
              <button class="btn ghost" data-act="codex" aria-label="Research">${ICON.book}<span>Research</span></button>
              <button class="btn ghost" data-act="notes" aria-label="Field notes">${ICON.notes}<span>Field notes</span></button>
              <button class="btn ghost icon-only" data-act="settings" aria-label="Settings">${ICON.gear}</button>
            </nav>
          </header>
          <div class="plates">${wings}</div>
        </div>
      </div>`,
      true,
    );
  }

  world(model: {
    wing: string;
    name: string;
    summary: string;
    levels: {
      id: string;
      index: number;
      name: string;
      unlocked: boolean;
      cleared: boolean;
      next: boolean;
      pips: boolean[];
    }[];
  }): void {
    this.hud.innerHTML = "";
    const levels = model.levels
      .map((level, i) => {
        const pips = level.pips.map((on) => `<i class="${on ? "on" : ""}"></i>`).join("");
        const state = !level.unlocked ? "locked" : level.cleared ? "cleared" : level.next ? "next" : "";
        return `<button class="node rise ${state}" style="--i:${i + 2}" data-act="level" data-arg="${esc(level.id)}" ${level.unlocked ? "" : "disabled"} aria-label="Room ${level.index}: ${esc(level.name)}${level.unlocked ? "" : " (locked)"}">
          <span class="idx">${level.unlocked ? level.index : ICON.lock}</span>
          <span class="node-name">${esc(level.name)}</span>
          <span class="pips">${pips}</span>
        </button>`;
      })
      .join("");
    this.paint(
      `<div class="scrim scroll">
        <div class="copy wide">
          <button class="texty rise" style="--i:0" data-act="map">${ICON.back} Wings</button>
          <header class="rise" style="--i:1">
            <p class="eyebrow">${esc(model.wing)}</p>
            <h2>${esc(model.name)}</h2>
            <p class="lede">${esc(model.summary)}</p>
          </header>
          <div class="nodes">${levels}</div>
        </div>
      </div>`,
      true,
    );
  }

  intro(model: { wing: string; name: string; summary: string }): void {
    this.paint(
      `<div class="scrim center-card">
        <div class="card pop intro-card">
          <p class="eyebrow">${esc(model.wing)}</p>
          <h2>${esc(model.name)}</h2>
          <p class="lede">${esc(model.summary)}</p>
          <button class="btn primary big" data-act="begin">${ICON.play}<span>Begin</span></button>
        </div>
      </div>`,
      true,
    );
  }

  settings(settings: Settings): void {
    const opt = (key: string, value: string, label: string, current: string) =>
      `<button class="seg-opt ${current === value ? "on" : ""}" data-setting="${key}" data-value="${value}" aria-pressed="${current === value}">${label}</button>`;
    const toggle = (key: string, label: string, on: boolean) =>
      `<label class="switch"><span>${label}</span><input type="checkbox" data-check="${key}" ${on ? "checked" : ""}/><i aria-hidden="true"></i></label>`;
    this.paint(
      `<div class="scrim scroll">
        <div class="copy wide narrow">
          <button class="texty rise" style="--i:0" data-act="back">${ICON.back} Back</button>
          <header class="rise" style="--i:1">
            <p class="eyebrow">Instrument</p>
            <h2>Settings</h2>
          </header>
          <div class="panel rise" style="--i:2">
            <div class="setting"><span>Path preview</span><div class="seg">
              ${opt("trajectory", "off", "Off", settings.trajectory)}
              ${opt("trajectory", "short", "Short", settings.trajectory)}
              ${opt("trajectory", "long", "Long", settings.trajectory)}
            </div></div>
            <div class="setting"><span>Screen shake</span><div class="seg">
              ${opt("shake", "full", "Full", settings.shake)}
              ${opt("shake", "reduced", "Soft", settings.shake)}
              ${opt("shake", "off", "Off", settings.shake)}
            </div></div>
            <div class="setting"><span>Particles</span><div class="seg">
              ${opt("particles", "full", "Full", settings.particles)}
              ${opt("particles", "reduced", "Reduced", settings.particles)}
            </div></div>
            <label class="setting slider"><span>Volume</span><input data-volume type="range" min="0" max="1" step="0.01" value="${settings.volume}"/></label>
          </div>
          <div class="panel rise" style="--i:3">
            ${toggle("haptics", "Haptics", settings.haptics)}
            ${toggle("reducedMotion", "Reduced motion", settings.reducedMotion)}
            ${toggle("contrast", "Higher contrast", settings.contrast)}
          </div>
          <p class="fine rise" style="--i:4">North is a triangle. South is a ring. Color is never the only signal.</p>
        </div>
      </div>`,
      true,
    );
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
        (entry, i) =>
          `<article class="card slim rise" style="--i:${i + 2}"><h3>${esc(entry.title)}</h3><p>${esc(entry.body)}</p></article>`,
      )
      .join("");
    const dark = Array.from({ length: Math.min(locked, 6) }, (_, i) => `<article class="card slim sealed rise" style="--i:${entries.length + i + 2}">${ICON.lock}<span>Unfiled</span></article>`).join("");
    this.paint(
      `<div class="scrim scroll">
        <div class="copy wide">
          <button class="texty rise" style="--i:0" data-act="map">${ICON.back} Wings</button>
          <header class="rise" style="--i:1">
            <p class="eyebrow">Research</p>
            <h2>What the rooms taught</h2>
          </header>
          <div class="stack">${cards || `<p class="lede">Nothing filed yet. The first room will write the first note.</p>`}${dark}</div>
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
          <button class="texty rise" style="--i:0" data-act="map">${ICON.back} Wings</button>
          <header class="rise" style="--i:1">
            <p class="eyebrow">Notebook</p>
            <h2>Field notes</h2>
          </header>
          <div class="table-wrap rise" style="--i:2">
            <table>
              <thead><tr><th>Room</th><th>Tries</th><th>Clears</th><th>Falls</th><th>Best</th></tr></thead>
              <tbody>${body || `<tr><td colspan="5">No attempts yet.</td></tr>`}</tbody>
            </table>
          </div>
          <div class="rise" style="--i:3"><button class="btn" data-act="export">Export notes</button></div>
        </div>
      </div>`,
      true,
    );
  }

  play(model: HudModel): void {
    this.blocking = false;
    this.screen.innerHTML = "";
    this.screen.classList.remove("open");
    this.lastPolarity = 0;
    // Keep Space for flipping rather than re-pressing whatever was last clicked.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
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
        <button class="icon" data-act="pause" aria-label="Pause">${ICON.pause}</button>
        <div class="titles">
          <p class="eyebrow" id="hud-kicker"></p>
          <h2 id="hud-title"></h2>
          <div class="goals" id="hud-goals"></div>
        </div>
        <button class="icon" id="hud-restart" data-act="restart" aria-label="Restart">${ICON.restart}</button>
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
        <button class="polarity ${model.polarity === 1 ? "north" : "south"} ${model.coach ? "coach" : ""}" id="hud-flip" data-act="flip" aria-label="Polarity ${model.polarity === 1 ? "North" : "South"}. Tap to flip.">
          <span class="side n"><b aria-hidden="true">▲</b>North</span>
          <span class="side s"><b aria-hidden="true">◯</b>South</span>
          <span class="knob" aria-hidden="true"></span>
        </button>
        <small class="read" id="hud-read"></small>
      </div>`;
    this.bind(this.hud);
    this.update(model);
  }

  update(model: HudModel): void {
    const title = this.hud.querySelector("#hud-title");
    const kicker = this.hud.querySelector("#hud-kicker");
    const goals = this.hud.querySelector("#hud-goals");
    const hint = this.hud.querySelector("#hud-hint");
    const read = this.hud.querySelector("#hud-read");
    const flip = this.hud.querySelector<HTMLElement>("#hud-flip");
    const restart = this.hud.querySelector("#hud-restart");
    if (title && title.textContent !== model.title) title.textContent = model.title;
    if (kicker && kicker.textContent !== model.kicker) kicker.textContent = model.kicker;
    if (goals) {
      const html = model.slots
        .filter((slot) => slot.id !== "exit")
        .map(
          (slot) =>
            `<span class="goal ${slot.met ? "met" : "miss"}" title="${esc(slot.label)}">${slotIcon(slot.id)}<span>${esc(slot.live ?? slot.label)}</span></span>`,
        )
        .join("");
      if (goals.innerHTML !== html) goals.innerHTML = html;
    }
    if (hint) {
      if (hint.textContent !== (model.hint ?? "")) hint.textContent = model.hint ?? "";
      hint.toggleAttribute("hidden", !model.hint);
    }
    if (read && read.textContent !== (model.read ?? "")) read.textContent = model.read ?? "";
    if (flip) {
      flip.classList.toggle("north", model.polarity === 1);
      flip.classList.toggle("south", model.polarity !== 1);
      flip.classList.toggle("coach", model.coach);
      if (this.lastPolarity !== 0 && this.lastPolarity !== model.polarity) {
        flip.classList.remove("pulse");
        void flip.offsetWidth;
        flip.classList.add("pulse");
      }
      if (this.lastPolarity !== model.polarity) {
        flip.setAttribute("aria-label", `Polarity ${model.polarity === 1 ? "North" : "South"}. Tap to flip.`);
      }
      this.lastPolarity = model.polarity;
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
        <div class="card pop">
          <p class="eyebrow">Held</p>
          <h2>Paused</h2>
          <div class="stack-buttons">
            <button class="btn primary big" data-act="resume">${ICON.play}<span>Resume</span></button>
            <button class="btn" data-act="restart">${ICON.restart}<span>Restart</span></button>
            <button class="btn" data-act="settings">${ICON.gear}<span>Settings</span></button>
            <button class="btn ghost" data-act="quit">${ICON.back}<span>Leave room</span></button>
          </div>
        </div>
      </div>`,
      true,
    );
  }

  /** Slot medallions light one after another; `step` is the delay between them in ms. */
  results(model: {
    title: string;
    success: string | null;
    slots: { label: string; met: boolean }[];
    switches: number;
    time: number;
    chain: number;
    next: boolean;
    best: boolean;
    step: number;
    lead: number;
  }): void {
    const medals = model.slots
      .map(
        (slot, i) =>
          `<li class="medal ${slot.met ? "met" : ""}" style="--d:${model.lead + i * model.step}ms">
            <span class="coin">${slot.met ? ICON.check : ""}</span>
            <span class="medal-label">${esc(slot.label)}</span>
          </li>`,
      )
      .join("");
    const all = model.slots.every((slot) => slot.met);
    this.paint(
      `<div class="scrim center-card">
        <div class="card pop results ${all ? "perfect" : ""}">
          <p class="eyebrow">${all ? "Perfect clear" : "Room cleared"}</p>
          <h2>${esc(model.title)}</h2>
          ${model.success ? `<p class="lede">${esc(model.success)}</p>` : ""}
          <ul class="medals">${medals}</ul>
          <div class="stats">
            <span>${ICON.flip}<b>${model.switches}</b> flip${model.switches === 1 ? "" : "s"}</span>
            <span>${ICON.clock}<b>${model.time.toFixed(1)}</b>s</span>
            ${model.chain >= 3 ? `<span>${ICON.link}<b>${model.chain}</b> chain</span>` : ""}
            ${model.best ? `<span class="best">New best</span>` : ""}
          </div>
          <div class="row actions">
            ${model.next ? `<button class="btn primary big" data-act="next"><span>Continue</span>${ICON.next}</button>` : `<button class="btn primary big" data-act="quit"><span>Return</span>${ICON.next}</button>`}
            <button class="btn" data-act="watch">${ICON.eye}<span>Watch</span></button>
            <button class="btn" data-act="restart">${ICON.restart}<span>Retry</span></button>
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
