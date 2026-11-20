import { createId, findVariant, type SceneElement, type VectorAsset, type VectorVariant } from "./model";

export const isDecoration = (id: string) => id.startsWith("decor-");
export function decorationName(name: string): string {
  if (/line|линия/i.test(name)) return "Линия";
  return /vector|ellipse/i.test(name) ? "Точка" : "Конфетти";
}

/** Figma SVG already contains its source rotation; use the exported viewport for new decor. */
export function prepareDecorationAssets(assets: VectorAsset[]): VectorAsset[] {
  return assets.map(asset => {
    if (!isDecoration(asset.id) || asset.variants.some(v => v.id.endsWith("-viewport"))) return asset;
    const original = asset.variants[0]!;
    const box = original.svg.match(/viewBox="([^"]+)"/)?.[1]?.split(/[\s,]+/).map(Number);
    if (!box || !box.slice(2).every(value => Number.isFinite(value) && value > 0)) return asset;
    return { ...asset, variants: [...asset.variants, { ...original, id: original.id + "-viewport", width: box[2]!, height: box[3]! }] };
  });
}

export function decorationVariant(asset: VectorAsset): VectorVariant {
  return asset.variants.find(v => v.id.endsWith("-viewport")) ?? asset.variants[0]!;
}

export function uniqueDecorations(assets: readonly VectorAsset[]): VectorAsset[] {
  const seen = new Set<string>();
  return assets.filter(asset => {
    if (!isDecoration(asset.id)) return false;
    const key = decorationVariant(asset).svg.replace(/\s+id="[^"]*"/g, "")
      .replace(/\d+\.\d+(?:e[+-]?\d+)?/gi, value => String(Math.round(Number(value) * 1000) / 1000));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function newDecoration(asset: VectorAsset, width: number, height: number): SceneElement {
  const variant = decorationVariant(asset);
  return { id: createId(), assetId: asset.id, variantId: variant.id, name: decorationName(asset.name),
    x: width * .06, y: height * .06,
    width: Math.min(width * (decorationName(asset.name) === "Линия" ? .18 : .06), height * .3 * variant.width / variant.height), rotation: 0 };
}

export function arrangeDecorations(subjects: readonly SceneElement[], assets: VectorAsset[], width: number, height: number): SceneElement[] {
  const available = assets.filter(asset => isDecoration(asset.id));
  const line = available.find(asset => decorationName(asset.name) === "Линия");
  const accent = available.find(asset => {
    const variant = decorationVariant(asset);
    return decorationName(asset.name) !== "Линия" && variant.width / variant.height > .4 && variant.width / variant.height < 2.5;
  }) ?? available.find(asset => decorationName(asset.name) === "Конфетти")
    ?? available.find(asset => decorationName(asset.name) === "Точка");
  const placed: SceneElement[] = [];
  const boxes = subjects.filter(item => findVariant(assets, item).role === "main").map(item => {
    const variant = findVariant(assets, item);
    return { x: item.x, y: item.y, width: item.width, height: item.width * variant.height / variant.width };
  });
  for (const asset of [line, accent, line, accent]) {
    if (!asset) continue;
    const item = newDecoration(asset, width, height);
    const variant = decorationVariant(asset);
    const h = item.width * variant.height / variant.width;
    const candidates = [[.04,.05],[.74,.76],[.04,.82],[.84,.06],[.04,.40],[.78,.40],
      [.40,.04],[.40,.85],[.65,.04],[.15,.82],[.84,.64],[.04,.64]];
    const scored = candidates.map(([x,y]) => {
      const box = { x: Math.min(width - item.width, width * x!), y: Math.min(height - h, height * y!), width: item.width, height: h };
      const overlap = boxes.reduce((sum, other) => sum + Math.max(0, Math.min(box.x + box.width, other.x + other.width) - Math.max(box.x, other.x)) *
        Math.max(0, Math.min(box.y + box.height, other.y + other.height) - Math.max(box.y, other.y)), 0);
      return { box, overlap: overlap / (box.width * box.height) };
    }).sort((a,b) => a.overlap - b.overlap);
    const best = scored[0]!;
    if (best.overlap > .15) continue;
    placed.push({ ...item, x: best.box.x, y: best.box.y });
    boxes.push(best.box);
  }
  return placed;
}
