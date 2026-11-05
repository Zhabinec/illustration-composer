import type { AssetRole, CompositionScene, CompositionSource } from "@illustration-composer/core";

export interface CompositionItemSettings {
  assetId: string;
  variantId: string;
  layer?: AssetRole;
  x?: number;
  y?: number;
  scale: number;
  rotation: number;
}

export function readCompositionItemSettings(value: unknown): CompositionItemSettings[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) throw new Error("Проверьте настройки предметов.");
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || !("assetId" in item) || typeof item.assetId !== "string" ||
      !("variantId" in item) || typeof item.variantId !== "string") throw new Error("Выберите вариант предмета из библиотеки.");
    const number = (key: "x" | "y" | "scale" | "rotation", min: number, max: number) => {
      const input = (item as Record<string, unknown>)[key];
      if (input === undefined && (key === "x" || key === "y")) return undefined;
      if (typeof input !== "number" || !Number.isFinite(input) || input < min || input > max) {
        throw new Error("Проверьте положение, масштаб и угол предмета.");
      }
      return input;
    };
    const x = number("x", 0, 100);
    const y = number("y", 0, 100);
    const layer = "layer" in item ? item.layer : undefined;
    if (layer !== undefined && layer !== "main" && layer !== "background") throw new Error("Выберите слой предмета.");
    return { assetId: item.assetId, variantId: item.variantId, ...(layer === undefined ? {} : { layer }), ...(x === undefined ? {} : { x }),
      ...(y === undefined ? {} : { y }), scale: number("scale", 25, 250)!, rotation: number("rotation", -180, 180)! };
  });
}

export function applyCompositionItemSettings(
  scene: CompositionScene, sources: readonly CompositionSource[], settings: readonly CompositionItemSettings[]
): CompositionScene {
  if (!settings.length) return scene;
  return { ...scene, items: scene.items.map((item, index) => {
    const setting = settings[index]!;
    const variant = setting.layer ? { ...item.variant, role: setting.layer } : item.variant;
    if (setting.x === undefined && setting.y === undefined && setting.scale === 100 && setting.rotation === 0) return { ...item, variant };
    const source = sources[index]!;
    const scale = item.scale * setting.scale / 100;
    const centerX = setting.x === undefined ? item.x + source.width * item.scale / 2 : scene.width * setting.x / 100;
    const centerY = setting.y === undefined ? item.y + source.height * item.scale / 2 : scene.height * setting.y / 100;
    const angle = setting.rotation * Math.PI / 180;
    const halfWidth = source.width * scale / 2;
    const halfHeight = source.height * scale / 2;
    return { ...item, variant, scale, rotation: setting.rotation,
      x: centerX - Math.cos(angle) * halfWidth - Math.sin(angle) * halfHeight,
      y: centerY + Math.sin(angle) * halfWidth - Math.cos(angle) * halfHeight };
  }) };
}
