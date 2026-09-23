import { describe, expect, it } from "vitest";
import type { LevelDef } from "../src/core/types";
import { LEVEL_H, LEVEL_W } from "../src/physics/constants";
import { runSim, toggles } from "../src/physics/sim";

function level(partial: Partial<LevelDef> & Pick<LevelDef, "ball">): LevelDef {
  return {
    id: "spec",
    world: 0,
    name: "spec",
    kicker: "",
    goal: { x: 1, y: 1, r: 0.2 },
    boxes: [
      { x: 0, y: 0, w: 0.45, h: LEVEL_H },
      { x: LEVEL_W - 0.45, y: 0, w: 0.45, h: LEVEL_H },
      { x: 0, y: 0, w: LEVEL_W, h: 0.45 },
    ],
    ...partial,
  };
}

describe("magnetic forces", () => {
  it("pulls a north ball down onto a south floor", () => {
    const result = runSim(
      level({
        ball: { x: 10, y: 6, polarity: 1 },
        plates: [
          {
            id: "floor",
            x: 6,
            y: 9,
            w: 8,
            h: 1.2,
            face: "up",
            polarity: -1,
            strength: 90,
            range: 6,
          },
        ],
      }),
      [],
      0.45,
    );
    const start = result.samples[0];
    const later = result.samples[1];
    expect(start).toBeTruthy();
    expect(later && later.y).toBeGreaterThan(start ? start.y : 0);
  });

  it("pushes a north ball up off a north floor", () => {
    const result = runSim(
      level({
        ball: { x: 10, y: 8.5, polarity: 1 },
        plates: [
          {
            id: "floor",
            x: 6,
            y: 9,
            w: 8,
            h: 1.5,
            face: "up",
            polarity: 1,
            strength: 110,
            range: 4,
          },
        ],
      }),
      [],
      0.7,
    );
    expect(result.endY).toBeLessThan(7.2);
  });

  it("does not pull through the back of a plate", () => {
    const front = runSim(
      level({
        ball: { x: 8, y: 6, polarity: 1, vx: 0, vy: 0 },
        gravity: 0,
        plates: [
          {
            id: "wall",
            x: 4,
            y: 4,
            w: 1.2,
            h: 4,
            face: "right",
            polarity: -1,
            strength: 80,
            range: 6,
          },
        ],
      }),
      [],
      0.4,
    );
    const back = runSim(
      level({
        ball: { x: 3.2, y: 6, polarity: 1 },
        gravity: 0,
        plates: [
          {
            id: "wall",
            x: 4,
            y: 4,
            w: 1.2,
            h: 4,
            face: "right",
            polarity: -1,
            strength: 80,
            range: 6,
          },
        ],
      }),
      [],
      0.4,
    );
    expect(front.endX).toBeLessThan(8);
    expect(Math.abs(back.endX - 3.2)).toBeLessThan(0.2);
  });

  it("ignores a magnet hidden behind a shield", () => {
    const open = runSim(
      level({
        ball: { x: 4, y: 6, polarity: 1 },
        gravity: 0,
        orbs: [{ id: "s", x: 14, y: 6, polarity: -1, strength: 70, range: 16, solid: false }],
      }),
      [],
      0.5,
    );
    const blocked = runSim(
      level({
        ball: { x: 4, y: 6, polarity: 1 },
        gravity: 0,
        orbs: [{ id: "s", x: 14, y: 6, polarity: -1, strength: 70, range: 16, solid: false }],
        shields: [{ x: 8, y: 4, w: 2, h: 4, solid: false }],
      }),
      [],
      0.5,
    );
    expect(open.endX).toBeGreaterThan(5);
    expect(Math.abs(blocked.endX - 4)).toBeLessThan(0.25);
  });

  it("inverts polarity inside an inversion pane", () => {
    const plain = runSim(
      level({
        ball: { x: 6, y: 6, polarity: 1 },
        gravity: 0,
        orbs: [{ id: "s", x: 12, y: 6, polarity: -1, strength: 50, range: 10, solid: false }],
      }),
      [],
      0.35,
    );
    const flipped = runSim(
      level({
        ball: { x: 6, y: 6, polarity: 1 },
        gravity: 0,
        orbs: [{ id: "s", x: 12, y: 6, polarity: -1, strength: 50, range: 10, solid: false }],
        zones: [{ kind: "invert", x: 4, y: 4, w: 4, h: 4 }],
      }),
      [],
      0.35,
    );
    expect(plain.endX).toBeGreaterThan(6.4);
    expect(flipped.endX).toBeLessThan(5.7);
  });
});

