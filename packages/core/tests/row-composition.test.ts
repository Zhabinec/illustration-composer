
import { describe, expect, it } from "vitest";
import {
  AssetId,
  createRowComposition
} from "../src/index.js";

import type {
  CompositionSource
} from "../src/index.js";

describe("Row composition", () => {
  const sources: CompositionSource[] = [
    {
      assetId: AssetId.create("book"),
      variant: {
        size: "L",
        role: "main",
        resourceKey: "book/main/l"
      },
      width: 1446,
      height: 977
    },
    {
      assetId: AssetId.create("pen"),
      variant: {
        size: "S",
        role: "main",
        resourceKey: "pen/main/s"
      },
      width: 254,
      height: 143
    }
  ];

  it("places objects inside composition bounds", () => {
    const scene = createRowComposition(1200, 800, sources);

    expect(scene.items).toHaveLength(2);

    for (const [index, item] of scene.items.entries()) {
      const source = sources[index]!;

      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeGreaterThanOrEqual(0);

      expect(item.x + source.width * item.scale)
        .toBeLessThanOrEqual(scene.width);

      expect(item.y + source.height * item.scale)
        .toBeLessThanOrEqual(scene.height);
    }
  });

  it("preserves object order and proportions", () => {
    const scene = createRowComposition(1200, 800, sources);

    expect(scene.items[0]!.x).toBeLessThan(scene.items[1]!.x);
    expect(scene.items.every(item => item.scale > 0)).toBe(true);
    expect(scene.items.every(item => item.rotation === 0)).toBe(true);
  });

  it("rejects invalid composition dimensions", () => {
    expect(() => createRowComposition(0, 800, sources))
      .toThrow();

    expect(() => createRowComposition(1200, 800, []))
      .toThrow();
  });

  it("rejects invalid source dimensions", () => {
    const invalid = [{ ...sources[0]!, width: 0 }];

    expect(() => createRowComposition(1200, 800, invalid))
      .toThrow("Invalid source dimensions");
  });

  it("scales secondary objects without affecting primary", () => {
  const primaryScene = createRowComposition(1200, 800, sources);

  const secondaryScene = createRowComposition(1200, 800, [
    sources[0]!,
    { ...sources[1]!, emphasis: "secondary" }
  ]);

    expect(secondaryScene.items[0]!.scale)
      .toBeCloseTo(primaryScene.items[0]!.scale);

    expect(secondaryScene.items[1]!.scale)
      .toBeCloseTo(primaryScene.items[1]!.scale * 0.55);
    });
});
