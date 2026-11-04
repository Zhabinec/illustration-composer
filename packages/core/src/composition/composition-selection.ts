import { findAssetVariant } from "../catalog/asset.js";
import type { Asset, AssetRole, AssetSize, AssetVariant } from "../catalog/asset.js";

export const maxCompositionObjects = 8;

export interface SelectedCompositionAsset {
  asset: Asset;
  variant: AssetVariant;
  emphasis: "primary" | "secondary";
}

export function selectCompositionAssets(
  assets: readonly Asset[], size: AssetSize, secondaryRole: AssetRole
): { selection: SelectedCompositionAsset[]; errors: string[]; warnings: string[] } {
  const selection: SelectedCompositionAsset[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!assets.length || assets.length > maxCompositionObjects) {
    return { selection, warnings, errors: [`Укажи от 1 до ${maxCompositionObjects} предметов.`] };
  }
  assets.forEach((asset, index) => {
    const role = index === 0 ? "main" : secondaryRole;
    const variant = findAssetVariant(asset, size, role) ?? findAssetVariant(asset, size === "L" ? "S" : "L", role);
    if (!variant) {
      errors.push(`«${asset.name}»: нет ${role === "main" ? "главного" : "фонового"} варианта.${index === 0
        ? " Первым укажи предмет с главным вариантом." : " Измени роль дополнительных предметов или состав."}`);
      return;
    }
    if (variant.size !== size) warnings.push(`«${asset.name}»: доступен ${variant.size}, используется вместо ${size}.`);
    selection.push({ asset, variant, emphasis: index === 0 ? "primary" : "secondary" });
  });
  return { selection, errors, warnings };
}
