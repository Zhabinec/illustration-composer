import type { CompositionItem, CompositionScene, CompositionSource } from "./row-composition.js";
import { maxCompositionObjects } from "./composition-selection.js";

interface Box { x: number; y: number; width: number; height: number }
interface Placement extends Box { index: number; scale: number }

function intersection(a: Box, b: Box): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function bounds(placements: readonly Box[]): Box {
  const x = Math.min(...placements.map(item => item.x));
  const y = Math.min(...placements.map(item => item.y));
  return { x, y, width: Math.max(...placements.map(item => item.x + item.width)) - x,
    height: Math.max(...placements.map(item => item.y + item.height)) - y };
}

function score(placements: readonly Placement[], width: number, height: number): number {
  const area = placements.reduce((sum, item) => sum + item.width * item.height, 0);
  const centerX = placements.reduce((sum, item) => sum + (item.x + item.width / 2) * item.width * item.height, 0) / area;
  const centerY = placements.reduce((sum, item) => sum + (item.y + item.height / 2) * item.width * item.height, 0) / area;
  const envelope = bounds(placements);
  const balance = Math.hypot(centerX / width - 0.5, centerY / height - 0.5);
  const whitespace = (envelope.width * envelope.height - area) / (width * height);
  const primary = placements[0]!;
  const primaryBalance = Math.hypot((primary.x + primary.width / 2) / width - 0.5,
    (primary.y + primary.height / 2) / height - 0.5);
  const accents = placements.slice(1);
  const rhythm = accents.reduce((sum, item) => {
    const dx = (item.x + item.width / 2 - primary.x - primary.width / 2) / width;
    const dy = (item.y + item.height / 2 - primary.y - primary.height / 2) / height;
    const diagonal = Math.min(Math.abs(dx), Math.abs(dy), 0.14);
    const gapX = Math.max(0, Math.abs(dx) - (primary.width + item.width) / (2 * width));
    const gapY = Math.max(0, Math.abs(dy) - (primary.height + item.height) / (2 * height));
    return sum + diagonal - Math.hypot(gapX, gapY) * 2;
  }, 0) / Math.max(1, accents.length);
  return area / (width * height) * 3 - balance * 2 - whitespace * 0.7 - primaryBalance * 0.35 + rhythm * 1.6;
}

function fit(source: CompositionSource, index: number, width: number, height: number): Placement {
  const scale = Math.min(width / source.width, height / source.height);
  return { index, scale, x: 0, y: 0, width: source.width * scale, height: source.height * scale };
}

function positions(box: Placement, width: number, height: number, margin: number): Placement[] {
  const result: Placement[] = [];
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
    result.push({ ...box, x: margin + (width - margin * 2 - box.width) * x / 8,
      y: margin + (height - margin * 2 - box.height) * y / 8 });
  }
  return result;
}

function separate(a: Box, b: Box, gap: number): boolean {
  return a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y;
}

function nearPrimary(box: Placement, primary: Placement, gap: number): Placement[] {
  const result: Placement[] = [];
  for (const offset of [-0.3, 0, 0.3]) {
    const x = primary.x + (primary.width - box.width) / 2 + primary.width * offset;
    const y = primary.y + (primary.height - box.height) / 2 + primary.height * offset;
    result.push(
      { ...box, x, y: primary.y - box.height - gap },
      { ...box, x, y: primary.y + primary.height + gap },
      { ...box, x: primary.x - box.width - gap, y },
      { ...box, x: primary.x + primary.width + gap, y }
    );
  }
  return result;
}

function foregroundCandidates(
  width: number, height: number, sources: readonly CompositionSource[], indices: readonly number[]
): Placement[][] {
  const primaryIndex = indices[0]!;
  const primary = sources[primaryIndex]!;
  const margin = Math.min(width, height) * 0.06;
  const gap = Math.min(width, height) * 0.025;
  const density = Math.sqrt(Math.max(1, indices.length / 3));
  const candidates: Placement[][] = [];
  for (const extent of [0.68, 0.60, 0.52]) {
    const main = fit(primary, primaryIndex, width * extent / density, height * extent / density);
    // Separate primary anchors let the same objects form a horizontal or vertical scene.
    for (const start of positions(main, width, height, margin).filter((_, index) =>
      index % 2 === 0 && Math.floor(index / 9) % 2 === 0)) {
      let beam: Placement[][] = [[start]];
      for (const index of indices.slice(1)) {
        const source = sources[index]!;
        const next: Placement[][] = [];
        for (const ratio of [1, 0.84]) {
          const secondary = fit(source, index, width * 0.42 / density * ratio, height * 0.42 / density * ratio);
          const areaLimit = Math.sqrt(main.width * main.height * 0.55 / (secondary.width * secondary.height));
          const reduction = Math.min(1, areaLimit);
          secondary.width *= reduction;
          secondary.height *= reduction;
          secondary.scale *= reduction;
          const nearby = nearPrimary(secondary, start, gap).filter(item =>
            item.x >= margin && item.y >= margin &&
            item.x + item.width <= width - margin && item.y + item.height <= height - margin);
          for (const placement of [...nearby, ...positions(secondary, width, height, margin)]) {
            for (const placed of beam) if (placed.every(item => separate(item, placement, gap))) {
              next.push([...placed, placement]);
            }
          }
        }
        beam = next.map(items => ({ items, score: score(items, width, height) }))
          .sort((a, b) => b.score - a.score).slice(0, 6).map(entry => entry.items);
        if (!beam.length) break;
      }
      candidates.push(...beam.filter(items => items.length === indices.length));
    }
  }
  return candidates;
}

