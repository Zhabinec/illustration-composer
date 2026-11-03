
import { describe, expect, it } from "vitest";
import {
  AssetId,
  findAssetVariant,
  type Asset
} from "../src/index.js";

describe("Asset", () => {
  const asset: Asset = {
    id: AssetId.create("book"),
    name: "Книга",
    tags: ["education", "knowledge"],
    variants: [
      {
        size: "S",
        role: "main",
        resourceKey: "book/main/s"
      },
      {
        size: "L",
        role: "background",
        resourceKey: "book/background/l"
      }
    ]
  };

  it("finds the requested variant", () => {
    const variant = findAssetVariant(asset, "S", "main");

    expect(variant?.resourceKey).toBe("book/main/s");
  });

  it("does not substitute missing variants", () => {
    const variant = findAssetVariant(asset, "L", "main");

    expect(variant).toBeUndefined();
  });

  it("rejects invalid asset identifiers", () => {
    expect(() => AssetId.create("Book 1")).toThrow();
    expect(() => AssetId.create(123)).toThrow();
    expect(() => AssetId.create("")).toThrow();
  });

  it("compares asset identifiers by value", () => {
    const first = AssetId.create("book");
    const second = AssetId.create("book");
    const third = AssetId.create("phone");

    expect(first.equals(second)).toBe(true);
    expect(first.equals(third)).toBe(false);
  });
});
