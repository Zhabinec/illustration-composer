import { assertVectorComposition } from "./figma-vector-composition.js";

export function normalizeSvgLayerIds(svg: string): string {
  const replacements = new Map<string, string>();
  const result = svg.replace(/(\s+id=")([^"]*)(")/g, (attribute, prefix: string, id: string, suffix: string) => {
    if (!Array.from(id).every(character => character.charCodeAt(0) <= 255)) return attribute;
    try {
      const decoded = decodeURIComponent(Array.from(id, character =>
        `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
      if (decoded !== id) replacements.set(id, decoded);
      return prefix + decoded + suffix;
    } catch {
      return attribute;
    }
  });
  return result.replace(/(href=["']#|url\(["']?#)([^"')]+)(["']?\)?)/g,
    (reference, prefix: string, id: string, suffix: string) =>
      replacements.has(id) ? prefix + replacements.get(id) + suffix : reference);
}

export function assertVectorSvg(svg: string): void {
  const references = svg.replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  if (!/<svg\b/i.test(svg) || !/<(?:path|rect|circle|ellipse|polygon|polyline|line|use)\b/i.test(svg)) {
    throw new Error("Экспорт не содержит векторной геометрии.");
  }
  if (/<(?:[\w-]+:)?(?:image|feImage|foreignObject|script)\b/i.test(svg) ||
      /(?:href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)[^\s"')])/i.test(references)) {
    throw new Error("SVG содержит растровый или внешний ресурс. Экспорт остановлен.");
  }
}

export async function exportSelectedComposition(paletteSourceIds: readonly string[]) {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1 || !selection[0]) {
    throw new Error("Выдели один фрейм или группу готовой композиции для экспорта.");
  }
  const source = selection[0];
  assertVectorComposition(source);
  if ([source, ...source.findAll(() => true)].some(node => paletteSourceIds.includes(node.id))) {
    throw new Error("Ресурс палитры нельзя экспортировать как композицию.");
  }
  const bytes = await source.exportAsync({
    format: "SVG", contentsOnly: true, svgIdAttribute: true,
    svgSimplifyStroke: false, useAbsoluteBounds: false
  });
  const svg = normalizeSvgLayerIds(decodeURIComponent(Array.from(bytes, byte => `%${byte.toString(16).padStart(2, "0")}`).join("")));
  assertVectorSvg(svg);
  const imported = figma.createNodeFromSvg(svg);
  try {
    assertVectorComposition(imported);
    if (Math.abs(imported.width - source.width) > 0.1 || Math.abs(imported.height - source.height) > 0.1) {
      throw new Error("Размер после повторного импорта SVG отличается от исходного. Экспорт остановлен.");
    }
    const geometry = imported.findAll(node => ["VECTOR", "BOOLEAN_OPERATION", "RECTANGLE", "ELLIPSE", "POLYGON", "STAR", "LINE"].includes(node.type));
    if (!geometry.length) throw new Error("После импорта SVG не осталось редактируемых векторных элементов.");
    const filename = source.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim().slice(0, 120) || "composition";
    return { svg, filename: `${filename}.svg`, width: source.width, height: source.height, vectorCount: geometry.length };
  } finally {
    imported.remove();
  }
}
