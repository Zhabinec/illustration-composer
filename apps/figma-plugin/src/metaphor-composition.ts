import { selectLocalMetaphor, validateSemanticSelection, selectCompositionAssets } from "@illustration-composer/core";
import type { AssetCatalog, AssetSize, AssetRole } from "@illustration-composer/core";
import { libraryConcepts, libraryProfiles } from "./library-semantics.js";

function resolveMetaphorAssets(query: string, catalog: AssetCatalog) {
  const result = selectLocalMetaphor(query, catalog, libraryConcepts, libraryProfiles);
  const validated = result.errors.length ? { assets: [], errors: result.errors }
    : validateSemanticSelection(result.suggestions, catalog);
  return { ...validated, themes: result.themes, suggestions: result.suggestions };
}

export function resolveMetaphorComposition(query: string, catalog: AssetCatalog) {
  const result = resolveMetaphorAssets(query, catalog);
  return { errors: result.errors, themes: result.themes,
    items: result.assets.map((asset, index) => ({
      id: asset.id.value, name: asset.name, reason: result.suggestions[index]!.reason
    })) };
}

export function resolveMetaphorSelection(query: string, catalog: AssetCatalog, size: AssetSize, role: AssetRole) {
  const result = resolveMetaphorAssets(query, catalog);
  return result.errors.length ? { selection: [], errors: result.errors, warnings: [] }
    : selectCompositionAssets(result.assets, size, role);
}

export function postMetaphorComposition(query: string, catalog: AssetCatalog, requestId: number) {
  const result = resolveMetaphorComposition(query, catalog);
  figma.ui.postMessage({ type: "metaphor-resolved", query, requestId, ...result });
  return result;
}
