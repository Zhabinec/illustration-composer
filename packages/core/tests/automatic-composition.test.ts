import { describe, expect, it } from "vitest";
import { AssetId, createAutomaticComposition } from "../src/index.js";
import type { CompositionSource } from "../src/index.js";

function source(id: string, width: number, height: number, role: "main" | "background" = "main"): CompositionSource {
  return { assetId: AssetId.create(id), variant: { size: "L", role, resourceKey: `${id}/${role}` }, width, height };
}

describe("automatic composition", () => {
  it.each([[1200, 800], [1000, 1000], [800, 1200]])("fits different silhouettes on %s × %s without covering foreground objects", (width, height) => {
    const sources = [source("wallet", 420, 260), source("coin", 320, 220), source("pen", 110, 470)];
    const scene = createAutomaticComposition(width, height, sources);
    expect(scene.items).toHaveLength(sources.length);
    const boxes = scene.items.map((item, index) => ({ ...item,
      width: sources[index]!.width * item.scale, height: sources[index]!.height * item.scale }));
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(width * 0.03);
      expect(box.y).toBeGreaterThanOrEqual(height * 0.03);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      expect(box.rotation).toBe(0);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      expect(a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
    }
    expect(boxes[0]!.width * boxes[0]!.height).toBeGreaterThan(boxes[1]!.width * boxes[1]!.height);
  });

  it("keeps background variants and places them behind a visible main subject", () => {
    const sources = [source("wallet", 420, 260), source("lamp", 300, 460, "background")];
    const scene = createAutomaticComposition(1000, 1000, sources);
    expect(scene.items.map(item => item.variant)).toEqual(sources.map(item => item.variant));
    const [main, background] = scene.items;
    const overlapX = Math.max(0, Math.min(main!.x + 420 * main!.scale, background!.x + 300 * background!.scale) - Math.max(main!.x, background!.x));
    const overlapY = Math.max(0, Math.min(main!.y + 260 * main!.scale, background!.y + 460 * background!.scale) - Math.max(main!.y, background!.y));
    const fraction = overlapX * overlapY / (300 * 460 * background!.scale ** 2);
    expect(fraction).toBeGreaterThan(0);
    expect(fraction).toBeLessThanOrEqual(0.7);
    expect(background!.y + 460 * background!.scale / 2).toBeLessThan(main!.y + 260 * main!.scale / 2);
    expect(scene.background).toBe("pale");
  });

  it("uses explicit importance rather than position in the input", () => {
    const sources: CompositionSource[] = [source("pen", 100, 400), { ...source("wallet", 400, 260), emphasis: "primary" }];
    const scene = createAutomaticComposition(1200, 800, sources);
    const areas = scene.items.map((item, index) => item.scale ** 2 * sources[index]!.width * sources[index]!.height);
    expect(areas[1]).toBeGreaterThan(areas[0]!);
  });

  it("preserves repeated instances, resource bindings, and inputs", () => {
    const sources = [source("coin", 300, 220), source("coin", 300, 220)];
    const before = JSON.stringify(sources);
    const scene = createAutomaticComposition(1000, 1000, sources);
    expect(scene.items).toHaveLength(2);
    expect(scene.items[0]!.x === scene.items[1]!.x && scene.items[0]!.y === scene.items[1]!.y).toBe(false);
    expect(JSON.stringify(sources)).toBe(before);
    expect(createAutomaticComposition(1000, 1000, sources)).toEqual(scene);
  });

  it("adapts positions to portrait rather than letterboxing a landscape scene", () => {
    const sources = [source("phone", 280, 450), source("wallet", 440, 270)];
    const landscape = createAutomaticComposition(1200, 800, sources);
    const portrait = createAutomaticComposition(800, 1200, sources);
    const centers = (scene: typeof portrait) => scene.items.map((item, index) => ({
      x: (item.x + sources[index]!.width * item.scale / 2) / scene.width,
      y: (item.y + sources[index]!.height * item.scale / 2) / scene.height
    }));
    expect(centers(portrait)).not.toEqual(centers(landscape));
  });

  it("handles a single subject and rejects invalid inputs and all-background scenes", () => {
    expect(createAutomaticComposition(1000, 1000, [source("coin", 300, 220)]).items).toHaveLength(1);
    expect(() => createAutomaticComposition(NaN, 800, [source("coin", 300, 220)])).toThrow();
    expect(() => createAutomaticComposition(1000, 1000, [])).toThrow();
    expect(() => createAutomaticComposition(1000, 1000, [source("coin", 0, 220)])).toThrow();
    expect(() => createAutomaticComposition(1000, 1000, [source("coin", 300, 220, "background")])).toThrow(/главный/);
  });

  it.each([2, 3, 5, 8])("keeps all %s requested instances in a dense scene", count => {
    const sources = Array.from({ length: count }, () => source("coin", 300, 220));
    expect(createAutomaticComposition(1200, 800, sources).items).toHaveLength(count);
  });
});
