import { sourceColors } from "@illustration-composer/core";
import type { ColorPalette } from "@illustration-composer/core";
import { discoverExampleTemplates } from "./figma-example-templates.js";
import { getTemplateSlots } from "./figma-template-slots.js";
import { assertVectorContent } from "./figma-vector-composition.js";
import { FigmaPaletteAdapter } from "./figma-palette-adapter.js";

const namespace = "illustrationComposer";
type DecorationLayer = LineNode | GroupNode | FrameNode | EllipseNode | VectorNode;
interface DecorationFit { scale: number; offsetX: number; offsetY: number }

export function referenceDecor(source: FrameNode): DecorationLayer[] {
  const named = new Set(getTemplateSlots(source).filter(slot => slot.kind === "decoration").map(slot => slot.id));
  const small = (node: SceneNode) => node.width <= source.width * 0.14 && node.height <= source.height * 0.14;
  return source.children.filter((node): node is DecorationLayer => node.visible && "isMask" in node && !node.isMask &&
    (node.type === "LINE" || node.type === "ELLIPSE" ||
      (node.type === "VECTOR" && (isDecorationLine(node) || small(node))) ||
      ((node.type === "GROUP" || node.type === "FRAME") && named.has(node.id)) ||
      (node.type === "GROUP" && /^group(?:\s+\d+)?$/i.test(node.name.trim()) && small(node) &&
        node.children.length > 1 && node.children.every(child => child.type === "ELLIPSE" || child.type === "VECTOR"))));
}

function isDecorationLine(node: DecorationLayer): boolean {
  return node.type === "LINE" || (node.type === "VECTOR" && /^(line|линия)(?:\s+\d+)?$/i.test(node.name.trim()));
}

export function decorationLabel(node: DecorationLayer): { type: string; name: string } {
  if (isDecorationLine(node)) return { type: "Линии", name: "Линия" };
  if (node.type === "ELLIPSE" || node.type === "VECTOR") return { type: "Точки", name: "Точка" };
  return { type: "Конфетти", name: "Конфетти" };
}

export function setSceneBackground(scene: FrameNode, choice: unknown, palette: ColorPalette): void {
  const customHex = typeof choice === "string" && /^#[0-9a-f]{6}$/i.test(choice) ? choice : undefined;
  if (!customHex && choice !== "pale" && choice !== "light" && choice !== "white" && choice !== "transparent") {
    throw new Error("Выберите фон холста.");
  }
  const hex = customHex ?? (choice === "pale" || choice === "light" ? sourceColors[choice] : "#FFFFFF");
  const fills: Paint[] = choice === "transparent" ? [] : [{ type: "SOLID", color: {
    r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255
  } }];
  const content = scene.children.find(node => node.id === scene.getSharedPluginData(namespace, "template-content"));
  const frame = content?.type === "FRAME" ? content : scene;
  if (customHex) {
    frame.fills = fills;
    frame.setSharedPluginData(namespace, "fixed-background", "1");
  } else {
    applyBackground(frame, fills, palette);
  }
}

function applyBackground(frame: FrameNode, fills: readonly Paint[], palette: ColorPalette): void {
  frame.fills = fills;
  frame.setSharedPluginData(namespace, "fixed-background", "");
  frame.setSharedPluginData(namespace, "fills-roles", "");
  new FigmaPaletteAdapter().applyToSurface(frame, palette);
}

export async function listReferenceStyles(paletteSourceIds: readonly string[]) {
  const { templates } = await discoverExampleTemplates(paletteSourceIds);
  return templates.map(({ sourceNodeId, name }) => ({ id: sourceNodeId, name }));
}

export async function applyReferenceStyle(
  scene: FrameNode, sourceId: string, mode: unknown, paletteSourceIds: readonly string[], palette: ColorPalette
): Promise<void> {
  if (mode !== "both" && mode !== "background" && mode !== "decor") throw new Error("Выберите, что перенести из примера.");
  if (scene.getSharedPluginData(namespace, "template-content")) throw new Error("Вариация использует декор своего шаблона.");
  const style = (await listReferenceStyles(paletteSourceIds)).find(item => item.id === sourceId);
  if (!style) throw new Error("Выберите исходный пример оформления.");
  const source = await figma.getNodeByIdAsync(style.id);
  if (source?.type !== "FRAME" || !Array.isArray(source.fills)) throw new Error("Фон примера недоступен.");
  copyReferenceStyle(scene, source, mode, palette);
}

