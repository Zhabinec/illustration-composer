import { resolveAssetNames, selectCompositionAssets } from "@illustration-composer/core";
import type { AssetCatalog, AssetSize, AssetRole } from "@illustration-composer/core";

const aliases: Readonly<Record<string, readonly string[]>> = {
  book: ["книги"], phone: ["телефоны", "смартфон", "смартфоны"],
  puzzle: ["пазл", "паззл", "паззлы"], coin: ["монеты"],
  headphones: ["наушник"], lamp: ["лампы", "светильник"],
  folder: ["папки"], pen: ["ручки"], wallet: ["кошельки"]
};

export function resolveNamedComposition(query: string, catalog: AssetCatalog, size: AssetSize, role: AssetRole) {
  const resolved = resolveAssetNames(query, catalog, aliases);
  const messages = resolved.issues.map(issue => {
    if (issue.kind === "empty") return "Введи названия предметов.";
    if (issue.kind === "too-long") return "Список названий слишком длинный (максимум 1000 символов).";
    const suggestions = issue.candidates.map(asset => asset.name).join(", ");
    if (issue.kind === "ambiguous") return `«${issue.query}» неоднозначно: ${suggestions}. Уточни название.`;
    return `«${issue.query}» не найдено в каталоге.${suggestions ? ` Возможно: ${suggestions}.` : ""}`;
  });
  const selected = resolved.issues.length ? { selection: [], errors: [], warnings: [] }
    : selectCompositionAssets(resolved.assets, size, role);
  return { ...selected, errors: [...messages, ...selected.errors] };
}

export function postNamedCompositionResolution(query: string, catalog: AssetCatalog, size: AssetSize, role: AssetRole) {
  const result = resolveNamedComposition(query, catalog, size, role);
  figma.ui.postMessage({
    type: "names-resolved", query, size, role,
    errors: result.errors, warnings: result.warnings,
    items: result.selection.map(item => ({ id: item.asset.id.value, name: item.asset.name,
      size: item.variant.size, role: item.variant.role, emphasis: item.emphasis }))
  });
  return result;
}
