import { describe, expect, it } from "vitest";
import { palettePresets } from "@illustration-composer/core";
import { preparePaletteImport } from "../src/palette-import.js";

const input = { name: "Моя схема", dark: "#334455", medium: "#8899aa", light: "#ddeeff" };

describe("Document palette import", () => {
  it("normalizes flat and nested palettes without using supplied IDs", () => {
    const flat = preparePaletteImport({ ...input, id: "coin", sourceNodeId: "1:1" }, [], []);
    const nested = preparePaletteImport({ name: input.name, colors: input }, [], []);
    expect(flat).toEqual(nested);
    expect(flat.id).toBe("palette-json-1");
    expect(flat.colors.medium).toBe("#8899AA");
    expect(flat).not.toHaveProperty("sourceNodeId");
    expect(flat.colors.pink).toBe(palettePresets.original!.colors.pink);
  });
  it("allocates a new ID without colliding with palettes or assets", () => {
    const existing = preparePaletteImport(input, [], []);
    expect(preparePaletteImport({ ...input, name: "Другая" }, [existing], ["palette-json-2"]).id).toBe("palette-json-3");
  });
  it("rejects duplicate custom and preset names without changing previous palettes", () => {
    const palettes = [preparePaletteImport(input, [], [])];
    const before = JSON.stringify(palettes);
    expect(() => preparePaletteImport({ ...input, name: " моя  схема " }, palettes, [])).toThrow("уже существует");
    expect(() => preparePaletteImport({ ...input, name: "мятная" }, [], [])).toThrow("уже существует");
    expect(JSON.stringify(palettes)).toBe(before);
  });
  it.each([null, [], "mint", { name: "x" }, { ...input, light: "red" }, { name: "x", colors: [] }])
  ("rejects malformed palettes: %j", value => {
    expect(() => preparePaletteImport(value, [], [])).toThrow();
  });
});
