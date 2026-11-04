import { describe, expect, it } from "vitest";

import {
  AssetId,
  LibraryRegistry,
  VariantId
} from "../src/index.js";

describe("Library Registry", () => {
  const assetId = AssetId.create("bush");

  const createVariant = (
    id: string,
    resourceKey: string,
    size: "S" | "L" = "L",
    role: "main" | "background" = "main"
  ) => ({
    id: VariantId.create(id),
    resourceKey,
    size,
    role
  });

  function createRegistry(): LibraryRegistry {
    const registry = new LibraryRegistry();

    registry.createAsset(
      assetId,
      "Куст",
      createVariant("variant-1", "source-1")
    );

    return registry;
  }

  it("allows an asset with only one variant", () => {
    const registry = createRegistry();

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll()[0]?.variants).toHaveLength(1);
  });

  it("adds a variant to an empty slot", () => {
    const registry = createRegistry();

    const result = registry.registerVariant({
      assetId,
      ...createVariant("variant-2", "source-2", "S")
    });

    expect(result.status).toBe("added");
    expect(registry.getAll()[0]?.variants).toHaveLength(2);
  });

  it("detects a conflict without overwriting", () => {
    const registry = createRegistry();

    const result = registry.registerVariant({
      assetId,
      ...createVariant("variant-2", "source-2")
    });

    expect(result.status).toBe("conflict");

    if (result.status === "conflict") {
      expect(result.current.id).toBe("variant-1");
    }

    expect(registry.getAll()[0]?.variants).toHaveLength(1);
  });

  it("requires confirmation of the current variant", () => {
    const registry = createRegistry();

    expect(() =>
      registry.registerVariant({
        assetId,
        ...createVariant("variant-2", "source-2"),
        decision: "replace",
        expectedActiveId: VariantId.create("wrong-variant")
      })
    ).toThrow("Variant changed since confirmation");
  });

  it("keeps an alternative without replacing the active variant", () => {
    const registry = createRegistry();

    registry.registerVariant({
      assetId,
      ...createVariant("variant-2", "source-2"),
      decision: "alternative",
      expectedActiveId: VariantId.create("variant-1")
    });

    const variants = registry.getAll()[0]!.variants;

    expect(variants).toHaveLength(2);
    expect(variants.find(variant => variant.active)?.id)
      .toBe("variant-1");
  });

  it("replaces an active variant and preserves the previous one", () => {
    const registry = createRegistry();

    registry.registerVariant({
      assetId,
      ...createVariant("variant-2", "source-2"),
      decision: "replace",
      expectedActiveId: VariantId.create("variant-1")
    });

    const variants = registry.getAll()[0]!.variants;

    expect(variants).toHaveLength(2);
    expect(variants.find(variant => variant.active)?.id)
      .toBe("variant-2");

    expect(
      variants.find(variant => variant.id === "variant-1")?.active
    ).toBe(false);
  });

  it("restores a previous variant", () => {
    const registry = createRegistry();

    registry.registerVariant({
      assetId,
      ...createVariant("variant-2", "source-2"),
      decision: "replace",
      expectedActiveId: VariantId.create("variant-1")
    });

    registry.activateVariant(
      assetId,
      VariantId.create("variant-1"),
      VariantId.create("variant-2")
    );

    expect(
      registry.getAll()[0]?.variants.find(
        variant => variant.active
      )?.id
    ).toBe("variant-1");
  });

  it("rejects registering the same resource twice", () => {
    const registry = createRegistry();

    expect(() =>
      registry.registerVariant({
        assetId,
        ...createVariant("variant-2", "source-1", "S")
      })
    ).toThrow("Resource already registered");
  });

  it("restores its state from a snapshot", () => {
    const registry = createRegistry();

    const restored = new LibraryRegistry(
      registry.snapshot()
    );

    expect(restored.getAll()).toEqual(registry.getAll());
  });
});