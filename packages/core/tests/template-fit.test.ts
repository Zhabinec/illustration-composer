import { describe, expect, it } from "vitest";
import { fitCompositionTemplate, scaleCompositionTemplate } from "../src/index.js";

describe("Template fitting", () => {
  it("keeps the original canvas unchanged", () => {
    expect(fitCompositionTemplate({ width: 1000, height: 1000 }, { width: 1000, height: 1000 }))
      .toEqual({ scale: 1, x: 0, y: 0 });
  });

  it.each([
    [{ width: 1200, height: 800 }, { scale: 0.8, x: 200, y: 0 }],
    [{ width: 800, height: 1200 }, { scale: 0.8, x: 0, y: 200 }]
  ])("fits without stretching or cropping on %o", (target, expected) => {
    expect(fitCompositionTemplate({ width: 1000, height: 1000 }, target)).toEqual(expected);
  });

  it.each([0, -1, NaN, Infinity])("rejects invalid dimensions %s", width => {
    expect(() => fitCompositionTemplate({ width, height: 1000 }, { width: 800, height: 1200 }))
      .toThrow("Invalid template or canvas dimensions");
    expect(() => fitCompositionTemplate({ width: 1000, height: 1000 }, { width: 800, height: width }))
      .toThrow("Invalid template or canvas dimensions");
  });
});

describe("Template canvas scaling", () => {
  it.each([0.5, 1, 1.5, 2])("scales the artwork and square canvas together at %s", scale => {
    expect(scaleCompositionTemplate({ width: 1000, height: 1000 }, scale))
      .toEqual({ width: 1000 * scale, height: 1000 * scale });
  });

  it("preserves a rectangular source's original aspect ratio", () => {
    expect(scaleCompositionTemplate({ width: 1200, height: 800 }, 0.5))
      .toEqual({ width: 600, height: 400 });
  });

  it.each([0, -1, NaN, Infinity])("rejects an invalid scale %s", scale => {
    expect(() => scaleCompositionTemplate({ width: 1000, height: 1000 }, scale)).toThrow("Invalid template scale");
  });
});
