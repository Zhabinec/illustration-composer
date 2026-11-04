import type { Asset } from "../catalog/asset.js";
import type { AssetCatalog } from "../catalog/asset-catalog.js";
import { maxCompositionObjects } from "../composition/composition-selection.js";

export interface SemanticSuggestion {
  assetId: string;
  reason: string;
}

export function validateSemanticSelection(
  suggestions: readonly SemanticSuggestion[], catalog: AssetCatalog
): { assets: Asset[]; errors: string[] } {
  const assets: Asset[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  if (!suggestions.length || suggestions.length > maxCompositionObjects) {
    errors.push(`Подбор должен содержать от 1 до ${maxCompositionObjects} предметов.`);
  }
  for (const suggestion of suggestions) {
    const asset = catalog.getAll().find(item => item.id.value === suggestion.assetId);
    if (!asset) errors.push(`Предмет «${suggestion.assetId}» отсутствует в каталоге.`);
    else if (seen.has(suggestion.assetId)) errors.push(`Предмет «${asset.name}» повторяется в подборе.`);
    else if (!suggestion.reason.trim()) errors.push(`Не объяснён выбор «${asset.name}».`);
    else assets.push(asset);
    seen.add(suggestion.assetId);
  }
  if (assets[0] && !assets[0].variants.some(item => item.role === "main")) {
    errors.push(`У главного предмета «${assets[0].name}» нет главного варианта.`);
  }
  return { assets: errors.length ? [] : assets, errors };
}