describe("motion", () => {
  it("rests on an attracting floor without bouncing away", () => {
    const result = runSim(
      level({
        ball: { x: 10, y: 9.5, polarity: 1 },
        boxes: [
          { x: 0, y: 0, w: 0.45, h: LEVEL_H },
          { x: LEVEL_W - 0.45, y: 0, w: 0.45, h: LEVEL_H },
          { x: 0, y: 0, w: LEVEL_W, h: 0.45 },
          { x: 0, y: 10.2, w: LEVEL_W, h: 1.8 },
        ],
        plates: [
          {
            id: "pad",
            x: 6,
            y: 10.2,
            w: 8,
            h: 1.2,
            face: "up",
            polarity: -1,
            strength: 100,
            range: 4,
          },
        ],
      }),
      [],
      3,
    );
    expect(result.status).toBe("play");
    const late = result.samples.filter((s) => s.t > 1.5);
    expect(late.length).toBeGreaterThan(3);
    for (const s of late) {
      expect(s.y).toBeGreaterThan(9.4);
      expect(s.y).toBeLessThan(10);
    }
  });

  it("slides toward an attracting pad", () => {
    const result = runSim(
      level({
        ball: { x: 4, y: 9.82, polarity: 1 },
        boxes: [
          { x: 0, y: 0, w: 0.45, h: LEVEL_H },
          { x: LEVEL_W - 0.45, y: 0, w: 0.45, h: LEVEL_H },
          { x: 0, y: 0, w: LEVEL_W, h: 0.45 },
          { x: 0, y: 10.2, w: LEVEL_W, h: 1.8 },
        ],
        plates: [
          {
            id: "pad",
            x: 12,
            y: 10.2,
            w: 6,
            h: 1.2,
            face: "up",
            polarity: -1,
            strength: 90,
            range: 9,
          },
        ],
      }),
      [],
      2.2,
    );
    expect(result.endX).toBeGreaterThan(7);
  });

  it("sticks to a ceiling while polarities oppose", () => {
    const result = runSim(
      level({
        ball: { x: 10, y: 1.5, polarity: 1 },
        plates: [
          {
            id: "ceil",
            x: 6,
            y: 0.45,
            w: 8,
            h: 0.7,
            face: "down",
            polarity: -1,
            strength: 130,
            range: 3,
          },
        ],
      }),
      [],
      2,
    );
    const late = result.samples.filter((s) => s.t > 1);
    expect(late.every((s) => s.y < 2.1 && s.y > 1.05)).toBe(true);
  });

  it("does not tunnel through a wall at speed", () => {
    const result = runSim(
      level({
        ball: { x: 4, y: 6, vx: 12, polarity: 1 },
        boxes: [
          { x: 0, y: 0, w: 0.45, h: LEVEL_H },
          { x: LEVEL_W - 0.45, y: 0, w: 0.45, h: LEVEL_H },
          { x: 0, y: 0, w: LEVEL_W, h: 0.45 },
          { x: 10, y: 0.45, w: 1.2, h: 11 },
        ],
      }),
      [],
      1.2,
    );
    expect(result.endX).toBeLessThan(10);
    expect(result.endX).toBeGreaterThan(2);
  });

  it("rides a sloped rail and keeps the tangent", () => {
    const result = runSim(
      level({
        ball: { x: 4.2, y: 4, polarity: 1 },
        gravity: 22,
        rails: [
          {
            id: "rail",
            x1: 3,
            y1: 4,
            x2: 16,
            y2: 8,
            polarity: -1,
            strength: 80,
            range: 3,
            capture: 1,
            exitX: 0,
            exitY: 1,
          },
        ],
      }),
      [],
      1.6,
    );
    expect(result.endX).toBeGreaterThan(7);
    expect(result.status).toBe("play");
  });
});

describe("outcomes", () => {
  it("rejects a cradle when the ball is too fast", () => {
    const fast = runSim(
      level({
        ball: { x: 8, y: 6, vx: 8, polarity: 1 },
        gravity: 0,
        goal: { x: 10, y: 6, r: 0.7, maxSpeed: 2 },
      }),
      [],
      1,
    );
    expect(fast.status).toBe("play");

    const slow = runSim(
      level({
        ball: { x: 10, y: 6, polarity: 1 },
        gravity: 0,
        goal: { x: 10, y: 6, r: 0.7, maxSpeed: 2 },
      }),
      [],
      0.3,
    );
    expect(slow.status).toBe("won");
  });

  it("fails in the void and on spikes and beams", () => {
    const pit = runSim(level({ ball: { x: 10, y: 11.2, polarity: 1 }, gravity: 30 }), [], 1);
    expect(pit.status).toBe("lost");
    expect(pit.failReason).toBe("void");

    const spike = runSim(
      level({
        ball: { x: 10, y: 6, polarity: 1 },
        gravity: 0,
        spikes: [{ x: 9.4, y: 5.6, w: 1.2, h: 1 }],
      }),
      [],
      0.2,
    );
    expect(spike.failReason).toBe("spike");

    const beam = runSim(
      level({
        ball: { x: 10, y: 6, polarity: 1 },
        gravity: 0,
        lasers: [{ x1: 6, y1: 6, x2: 14, y2: 6 }],
      }),
      [],
      0.2,
    );
    expect(beam.failReason).toBe("beam");
  });

  it("is deterministic for the same commands", () => {
    const spec = level({
      ball: { x: 5, y: 4, polarity: 1 },
      boxes: [
        { x: 0, y: 0, w: 0.45, h: LEVEL_H },
        { x: LEVEL_W - 0.45, y: 0, w: 0.45, h: LEVEL_H },
        { x: 0, y: 0, w: LEVEL_W, h: 0.45 },
        { x: 0, y: 10.4, w: LEVEL_W, h: 1.6 },
      ],
      orbs: [
        {
          id: "mover",
          x: 12,
          y: 7,
          polarity: -1,
          strength: 60,
          range: 8,
          solid: false,
          motion: { ampX: 2, omega: 1.3 },
        },
      ],
    });
    const commands = toggles(spec, [0.35, 0.9, 1.5, 2.2]);
    const a = runSim(spec, commands, 3);
    const b = runSim(spec, commands, 3);
    expect(a).toEqual(b);
  });

  it("applies a flip that arrives during the switch delay", () => {
    const spec = level({
      ball: { x: 6, y: 6, polarity: 1 },
      gravity: 0,
      orbs: [{ id: "s", x: 14, y: 6, polarity: -1, strength: 40, range: 12, solid: false }],
    });
    const held = runSim(spec, toggles(spec, [0, 0.03]), 0.6);
    expect(held.switches).toBe(2);
    expect(held.samples.some((s) => s.p === -1)).toBe(true);
    expect(held.samples.some((s) => s.p === 1)).toBe(true);
  });
});
