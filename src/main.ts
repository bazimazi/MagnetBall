import "./style.css";
import { haptic, Soundscape } from "./audio/audio";
import { DEFAULT_PARAMS, type Command, type LevelDef, type SimParams } from "./core/types";
import type { ArchetypeId } from "./core/types";
import { CODEX, WORLDS, levelUnlocked, worldUnlocked } from "./game/content";
import { DAILY, DEMO, LAB, dailyLevel } from "./game/extras";
import { gradeRun, objectiveSlots } from "./game/grade";
import { ARCHETYPES } from "./game/archetypes";
import { CAMPAIGN, unlockedCores, worldLevels } from "./game/levels";
import { loadSave, mergeClear, statFor, writeSave, type ClearRecord } from "./game/save";
import { DT } from "./physics/constants";
import { createState, previewPath, step } from "./physics/sim";
import type { SimState } from "./core/types";
import { View, failLabel, type Mark } from "./render/view";
import { Shell, type HudModel } from "./ui/shell";

type ScreenName =
  | "title"
  | "map"
  | "world"
  | "intro"
  | "play"
  | "pause"
  | "results"
  | "settings"
  | "codex"
  | "notes";

interface Session {
  level: LevelDef;
  origin: "campaign" | "lab" | "daily";
  kind: "campaign" | "lab" | "daily" | "replay";
  state: SimState;
  params: SimParams;
  commands: Command[];
  tape: Command[];
  recovering: boolean;
  recoverAt: number;
  mark: Mark | null;
  sessionFails: number;
  saved: boolean;
  wonAt: number | null;
  preset: string;
  core: ArchetypeId;
}

const query = new URLSearchParams(location.search);
const debug = query.get("debug") === "1";
const jump = query.get("level");

const canvas = document.querySelector<HTMLCanvasElement>("#view");
const root = document.querySelector<HTMLElement>("#app");
if (!canvas || !root) throw new Error("Missing game mount");

const view = new View(canvas);
const sound = new Soundscape();
const save = loadSave();
sound.setVolume(save.settings.volume);

let screen: ScreenName = "title";
let settingsFrom: ScreenName = "map";
let worldId = 1;
let session: Session | null = null;
let demo = createState(DEMO, { ...DEFAULT_PARAMS, sandbox: true });
let demoCommands: Command[] = [];
let demoFlip = 1.3;
let preview: { x: number; y: number; lost: boolean }[] = [];
let previewHold = 0;
let acc = 0;
let last = performance.now();

const shell = new Shell(root, {
  act: (action, arg) => onAct(action, arg),
  setting: (key, value) => onSetting(key, value),
  volume: (value) => {
    save.settings.volume = value;
    sound.setVolume(value);
    writeSave(save);
  },
  lab: (key, value) => {
    if (!session) return;
    if (key === "gravity") session.params.gravityScale = value;
    if (key === "mass") session.params.massScale = value;
    if (key === "magnet") session.params.magnetScale = value;
    if (key === "bounce") session.params.restitutionScale = value;
  },
});

function clearedIds(): string[] {
  return Object.entries(save.cleared)
    .filter(([, record]) => record.exit)
    .map(([id]) => id);
}

function dayKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function applyBody(): void {
  document.body.classList.toggle("contrast", save.settings.contrast);
  document.body.classList.toggle("quiet", save.settings.reducedMotion);
}

function showTitle(): void {
  screen = "title";
  session = null;
  shell.title();
}

function showMap(): void {
  screen = "map";
  session = null;
  const ids = clearedIds();
  shell.map({
    wings: WORLDS.map((wing) => {
      const levels = worldLevels(wing.id);
      return {
        id: wing.id,
        wing: wing.wing,
        name: wing.name,
        summary: wing.summary,
        sealed: Boolean(wing.sealed),
        unlocked: worldUnlocked(wing.id, ids, CAMPAIGN),
        cleared: levels.filter((level) => ids.includes(level.id)).length,
        total: levels.length,
      };
    }),
    lab: ids.length >= 3,
    daily: ids.length >= 4,
    dailyDone: save.dailies.includes(dayKey()),
    dailyName: "Today’s trial",
  });
}

