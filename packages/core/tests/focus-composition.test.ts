
import { describe, expect, it } from "vitest";
import {
  AssetId,
  createFocusComposition
} from "../src/index.js";

describe("Focus composition", () => {
  const book = {
    assetId: AssetId.create("book"),
    variant: {
      size: "L" as const,
      role: "main" as const,
      resourceKey: "book/main/l"
    },
    width: 1446,
    height: 977
  };

  const pen = {
    assetId: AssetId.create("pen"),
    variant: {
      size: "S" as const,
      role: "main" as const,
      resourceKey: "pen/main/s"
    },
    width: 254,
    height: 143
  };

  it("keeps objects inside the canvas", () => {
    const scene = createFocusComposition(1200, 800, book, pen);

    for (const [index, item] of scene.items.entries()) {
      const source = [book, pen][index]!;

      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.x + source.width * item.scale)
        .toBeLessThanOrEqual(scene.width);
      expect(item.y + source.height * item.scale)
        .toBeLessThanOrEqual(scene.height);
    }
  });

  it("places a secondary main object without covering the primary", () => {
    const scene = createFocusComposition(1200, 800, book, pen);
    const [primary, secondary] = scene.items;

    const intersects = secondary!.x < primary!.x + book.width * primary!.scale &&
      secondary!.x + pen.width * secondary!.scale > primary!.x &&
      secondary!.y < primary!.y + book.height * primary!.scale &&
      secondary!.y + pen.height * secondary!.scale > primary!.y;
    expect(intersects).toBe(false);
  });

  it("rejects invalid dimensions", () => {
    expect(() => createFocusComposition(0, 800, book, pen))
      .toThrow();

    expect(() => createFocusComposition(1200, 800, book, {
      ...pen,
      width: 0
    })).toThrow();
  });

  it.each([
    [1200, 800], [1000, 1000], [800, 1200]
  ])("supports one and multiple objects on %s × %s", (width, height) => {
    for (const count of [1, 3, 5, 8]) {
      const sources = Array.from({ length: count }, (_, index) => index === 0 ? book : pen);
      const scene = createFocusComposition(width, height, sources[0]!, sources[1], ...sources.slice(2));
      expect(scene.items).toHaveLength(count);
      scene.items.forEach((item, index) => {
        const source = sources[index]!;
        expect(item.x).toBeGreaterThanOrEqual(0);
        expect(item.y).toBeGreaterThanOrEqual(0);
        expect(item.x + source.width * item.scale).toBeLessThanOrEqual(width + 0.001);
        expect(item.y + source.height * item.scale).toBeLessThanOrEqual(height + 0.001);
      });
      for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
        const a = scene.items[i]!, b = scene.items[j]!;
        const sa = sources[i]!, sb = sources[j]!;
        expect(a.x < b.x + sb.width * b.scale && a.x + sa.width * a.scale > b.x &&
          a.y < b.y + sb.height * b.scale && a.y + sa.height * a.scale > b.y).toBe(false);
      }
    }
  });
});
