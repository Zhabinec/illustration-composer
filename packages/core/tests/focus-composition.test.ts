
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

  it("places secondary object over the primary area", () => {
    const scene = createFocusComposition(1200, 800, book, pen);
    const [primary, secondary] = scene.items;

    expect(secondary!.x).toBeGreaterThan(primary!.x);
    expect(secondary!.x)
      .toBeLessThan(primary!.x + book.width * primary!.scale);
    expect(secondary!.y)
      .toBeLessThan(primary!.y + book.height * primary!.scale);
  });

  it("rejects invalid dimensions", () => {
    expect(() => createFocusComposition(0, 800, book, pen))
      .toThrow();

    expect(() => createFocusComposition(1200, 800, book, {
      ...pen,
      width: 0
    })).toThrow();
  });
});