function addBackgrounds(
  foreground: readonly Placement[], width: number, height: number,
  sources: readonly CompositionSource[], indices: readonly number[]
): Placement[] | null {
  const result = [...foreground];
  const margin = Math.min(width, height) * 0.04;
  const canvas = { x: 0, y: 0, width, height };
  const main = foreground[0]!;
  for (const index of indices) {
    let best: { item: Placement; score: number } | undefined;
    const density = Math.sqrt(indices.length);
    for (const extent of [0.52, 0.74, 0.92]) {
      const box = fit(sources[index]!, index, width * extent / density, height * extent / density);
      const contained = positions(box, width, height, margin);
      const raisedY = Math.max(margin, Math.min(height - margin - box.height,
        main.y + (main.height - box.height) / 2 - height * 0.13));
      const candidates = [...contained, ...nearPrimary(box, main, margin).filter(item =>
        item.x >= 0 && item.y >= 0 && item.x + item.width <= width && item.y + item.height <= height)];
      for (const { x } of contained.slice(0, 9)) candidates.push({ ...box, x, y: raisedY });
      if (extent === 0.92 && indices.length === 1) {
        // Let a single large background enter from one edge of the canvas.
        const sideAnchors = contained.filter((_, position) => position % 18 === 0);
        for (const y of [raisedY, ...sideAnchors.map(item => item.y)]) {
          candidates.push({ ...box, x: -box.width * 0.14, y }, { ...box, x: width - box.width * 0.86, y });
        }
        for (const { x } of contained.slice(0, 9)) candidates.push({ ...box, x, y: -box.height * 0.14 });
      }
      for (const item of candidates) {
        const area = item.width * item.height;
        const inside = intersection(item, canvas);
        const covered = result.reduce((sum, other) => sum + intersection(item, other), 0);
        const visible = Math.max(0, inside - covered);
        if (visible < area * 0.48) continue;
        const dx = (item.x + item.width / 2 - main.x - main.width / 2) / width;
        const dy = (item.y + item.height / 2 - main.y - main.height / 2) / height;
        const gapX = Math.max(0, Math.abs(dx) - (main.width + item.width) / (2 * width));
        const gapY = Math.max(0, Math.abs(dy) - (main.height + item.height) / (2 * height));
        const depth = intersection(item, main) / area;
        const presence = Math.min(visible / (main.width * main.height), 1.25);
        const edgeEntry = inside < area * 0.99 && (item.y < 0 ? item.height / height : item.width / width) > 0.8;
        const score = presence * 0.4 - Math.hypot(gapX, gapY) - Math.abs(depth - 0.2) * 0.55
          - Math.abs(dy + 0.13) * 1.05 - Math.max(0, dy + 0.05) * 1.5
          - (1 - inside / area) * 0.2 + (edgeEntry ? 0.12 : 0);
        if (!best || score > best.score) best = { item, score };
      }
    }
    if (!best) return null;
    result.push(best.item);
  }
  return result;
}

/** Plans independent vector placements; source geometry and library roles remain unchanged. */
export function createAutomaticComposition(
  width: number, height: number, sources: readonly CompositionSource[]
): CompositionScene {
  if (![width, height].every(value => Number.isFinite(value) && value > 0) ||
    !sources.length || sources.length > maxCompositionObjects || sources.some(source =>
      ![source.width, source.height].every(value => Number.isFinite(value) && value > 0))) {
    throw new Error("Invalid composition dimensions or sources");
  }
  const mainIndices = sources.flatMap((source, index) => source.variant.role === "main" ? [index] : []);
  const primary = mainIndices.find(index => sources[index]!.emphasis === "primary") ?? mainIndices[0];
  if (primary === undefined) throw new Error("Для композиции нужен хотя бы один главный предмет.");
  const ordered = [primary, ...mainIndices.filter(index => index !== primary)];
  const background = sources.flatMap((source, index) => source.variant.role === "background" ? [index] : []);
  const candidates = foregroundCandidates(width, height, sources, ordered)
    .sort((a, b) => score(b, width, height) - score(a, width, height));
  let best: Placement[] | null = null;
  for (const candidate of candidates) {
    best = addBackgrounds(candidate, width, height, sources, background);
    if (best) break;
  }
  if (!best) throw new Error("Предметам тесно. Выбери другой формат или сократи число предметов.");
  const items: CompositionItem[] = sources.map((source, index) => {
    const placed = best!.find(item => item.index === index)!;
    // Later backgrounds were fitted behind the earlier ones.
    const layer = source.variant.role === "background" ? { zIndex: -background.indexOf(index) } : {};
    return { assetId: source.assetId, variant: source.variant,
      x: placed.x, y: placed.y, scale: placed.scale, rotation: 0, ...layer };
  });
  return { width, height, items, background: "pale" };
}
