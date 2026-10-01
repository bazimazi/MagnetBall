import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAMPAIGN } from "../src/game/levels";
import { DAILY, LAB } from "../src/game/extras";
import { DEFAULT_SETTINGS } from "../src/game/settings";
import { createState, step, toggles } from "../src/physics/sim";
import { DEFAULT_PARAMS } from "../src/core/types";
import { View, type FrameInput } from "../src/render/view";
import { mix, rgba } from "../src/render/color";
import { SOLUTIONS } from "./solutions";

const offscreen: Canvas[] = [];

beforeEach(() => {
  offscreen.length = 0;
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas = createCanvas(1, 1);
      vi.spyOn(canvas, "getContext");
      offscreen.push(canvas);
      return canvas;
    },
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function scene(width = 1280, height = 800, level = CAMPAIGN[0]) {
  const canvas = createCanvas(width, height);
  const element = Object.assign(canvas, { getBoundingClientRect: () => ({ width, height }) });
  const view = new View(element as unknown as HTMLCanvasElement);
  view.resize();
  view.enter(level, false);
  const input: FrameInput = {
    level, state: createState(level), preview: [], settings: { ...DEFAULT_SETTINGS },
    debug: false, failDots: [], mark: null, inset: { top: 92, bottom: 104 },
  };
  return { view, input, canvas };
}

function artifact(name: string, canvas: Canvas) {
  if (!process.env.RENDER_ARTIFACTS) return;
  mkdirSync(process.env.RENDER_ARTIFACTS, { recursive: true });
  writeFileSync(join(process.env.RENDER_ARTIFACTS, `${name}.png`), canvas.toBuffer("image/png"));
}

describe("rendering", () => {
  it("preserves the displayed color when another flip interrupts a blend", () => {
    const intermediate = mix("#ff8f3f", "#34d8c6", 0.5);
    expect(mix(intermediate, "#ff8f3f", 0)).toBe(intermediate);
    expect(rgba(intermediate, 0.4)).toBe("rgba(154,180,131,0.4)");
  });

  it("reuses the static chamber throughout camera entry instead of rebuilding at every zoom step", () => {
    const { view, input } = scene();
    view.draw(input, 1 / 60);
    const chamber = offscreen[1]; // First canvas is noise, next is the room texture.
    expect(chamber).toBeDefined();
    for (let i = 0; i < 45; i++) view.draw(input, 1 / 60);
    expect(chamber.getContext).toHaveBeenCalledTimes(1);
    view.resize();
    view.draw(input, 1 / 60);
    expect(chamber.getContext).toHaveBeenCalledTimes(2);
  });

  it("renders every campaign, daily and laboratory layout with the real Canvas API", () => {
    for (const level of [...CAMPAIGN, ...DAILY, ...LAB]) {
      const { view, input, canvas } = scene(960, 640, level);
      for (let i = 0; i < 3; i++) view.draw(input, 0.25);
      expect(canvas.getContext("2d").getImageData(480, 320, 1, 1).data[3], level.id).toBe(255);
      if (level === CAMPAIGN[0] || level === CAMPAIGN[10] || level === CAMPAIGN[20]) artifact(level.id, canvas);
    }
  });

  it("keeps decorative motion still in reduced-motion mode, including the title", () => {
    const { view, input, canvas } = scene();
    input.settings.reducedMotion = true;
    view.draw(input, 1);
    const first = canvas.toBuffer("image/png");
    view.draw(input, 1);
    expect(canvas.toBuffer("image/png").equals(first)).toBe(true);
    input.title = true;
    view.draw(input, 1);
    const title = canvas.toBuffer("image/png");
    view.draw(input, 1);
    expect(canvas.toBuffer("image/png").equals(title)).toBe(true);
  });

  it("freezes visual effects when paused", () => {
    const { view, input, canvas } = scene();
    for (let i = 0; i < 90; i++) view.draw(input, 1 / 60);
    view.ingest([{ type: "switch", polarity: -1 }], input.settings, input.level, input.state);
    input.paused = true;
    view.draw(input, 1 / 60);
    const before = canvas.toBuffer("image/png");
    view.draw(input, 0.5);
    expect(canvas.toBuffer("image/png").equals(before)).toBe(true);
  });

  it("renders capture, failure, respawn and high-DPI portrait layouts", () => {
    vi.stubGlobal("window", { devicePixelRatio: 2 });
    const { view, input, canvas } = scene(390, 844);
    const commands = toggles(input.level, SOLUTIONS[input.level.id]);
    for (let i = 0; i < 500 && input.state.status === "play"; i++) {
      step(input.level, input.state, DEFAULT_PARAMS, commands);
      view.ingest(input.state.events, input.settings, input.level, input.state);
      view.draw(input, 1 / 120);
    }
    expect(input.state.status).toBe("won");
    artifact("portrait-capture", canvas);
    view.respawn(false);
    view.draw(input, 0.5);
    view.ingest([{ type: "lose", reason: "spike" }], input.settings, input.level, input.state);
    view.draw(input, 0.1);
    artifact("portrait-shatter", canvas);
    expect(canvas.width).toBe(780);
  });

  it("renders the kinetic title sculpture at desktop and phone sizes", () => {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const { view, input, canvas } = scene(width, height);
      input.title = true;
      view.draw(input, 1);
      artifact(`title-${width}`, canvas);
    }
  });
});