function showWorld(id: number): void {
  worldId = id;
  const info = WORLDS.find((wing) => wing.id === id);
  if (!info) return;
  screen = "world";
  session = null;
  const ids = clearedIds();
  shell.world({
    wing: info.wing,
    name: info.name,
    summary: info.summary,
    levels: worldLevels(id).map((level, index) => ({
      id: level.id,
      index: index + 1,
      name: level.name,
      unlocked: levelUnlocked(level, ids, CAMPAIGN) || level.id === jump,
      pips: pipsFor(level),
    })),
  });
}

function showIntro(id: number): void {
  const info = WORLDS.find((wing) => wing.id === id);
  if (!info) return;
  worldId = id;
  screen = "intro";
  shell.intro({ wing: info.wing, name: info.name, summary: info.summary });
}

function showSettings(): void {
  settingsFrom = screen === "settings" ? settingsFrom : screen;
  screen = "settings";
  shell.settings(save.settings);
}

function showCodex(): void {
  screen = "codex";
  session = null;
  const open = CODEX.filter((entry) => save.codex.includes(entry.id));
  shell.codex(
    open.map((entry) => ({ title: entry.title, body: entry.body })),
    CODEX.length - open.length,
  );
}

function showNotes(): void {
  screen = "notes";
  session = null;
  const rows = [...CAMPAIGN, ...DAILY].map((level) => {
    const stat = save.stats[level.id];
    const clear = save.cleared[level.id];
    const best = clear?.exit
      ? `${clear.switches} flips · ${clear.time.toFixed(1)}s`
      : "—";
    return {
      name: level.name,
      attempts: stat?.attempts ?? 0,
      wins: stat?.wins ?? 0,
      fails: stat?.fails ?? 0,
      best,
    };
  }).filter((row) => row.attempts > 0 || row.wins > 0);
  shell.notes(rows);
}

function pipsFor(level: LevelDef): boolean[] {
  const record = save.cleared[level.id];
  return objectiveSlots(level).map((slot) => {
    if (!record?.exit) return false;
    if (slot.id === "exit") return record.exit;
    if (slot.id === "switches") return record.switchesMet;
    if (slot.id === "shards") return record.shardsMet;
    return record.timeMet;
  });
}

function begin(
  level: LevelDef,
  origin: Session["origin"],
  core: ArchetypeId = level.ball.archetype ?? "probe",
  preset = "",
): void {
  const params: SimParams = {
    ...DEFAULT_PARAMS,
    sandbox: Boolean(level.sandbox),
  };
  const authored: LevelDef =
    core === (level.ball.archetype ?? "probe")
      ? level
      : { ...level, ball: { ...level.ball, archetype: core } };
  session = {
    level: authored,
    origin,
    kind: origin,
    state: createState(authored, params),
    params,
    commands: [],
    tape: [],
    recovering: false,
    recoverAt: 0,
    mark: null,
    sessionFails: 0,
    saved: false,
    wonAt: null,
    preset,
    core,
  };
  const stat = statFor(save, level.id);
  stat.attempts += 1;
  save.stats[level.id] = stat;
  writeSave(save);
  preview = [];
  view.clearTrail();
  screen = "play";
  shell.play(hud());
  shell.say(`${level.name}. Polarity ${authored.ball.polarity === 1 ? "north" : "south"}.`);
}

function hud(): HudModel {
  const current = session;
  if (!current) {
    return {
      title: "",
      kicker: "",
      polarity: 1,
      read: null,
      slots: [],
      hint: null,
      coach: false,
      settled: false,
      lab: false,
      presets: [],
      cores: [],
      preset: "",
      core: "probe",
    };
  }
  const { level, state } = current;
  const stat = save.stats[level.id];
  const showHint = Boolean(level.hint) && ((stat?.fails ?? 0) >= 2 || current.sessionFails >= 2);
  const read =
    state.effective !== state.ball.polarity
      ? `Reads as ${state.effective === 1 ? "north" : "south"}`
      : null;
  return {
    title: level.name,
    kicker: level.kicker,
    polarity: state.ball.polarity,
    read,
    slots: objectiveSlots(level).map((slot) => ({
      label: slot.label,
      met: liveMet(level, state, slot.id),
    })),
    hint: showHint ? (level.hint ?? null) : null,
    coach: level.id === "1-2" && !save.taughtFlip,
    settled: state.restTime > 1.15 && state.status === "play" && !current.recovering,
    lab: current.kind === "lab",
    presets: LAB.map((preset) => ({ id: preset.id, name: preset.name })),
    cores: unlockedCores(clearedIds()).map((id) => ({ id, label: ARCHETYPES[id].label })),
    preset: current.preset,
    core: current.core,
  };
}

