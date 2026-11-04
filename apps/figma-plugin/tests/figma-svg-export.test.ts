import { afterEach, describe, expect, it, vi } from "vitest";
import { assertVectorSvg, exportSelectedComposition, normalizeSvgLayerIds } from "../src/figma-svg-export.js";

const svg = '<svg width="1200" height="800"><g id="Монета"><path d="M0 0h10v10z" fill="url(#paint)"/></g><defs><linearGradient id="paint"/></defs></svg>';
function environment(options: { paint?: string; svg?: string; importedWidth?: number; importError?: boolean } = {}) {
  const vector = { id: "v", name: "Монета", type: "VECTOR", fills: [{ type: options.paint ?? "SOLID" }] };
  const source = {
    id: "frame", name: 'Сцена: Монета/Кошелёк', type: "FRAME", width: 1200, height: 800,
    children: [vector], findAll: () => [vector], exportAsync: vi.fn(async () => new TextEncoder().encode(options.svg ?? svg))
  };
  const imported = {
    ...source, id: "roundtrip", width: options.importedWidth ?? 1200, remove: vi.fn()
  };
  const createNodeFromSvg = vi.fn(() => {
    if (options.importError) throw new Error("import failed");
    return imported;
  });
  const currentPage = { selection: [source] };
  vi.stubGlobal("figma", { currentPage, createNodeFromSvg });
  return { source, imported, createNodeFromSvg, currentPage };
}
afterEach(() => vi.unstubAllGlobals());

describe("Vector SVG export", () => {
  it("repairs UTF-8 layer IDs emitted as Latin-1, including their internal references", () => {
    const broken = Array.from(new TextEncoder().encode("Монета"), byte => String.fromCharCode(byte)).join("");
    expect(normalizeSvgLayerIds(`<svg><g id="${broken}"><path mask="url(#${broken})"/></g><use href="#${broken}"/></svg>`))
      .toBe('<svg><g id="Монета"><path mask="url(#Монета)"/></g><use href="#Монета"/></svg>');
  });
  it("preserves valid Cyrillic and Latin-1 layer IDs", () => {
    const original = '<svg><g id="Монета"/><g id="Müller"/><path fill="url(#paint)"/></svg>';
    expect(normalizeSvgLayerIds(original)).toBe(original);
  });
  it("uses vector export settings and verifies the SVG by importing it, then removes the temporary node", async () => {
    const { source, imported, createNodeFromSvg, currentPage } = environment();
    const result = await exportSelectedComposition([]);
    expect(source.exportAsync).toHaveBeenCalledWith({ format: "SVG", contentsOnly: true,
      svgIdAttribute: true, svgSimplifyStroke: false, useAbsoluteBounds: false });
    expect(createNodeFromSvg).toHaveBeenCalledWith(svg);
    expect(imported.remove).toHaveBeenCalledOnce();
    expect(currentPage.selection).toEqual([source]);
    expect(result).toEqual({ svg, filename: "Сцена- Монета-Кошелёк.svg", width: 1200, height: 800, vectorCount: 1 });
  });
  it("rejects raster source fills before calling export", async () => {
    const { source } = environment({ paint: "IMAGE" });
    await expect(exportSelectedComposition([])).rejects.toThrow("заливку");
    expect(source.exportAsync).not.toHaveBeenCalled();
  });
  it("rejects registered palette resources as compositions", async () => {
    const { source } = environment();
    await expect(exportSelectedComposition(["v"])).rejects.toThrow("Ресурс палитры");
    expect(source.exportAsync).not.toHaveBeenCalled();
  });
  it("does not export an empty or multiple selection", async () => {
    const { currentPage, source } = environment();
    currentPage.selection = [];
    await expect(exportSelectedComposition([])).rejects.toThrow("Выдели один");
    currentPage.selection = [source, source];
    await expect(exportSelectedComposition([])).rejects.toThrow("Выдели один");
  });
  it("cleans up a failed round trip without offering a download", async () => {
    const { imported } = environment({ importedWidth: 1100 });
    await expect(exportSelectedComposition([])).rejects.toThrow("Размер");
    expect(imported.remove).toHaveBeenCalledOnce();
  });
  it("propagates import errors", async () => {
    environment({ importError: true });
    await expect(exportSelectedComposition([])).rejects.toThrow("import failed");
  });
  it.each([
    '<svg><image href="data:image/png;base64,abc"/></svg>',
    '<svg><path/><feImage href="#vector"/></svg>',
    '<svg><foreignObject/></svg>', '<svg><script/></svg>',
    '<svg><path fill="url(https://example.com/a.svg)"/></svg>',
    '<svg><use xlink:href="https://example.com/a.svg#id"/></svg>',
    '<svg><x:image/></svg>', '<svg></svg>'
  ])("rejects raster or unsupported SVG: %s", value => {
    expect(() => assertVectorSvg(value)).toThrow();
  });
  it("permits internal vector masks, gradients and use references", () => {
    expect(() => assertVectorSvg('<svg><use href="#coin"/><path fill="url(\'#gradient\')" mask="url(&quot;#mask&quot;)"/></svg>')).not.toThrow();
    expect(() => assertVectorSvg('<svg><use href="#coin"/><path fill="url(\'#gradient\')" mask="url(#mask)"/></svg>')).not.toThrow();
  });
});
