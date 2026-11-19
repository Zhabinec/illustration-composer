export interface VectorVariant {
  id: string;
  size: "S" | "L";
  role: "main" | "background";
  width: number;
  height: number;
  svg: string;
}

export interface VectorAsset {
  id: string;
  name: string;
  variants: VectorVariant[];
}

export interface SceneElement {
  id: string;
  assetId: string;
  variantId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
}

export interface Scene {
  width: number;
  height: number;
  background: string;
  paletteId: string;
  elements: SceneElement[];
}

export const createId = () => crypto.randomUUID();

export function elementHeight(element: SceneElement, variant: VectorVariant): number {
  return element.width * variant.height / variant.width;
}

export function findVariant(assets: readonly VectorAsset[], element: SceneElement): VectorVariant {
  const variant = assets.find(asset => asset.id === element.assetId)?.variants.find(item => item.id === element.variantId);
  if (!variant) throw new Error("Исходный рисунок недоступен. Выберите другой предмет.");
  return variant;
}
