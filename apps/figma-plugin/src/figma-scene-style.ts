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
  applyBackground(scene, fills, palette);
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
      const scale = Math.min(scene.width / source.width, scene.height / source.height);
      const offsetX = (scene.width - source.width * scale) / 2;
      const offsetY = (scene.height - source.height * scale) / 2;
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
    if (mode !== "decor") applyBackground(scene, source.fills, palette);
    for (const node of previous) node.remove();
  } catch (error) {
    decor?.remove();
    throw error;
  }
}
