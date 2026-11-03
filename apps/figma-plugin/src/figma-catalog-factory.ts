
import {
  AssetCatalog,
  AssetId
} from "@illustration-composer/core";

import type {
  Asset,
  AssetVariant
} from "@illustration-composer/core";

import type {
  IndexedAsset
} from "./figma-asset-index.js";

const assetIds: Readonly<Record<string, string>> = {
  "Книга": "book",
  "Телефон": "phone",
  "Наушники": "headphones",
  "Лампа": "lamp",
  "Пазлы": "puzzle",
  "Монета": "coin",
  "Кошелек": "wallet",
  "Ручка": "pen",
  "Папка": "folder"
};

export function createAssetCatalog(
  index: readonly IndexedAsset[]
): AssetCatalog {
  const assets: Asset[] = index.map(item => {
    const id = assetIds[item.name];

    if (!id) {
      throw new Error(`Unknown asset name: ${item.name}`);
    }

    const variants: AssetVariant[] = item.variants.map(
      variant => ({
        size: variant.size,
        role: variant.role,
        resourceKey:
          `${id}/${variant.role}/${variant.size.toLowerCase()}`
      })
    );

    return {
      id: AssetId.create(id),
      name: item.name,
      tags: [item.name],
      variants
    };
  });

  return new AssetCatalog(assets);
}
