import { describe, expect, it } from "vitest";
import { AssetId, tryCreateSurfaceComposition } from "../src/index.js";
import type { CompositionSource, SurfaceReference } from "../src/index.js";

const book: CompositionSource = { assetId: AssetId.create("book"), width: 1400, height: 1000,
  variant: { size: "L", role: "main", resourceKey: "book-main" } };
const phone: CompositionSource = { assetId: AssetId.create("phone"), width: 600, height: 400,
  variant: { size: "L", role: "main", resourceKey: "phone-main" } };
const reference: SurfaceReference = { supportIndex: 0, subjectIndex: 1, supportAspect: 1.4,
  surface: { x: 0.5, y: 0.16, width: 0.28, height: 0.24 },
  subject: { x: 0.3, y: 0.15, width: 0.5, height: 0.45 } };

describe("surface relationship", () => {
  it.each([[1200, 800], [1000, 1000], [800, 1200]])("keeps intentional overlap, proportions and complete objects on %s × %s", (width, height) => {
    const sources = [book, phone];
    const before = JSON.stringify(sources);
    const scene = tryCreateSurfaceComposition(width, height, sources, reference)!;
    expect(scene).not.toBeNull();
    expect(scene.width).toBe(width);
    expect(scene.height).toBe(height);
    const [support, subject] = scene.items;
    expect(subject!.zIndex).toBeGreaterThan(support!.zIndex!);
    expect(subject!.x).toBeGreaterThan(support!.x);
    expect(subject!.x + phone.width * subject!.scale).toBeLessThan(support!.x + book.width * support!.scale);
    expect(subject!.x).toBeGreaterThanOrEqual(support!.x + reference.surface.x * book.width * support!.scale - 0.001);
    expect(subject!.y).toBeGreaterThanOrEqual(support!.y + reference.surface.y * book.height * support!.scale - 0.001);
    expect(subject!.x + phone.width * subject!.scale).toBeLessThanOrEqual(
      support!.x + (reference.surface.x + reference.surface.width) * book.width * support!.scale + 0.001);
    expect(subject!.y + phone.height * subject!.scale).toBeLessThanOrEqual(
      support!.y + (reference.surface.y + reference.surface.height) * book.height * support!.scale + 0.001);
    scene.items.forEach((item, index) => {
      expect(item.variant).toBe(sources[index]!.variant);
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.x + sources[index]!.width * item.scale).toBeLessThanOrEqual(width);
      expect(item.y + sources[index]!.height * item.scale).toBeLessThanOrEqual(height);
    });
    expect(JSON.stringify(sources)).toBe(before);
  });

  it("keeps the subject on top when request order is reversed", () => {
    const scene = tryCreateSurfaceComposition(1000, 1000, [phone, book], { ...reference, supportIndex: 1, subjectIndex: 0 })!;
    expect(scene.items.map(item => item.assetId.value)).toEqual(["phone", "book"]);
    expect(scene.items[0]!.zIndex).toBe(1);
    expect(scene.items[1]!.zIndex).toBe(0);
  });

  it("rejects incompatible silhouettes, altered support proportions and background sources", () => {
    expect(tryCreateSurfaceComposition(1000, 1000, [book, { ...phone, width: 30 }], reference)).toBeNull();
    expect(tryCreateSurfaceComposition(1000, 1000, [{ ...book, height: 400 }, phone], reference)).toBeNull();
    expect(tryCreateSurfaceComposition(1000, 1000, [book, { ...phone, variant: { ...phone.variant, role: "background" } }], reference)).toBeNull();
  });

  it("rejects a reference without overlap and never silently drops extra objects", () => {
    expect(tryCreateSurfaceComposition(1000, 1000, [book, phone], { ...reference, subject: { ...reference.subject, x: 2 } })).toBeNull();
    expect(tryCreateSurfaceComposition(1000, 1000, [book, phone, phone], reference)).toBeNull();
    expect(tryCreateSurfaceComposition(1000, 1000, [book, phone], { ...reference, subject: { ...reference.subject, x: 0.95 } })).toBeNull();
  });

  it("rejects invalid geometry and slot indices", () => {
    expect(tryCreateSurfaceComposition(0, 1000, [book, phone], reference)).toBeNull();
    expect(tryCreateSurfaceComposition(1000, 1000, [book, phone], { ...reference, subjectIndex: 0 })).toBeNull();
    expect(tryCreateSurfaceComposition(1000, 1000, [book, phone], { ...reference, subjectIndex: 4 })).toBeNull();
    expect(tryCreateSurfaceComposition(1000, 1000, [book, phone], { ...reference, subject: { ...reference.subject, x: NaN } })).toBeNull();
    expect(tryCreateSurfaceComposition(1000, 1000, [book, phone], { ...reference, surface: { ...reference.surface, x: 2 } })).toBeNull();
  });
});
