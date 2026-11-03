
import type { ResolvedAsset } from "./figma-library-resolver.js";

export type IndexedVariant = Pick<
  ResolvedAsset,
  "nodeId" | "size" | "role"
>;

export interface IndexedAsset {
  name: string;
  variants: readonly IndexedVariant[];
}

export function indexResolvedAssets(
  assets: readonly ResolvedAsset[]
): IndexedAsset[] {
  const grouped = new Map<string, IndexedVariant[]>();

  for (const asset of assets) {
    const variants = grouped.get(asset.name) ?? [];

    if (
      variants.some(
        variant =>
          variant.size === asset.size &&
          variant.role === asset.role
      )
    ) {
      throw new Error(
        `Duplicate variant: ${asset.name}/${asset.size}/${asset.role}`
      );
    }

    variants.push({
      nodeId: asset.nodeId,
      size: asset.size,
      role: asset.role
    });

    grouped.set(asset.name, variants);
  }

  return [...grouped].map(([name, variants]) => ({
    name,
    variants
  }));
}
