
import { describe, expect, it } from "vitest";
import {
  AssetCatalog,
  AssetId,
  type Asset
} from "../src/index.js";

describe("AssetCatalog", () => {
  const assets: Asset[] = [
    {
      id: AssetId.create("book"),
      name: "Книга",
      tags: ["education", "knowledge"],
      variants: []
    },
    {
      id: AssetId.create("phone"),
      name: "Телефон",
      tags: ["technology", "communication"],
      variants: []
    }
  ];

  const catalog = new AssetCatalog(assets);

  it("finds an asset by ID value", () => {
    const asset = catalog.getById(AssetId.create("book"));

    expect(asset?.name).toBe("Книга");
  });

  it("returns undefined for unknown IDs", () => {
    expect(catalog.getById(AssetId.create("lamp")))
      .toBeUndefined();
  });

  it("searches assets by name and tags", () => {
    expect(catalog.search("КНИГА")).toHaveLength(1);
    expect(catalog.search("technology")[0]?.name)
      .toBe("Телефон");
  });

  it("rejects duplicate asset IDs", () => {
    expect(() => new AssetCatalog([
      assets[0]!,
      assets[0]!
    ])).toThrow("Duplicate asset ID");
  });

  it("returns no results for an empty query", () => {
    expect(catalog.search("   ")).toEqual([]);
  });
});