function liveMet(level: LevelDef, state: SimState, id: string): boolean {
  const o = level.objectives ?? {};
  if (id === "exit") return state.status === "won";
  if (id === "switches") return o.maxSwitches != null && state.switches <= o.maxSwitches;
  if (id === "shards") return Boolean(o.fragments) && state.got.every(Boolean);
  if (id === "time") return o.maxTime != null && state.time <= o.maxTime;
  return false;
}

function flip(): void {
  if (!session || screen !== "play") return;
  if (session.recovering) {
    restart();
    return;
  }
  if (session.kind === "replay" || session.state.status !== "play") return;
  const base = session.state.desired ?? session.state.ball.polarity;
  const next = base === 1 ? -1 : 1;
  session.commands.push({ frame: session.state.frame, polarity: next });
  save.taughtFlip = true;
  sound.unlock();
  sound.switched(next);
  haptic(12, save.settings.haptics);
  previewHold = 0;
  shell.say(next === 1 ? "North" : "South");
}

function restart(): void {
  if (!session) return;
  const { level, origin, core, preset, mark, sessionFails, params } = session;
  const kept = mark && mark.life > 0 ? { ...mark, life: Math.max(mark.life, 0.8) } : null;
  session = {
    level,
    origin,
    kind: origin,
    state: createState(level, params),
    params: { ...params },
    commands: [],
    tape: session.tape,
    recovering: false,
    recoverAt: 0,
    mark: kept,
    sessionFails,
    saved: false,
    wonAt: null,
    preset,
    core,
  };
  const stat = statFor(save, level.id);
  stat.restarts += 1;
  stat.attempts += 1;
  save.stats[level.id] = stat;
  writeSave(save);
  preview = [];
  view.clearTrail();
  screen = "play";
  shell.clearOverlay();
  shell.play(hud());
}

function watch(): void {
  if (!session) return;
  const tape = session.tape.slice();
  session.state = createState(session.level, session.params);
  session.kind = "replay";
  session.commands = [];
  session.tape = tape;
  session.recovering = false;
  session.saved = true;
  session.wonAt = null;
  preview = [];
  view.clearTrail();
  screen = "play";
  shell.clearOverlay();
  shell.play(hud());
  shell.say("Watching your run.");
}

function finish(now: number): void {
  if (!session) return;
  if (session.kind === "replay") {
    if (session.wonAt == null) session.wonAt = now;
    return;
  }
  if (session.saved) return;
  session.saved = true;
  session.tape = session.commands.slice();
  session.wonAt = now;
  const { level, state, kind } = session;
  if (kind === "lab") return;
  const fragments = state.got.filter(Boolean).length;
  const grade = gradeRun(level, {
    status: state.status,
    switches: state.switches,
    time: state.time,
    fragments,
  });
  const record: ClearRecord = {
    switches: state.switches,
    time: state.time,
    fragments,
    chain: state.bestChain,
    exit: grade.met.exit,
    switchesMet: grade.met.switches,
    shardsMet: grade.met.shards,
    timeMet: grade.met.time,
  };
  if (kind === "daily") {
    const key = dayKey();
    if (!save.dailies.includes(key)) save.dailies.push(key);
  }
  save.cleared[level.id] = mergeClear(save.cleared[level.id], record);
  const stat = statFor(save, level.id);
  stat.wins += 1;
  save.stats[level.id] = stat;
  if (level.discover && !save.codex.includes(level.discover)) save.codex.push(level.discover);
  for (const core of unlockedCores(clearedIds())) {
    if (core !== "probe" && !save.codex.includes(core)) save.codex.push(core);
  }
  writeSave(save);
  sound.won();
  haptic([12, 40, 18], save.settings.haptics);
  shell.say(`${level.name} cleared.`);
}

