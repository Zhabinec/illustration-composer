import { AssetId } from "@illustration-composer/core";
import { expect, it } from "vitest";
import { applyCompositionItemSettings, readCompositionItemSettings } from "../src/composition-item-settings.js";

it("keeps exact Figma coordinates when scaling and rotating another occurrence", () => {
  const source = { assetId: AssetId.create("pen"), variant: { resourceKey: "pen", role: "main", size: "L" } as const,
    width: 100, height: 40 };
  const first = { assetId: source.assetId, variant: source.variant, x: 30, y: 40, scale: 1, rotation: 0 };
  const second = { ...first, x: 200 };
  const settings = readCompositionItemSettings([
    { assetId: "pen", variantId: "pen-l", layer: "background", scale: 100, rotation: 0 },
    { assetId: "pen", variantId: "pen-l", x: 25, y: 75, scale: 150, rotation: 90 }
  ]);
  const result = applyCompositionItemSettings({ width: 800, height: 400, items: [first, second] }, [source, source], settings);
  expect(result.items[0]).toEqual({ ...first, variant: { ...first.variant, role: "background" } });
  expect(result.items[1]).toMatchObject({ scale: 1.5, rotation: 90 });
  expect(result.items[1]!.x).toBe(25);
  expect(result.items[1]!.y).toBe(75);
});
