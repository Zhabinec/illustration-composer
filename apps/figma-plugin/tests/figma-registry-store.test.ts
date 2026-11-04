import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetId, LibraryRegistry, VariantId, palettePresets } from "@illustration-composer/core";
import { FigmaRegistryStore, toAssetCatalog } from "../src/figma-registry-store.js";
import type { RegistryDocument } from "../src/figma-registry-store.js";

const namespace = "illustrationComposer";
const key = "illustration-composer-registry-v1";

function savedDocument(): RegistryDocument {
  const registry = new LibraryRegistry();
  registry.createAsset(AssetId.create("bush"), "Куст", {
    id: VariantId.create("old"), resourceKey: "source-old", size: "L", role: "main"
  });
  registry.registerVariant({
    assetId: AssetId.create("bush"),
    id: VariantId.create("new"), resourceKey: "source-new", size: "L", role: "main",
    decision: "replace", expectedActiveId: VariantId.create("old")
  });
  return {
    version: 1,
    registry: registry.snapshot(),
    sourceNodeIds: { "source-old": "1:1", "source-new": "1:2" },
    palettes: [{ ...palettePresets.mint!, id: "custom-mint", sourceNodeId: "1:3" }]
  };
}

function environment(shared = "", legacy = "", pluginId?: string) {
  const data = { shared, legacy };
  const root = {
    getSharedPluginData: vi.fn(() => data.shared),
    setSharedPluginData: vi.fn((_namespace: string, _key: string, value: string) => {
      data.shared = value;
    }),
    getPluginData: vi.fn(() => {
      if (!pluginId) throw new Error("Private data requires an ID");
      return data.legacy;
    })
  };
  vi.stubGlobal("figma", { root, pluginId });
  return { root, data };
}

afterEach(() => vi.unstubAllGlobals());

describe("Figma registry document storage", () => {
  it("starts without an ID without accessing private data", () => {
    const { root } = environment();
    expect(new FigmaRegistryStore().load()).toBeNull();
    expect(root.getPluginData).not.toHaveBeenCalled();
  });

  it("restores history, bindings and palettes in a new store without an ID", () => {
    const { root } = environment();
    const document = savedDocument();
    new FigmaRegistryStore().save(document);
    expect(root.setSharedPluginData).toHaveBeenCalledWith(namespace, key, JSON.stringify(document));
    const restored = new FigmaRegistryStore().load();
    expect(restored).toEqual(document);
    expect(root.getPluginData).not.toHaveBeenCalled();

    const registry = new LibraryRegistry(restored!.registry);
    expect(toAssetCatalog(registry).getAll()[0]?.variants).toEqual([
      { resourceKey: "source-new", size: "L", role: "main" }
    ]);
    registry.activateVariant(AssetId.create("bush"), VariantId.create("old"), VariantId.create("new"));
    new FigmaRegistryStore().save({ ...restored!, registry: registry.snapshot() });
    expect(new FigmaRegistryStore().load()?.registry.assets[0]?.variants[0]?.active).toBe(true);
  });

  it("migrates private data under the original ID and retains the legacy record", () => {
    const legacy = JSON.stringify(savedDocument());
    const { data } = environment("", legacy, "original-plugin-id");
    expect(new FigmaRegistryStore().load()).toEqual(savedDocument());
    expect(data.shared).toBe(legacy);
    expect(data.legacy).toBe(legacy);
  });

  it("uses shared state rather than an outdated private snapshot", () => {
    const { root } = environment(JSON.stringify(savedDocument()), "broken legacy", "original-plugin-id");
    expect(new FigmaRegistryStore().load()).toEqual(savedDocument());
    expect(root.getPluginData).not.toHaveBeenCalled();
  });

  it("does not reset or replace corrupt saved data", () => {
    const { root, data } = environment("{broken", JSON.stringify(savedDocument()), "original-plugin-id");
    expect(() => new FigmaRegistryStore().load()).toThrow();
    expect(data.shared).toBe("{broken");
    expect(root.getPluginData).not.toHaveBeenCalled();
    expect(root.setSharedPluginData).not.toHaveBeenCalled();
  });

  it("keeps legacy data when migration cannot be written", () => {
    const legacy = JSON.stringify(savedDocument());
    const { root, data } = environment("", legacy, "original-plugin-id");
    root.setSharedPluginData.mockImplementation(() => { throw new Error("Write failed"); });
    expect(() => new FigmaRegistryStore().load()).toThrow("Write failed");
    expect(data.legacy).toBe(legacy);
    expect(data.shared).toBe("");
  });

  it("rejects missing bindings before overwriting the saved document", () => {
    const original = JSON.stringify(savedDocument());
    const { root, data } = environment(original);
    const invalid = savedDocument();
    delete invalid.sourceNodeIds["source-old"];
    expect(() => new FigmaRegistryStore().save(invalid)).toThrow("Missing source binding");
    expect(data.shared).toBe(original);
    expect(root.setSharedPluginData).not.toHaveBeenCalled();
  });

  it("rejects a palette source already registered as an object", () => {
    const { root } = environment();
    const invalid = savedDocument();
    invalid.palettes[0]!.sourceNodeId = "1:1";
    expect(() => new FigmaRegistryStore().save(invalid)).toThrow("Invalid saved palette");
    expect(root.setSharedPluginData).not.toHaveBeenCalled();
  });

  it("validates palette colors on loading", () => {
    const invalid = savedDocument();
    invalid.palettes[0] = {
      ...invalid.palettes[0]!, colors: { ...palettePresets.mint!.colors, dark: "invalid" }
    };
    environment(JSON.stringify(invalid));
    expect(() => new FigmaRegistryStore().load()).toThrow("Invalid palette color");
  });

  it("checks the UTF-8 byte budget rather than JavaScript string length", () => {
    const { root } = environment();
    const large = savedDocument();
    large.sourceNodeIds["source-new"] = "я".repeat(50000);
    expect(JSON.stringify(large).length).toBeLessThan(80000);
    expect(() => new FigmaRegistryStore().save(large)).toThrow("Registry is too large");
    expect(root.setSharedPluginData).not.toHaveBeenCalled();
  });
});
