import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetId } from "@illustration-composer/core";
import type { CompositionSource } from "@illustration-composer/core";
import { planAutomaticScene, readBookSurfaceReference } from "../src/automatic-scene-planner.js";
import { discoverExampleTemplates } from "../src/figma-example-templates.js";
import { getVectorComposition } from "../src/figma-vector-composition.js";
import { FigmaSceneRenderer } from "../src/figma-scene-renderer.js";
import { palettePresets } from "@illustration-composer/core";

vi.mock("../src/figma-example-templates.js", () => ({ discoverExampleTemplates: vi.fn() }));
vi.mock("../src/figma-vector-composition.js", () => ({ getVectorComposition: vi.fn() }));
vi.mock("../src/figma-palette-adapter.js", () => ({ FigmaPaletteAdapter: class { apply = vi.fn(); } }));
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.clearAllMocks());

function group(name: string, width: number, height: number, x: number, y: number) {
  return { type: "GROUP", name, width, height, x, y, relativeTransform: [[1, 0, x], [0, 1, y]] };
}
function example() {
  return { width: 1000, height: 1000, children: [
    group("Книга", 1400, 1000, -100, 0), group("Телефон", 700, 450, 320, 150)
  ] };
}
function source(id: string, width: number, height: number): CompositionSource {
  return { assetId: AssetId.create(id), width, height,
    variant: { role: "main", size: "L", resourceKey: id } };
}

describe("reference relationship extraction", () => {
  it("reads relative geometry without cloning or modifying the example", () => {
    const frame = example();
    const before = JSON.stringify(frame);
    expect(Reflect.apply(readBookSurfaceReference, undefined, [frame, 1, 0])).toEqual({
      supportIndex: 1, subjectIndex: 0, supportAspect: 1.4,
      surface: { x: 0.5, y: 0.16, width: 0.28, height: 0.24 },
      subject: { x: 0.3, y: 0.15, width: 0.5, height: 0.45 }
    });
    expect(JSON.stringify(frame)).toBe(before);
  });
  it("does not infer an anonymous surface or reverse the author's layering", () => {
    const frame = example();
    frame.children[0]!.name = "Group 1";
    expect(Reflect.apply(readBookSurfaceReference, undefined, [frame, 0, 1])).toBeNull();
    const reversed = example();
    reversed.children.reverse();
    expect(Reflect.apply(readBookSurfaceReference, undefined, [reversed, 0, 1])).toBeNull();
  });
  it("rejects transformations that cannot be transferred without changing geometry", () => {
    const frame = example();
    frame.children[1]!.relativeTransform = [[0, -1, 320], [1, 0, 150]];
    expect(Reflect.apply(readBookSurfaceReference, undefined, [frame, 0, 1])).toBeNull();
  });
});

describe("automatic relationship selection", () => {
  const sources = [source("wallet", 600, 400), source("book", 1400, 1000)];
  it("builds the requested pair with a relationship read from the examples", async () => {
    vi.mocked(discoverExampleTemplates).mockResolvedValue({ templates: [
      { id: "example-current", name: "Книга + Телефон", sourceNodeId: "current-id", origin: "example" }
    ], warnings: [] });
    vi.mocked(getVectorComposition).mockResolvedValue(example() as unknown as FrameNode);
    const result = await planAutomaticScene(1000, 1000, sources, ["palette-source"]);
    expect(result.description).toBe("Предмет на книге");
    expect(result.scene.items.map(item => item.assetId.value)).toEqual(["wallet", "book"]);
    expect(result.scene.items[0]!.zIndex).toBeGreaterThan(result.scene.items[1]!.zIndex!);
    expect(discoverExampleTemplates).toHaveBeenCalledWith(["palette-source"]);
    expect(getVectorComposition).toHaveBeenCalledWith("current-id");
  });
  it("uses free placement when reference examples are unavailable", async () => {
    vi.mocked(discoverExampleTemplates).mockResolvedValue({ templates: [], warnings: ["Нет примеров"] });
    expect((await planAutomaticScene(1000, 1000, sources, [])).description).toBe("Свободная расстановка");
  });
  it("does not force an unknown object or background book into a support relationship", async () => {
    await planAutomaticScene(1000, 1000, [source("coin", 400, 300), source("book", 1400, 1000)], []);
    await planAutomaticScene(1000, 1000, [sources[0]!, { ...sources[1]!, variant: { ...sources[1]!.variant, role: "background" } }], []);
    expect(discoverExampleTemplates).not.toHaveBeenCalled();
  });
});

describe("scene layer ordering", () => {
  it("renders the support below the subject and all backgrounds below main", async () => {
    const sources = [source("wallet", 600, 400), source("book", 1400, 1000)];
    const clones: string[] = [];
    const frame = { id: "result", resize: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("figma", { currentPage: { children: [] }, createFrame: () => frame });
    const renderer = Reflect.construct(FigmaSceneRenderer, [{ cloneInto: async (key: string) => {
      clones.push(key);
      return { rescale: vi.fn(), setSharedPluginData: vi.fn() };
    } }]);
    await renderer.render({ width: 1000, height: 1000, items: [
      { assetId: sources[0]!.assetId, variant: sources[0]!.variant, x: 0, y: 0, scale: 1, rotation: 0, zIndex: 1 },
      { assetId: sources[1]!.assetId, variant: sources[1]!.variant, x: 0, y: 0, scale: 1, rotation: 0, zIndex: 0 },
      { assetId: AssetId.create("lamp"), variant: { size: "L", role: "background", resourceKey: "lamp" }, x: 0, y: 0, scale: 1, rotation: 0, zIndex: 99 }
    ] }, "Scene", palettePresets.original);
    expect(clones).toEqual(["lamp", "book", "wallet"]);
  });
});