export async function addChosenDecoration(
  scene: FrameNode, entries: unknown, paletteSourceIds: readonly string[], palette: ColorPalette
): Promise<void> {
  if (!Array.isArray(entries) || !entries.length || entries.length > 12) throw new Error("Добавьте от 1 до 12 украшений.");
  const { templates } = await discoverExampleTemplates(paletteSourceIds);
  const sources = new Map<string, FrameNode>();
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== "object" || typeof entry.sourceId !== "string" || typeof entry.layerId !== "string") {
      throw new Error("Выберите украшение из библиотеки.");
    }
    const coordinate = (value: unknown, min: number, max = Infinity) => {
      if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        throw new Error("Проверьте положение, масштаб и поворот декора.");
      }
      return value;
    };
    let source = sources.get(entry.sourceId);
    if (!source && templates.some(template => template.sourceNodeId === entry.sourceId)) {
      const node = await figma.getNodeByIdAsync(entry.sourceId);
      if (node?.type === "FRAME") {
        source = node;
        sources.set(entry.sourceId, source);
      }
    }
    const layer = source && referenceDecor(source).find(item => item.id === entry.layerId);
    if (!source || !layer) throw new Error("Это украшение больше недоступно.");
    assertVectorContent(layer);
    const fit = decorationFit(scene, source);
    const [[a, c, x], [b, d, y]] = layer.relativeTransform;
    const centerX = fit.offsetX + fit.scale * (x + a * layer.width / 2 + c * layer.height / 2);
    const centerY = fit.offsetY + fit.scale * (y + b * layer.width / 2 + d * layer.height / 2);
    const positionX = entry.x === undefined ? undefined : coordinate(entry.x, -10000, 10000);
    const positionY = entry.y === undefined ? undefined : coordinate(entry.y, -10000, 10000);
    const scale = fit.scale * (coordinate(entry.scale, 25) / 100);
    const rotation = coordinate(entry.rotation, -180, 180);
    const copy = layer.clone();
    scene.insertChild(index, copy);
    copy.name = `Декор · ${layer.name}`;
    copy.setSharedPluginData(namespace, "composition-role", "background");
    copy.rescale(scale);
    copy.relativeTransform = [[a, c, 0], [b, d, 0]];
    copy.rotation += rotation;
    const [[ra, rc], [rb, rd]] = copy.relativeTransform;
    copy.x = positionX ?? (centerX - ra * copy.width / 2 - rc * copy.height / 2);
    copy.y = positionY ?? (centerY - rb * copy.width / 2 - rd * copy.height / 2);
    new FigmaPaletteAdapter().apply(copy, palette);
  }
}

