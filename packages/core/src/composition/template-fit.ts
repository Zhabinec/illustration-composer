export interface CanvasSize {
  width: number;
  height: number;
}

export function scaleCompositionTemplate(source: CanvasSize, scale: number): CanvasSize {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid template scale");
  const target = { width: source.width * scale, height: source.height * scale };
  fitCompositionTemplate(source, target);
  return target;
}

export function fitCompositionTemplate(source: CanvasSize, target: CanvasSize): {
  scale: number;
  x: number;
  y: number;
} {
  for (const value of [source.width, source.height, target.width, target.height]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("Invalid template or canvas dimensions");
    }
  }
  const scale = Math.min(target.width / source.width, target.height / source.height);
  return {
    scale,
    x: (target.width - source.width * scale) / 2,
    y: (target.height - source.height * scale) / 2
  };
}
