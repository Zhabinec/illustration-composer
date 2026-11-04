import { describe, expect, it } from "vitest";
import { AssetId, selectCompositionAssets } from "../src/index.js";
import type { Asset } from "../src/index.js";

const bush: Asset = { id: AssetId.create("bush"), name: "Куст", tags: [],
  variants: [{ size: "L", role: "main", resourceKey: "bush/main" }] };
const coin: Asset = { id: AssetId.create("coin"), name: "Монета", tags: [], variants: [
  { size: "S", role: "main", resourceKey: "coin/main" },
  { size: "S", role: "background", resourceKey: "coin/background" }
] };

describe("Composition variant selection", () => {
  it("accepts a single object with only L/main", () => {
    const result = selectCompositionAssets([bush], "L", "background");
    expect(result.errors).toEqual([]);
    expect(result.selection[0]?.variant.resourceKey).toBe("bush/main");
    expect(result.selection[0]?.emphasis).toBe("primary");
  });

  it("reports the fallback size instead of inventing a missing variant", () => {
    const result = selectCompositionAssets([bush], "S", "main");
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]).toContain("используется вместо S");
    expect(result.selection[0]?.variant.size).toBe("L");
  });

  it("selects the requested background variants for additional objects", () => {
    const result = selectCompositionAssets([bush, coin, coin], "S", "background");
    expect(result.errors).toEqual([]);
    expect(result.selection.map(item => item.variant.role)).toEqual(["main", "background", "background"]);
  });

  it("reports an unavailable role without silently changing it", () => {
    expect(selectCompositionAssets([coin, bush], "L", "background").errors[0]).toContain("нет фонового");
    const backgroundOnly: Asset = { ...bush, variants: [{ size: "L", role: "background", resourceKey: "bush/bg" }] };
    expect(selectCompositionAssets([backgroundOnly], "L", "main").errors[0]).toContain("Первым укажи");
  });

  it("rejects empty and oversized requests", () => {
    expect(selectCompositionAssets([], "L", "main").errors).not.toHaveLength(0);
    expect(selectCompositionAssets(Array.from({ length: 9 }, () => bush), "L", "main").errors).not.toHaveLength(0);
  });
});
