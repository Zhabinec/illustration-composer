
import type { AssetId } from "../catalog/asset-id.js";
import type { AssetVariant } from "../catalog/asset.js";
import type { ColorRole } from "../palette/color-palette.js";

export interface CompositionSource {
  assetId: AssetId;
  variant: AssetVariant;
  width: number;
  height: number;
  emphasis?: "primary" | "secondary";
}

export interface CompositionItem {
  assetId: AssetId;
  variant: AssetVariant;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface CompositionScene {
  width: number;
  height: number;
  items: readonly CompositionItem[];
  background?: ColorRole;
  shrinkSuggestions?: readonly { assetId: AssetId; scale: number }[];
}

export function createRowComposition(
  width: number,
  height: number,
  sources: readonly CompositionSource[]
): CompositionScene {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    sources.length === 0
  ) {
    throw new Error("Invalid composition dimensions or sources");
  }

  const padding = width * 0.08;
  const gap = width * 0.04;
  const cellWidth =
    (width - padding * 2 - gap * (sources.length - 1)) /
    sources.length;

  if (cellWidth <= 0) {
    throw new Error("Too many composition objects");
  }

  const maxHeight = height * 0.72;

  const items = sources.map((source, index): CompositionItem => {
    if (
      !Number.isFinite(source.width) ||
      !Number.isFinite(source.height) ||
      source.width <= 0 ||
      source.height <= 0
    ) {
      throw new Error("Invalid source dimensions");
    }

  const fitScale = Math.min(
    cellWidth / source.width,
    maxHeight / source.height
  );

    const emphasisScale = source.emphasis === "secondary" ? 0.55 : 1;

    const scale = fitScale * emphasisScale;

    const scaledWidth = source.width * scale;
    const scaledHeight = source.height * scale;

    return {
      assetId: source.assetId,
      variant: source.variant,
      x: padding +
        index * (cellWidth + gap) +
        (cellWidth - scaledWidth) / 2,
      y: (height - scaledHeight) / 2,
      scale,
      rotation: 0
    };
  });

  return { width, height, items };
}
