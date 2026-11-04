import { normalizeAssetName, palettePresets, resolvePalette } from "@illustration-composer/core";
import type { ColorPalette } from "@illustration-composer/core";

export function preparePaletteImport(
  value: unknown, palettes: readonly ColorPalette[], assetIds: readonly string[]
): ColorPalette {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Палитра должна быть JSON-объектом с названием и цветами.");
  }
  const input = value as Record<string, unknown>;
  const palette = "colors" in input
    ? resolvePalette({ ...(typeof input.colors === "object" && input.colors !== null && !Array.isArray(input.colors)
        ? input.colors : {}), name: input.name })
    : resolvePalette(input);
  const existing = [...Object.values(palettePresets), ...palettes];
  if (existing.some(item => normalizeAssetName(item.name) === normalizeAssetName(palette.name))) {
    throw new Error("Палитра с таким названием уже существует. Измени название в JSON.");
  }
  const occupied = new Set([...existing.map(item => item.id), ...assetIds]);
  let sequence = 1;
  while (occupied.has(`palette-json-${sequence}`)) sequence++;
  return { ...palette, id: `palette-json-${sequence}` };
}
