
import { AssetId } from "./asset-id.js";
import type { Asset } from "./asset.js";

export class AssetCatalog {
  private readonly assets = new Map<string, Asset>();

  constructor(assets: readonly Asset[]) {
    for (const asset of assets) {
      const id = asset.id.value;

      if (this.assets.has(id)) {
        throw new Error(`Duplicate asset ID: ${id}`);
      }

      this.assets.set(id, asset);
    }
  }

  getById(id: AssetId): Asset | undefined {
    return this.assets.get(id.value);
  }

  search(query: string): readonly Asset[] {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return [];
    }

    return [...this.assets.values()].filter(
      asset =>
        asset.name.toLowerCase().includes(normalized) ||
        asset.tags.some(tag =>
          tag.toLowerCase().includes(normalized)
        )
    );
  }

  getAll(): readonly Asset[] {
    return [...this.assets.values()];
  }
}