export async function addAutomaticDecoration(scene: FrameNode, paletteSourceIds: readonly string[], palette: ColorPalette): Promise<void> {
  const { templates } = await discoverExampleTemplates(paletteSourceIds);
  const foreground = scene.children.flatMap(node => node.absoluteBoundingBox ? [node.absoluteBoundingBox] : []);
  const canvas = scene.absoluteBoundingBox;
  if (!canvas) return;
  let best: { source: FrameNode; layers: DecorationLayer[]; fit: DecorationFit; score: number } | undefined;
  for (const template of templates) {
    const source = await figma.getNodeByIdAsync(template.sourceNodeId);
    if (source?.type !== "FRAME") continue;
    const sourceBounds = source.absoluteBoundingBox;
    if (!sourceBounds) continue;
    const layers = referenceDecor(source);
    if (!layers.length) continue;
    const formatDistance = Math.abs(Math.log(source.width / source.height / (scene.width / scene.height)));
    const samples = layers.map(layer => ({ layer, points: decorationSamples(layer) }));
    for (const factor of [1, 0.82]) {
      const fit = decorationFit(scene, source, factor);
      for (const [dx, dy] of [[0, 0], [-0.12, 0], [0.12, 0], [0, -0.12], [0, 0.12]]) {
        const placement = { ...fit, offsetX: fit.offsetX + dx! * scene.width, offsetY: fit.offsetY + dy! * scene.height };
        const visible = samples.flatMap(({ layer, points }) => {
          const count = points.filter(point => {
            const x = canvas.x + placement.offsetX + (point.x - sourceBounds.x) * placement.scale;
            const y = canvas.y + placement.offsetY + (point.y - sourceBounds.y) * placement.scale;
            return x >= canvas.x && x <= canvas.x + canvas.width && y >= canvas.y && y <= canvas.y + canvas.height &&
              !foreground.some(box => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height);
          }).length;
          return count && count / points.length >= 0.6 ? [{ layer, visibility: count / points.length }] : [];
        });
        if (!visible.length) continue;
        const score = visible.reduce((sum, item) => sum + item.visibility, 0) / visible.length +
          Math.min(visible.length, 4) * 0.25 - formatDistance * 0.45 -
          (1 - factor) * 0.45 - Math.hypot(dx!, dy!) * 0.5;
        if (!best || score > best.score) best = { source, layers: visible.map(item => item.layer), fit: placement, score };
      }
    }
  }
  if (best) copyReferenceStyle(scene, best.source, "decor", palette, best.layers, best.fit);
}

function decorationSamples(layer: DecorationLayer): { x: number; y: number }[] {
  if (isDecorationLine(layer)) {
    const [[a, , x], [b, , y]] = layer.absoluteTransform;
    return [0.1, 0.3, 0.5, 0.7, 0.9].map(fraction => ({
      x: x + a * layer.width * fraction, y: y + b * layer.width * fraction
    }));
  }
  if (!("findAll" in layer)) {
    const box = layer.absoluteBoundingBox;
    return box ? [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] : [];
  }
  return layer.findAll(child => child.visible && !("children" in child)).flatMap(child => {
    const box = child.absoluteBoundingBox;
    return box ? [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] : [];
  });
}

function decorationFit(scene: FrameNode, source: FrameNode, factor = 1): DecorationFit {
  const scale = Math.min(scene.width / source.width, scene.height / source.height) * factor;
  return { scale, offsetX: (scene.width - source.width * scale) / 2, offsetY: (scene.height - source.height * scale) / 2 };
}

function copyReferenceStyle(
  scene: FrameNode, source: FrameNode, mode: "both" | "background" | "decor", palette: ColorPalette,
  layers = mode === "background" ? [] : referenceDecor(source), fit = decorationFit(scene, source)
): void {
  if (mode === "decor" && !layers.length) throw new Error("В этом примере нет отдельного декора.");
  const previous = mode === "background" ? [] : scene.children.filter(node => node.getSharedPluginData(namespace, "reference-decor") === "1");
  const decor = layers.length ? figma.createFrame() : null;
  try {
    if (decor) {
      decor.name = "Декор из примера";
      decor.fills = [];
      decor.clipsContent = false;
      decor.resizeWithoutConstraints(scene.width, scene.height);
      decor.setSharedPluginData(namespace, "reference-decor", "1");
      decor.setSharedPluginData(namespace, "composition-role", "background");
      scene.insertChild(0, decor);
      decor.x = 0;
      decor.y = 0;
      const { scale, offsetX, offsetY } = fit;
      for (const layer of layers) {
        assertVectorContent(layer);
        const copy = layer.clone();
        decor.appendChild(copy);
        const [[a, c, x], [b, d, y]] = layer.relativeTransform;
        copy.rescale(scale);
        copy.relativeTransform = [[a, c, x * scale + offsetX], [b, d, y * scale + offsetY]];
      }
      new FigmaPaletteAdapter().apply(decor, palette);
    }
    if (mode !== "decor" && Array.isArray(source.fills)) applyBackground(scene, source.fills, palette);
    for (const node of previous) node.remove();
  } catch (error) {
    decor?.remove();
    throw error;
  }
}
