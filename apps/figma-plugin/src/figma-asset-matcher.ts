
import type { ScannedAsset } from "./figma-library-scanner.js";

export interface AssetNameSuggestion {
  nodeId: string;
  name: string;
  referenceNodeId: string;
}

export function suggestAssetNames(
  assets: readonly ScannedAsset[]
): AssetNameSuggestion[] {
  const suggestions: AssetNameSuggestion[] = [];

  for (const asset of assets) {
    if (asset.identified || asset.size !== "S") {
      continue;
    }

    const matches = assets.filter(candidate =>
      candidate.identified &&
      candidate.size === "L" &&
      candidate.role === asset.role &&
      Math.abs(candidate.width - asset.width * 2) <= 4 &&
      Math.abs(candidate.height - asset.height * 2) <= 4
    );

    if (matches.length !== 1) {
      continue;
    }

    const match = matches[0]!;

    suggestions.push({
      nodeId: asset.nodeId,
      name: match.name,
      referenceNodeId: match.nodeId
    });
  }

  return suggestions;
}
