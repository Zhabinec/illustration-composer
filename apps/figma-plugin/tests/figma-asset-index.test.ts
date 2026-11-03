
import { describe, expect, it } from "vitest";
import { indexResolvedAssets } from "../src/figma-asset-index.js";

describe("Asset indexing", () => {
  const assets = (["S", "L"] as const).flatMap(size =>
    (["main", "background"] as const).map(role => ({
      nodeId: `${size}-${role}`,
      name: "Книга",
      size,
      role,
      vectorCount: 53,
      width: 100,
      height: 100,
      match: "named" as const
    }))
  );

  it("groups four variants into one asset", () => {
    const index = indexResolvedAssets(assets);

    expect(index).toHaveLength(1);
    expect(index[0]?.name).toBe("Книга");
    expect(index[0]?.variants).toHaveLength(4);
  });

  it("rejects duplicate variants", () => {
    expect(() =>
      indexResolvedAssets([assets[0]!, assets[0]!])
    ).toThrow("Duplicate variant");
  });
});
