
import type { ScannedAsset } from "./figma-library-scanner.js";
import type { AssetNameSuggestion } from "./figma-asset-matcher.js";

export type ResolvedAsset = Omit<ScannedAsset, "identified"> & {
  match: "named" | "suggested";
};

export interface LibraryResolution {
  resolved: readonly ResolvedAsset[];
  unresolved: readonly ScannedAsset[];
}

export function resolveLibrary(
  assets: readonly ScannedAsset[],
  suggestions: readonly AssetNameSuggestion[]
): LibraryResolution {
  const names = new Map(
    suggestions.map(suggestion => [
      suggestion.nodeId,
      suggestion.name
    ])
  );

  const resolved: ResolvedAsset[] = [];
  const unresolved: ScannedAsset[] = [];

  for (const asset of assets) {
    const { identified, ...data } = asset;

    if (identified) {
      resolved.push({ ...data, match: "named" });
      continue;
    }

    const suggestedName = names.get(asset.nodeId);

    if (!suggestedName) {
      unresolved.push(asset);
      continue;
    }

    resolved.push({
      ...data,
      name: suggestedName,
      match: "suggested"
    });
  }

  return { resolved, unresolved };
}
