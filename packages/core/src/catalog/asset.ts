
import type { AssetId } from "./asset-id.js";

export type AssetSize = "S" | "L";

export type AssetRole = "main" | "background";

export interface AssetVariant {
  size: AssetSize;
  role: AssetRole;
  resourceKey: string;
}

export interface Asset {
  id: AssetId;
  name: string;
  tags: readonly string[];
  variants: readonly AssetVariant[];
}

export function findAssetVariant(
  asset: Asset,
  size: AssetSize,
  role: AssetRole
): AssetVariant | undefined {
  return asset.variants.find(
    variant => variant.size === size && variant.role === role
  );
}
