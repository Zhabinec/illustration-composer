import type { CompositionScene, CompositionSource } from "./row-composition.js";

export interface SurfaceReference {
  supportIndex: number;
  subjectIndex: number;
  supportAspect: number;
  subject: { x: number; y: number; width: number; height: number };
  surface: { x: number; y: number; width: number; height: number };
}

/** Transfers an explicitly identified overlap relationship, never infers a surface from size. */
export function tryCreateSurfaceComposition(
  width: number, height: number, sources: readonly CompositionSource[], reference: SurfaceReference
): CompositionScene | null {
  const support = sources[reference.supportIndex];
  const subject = sources[reference.subjectIndex];
  const slot = reference.subject;
  const surface = reference.surface;
  if (sources.length !== 2 || reference.supportIndex === reference.subjectIndex || !support || !subject ||
    ![width, height, support.width, support.height, subject.width, subject.height,
      reference.supportAspect, slot.width, slot.height, surface.width, surface.height].every(value => Number.isFinite(value) && value > 0) ||
    ![slot.x, slot.y, surface.x, surface.y].every(Number.isFinite) ||
    surface.x < 0 || surface.y < 0 || surface.x + surface.width > 1 || surface.y + surface.height > 1 ||
    support.variant.role !== "main" || subject.variant.role !== "main") return null;
  if (Math.abs(Math.log(support.width / support.height / reference.supportAspect)) > 0.03) return null;
  const referenceOverlap = Math.max(0, Math.min(1, slot.x + slot.width) - Math.max(0, slot.x)) *
    Math.max(0, Math.min(1, slot.y + slot.height) - Math.max(0, slot.y));
  if (referenceOverlap / (slot.width * slot.height) < 0.5) return null;

  const slotWidth = slot.width * support.width;
  const slotHeight = slot.height * support.height;
  const fitScale = Math.min(slotWidth / subject.width, slotHeight / subject.height);
  if (subject.width * subject.height * fitScale ** 2 / (slotWidth * slotHeight) < 0.65) return null;
  const subjectScale = Math.min(fitScale,
    surface.width * support.width / subject.width, surface.height * support.height / subject.height);
  const subjectWidth = subject.width * subjectScale;
  const subjectHeight = subject.height * subjectScale;
  const x = (surface.x + surface.width / 2) * support.width - subjectWidth / 2;
  const y = (surface.y + surface.height / 2) * support.height - subjectHeight / 2;
  const scale = Math.min(width * 0.88 / support.width, height * 0.84 / support.height);
  const offsetX = (width - support.width * scale) / 2;
  const offsetY = (height - support.height * scale) / 2;
  return { width, height, background: "pale", items: sources.map((source, index) => ({
    assetId: source.assetId, variant: source.variant, rotation: 0,
    x: offsetX + (index === reference.subjectIndex ? x * scale : 0),
    y: offsetY + (index === reference.subjectIndex ? y * scale : 0),
    scale: scale * (index === reference.subjectIndex ? subjectScale : 1),
    zIndex: index === reference.subjectIndex ? 1 : 0
  })) };
}
