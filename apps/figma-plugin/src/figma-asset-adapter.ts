
import { AssetCatalog } from "@illustration-composer/core";
import type { IndexedAsset } from "./figma-asset-index.js";

export class FigmaAssetAdapter {
  private readonly nodeIds = new Map<string, string>();

  constructor(
    catalog: AssetCatalog,
    index: readonly IndexedAsset[]
  ) {
    const indexedAssets = new Map(
      index.map(asset => [asset.name, asset])
    );

    for (const asset of catalog.getAll()) {
      const indexed = indexedAssets.get(asset.name);

      if (!indexed) {
        throw new Error(`Asset not indexed: ${asset.name}`);
      }

      for (const variant of asset.variants) {
        const match = indexed.variants.find(
          item =>
            item.size === variant.size &&
            item.role === variant.role
        );

        if (!match) {
          throw new Error(
            `Variant not found: ${variant.resourceKey}`
          );
        }

        if (this.nodeIds.has(variant.resourceKey)) {
          throw new Error(
            `Duplicate resource: ${variant.resourceKey}`
          );
        }

        this.nodeIds.set(variant.resourceKey, match.nodeId);
      }
    }
  }

    
  private async getSource(resourceKey: string): Promise<GroupNode> {
    const nodeId = this.nodeIds.get(resourceKey);

    if (!nodeId) {
      throw new Error(`Unknown resource: ${resourceKey}`);
    }

    const node = await figma.getNodeByIdAsync(nodeId);

    if (!node || node.type !== "GROUP") {
      throw new Error(`Source group not found: ${resourceKey}`);
    }

    return node;
  }

  async getDimensions(
    resourceKey: string
  ): Promise<{ width: number; height: number }> {
    const source = await this.getSource(resourceKey);

    return {
      width: source.width,
      height: source.height
    };
  }

  async cloneInto(
    resourceKey: string,
    target: FrameNode
  ): Promise<GroupNode> {
    const source = await this.getSource(resourceKey);
    const copy = source.clone();

    target.appendChild(copy);

    return copy;
  }

}