function fail(now: number): void {
  if (!session || session.recovering || session.state.status !== "lost") return;
  session.recovering = true;
  session.recoverAt = now + 560;
  const reason = session.state.failReason ?? "void";
  session.mark = {
    x: session.state.ball.x,
    y: session.state.ball.y,
    label: failLabel(reason),
    life: 1.7,
  };
  session.sessionFails += 1;
  const stat = statFor(save, session.level.id);
  stat.fails += 1;
  stat.spots.push({
    x: Math.round(session.state.ball.x * 10) / 10,
    y: Math.round(session.state.ball.y * 10) / 10,
  });
  stat.spots = stat.spots.slice(-30);
  save.stats[session.level.id] = stat;
  writeSave(save);
  sound.lost();
  haptic(28, save.settings.haptics);
  shell.say(failLabel(reason));
}

function showResults(): void {
  if (!session) return;
  screen = "results";
  const { level, state } = session;
  const fragments = state.got.filter(Boolean).length;
  const grade = gradeRun(level, {
    status: "won",
    switches: state.switches,
    time: state.time,
    fragments,
  });
  const peers = worldLevels(level.world);
  const index = peers.findIndex((item) => item.id === level.id);
  const next = session.origin === "campaign" ? peers[index + 1] : undefined;
  shell.results({
    title: level.name,
    success: level.success ?? null,
    slots: grade.slots.map((slot) => ({ label: slot.label, met: grade.met[slot.id] })),
    detail: `${state.switches} flips · ${state.time.toFixed(1)}s`,
    chain: state.bestChain,
    next: Boolean(next),
  });
}

function onAct(action: string, arg: string): void {
  sound.unlock();
  if (action === "enter" || action === "map") showMap();
  else if (action === "world") {
    const id = Number(arg);
    if (!save.seenWorlds.includes(id)) showIntro(id);
    else showWorld(id);
  } else if (action === "begin") {
    if (!save.seenWorlds.includes(worldId)) save.seenWorlds.push(worldId);
    writeSave(save);
    showWorld(worldId);
  } else if (action === "level") {
    const level = CAMPAIGN.find((item) => item.id === arg);
    if (level) begin(level, "campaign");
  } else if (action === "lab") {
    const level = LAB[0];
    if (level) begin(level, "lab", "probe", level.id);
  } else if (action === "daily") begin(dailyLevel(), "daily");
  else if (action === "settings") showSettings();
  else if (action === "codex") showCodex();
  else if (action === "notes") showNotes();
  else if (action === "back") {
    if (settingsFrom === "pause") {
      screen = "pause";
      shell.pause();
    } else if (settingsFrom === "play" && session) {
      screen = "play";
      shell.clearOverlay();
    } else showMap();
  } else if (action === "pause") {
    if (screen === "play") {
      screen = "pause";
      shell.pause();
    }
  } else if (action === "resume") {
    screen = "play";
    shell.clearOverlay();
  } else if (action === "restart") restart();
  else if (action === "flip") flip();
  else if (action === "watch") watch();
  else if (action === "next" && session) {
    const peers = worldLevels(session.level.world);
    const index = peers.findIndex((item) => item.id === session?.level.id);
    const next = peers[index + 1];
    if (next) begin(next, "campaign");
    else showWorld(session.level.world);
  } else if (action === "quit") {
    if (session?.kind === "campaign") showWorld(session.level.world);
    else showMap();
  } else if (action === "bench") shell.toggleBench();
  else if (action === "preset") {
    const level = LAB.find((item) => item.id === arg);
    if (level && session) begin(level, "lab", session.core, level.id);
  } else if (action === "core" && session?.kind === "lab") {
    begin(session.level, "lab", arg as ArchetypeId, session.preset);
  } else if (action === "export") {
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "magnet-ball-notes.json";
    link.click();
    URL.revokeObjectURL(url);
  }
}

function onSetting(key: string, value: string): void {
  const settings = save.settings;
  if (key === "trajectory" && (value === "off" || value === "short" || value === "long")) settings.trajectory = value;
  else if (key === "shake" && (value === "full" || value === "reduced" || value === "off")) settings.shake = value;
  else if (key === "particles" && (value === "full" || value === "reduced")) settings.particles = value;
  else if (key === "haptics") settings.haptics = value === "on";
  else if (key === "reducedMotion") settings.reducedMotion = value === "on";
  else if (key === "contrast") settings.contrast = value === "on";
  if (settings.reducedMotion) settings.shake = "off";
  writeSave(save);
  applyBody();
  if (screen === "settings") shell.settings(save.settings);
}

