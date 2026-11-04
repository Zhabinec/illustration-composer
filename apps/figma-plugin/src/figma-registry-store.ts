import {
  AssetCatalog,
  AssetId,
  LibraryRegistry,
  VariantId,
  resolvePalette
} from "@illustration-composer/core";
import type {
  Asset,
  ColorPalette,
  LibraryRegistrySnapshot
} from "@illustration-composer/core";
import type { ResolvedAsset } from "./figma-library-resolver.js";

export interface RegisteredPalette extends ColorPalette {
  sourceNodeId: string;
}

export interface RegistryDocument {
  version: 1;
  registry: LibraryRegistrySnapshot;
  sourceNodeIds: Record<string, string>;
  palettes: RegisteredPalette[];
}

const metadataKey = "illustration-composer-registry-v1";
const metadataNamespace = "illustrationComposer";
const maxEntryBytes = 95000;

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}
const knownAssetIds: Readonly<Record<string, string>> = {
  "Книга": "book",
  "Телефон": "phone",
  "Пазлы": "puzzle",
  "Монета": "coin",
  "Наушники": "headphones",
  "Лампа": "lamp",
  "Папка": "folder",
  "Ручка": "pen",
  "Кошелек": "wallet",
  "Кошелёк": "wallet"
};

export function sourceIdentity(nodeId: string): {
  assetId: AssetId;
  variantId: VariantId;
  resourceKey: string;
  paletteId: string;
} {
  const suffix = nodeId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!suffix) throw new Error("Invalid source node ID");
  return {
    assetId: AssetId.create(`asset-${suffix}`),
    variantId: VariantId.create(`variant-${suffix}`),
    resourceKey: `source-${suffix}`,
    paletteId: `palette-${suffix}`
  };
}

export class FigmaRegistryStore {
  load(): RegistryDocument | null {
    const shared = figma.root.getSharedPluginData(metadataNamespace, metadataKey);
    if (shared) return this.parse(shared);

    // Private data is only accessible under the original manifest ID.
    const legacy = figma.pluginId ? figma.root.getPluginData(metadataKey) : "";
    if (!legacy) return null;

    const document = this.parse(legacy);
    this.save(document);
    return document;
  }

  save(document: RegistryDocument): void {
    const serialized = JSON.stringify(document);
    this.parse(serialized);
    const bytes = utf8ByteLength(metadataNamespace + metadataKey + serialized);
    if (bytes > maxEntryBytes) {
      throw new Error("Registry is too large for Figma document storage");
    }
    figma.root.setSharedPluginData(metadataNamespace, metadataKey, serialized);
  }

  private parse(raw: string): RegistryDocument {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || !("version" in data) || data.version !== 1 ||
        !("registry" in data) || !("sourceNodeIds" in data) || !("palettes" in data)) {
      throw new Error("Invalid saved library registry");
    }
    const document = data as RegistryDocument;
    new LibraryRegistry(document.registry);
    if (typeof document.sourceNodeIds !== "object" || document.sourceNodeIds === null ||
        Array.isArray(document.sourceNodeIds) || !Array.isArray(document.palettes)) {
      throw new Error("Invalid saved library metadata");
    }
    const sources = new Set<string>();
    for (const nodeId of Object.values(document.sourceNodeIds)) {
      if (typeof nodeId !== "string" || !nodeId.trim() || sources.has(nodeId)) {
        throw new Error("Invalid or duplicate source binding");
      }
      sources.add(nodeId);
    }
    for (const asset of document.registry.assets) {
      for (const variant of asset.variants) {
        if (!Object.prototype.hasOwnProperty.call(document.sourceNodeIds, variant.resourceKey)) {
          throw new Error(`Missing source binding: ${variant.resourceKey}`);
        }
        if (typeof variant.active !== "boolean") {
          throw new Error("Invalid saved variant status");
        }
      }
    }
    const paletteIds = new Set<string>();
    for (const palette of document.palettes) {
      if (!palette || typeof palette.sourceNodeId !== "string" || !palette.sourceNodeId.trim() ||
          typeof palette.id !== "string" || !palette.id.trim() || paletteIds.has(palette.id) ||
          sources.has(palette.sourceNodeId) || typeof palette.colors !== "object" ||
          palette.colors === null || Array.isArray(palette.colors)) {
        throw new Error("Invalid saved palette");
      }
      resolvePalette({ ...palette.colors, name: palette.name });
      paletteIds.add(palette.id);
      sources.add(palette.sourceNodeId);
    }
    return document;
  }

  bootstrap(assets: readonly ResolvedAsset[]): RegistryDocument {
    const registry = new LibraryRegistry();
    const sourceNodeIds: Record<string, string> = {};

    for (const asset of assets) {
      const knownId = knownAssetIds[asset.name];
      if (!knownId) continue;
      const identity = sourceIdentity(asset.nodeId);
      const assetId = AssetId.create(knownId);
      const variant = {
        id: identity.variantId,
        resourceKey: identity.resourceKey,
        size: asset.size,
        role: asset.role
      };
      const existing = registry.getAll().find(item => item.id === assetId.value);
      if (!existing) {
        registry.createAsset(assetId, asset.name, variant);
      } else {
        const active = existing.variants.find(item =>
          item.active && item.size === asset.size && item.role === asset.role
        );
        registry.registerVariant({
          ...variant,
          assetId,
          ...(active ? {
            decision: "alternative" as const,
            expectedActiveId: VariantId.create(active.id)
          } : {})
        });
      }
      sourceNodeIds[identity.resourceKey] = asset.nodeId;
    }
    return {
      version: 1,
      registry: registry.snapshot(),
      sourceNodeIds,
      palettes: []
    };
  }
}

export function toAssetCatalog(registry: LibraryRegistry): AssetCatalog {
  const assets: Asset[] = registry.getAll().map(item => ({
    id: AssetId.create(item.id),
    name: item.name,
    tags: [item.name],
    variants: item.variants.filter(variant => variant.active).map(variant => ({
      size: variant.size,
      role: variant.role,
      resourceKey: variant.resourceKey
    }))
  }));
  return new AssetCatalog(assets);
}
