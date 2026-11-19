import { describe, expect, it } from "vitest";
import library from "../src/library.json";
import { arrange, newElement, pickObjects } from "../src/composition";
import type { VectorAsset } from "../src/model";

const assets = library.assets as VectorAsset[];

describe("web composition", () => {
  it("resolves names without treating template fragments as competing subjects", () => {
    expect(pickObjects("Книга, Ручка, Лампа", "names", assets).map(asset => asset.id))
      .toEqual(["book", "pen", "lamp"]);
  });

  it("selects existing library subjects for a metaphor", () => {
    const selected = pickObjects("Финансовая безопасность", "metaphor", assets);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every(asset => assets.includes(asset) && !asset.id.startsWith("reference-"))).toBe(true);
  });

  it("allows background artwork as the primary subject without replacing its variant", () => {
    const book = assets.find(asset => asset.id === "book")!;
    const variant = book.variants.find(item => item.role === "background")!;
    const element = { ...newElement(book, 1200), variantId: variant.id };
    const [placed] = arrange([element], assets, 1200, 800, "automatic");
    expect(placed!.variantId).toBe(variant.id);
    expect(placed!.width).toBeGreaterThan(0);
    expect(Number.isFinite(placed!.x)).toBe(true);
  });
});
