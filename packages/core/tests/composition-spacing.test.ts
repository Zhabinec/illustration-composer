import { describe, expect, it } from "vitest";
import { spaceCompositionObjects } from "../src/index.js";
import type { CompositionBox } from "../src/index.js";

const primary: CompositionBox = {
  id: "primary", name: "Монета", x: 100, y: 100, width: 500, height: 400, role: "main", kind: "primary"
};
const secondary: CompositionBox = {
  id: "secondary", name: "Кошелёк", x: 400, y: 200, width: 250, height: 200, role: "main", kind: "secondary"
};

function overlaps(a: CompositionBox, b: CompositionBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("Composition spacing", () => {
  it("moves a supporting main object to free space without shrinking the primary", () => {
    const result = spaceCompositionObjects({ width: 1000, height: 800 }, [primary, secondary]);
    expect(result[0]).toEqual({ ...primary, scale: 1 });
    expect(result[1]?.scale).toBe(1);
    expect(overlaps(result[0]!, result[1]!)).toBe(false);
    expect(secondary.x).toBe(400);
  });

  it("leaves overlapping backgrounds and decoration in their original places", () => {
    const background = { ...secondary, role: "background" as const };
    const decor = { ...secondary, id: "decor", kind: "decoration" as const };
    expect(spaceCompositionObjects({ width: 1000, height: 800 }, [primary, background, decor]))
      .toEqual([primary, background, decor].map(item => ({ ...item, scale: 1 })));
  });

  it("proposes a smaller object when moving at full size cannot resolve the overlap", () => {
    const anchor = { ...primary, x: 20, y: 20, width: 760, height: 760 };
    const supporting = { ...secondary, x: 500, y: 500, width: 400, height: 400 };
    const result = spaceCompositionObjects({ width: 1000, height: 1000 }, [anchor, supporting]);
    expect(result[1]!.scale).toBeLessThan(1);
    expect(overlaps(result[0]!, result[1]!)).toBe(false);
    expect(result[1]!.x + result[1]!.width).toBeLessThanOrEqual(1000);
    expect(result[1]!.y + result[1]!.height).toBeLessThanOrEqual(1000);
  });

  it("avoids all preceding main objects, including on a vertical canvas", () => {
    const boxes = [
      { ...primary, x: 70, y: 100, width: 500, height: 500 },
      { ...secondary, x: 350, y: 350 },
      { ...secondary, id: "third", x: 350, y: 400 }
    ];
    const result = spaceCompositionObjects({ width: 800, height: 1200 }, boxes);
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) expect(overlaps(result[i]!, result[j]!)).toBe(false);
    }
  });

  it("reports a layout with no usable free area instead of hiding an object", () => {
    expect(() => spaceCompositionObjects({ width: 800, height: 800 }, [
      { ...primary, x: 0, y: 0, width: 800, height: 800 }, secondary
    ])).toThrow("Нет свободного места");
  });

  it("rejects non-finite geometry", () => {
    expect(() => spaceCompositionObjects({ width: 1000, height: 800 }, [{ ...primary, width: NaN }]))
      .toThrow("Invalid composition object bounds");
  });
});
