import { afterEach, describe, expect, it, vi } from "vitest";
import { FigmaCompositionTemplateStore } from "../src/figma-composition-template-store.js";
import { assertVectorComposition, getVectorComposition } from "../src/figma-vector-composition.js";
import { getTemplateSlots, resolveTemplateReplacements, replaceTemplateSlots } from "../src/figma-template-slots.js";
import type { LibraryRegistrySnapshot } from "@illustration-composer/core";

afterEach(() => vi.unstubAllGlobals());

function storage(initial = "") {
  const data = { raw: initial };
  const setSharedPluginData = vi.fn((_namespace: string, _key: string, raw: string) => { data.raw = raw; });
  vi.stubGlobal("figma", { root: { getSharedPluginData: () => data.raw, setSharedPluginData } });
  return { data, setSharedPluginData };
}

describe("Composition template storage", () => {
  it("persists named source bindings across store instances", () => {
    storage();
    new FigmaCompositionTemplateStore().add("Телефон и пазлы", "24:3312");
    expect(new FigmaCompositionTemplateStore().list()).toEqual([
      { id: "template-24:3312", name: "Телефон и пазлы", sourceNodeId: "24:3312" }
    ]);
  });

  it("rejects duplicate names and sources without overwriting", () => {
    const { data, setSharedPluginData } = storage();
    const store = new FigmaCompositionTemplateStore();
    store.add("Пазлы", "1:1");
    const original = data.raw;
    expect(() => store.add(" пазлы ", "1:2")).toThrow();
    expect(() => store.add("Другой", "1:1")).toThrow();
    expect(data.raw).toBe(original);
    expect(setSharedPluginData).toHaveBeenCalledTimes(1);
  });

  it("does not reset corrupt storage", () => {
    const { setSharedPluginData } = storage("{invalid");
    expect(() => new FigmaCompositionTemplateStore().add("Пазлы", "1:1")).toThrow();
    expect(setSharedPluginData).not.toHaveBeenCalled();
  });

  it("propagates document write errors", () => {
    const { setSharedPluginData, data } = storage();
    setSharedPluginData.mockImplementation(() => { throw new Error("read-only document"); });
    expect(() => new FigmaCompositionTemplateStore().add("Пазлы", "1:1")).toThrow("read-only document");
    expect(data.raw).toBe("");
  });
});

describe("Vector composition boundary", () => {
  // Minimal API doubles: exercise untrusted runtime values, not Figma typings.
  function composition(children: object[]) {
    return { type: "FRAME", name: "Фон", width: 1000, height: 1000, children, findAll: () => children };
  }

  it("accepts vector objects and existing vector background decoration", () => {
    expect(() => Reflect.apply(assertVectorComposition, undefined, [composition([
      { type: "VECTOR", name: "Телефон", fills: [{ type: "SOLID" }] },
      { type: "LINE", name: "Линия", strokes: [{ type: "SOLID" }] }
    ])])).not.toThrow();
  });

  it.each(["IMAGE", "VIDEO", "PATTERN", "SHADER"])('rejects %s paints', type => {
    expect(() => Reflect.apply(assertVectorComposition, undefined, [composition([
      { type: "RECTANGLE", name: "Картинка", fills: [{ type }] }
    ])])).toThrow("заливку");
  });

  it("rejects unsupported content and empty selections", () => {
    expect(() => Reflect.apply(assertVectorComposition, undefined, [composition([])])).toThrow("пуста");
    expect(() => Reflect.apply(assertVectorComposition, undefined, [composition([
      { type: "TEXT", name: "Заголовок" }
    ])])).toThrow("не поддерживается");
  });

  it("reports a deleted source explicitly", async () => {
    vi.stubGlobal("figma", { getNodeByIdAsync: async () => null });
    await expect(getVectorComposition("missing")).rejects.toThrow("Источник шаблона удалён");
  });
});

