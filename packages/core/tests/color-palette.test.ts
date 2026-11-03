
import { describe, expect, it } from "vitest";

import {
  getReplacementColor,
  resolvePalette
} from "../src/index.js";

describe("Color palettes", () => {
  it("resolves built-in palettes", () => {
    const mint = resolvePalette("mint");
    const peach = resolvePalette("peach");

    expect(
      getReplacementColor("#7864D7", mint)
    ).toBe("#5ABEBE");

    expect(
      getReplacementColor("#D7CDF5", mint)
    ).toBe("#BEEBEB");

    expect(
      getReplacementColor("#7864D7", peach)
    ).toBe("#D27532");
  });

  it("preserves colors outside mapped roles", () => {
    const palette = resolvePalette("mint");

    expect(
      getReplacementColor("#181817", palette)
    ).toBeUndefined();

    expect(
      getReplacementColor("#FFFFFF", palette)
    ).toBeUndefined();
  });

  it("accepts a custom palette", () => {
    const palette = resolvePalette({
      name: "Custom",
      dark: "#123456",
      medium: "#789ABC",
      light: "#DDEEFF"
    });

    expect(palette.id).toBe("custom");
    expect(palette.colors.dark).toBe("#123456");
    expect(palette.colors.pink).toBe("#F9A3AA");
  });

  it("rejects invalid palette colors", () => {
    expect(() =>
      resolvePalette({
        name: "Invalid",
        dark: "red",
        medium: "#789ABC",
        light: "#DDEEFF"
      })
    ).toThrow("Invalid palette color");
  });
});
