
import type {
  CompositionScene,
  CompositionSource
} from "./row-composition.js";

export function createFocusComposition(
  width: number,
  height: number,
  primary: CompositionSource,
  secondary: CompositionSource
): CompositionScene {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("Invalid composition dimensions");
  }

  for (const source of [primary, secondary]) {
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

  const secondaryScale = Math.min(
    width * 0.24 / secondary.width,
    height * 0.28 / secondary.height
  );

  const primaryWidth = primary.width * primaryScale;
  const primaryHeight = primary.height * primaryScale;

  const secondaryWidth = secondary.width * secondaryScale;
  const secondaryHeight = secondary.height * secondaryScale;

  const primaryX = Math.max(
    0,
    (width - primaryWidth) / 2 - width * 0.06
  );

  const primaryY = Math.max(
    0,
    (height - primaryHeight) / 2 - height * 0.05
  );

  const secondaryX = Math.min(
    width - secondaryWidth,
    primaryX + primaryWidth * 0.74
  );

  const secondaryY = Math.min(
    height - secondaryHeight,
    primaryY + primaryHeight * 0.65
  );

  return {
    width,
    height,
    items: [
      {
        assetId: primary.assetId,
        variant: primary.variant,
        x: primaryX,
        y: primaryY,
        scale: primaryScale,
        rotation: 0
      },
      {
        assetId: secondary.assetId,
        variant: secondary.variant,
        x: secondaryX,
        y: secondaryY,
        scale: secondaryScale,
        rotation: 0
      }
    ]
  };
}
