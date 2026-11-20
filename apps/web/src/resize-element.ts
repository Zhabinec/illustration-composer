import { elementHeight, type SceneElement, type VectorVariant } from "./model";

/** Resize proportionally while keeping the rotated top-left corner anchored. */
export function resizeElement(item: SceneElement, variant: VectorVariant, dx: number, dy: number): SceneElement {
  const w = item.width;
  const h = elementHeight(item, variant);
  const angle = item.rotation * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const vx = w * cos - h * sin, vy = w * sin + h * cos;
  const ratio = Math.max(1 / w, 1 + (dx * vx + dy * vy) / (w * w + h * h));
  return { ...item, width: w * ratio,
    x: item.x + (1 - ratio) * (w / 2 - vx / 2),
    y: item.y + (1 - ratio) * (h / 2 - vy / 2) };
}
