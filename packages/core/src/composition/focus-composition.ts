
import type {
  CompositionScene,
  CompositionSource
} from "./row-composition.js";
import { spaceCompositionObjects } from "./composition-spacing.js";

export function createFocusComposition(
  width: number,
  height: number,
  primary: CompositionSource,
  secondary?: CompositionSource,
  ...additional: CompositionSource[]
): CompositionScene {
  const sources = [primary, ...(secondary ? [secondary] : []), ...additional];
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("Invalid composition dimensions");
  }

  for (const source of sources) {
    if (
      !Number.isFinite(source.width) ||
      !Number.isFinite(source.height) ||
      source.width <= 0 ||
      source.height <= 0
    ) {
      throw new Error("Invalid source dimensions");
    }
  }

  const primaryScale = Math.min(
    width * 0.62 / primary.width,
    height * 0.65 / primary.height
  );

  const primaryWidth = primary.width * primaryScale;
  const primaryHeight = primary.height * primaryScale;

  const primaryX = Math.max(
    0,
    (width - primaryWidth) / 2 - (sources.length > 1 ? width * 0.06 : 0)
  );

  const primaryY = Math.max(
    0,
    (height - primaryHeight) / 2 - (sources.length > 1 ? height * 0.05 : 0)
  );

  const anchors = [[0.74, 0.65], [-0.18, -0.12], [0.86, -0.14], [-0.2, 0.85], [1, 0.35], [0.4, 1], [-0.25, 0.3]];
  const scene: CompositionScene = {
    width,
    height,
    items: sources.map((source, index) => {
      if (index === 0) return { assetId: source.assetId, variant: source.variant,
        x: primaryX, y: primaryY, scale: primaryScale, rotation: 0 };
      const density = Math.sqrt(Math.max(1, (sources.length - 1) / 2));
      const scale = Math.min(width * 0.24 / source.width, height * 0.28 / source.height) / density;
      const [anchorX = 0.74, anchorY = 0.65] = anchors[(index - 1) % anchors.length]!;
      return { assetId: source.assetId, variant: source.variant, scale, rotation: 0,
        x: Math.max(0, Math.min(width - source.width * scale, primaryX + primaryWidth * anchorX)),
        y: Math.max(0, Math.min(height - source.height * scale, primaryY + primaryHeight * anchorY)) };
    })
  };
  const boxes = spaceCompositionObjects(scene, scene.items.map((item, index) => ({
    id: String(index), name: item.assetId.value,
    x: item.x, y: item.y,
    width: sources[index]!.width * item.scale,
    height: sources[index]!.height * item.scale,
    role: item.variant.role,
    kind: index === 0 ? "primary" : "secondary"
  })));
  const shrinkSuggestions = boxes.flatMap((box, index) => box.scale < 1
    ? [{ assetId: sources[index]!.assetId, scale: box.scale }] : []);
  return {
    ...scene,
    items: scene.items.map((item, index) => ({
      ...item, x: boxes[index]!.x, y: boxes[index]!.y, scale: item.scale * boxes[index]!.scale
    })),
    ...(shrinkSuggestions.length ? { shrinkSuggestions } : {})
  };
}
