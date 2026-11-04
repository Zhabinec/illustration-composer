import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetCatalog, AssetId } from "@illustration-composer/core";
import { postMetaphorComposition, resolveMetaphorComposition, resolveMetaphorSelection } from "../src/metaphor-composition.js";

const ids = ["coin", "wallet", "phone", "book", "pen", "lamp", "folder", "puzzle", "headphones"];
const catalog = new AssetCatalog(ids.map(id => ({ id: AssetId.create(id), name: id, tags: [],
  variants: [{ size: "L" as const, role: "main" as const, resourceKey: id }] })));
afterEach(() => vi.unstubAllGlobals());

describe("Metaphors from the source library", () => {
  it("creates a selection directly from the title without a previous names request", () => {
    const result = resolveMetaphorSelection("Финансовая безопасность", catalog, "L", "main");
    expect(result.errors).toEqual([]);
    expect(result.selection.map(item => item.asset.id.value)).toEqual(["coin", "wallet"]);
    expect(result.selection.map(item => item.variant.resourceKey)).toEqual(["coin", "wallet"]);
  });
  it("rejects an unknown metaphor or missing requested role before creating a scene", () => {
    expect(resolveMetaphorSelection("Дракон на луне", catalog, "L", "main").selection).toEqual([]);
    expect(resolveMetaphorSelection("Дракон на луне", catalog, "L", "main").errors.length).toBeGreaterThan(0);
    expect(resolveMetaphorSelection("Финансовая безопасность", catalog, "L", "background").errors.length).toBeGreaterThan(0);
  });
  it.each([
    ["Финансовая безопасность", "coin", "wallet"],
    ["Учёба и новые знания", "book", "pen"],
    ["Идеи для команды", "puzzle", "lamp"],
    ["Мобильная связь", "phone", "headphones"],
    ["Порядок в документах", "folder", "pen"],
    ["Музыка в пути", "headphones", "phone"]
  ])("selects an appropriate primary and supporting asset for %s", (query, first, second) => {
    const result = resolveMetaphorComposition(query, catalog);
    expect(result.errors).toEqual([]);
    expect(result.items[0]?.id).toBe(first);
    expect(result.items.map(item => item.id)).toContain(second);
    expect(result.items.every(item => item.reason && ids.includes(item.id))).toBe(true);
    expect(result.items.length).toBeLessThanOrEqual(3);
  });
  it("does not confuse an unrelated prefix with an idea", () => {
    expect(resolveMetaphorComposition("Идеальный закат", catalog).items).toEqual([]);
  });
  it("honors the current catalog instead of restoring missing objects", () => {
    const result = resolveMetaphorComposition("Финансовая безопасность", new AssetCatalog(catalog.getAll().filter(asset => asset.id.value !== "coin")));
    expect(result.items.map(item => item.id)).toEqual(["wallet"]);
  });
  it("does not infer meanings for a newly registered unknown source", () => {
    const custom = new AssetCatalog([{ id: AssetId.create("custom"), name: "Куст", tags: [], variants: [] }]);
    expect(resolveMetaphorComposition("Природа и рост", custom).items).toEqual([]);
  });
  it("posts an explanation with the request identity", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("figma", { ui: { postMessage } });
    const result = postMetaphorComposition("Финансовая безопасность", catalog, 7);
    expect(postMessage).toHaveBeenCalledWith({ type: "metaphor-resolved", query: "Финансовая безопасность", requestId: 7, ...result });
  });
});
