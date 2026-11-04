import { selectLocalMetaphor, validateSemanticSelection } from "@illustration-composer/core";
import type { AssetCatalog } from "@illustration-composer/core";
import { libraryConcepts, libraryProfiles } from "./library-semantics.js";

export function resolveMetaphorComposition(query: string, catalog: AssetCatalog) {
  const result = selectLocalMetaphor(query, catalog, libraryConcepts, libraryProfiles);
  const validated = result.errors.length ? { assets: [], errors: result.errors }
    : validateSemanticSelection(result.suggestions, catalog);
  return {
    errors: validated.errors, themes: result.themes,
    items: validated.assets.map((asset, index) => ({
      id: asset.id.value, name: asset.name, reason: result.suggestions[index]!.reason
    }))
  };
}

export function postMetaphorComposition(query: string, catalog: AssetCatalog, requestId: number) {
  const result = resolveMetaphorComposition(query, catalog);
  figma.ui.postMessage({ type: "metaphor-resolved", query, requestId, ...result });
  return result;
}
