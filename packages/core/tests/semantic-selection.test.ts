import { describe, expect, it } from "vitest";
import { AssetCatalog, AssetId, selectLocalMetaphor, validateSemanticSelection } from "../src/index.js";
import type { Asset, SemanticAssetProfile } from "../src/index.js";

function asset(id: string, main = true): Asset {
  return { id: AssetId.create(id), name: id, tags: [],
    variants: [{ size: "L", role: main ? "main" : "background", resourceKey: id }] };
}
const catalog = new AssetCatalog([asset("coin"), asset("wallet"), asset("phone"), asset("book")]);
const concepts = [
  { id: "finance", label: "Финансы", stems: ["финанс", "накоп"] },
  { id: "learning", label: "Учёба", stems: ["обуч"] }
];
const profiles: SemanticAssetProfile[] = [
  { assetId: "wallet", associations: [{ conceptId: "finance", weight: 3, reason: "Кошелёк" }] },
  { assetId: "coin", associations: [{ conceptId: "finance", weight: 5, reason: "Монета" }] },
  { assetId: "book", associations: [{ conceptId: "learning", weight: 5, reason: "Книга" }] },
  { assetId: "missing", associations: [{ conceptId: "finance", weight: 100, reason: "Нет в каталоге" }] }
];

describe("Local semantic selection", () => {
  it("ranks only existing assets by meaning and preserves the catalog", () => {
    const before = JSON.stringify(catalog.getAll());
    const result = selectLocalMetaphor("ФИНАНСОВЫЕ накопления", catalog, concepts, profiles);
    expect(result.suggestions.map(item => item.assetId)).toEqual(["coin", "wallet"]);
    expect(result.themes).toEqual(["Финансы"]);
    expect(result.errors).toEqual([]);
    expect(JSON.stringify(catalog.getAll())).toBe(before);
  });
  it("does not increase a topic's importance when words repeat", () => {
    expect(selectLocalMetaphor("финансы финансы", catalog, concepts, profiles))
      .toEqual(selectLocalMetaphor("финансы", catalog, concepts, profiles));
  });
  it("matches words, not substrings inside unrelated words", () => {
    expect(selectLocalMetaphor("микрофинансы", catalog, concepts, profiles).suggestions).toEqual([]);
  });
  it.each(["", "дракон на луне", "а".repeat(501), "Финансы без накоплений", "не обучение"])
  ("does not fabricate a selection for %s", query => {
    const result = selectLocalMetaphor(query, catalog, concepts, profiles);
    expect(result.suggestions).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });
  it("returns an error when all matching sources have disappeared", () => {
    expect(selectLocalMetaphor("финансы", new AssetCatalog([]), concepts, profiles).errors).toHaveLength(1);
  });
  it("matches complete token sequences and does not inflate repeated phrases", () => {
    const phrases = [{ id: "finance", label: "Финансы", stems: [], phrases: [["золот", "запас"]] }];
    const result = selectLocalMetaphor("Золотой запас!", catalog, phrases, profiles);
    expect(result.suggestions[0]?.assetId).toBe("coin");
    expect(selectLocalMetaphor("Золотой запас, золотой запас", catalog, phrases, profiles)).toEqual(result);
    expect(selectLocalMetaphor("золотой красивый запас", catalog, phrases, profiles).suggestions).toEqual([]);
    expect(selectLocalMetaphor("запас золотой", catalog, phrases, profiles).suggestions).toEqual([]);
  });
  it("puts a main-capable asset first even when a background scores higher", () => {
    const result = selectLocalMetaphor("финансы", new AssetCatalog([asset("coin", false), asset("wallet")]), concepts, profiles);
    expect(result.suggestions.map(item => item.assetId)).toEqual(["wallet", "coin"]);
    expect(selectLocalMetaphor("финансы", new AssetCatalog([asset("coin", false)]), concepts, profiles).errors).toHaveLength(1);
  });
});

describe("Semantic response validation", () => {
  it("accepts existing IDs with reasons", () => {
    expect(validateSemanticSelection([{ assetId: "coin", reason: "Финансы" }], catalog).assets[0]?.id.value).toBe("coin");
  });
  it.each([
    [], [{ assetId: "mint", reason: "Палитра не предмет" }],
    [{ assetId: "coin", reason: "" }],
    [{ assetId: "coin", reason: "a" }, { assetId: "coin", reason: "b" }],
    Array.from({ length: 9 }, () => ({ assetId: "coin", reason: "a" }))
  ].map(suggestions => ({ suggestions })))("rejects invalid results without a partial selection", ({ suggestions }) => {
    const result = validateSemanticSelection(suggestions, catalog);
    expect(result.assets).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });
  it("rejects a background-only main object", () => {
    expect(validateSemanticSelection([{ assetId: "coin", reason: "a" }], new AssetCatalog([asset("coin", false)])).assets).toEqual([]);
  });
});