describe("Template object replacement", () => {
  const slots = [{ id: "slot-phone", name: "Телефон", index: 0, kind: "primary" as const }];
  const registry: LibraryRegistrySnapshot = {
    version: 1,
    assets: [{ id: "book", name: "Книга", variants: [
      { id: "book-main", resourceKey: "book/main", size: "L", role: "main", active: true },
      { id: "book-background", resourceKey: "book/background", size: "S", role: "background", active: true },
      { id: "book-old", resourceKey: "book/old", size: "L", role: "main", active: false }
    ] }]
  };
  const choice = { slotId: "slot-phone", assetId: "book", variantId: "book-background" };

  it("offers object groups while leaving individual vector decoration unchanged", () => {
    const source = { children: [
      { id: "line", name: "Line 1", type: "VECTOR", isMask: false },
      { id: "slot-phone", name: "Телефон", type: "GROUP", isMask: false },
      { id: "mask", name: "Mask", type: "GROUP", isMask: true }
    ] };
    expect(Reflect.apply(getTemplateSlots, undefined, [source])).toEqual([
      { id: "slot-phone", name: "Телефон", index: 1, kind: "primary" }
    ]);
  });

  it("labels the main object, supporting object and decoration while preserving layer indexes", () => {
    const source = { children: [
      { id: "decor", name: "конфетти", type: "GROUP", width: 900, height: 900 },
      { id: "puzzle", name: "Пазлы", type: "GROUP", width: 400, height: 200 },
      { id: "phone", name: "Телефон", type: "GROUP", width: 800, height: 400 }
    ] };
    expect(Reflect.apply(getTemplateSlots, undefined, [source])).toEqual([
      { id: "phone", name: "Телефон", index: 2, kind: "primary" },
      { id: "puzzle", name: "Пазлы", index: 1, kind: "secondary" },
      { id: "decor", name: "конфетти", index: 0, kind: "decoration" }
    ]);
    expect(source.children[0]?.name).toBe("конфетти");
  });

  it("resolves a selected background variant to an existing library resource", () => {
    expect(resolveTemplateReplacements([choice], slots, registry)).toEqual([
      { slotId: "slot-phone", resourceKey: "book/background", name: "Книга", role: "background" }
    ]);
    expect(resolveTemplateReplacements([], slots, registry)).toEqual([]);
  });

  it("rejects an unknown or repeated slot", () => {
    expect(() => resolveTemplateReplacements([{ ...choice, slotId: "unknown" }], slots, registry)).toThrow("Слот");
    expect(() => resolveTemplateReplacements([choice, choice], slots, registry)).toThrow("Слот");
  });

  it("rejects palette IDs and inactive variants", () => {
    expect(() => resolveTemplateReplacements([{ ...choice, assetId: "mint" }], slots, registry)).toThrow("недоступен");
    expect(() => resolveTemplateReplacements([{ ...choice, variantId: "book-old" }], slots, registry)).toThrow("недоступен");
  });

  it("preserves the slot rotation and layer position without changing the source", async () => {
    const original = { id: "slot-phone", name: "Телефон", type: "GROUP", isMask: false };
    const source = { children: [original] };
    const old = { width: 200, height: 100, relativeTransform: [[0, -1, 300], [1, 0, 400]], remove: vi.fn() };
    const replacement = {
      type: "VECTOR", name: "Library book", width: 100, height: 100, locked: true,
      rescale: vi.fn(), relativeTransform: [[1, 0, 0], [0, 1, 0]]
    };
    const copy = { children: [old], insertChild: vi.fn() };
    const adapter = { cloneInto: vi.fn(async () => replacement) };
    await Reflect.apply(replaceTemplateSlots, undefined, [source, copy,
      [{ slotId: "slot-phone", name: "Книга", resourceKey: "book/main" }], adapter]);
    expect(replacement.rescale).toHaveBeenCalledWith(1);
    expect(replacement.relativeTransform).toEqual([[0, -1, 300], [1, 0, 450]]);
    expect(copy.insertChild).toHaveBeenCalledWith(0, replacement);
    expect(old.remove).toHaveBeenCalledOnce();
    expect(original.name).toBe("Телефон");
    expect(replacement.name).toBe("Книга");
  });
});
