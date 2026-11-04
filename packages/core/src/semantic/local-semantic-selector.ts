import type { AssetCatalog } from "../catalog/asset-catalog.js";
import { normalizeAssetName } from "../catalog/asset-name-resolver.js";
import type { SemanticSuggestion } from "./semantic-selection.js";

export interface SemanticConcept {
  id: string;
  label: string;
  stems: readonly string[];
}

export interface SemanticAssetProfile {
  assetId: string;
  associations: readonly { conceptId: string; weight: number; reason: string }[];
}

export function selectLocalMetaphor(
  query: string, catalog: AssetCatalog,
  concepts: readonly SemanticConcept[], profiles: readonly SemanticAssetProfile[]
): { suggestions: SemanticSuggestion[]; themes: string[]; errors: string[] } {
  const fail = (message: string) => ({ suggestions: [], themes: [], errors: [message] });
  if (!query.trim()) return fail("Введи метафору или заголовок.");
  if (query.length > 500) return fail("Заголовок слишком длинный (максимум 500 символов).");
  const words = normalizeAssetName(query).match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.some(word => ["без", "не", "нет", "исключая", "кроме"].includes(word))) {
    return fail("Локальный подбор пока не учитывает отрицания. Опиши желаемую тему утвердительно, а состав поправь после подбора.");
  }
  const matched = concepts.filter(concept => concept.stems.some(stem => words.some(word => word.startsWith(stem))));
  if (!matched.length) return fail("Тема не распознана локальным подбором. Попробуй другой заголовок или выбери предметы по названиям.");
  const matchedIds = new Set(matched.map(item => item.id));
  const candidates = profiles.flatMap(profile => {
    const asset = catalog.getAll().find(item => item.id.value === profile.assetId);
    if (!asset) return [];
    const associations = profile.associations.filter(item => matchedIds.has(item.conceptId));
    const score = associations.reduce((sum, item) => sum + item.weight, 0);
    if (!score) return [];
    return [{ asset, score, reason: associations.map(item => item.reason).join(" ") }];
  }).sort((a, b) => b.score - a.score || a.asset.id.value.localeCompare(b.asset.id.value));
  const primary = candidates.find(item => item.asset.variants.some(variant => variant.role === "main"));
  if (!primary) return fail("Для этой темы в каталоге нет подходящего главного предмета. Выбери другую тему или состав по названиям.");
  const selected = [primary, ...candidates.filter(item => item !== primary)].slice(0, 3);
  return {
    suggestions: selected.map(item => ({ assetId: item.asset.id.value, reason: item.reason })),
    themes: matched.map(item => item.label), errors: []
  };
}
