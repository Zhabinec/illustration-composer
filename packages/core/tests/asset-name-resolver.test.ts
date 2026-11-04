import { describe, expect, it } from "vitest";
import { AssetCatalog, AssetId, resolveAssetNames } from "../src/index.js";

function asset(id: string, name: string, tags: string[] = []) {
  return { id: AssetId.create(id), name, tags,
    variants: [{ size: "L" as const, role: "main" as const, resourceKey: `${id}/main` }] };
}
const catalog = new AssetCatalog([
  asset("coin", "Монета"), asset("wallet", "Кошелёк"), asset("phone", "Телефон"),
  asset("balloon", "Воздушный шар"), asset("kit", "Книга и ручка")
]);

describe("Asset names", () => {
  it.each(["  МОНЕТА, кошелек; Телефон  ", "Монета\nКошелёк\nТелефон", "монета кошелёк и телефон"])
  ("resolves an ordered list: %s", query => {
    const result = resolveAssetNames(query, catalog);
    expect(result.assets.map(asset => asset.id.value)).toEqual(["coin", "wallet", "phone"]);
    expect(result.issues).toEqual([]);
  });

  it("keeps compound names, including names with a conjunction, intact", () => {
    const result = resolveAssetNames("Воздушный шар и Книга и ручка", catalog);
    expect(result.assets.map(asset => asset.id.value)).toEqual(["balloon", "kit"]);
    expect(result.issues).toEqual([]);
  });

  it("preserves repetitions for independent copies", () => {
    expect(resolveAssetNames("Монета, монета", catalog).assets.map(asset => asset.id.value)).toEqual(["coin", "coin"]);
  });

  it("uses aliases only for existing catalog IDs", () => {
    const result = resolveAssetNames("смартфон", catalog, { phone: ["смартфон"], missing: ["цветок"] });
    expect(result.assets[0]?.id.value).toBe("phone");
    expect(resolveAssetNames("цветок", catalog, { missing: ["цветок"] }).issues[0]?.kind).toBe("unknown");
  });

  it("suggests a typo correction without silently selecting it", () => {
    const result = resolveAssetNames("телфон", catalog);
    expect(result.assets).toEqual([]);
    expect(result.issues[0]?.candidates.map(asset => asset.id.value)).toContain("phone");
  });

  it("does not hide unknown names among known objects", () => {
    const result = resolveAssetNames("монета, дракон, кошелёк", catalog);
    expect(result.assets.map(asset => asset.id.value)).toEqual(["coin", "wallet"]);
    expect(result.issues).toEqual([{ query: "дракон", kind: "unknown", candidates: [] }]);
  });

  it("reports ambiguity instead of taking the first matching asset", () => {
    const ambiguous = new AssetCatalog([asset("one", "Телефон"), asset("two", "Смартфон", ["телефон"])]);
    const result = resolveAssetNames("телефон", ambiguous);
    expect(result.assets).toHaveLength(0);
    expect(result.issues[0]?.kind).toBe("ambiguous");
    expect(result.issues[0]?.candidates).toHaveLength(2);
  });

  it.each(["", "  ", ", ; +", "и"])("handles an empty list %s", query => {
    expect(resolveAssetNames(query, catalog).issues[0]?.kind).toBe("empty");
  });

  it("limits the input size and rejects palette names absent from the asset catalog", () => {
    expect(resolveAssetNames("x".repeat(1001), catalog).issues[0]?.kind).toBe("too-long");
    expect(resolveAssetNames("mint", catalog).issues[0]?.kind).toBe("unknown");
  });
});
