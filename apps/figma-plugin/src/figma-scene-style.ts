import { sourceColors } from "@illustration-composer/core";
import type { ColorPalette } from "@illustration-composer/core";
import { discoverExampleTemplates } from "./figma-example-templates.js";
import { getTemplateSlots } from "./figma-template-slots.js";
import { assertVectorContent } from "./figma-vector-composition.js";
import { FigmaPaletteAdapter } from "./figma-palette-adapter.js";

const namespace = "illustrationComposer";

export function referenceDecor(source: FrameNode): (LineNode | GroupNode | FrameNode)[] {
  const named = new Set(getTemplateSlots(source).filter(slot => slot.kind === "decoration").map(slot => slot.id));
  return source.children.filter((node): node is LineNode | GroupNode | FrameNode => node.visible &&
    (node.type === "LINE" || ((node.type === "GROUP" || node.type === "FRAME") && named.has(node.id))) && !node.isMask);
}

export function setSceneBackground(scene: FrameNode, choice: unknown, palette: ColorPalette): void {
  if (choice !== "pale" && choice !== "light" && choice !== "white" && choice !== "transparent") {
    throw new Error("Выберите фон холста.");
  }
  const hex = choice === "pale" || choice === "light" ? sourceColors[choice] : "#FFFFFF";
  const fills: Paint[] = choice === "transparent" ? [] : [{ type: "SOLID", color: {
    r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255
  } }];
  const content = scene.children.find(node => node.id === scene.getSharedPluginData(namespace, "template-content"));
  applyBackground(content?.type === "FRAME" ? content : scene, fills, palette);
}

function applyBackground(frame: FrameNode, fills: readonly Paint[], palette: ColorPalette): void {
  frame.fills = fills;
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

export async function addAutomaticDecoration(scene: FrameNode, paletteSourceIds: readonly string[], palette: ColorPalette): Promise<void> {
  const { templates } = await discoverExampleTemplates(paletteSourceIds);
  const foreground = scene.children.flatMap(node => node.absoluteBoundingBox ? [node.absoluteBoundingBox] : []);
  const canvas = scene.absoluteBoundingBox;
  if (!canvas) return;
  let best: { source: FrameNode; score: number } | undefined;
  for (const template of templates) {
    const source = await figma.getNodeByIdAsync(template.sourceNodeId);
    if (source?.type !== "FRAME") continue;
    const sourceBounds = source.absoluteBoundingBox;
    if (!sourceBounds) continue;
    const { scale, offsetX, offsetY } = decorationFit(scene, source);
    const marks = referenceDecor(source).flatMap(node => node.type === "LINE" ? [node] :
      node.findAll(child => child.visible && !("children" in child)));
    if (!marks.length) continue;
    const visible = marks.filter(mark => {
      const bounds = mark.absoluteBoundingBox;
      if (!bounds) return false;
      // Sample along long marks as well as at their centers.
      return [0.2, 0.5, 0.8].filter(fraction => {
        const x = canvas.x + offsetX + (bounds.x - sourceBounds.x + bounds.width * fraction) * scale;
        const y = canvas.y + offsetY + (bounds.y - sourceBounds.y + bounds.height * fraction) * scale;
        return x >= canvas.x && x <= canvas.x + canvas.width && y >= canvas.y && y <= canvas.y + canvas.height &&
          !foreground.some(box => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height);
      }).length >= 2;
    }).length;
    if (visible / marks.length < 0.5) continue;
    const formatDistance = Math.abs(Math.log(source.width / source.height / (scene.width / scene.height)));
    const score = visible / marks.length - formatDistance * 0.8 + Math.min(visible, 5) * 0.12;
    if (!best || score > best.score) best = { source, score };
  }
  if (best) copyReferenceStyle(scene, best.source, "decor", palette);
}

function decorationFit(scene: FrameNode, source: FrameNode) {
  const scale = Math.min(scene.width / source.width, scene.height / source.height);
  return { scale, offsetX: (scene.width - source.width * scale) / 2, offsetY: (scene.height - source.height * scale) / 2 };
}

function copyReferenceStyle(scene: FrameNode, source: FrameNode, mode: "both" | "background" | "decor", palette: ColorPalette): void {
  const layers = mode === "background" ? [] : referenceDecor(source);
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
      const { scale, offsetX, offsetY } = decorationFit(scene, source);
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
