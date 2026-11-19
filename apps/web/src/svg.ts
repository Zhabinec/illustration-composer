import { sourceColors, type ColorPalette, type ColorRole } from "@illustration-composer/core";
import { findVariant, elementHeight, type Scene, type SceneElement, type VectorAsset, type VectorVariant } from "./model";

const namespace = "http://www.w3.org/2000/svg";
const allowed = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "defs", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "use", "symbol", "title", "desc"]);

export function parseVector(svg: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.querySelector("parsererror") || root.localName !== "svg" || root.namespaceURI !== namespace) {
    throw new Error("Файл должен содержать корректный SVG.");
  }
  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (!allowed.has(element.localName)) throw new Error("SVG содержит неподдерживаемый слой " + element.localName + ".");
    for (const attribute of [...element.attributes]) {
      const name = attribute.localName.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on") || (name === "href" && !/^#[\w:.-]+$/.test(value)) ||
          /url\s*\(/i.test(value) && !/^url\(\s*["']?#[\w:.-]+["']?\s*\)$/i.test(value)) {
        throw new Error("SVG содержит внешнюю ссылку или активное содержимое.");
      }
      if (name === "style") throw new Error("Для импорта SVG сохраните стили в атрибутах fill и stroke.");
    }
  }
  return document.importNode(root, true) as unknown as SVGSVGElement;
}

export function importedVariant(svg: string): VectorVariant {
  const node = parseVector(svg);
  const viewBox = node.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const width = viewBox?.[2] ?? Number(node.getAttribute("width"));
  const height = viewBox?.[3] ?? Number(node.getAttribute("height"));
  if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 100000)) {
    throw new Error("У SVG должны быть положительные размеры или viewBox.");
  }
  return { id: crypto.randomUUID(), size: "L", role: "main", width, height, svg: new XMLSerializer().serializeToString(node) };
}

export function artwork(variant: VectorVariant, palette: ColorPalette, prefix: string): SVGSVGElement {
  const svg = parseVector(variant.svg);
  const ids = new Map<string, string>();
  for (const node of svg.querySelectorAll("[id]")) {
    const id = node.getAttribute("id")!;
    const unique = prefix + "-" + ids.size;
    ids.set(id, unique);
    node.setAttribute("id", unique);
  }
  const colors = new Map(Object.entries(sourceColors).map(([role, hex]) => [hex.toUpperCase(), palette.colors[role as ColorRole]]));
  for (const node of [svg, ...svg.querySelectorAll("*")]) {
    for (const attribute of [...node.attributes]) {
      let value = attribute.value.replace(/url\(["']?#([^)"']+)["']?\)/g,
        (_match, id: string) => "url(#" + (ids.get(id) ?? id) + ")");
      if (attribute.localName === "href" && value.startsWith("#")) value = "#" + (ids.get(value.slice(1)) ?? value.slice(1));
      if (["fill", "stroke", "stop-color"].includes(attribute.name)) value = colors.get(value.toUpperCase()) ?? value;
      node.setAttributeNS(attribute.namespaceURI, attribute.name, value);
    }
  }
  svg.setAttribute("width", String(variant.width));
  svg.setAttribute("height", String(variant.height));
  svg.setAttribute("overflow", "visible");
  return svg;
}

export function transform(element: SceneElement, variant: VectorVariant): string {
  const height = elementHeight(element, variant);
  const scale = element.width / variant.width;
  return `translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width / 2} ${height / 2}) scale(${scale})`;
}

export function sceneSvg(scene: Scene, assets: readonly VectorAsset[], palette: ColorPalette): SVGSVGElement {
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("xmlns", namespace);
  svg.setAttribute("width", String(scene.width));
  svg.setAttribute("height", String(scene.height));
  svg.setAttribute("viewBox", `0 0 ${scene.width} ${scene.height}`);
  svg.setAttribute("overflow", "hidden");
  if (scene.background !== "transparent") {
    const rect = document.createElementNS(namespace, "rect");
    rect.setAttribute("width", String(scene.width));
    rect.setAttribute("height", String(scene.height));
    rect.setAttribute("fill", scene.background.startsWith("#") ? scene.background : palette.colors[scene.background as ColorRole]);
    svg.append(rect);
  }
  for (const element of scene.elements) {
    const variant = findVariant(assets, element);
    const group = document.createElementNS(namespace, "g");
    group.dataset.element = element.id;
    group.setAttribute("id", element.id);
    group.setAttribute("aria-label", element.name);
    group.setAttribute("transform", transform(element, variant));
    group.append(artwork(variant, palette, element.id));
    svg.append(group);
  }
  return svg;
}

export function downloadText(text: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
