import type { AssetRole } from "../catalog/asset.js";
import type { CanvasSize } from "./template-fit.js";

export interface CompositionBox {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  role: AssetRole;
  kind: "primary" | "secondary" | "decoration";
}

export interface SpacedCompositionBox extends CompositionBox {
  scale: number;
}

function intersects(a: CompositionBox, b: CompositionBox, gap: number): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

function findPosition(
  item: CompositionBox, obstacles: readonly CompositionBox[], canvas: CanvasSize, gap: number
): { x: number; y: number } | null {
  const xs = [item.x, gap, canvas.width - gap - item.width,
    ...obstacles.flatMap(other => [other.x - gap - item.width, other.x + other.width + gap])];
  const ys = [item.y, gap, canvas.height - gap - item.height,
    ...obstacles.flatMap(other => [other.y - gap - item.height, other.y + other.height + gap])];
  let best: { x: number; y: number } | null = null;
  let distance = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const candidate = { ...item, x, y };
      if (x < 0 || y < 0 || x + item.width > canvas.width || y + item.height > canvas.height ||
          obstacles.some(other => intersects(candidate, other, gap))) continue;
      const next = (x - item.x) ** 2 + (y - item.y) ** 2;
      if (next < distance) {
        best = { x, y };
        distance = next;
      }
    }
  }
  return best;
}

export function spaceCompositionObjects(
  canvas: CanvasSize, boxes: readonly CompositionBox[]
): SpacedCompositionBox[] {
  if (![canvas.width, canvas.height].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error("Invalid composition canvas");
  }
  const ids = new Set<string>();
  for (const box of boxes) {
    if (ids.has(box.id) || ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
        box.width <= 0 || box.height <= 0) throw new Error("Invalid composition object bounds");
    ids.add(box.id);
  }
  const items = boxes.map(box => ({ ...box, scale: 1 }));
  const main = items.filter(box => box.role === "main" && box.kind !== "decoration")
    .sort((a, b) => Number(b.kind === "primary") - Number(a.kind === "primary"));
  const anchor = main[0];
  if (!anchor) return items;
  const placed: CompositionBox[] = [anchor];
  const gap = Math.min(canvas.width, canvas.height) * 0.015;
  for (const item of main.slice(1)) {
    if (!placed.some(other => intersects(item, other, 0))) {
      placed.push(item);
      continue;
    }
    let found = false;
    for (let step = 20; step >= 4; step--) {
      const scale = step / 20;
      const candidate = { ...item, width: item.width * scale, height: item.height * scale };
      const position = findPosition(candidate, placed, canvas, gap);
      if (!position) continue;
      Object.assign(item, position, { width: candidate.width, height: candidate.height, scale });
      placed.push(item);
      found = true;
      break;
    }
    if (!found) throw new Error(`Нет свободного места для «${item.name}». Выбери другой предмет или расстановку.`);
  }
  return items;
}
