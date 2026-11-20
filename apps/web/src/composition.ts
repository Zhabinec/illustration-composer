import {
  AssetCatalog, AssetId, createAutomaticComposition, createFocusComposition, createRowComposition,
  selectLocalMetaphor, resolveAssetNames, libraryConcepts, libraryProfiles
} from "@illustration-composer/core";
import type { VectorAsset, SceneElement } from "./model";
import { createId, findVariant } from "./model";

export function pickObjects(query: string, mode: string, assets: readonly VectorAsset[]): VectorAsset[] {
  const available = assets.filter(asset => !/^(decor-|reference-)/.test(asset.id));
  const catalog = new AssetCatalog(available.map(asset => ({
    id: AssetId.create(asset.id), name: asset.name, tags: [],
    variants: asset.variants.map(variant => ({ ...variant, resourceKey: variant.id }))
  })));
  if (mode === "names") {
    const result = resolveAssetNames(query, catalog, { puzzle: ["паззлы", "пазл"], wallet: ["кошелёк", "кошелек"] });
    if (result.issues.length) throw new Error("Проверьте названия. Доступные предметы показаны в библиотеке.");
    return result.assets.map(item => available.find(asset => asset.id === item.id.value)!);
  }
  const result = selectLocalMetaphor(query, catalog, libraryConcepts, libraryProfiles);
  if (result.errors.length) throw new Error(result.errors.join(" "));
  return result.suggestions.map(item => available.find(asset => asset.id === item.assetId)!);
}

export function arrange(elements: readonly SceneElement[], assets: readonly VectorAsset[], width: number, height: number, layout: string): SceneElement[] {
  const sources = elements.map((element, index) => {
    const variant = findVariant(assets, element);
    return { assetId: AssetId.create(element.assetId), variant: { size: variant.size, role: index === 0 ? "main" as const : variant.role, resourceKey: variant.id },
      width: variant.width, height: variant.height, emphasis: index === 0 ? "primary" as const : "secondary" as const };
  });
  if (!sources.length) return [];
  const scene = layout === "row" ? createRowComposition(width, height, sources)
    : ["focus", "left", "right", "diagonal"].includes(layout) ? createFocusComposition(width, height, sources[0]!, sources[1], ...sources.slice(2))
    : createAutomaticComposition(width, height, sources);
  const positioned = scene.items.map((item, index) => ({
    ...elements[index]!, x: layout === "right" ? width - item.x - sources[index]!.width * item.scale : item.x,
    y: item.y, width: sources[index]!.width * item.scale,
    rotation: layout === "diagonal" && index > 0 ? (index % 2 ? -8 : 8) : item.rotation
  }));
  return positioned.sort((a, b) => Number(findVariant(assets, a).role === "main") - Number(findVariant(assets, b).role === "main"));
}

export function compositionSubjects(chosen: readonly VectorAsset[], width: number, depth: boolean): SceneElement[] {
  return chosen.map((asset, index) => {
    const item = newElement(asset, width);
    if (depth && index > 0 && index === chosen.length - 1) {
      const background = asset.variants.find(v => v.role === "background" && v.size === "L")
        ?? asset.variants.find(v => v.role === "background");
      if (background) item.variantId = background.id;
    }
    return item;
  });
}

export function newElement(asset: VectorAsset, canvasWidth: number): SceneElement {
  const variant = asset.variants.find(v => v.size === "L" && v.role === "main") ?? asset.variants[0]!;
  return { id: createId(), assetId: asset.id, variantId: variant.id, name: asset.name,
    x: canvasWidth * 0.15, y: canvasWidth * 0.15, width: canvasWidth * 0.5, rotation: 0 };
}
