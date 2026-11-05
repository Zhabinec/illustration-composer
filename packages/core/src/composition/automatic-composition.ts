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
          for (const placement of positions(secondary, width, height, margin)) {
            for (const placed of beam) if (placed.every(item => separate(item, placement, gap))) {
              next.push([...placed, placement]);
            }
          }
        }
        beam = next.sort((a, b) => score(b, width, height) - score(a, width, height)).slice(0, 6);
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
  for (const index of indices) {
    const box = fit(sources[index]!, index, width * 0.66 / Math.sqrt(indices.length), height * 0.66 / Math.sqrt(indices.length));
    const possible = positions(box, width, height, margin).map(item => {
      const covered = result.reduce((sum, other) => sum + intersection(item, other), 0);
      const visible = Math.max(0, 1 - covered / (item.width * item.height));
      const main = foreground[0]!;
      const distance = Math.hypot((item.x + item.width / 2 - main.x - main.width / 2 + width * 0.12) / width,
        (item.y + item.height / 2 - main.y - main.height / 2 + height * 0.18) / height);
      return { item, visible, score: -Math.abs(visible - 0.65) * 0.4 - distance };
    }).filter(candidate => candidate.visible >= 0.3);
    possible.sort((a, b) => b.score - a.score);
    if (!possible[0]) return null;
    result.push(possible[0].item);
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
    return { assetId: source.assetId, variant: source.variant,
      x: placed.x, y: placed.y, scale: placed.scale, rotation: 0 };
  });
  return { width, height, items, background: "pale" };
}