function tick(now: number): void {
  if (screen === "title" || screen === "map" || screen === "world" || screen === "codex" || screen === "notes") {
    demoFlip -= DT;
    if (demoFlip <= 0) {
      demoFlip = 1.35;
      const next = demo.ball.polarity === 1 ? -1 : 1;
      demoCommands.push({ frame: demo.frame, polarity: next });
    }
    step(DEMO, demo, { ...DEFAULT_PARAMS, sandbox: true }, demoCommands);
    view.ingest(demo.events, save.settings);
    sound.hum(Math.hypot(demo.fx, demo.fy));
    if (demo.time > 14) {
      demo = createState(DEMO, { ...DEFAULT_PARAMS, sandbox: true });
      demoCommands = [];
    }
    return;
  }
  if (!session || screen === "pause" || screen === "results" || screen === "settings") return;
  if (session.recovering) return;
  const using = session.kind === "replay" ? session.tape : session.commands;
  step(session.level, session.state, session.params, using);
  view.ingest(session.state.events, save.settings);
  sound.hum(Math.hypot(session.state.fx, session.state.fy));
  for (const event of session.state.events) {
    if (event.type === "bounce") sound.bounced(event.speed);
    else if (event.type === "switch" && session.kind === "replay") sound.switched(event.polarity);
    else if (event.type === "field") sound.entered(event.attract);
    else if (event.type === "collect") sound.collected();
    else if (event.type === "reject") sound.rejected();
    else if (event.type === "chain") sound.chained(event.n);
    else if (event.type === "chime") sound.chimed();
    else     if (event.type === "win") finish(now);
    else if (event.type === "lose" && session.kind !== "replay") fail(now);
  }
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!document.hidden) {
    acc += dt;
    let guard = 0;
    while (acc >= DT && guard < 6) {
      tick(now);
      acc -= DT;
      guard += 1;
    }
  }
  if (session?.mark) {
    session.mark.life -= dt;
    if (session.mark.life <= 0) session.mark = null;
  }
  if (session?.recovering && now >= session.recoverAt) restart();
  if (session?.wonAt && now - session.wonAt > 620 && screen === "play") showResults();

  const drawing = session?.level ?? DEMO;
  const state = session?.state ?? demo;
  if (session && screen === "play") {
    previewHold -= 1;
    const mode = session.level.forceTrajectory ?? save.settings.trajectory;
    if (mode !== "off" && previewHold <= 0 && state.status === "play" && !session.recovering) {
      preview = previewPath(session.level, state, session.params, mode === "long" ? 1.45 : 0.72);
      previewHold = 5;
    }
    shell.update(hud());
    const stat = statFor(save, session.level.id);
    if ((stat.fails >= 2 || session.sessionFails >= 2) && session.level.hint && !session.recovering) {
      if (stat.hints === 0) {
        stat.hints = 1;
        save.stats[session.level.id] = stat;
      }
    }
  }

  view.draw(
    {
      level: drawing,
      state,
      preview: screen === "play" ? preview : [],
      settings: save.settings,
      debug,
      failDots: debug && session ? (save.stats[session.level.id]?.spots ?? []) : [],
      mark: session?.mark ?? null,
    },
    dt,
  );
  requestAnimationFrame(frame);
}

window.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  sound.unlock();
  if (shell.isControl(event.target) || shell.blocking) return;
  if (screen === "play") flip();
});

window.addEventListener("keydown", (event) => {
  const key = event.key;
  if (event.code === "Space" || event.code === "KeyK" || key === " " || key === "k" || key === "K") {
    event.preventDefault();
    if (screen === "play") flip();
  } else if (event.code === "KeyR" || key === "r" || key === "R") {
    event.preventDefault();
    if (session) restart();
  } else if (event.code === "Escape" || key === "Escape") {
    if (screen === "play") onAct("pause", "");
    else if (screen === "pause") onAct("resume", "");
  }
});

window.addEventListener("resize", () => view.resize());
applyBody();
view.resize();
if (jump) {
  const level = CAMPAIGN.find((item) => item.id === jump) ?? DAILY.find((item) => item.id === jump);
  if (level) begin(level, CAMPAIGN.includes(level) ? "campaign" : "daily");
  else showTitle();
} else showTitle();
requestAnimationFrame(frame);
