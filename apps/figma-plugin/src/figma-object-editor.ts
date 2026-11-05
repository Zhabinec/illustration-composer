import { fitCompositionTemplate } from "@illustration-composer/core";
import type { ColorPalette } from "@illustration-composer/core";
import type { EditableObject } from "./figma-scene-editor.js";
import { FigmaAssetAdapter } from "./figma-asset-adapter.js";
import { FigmaPaletteAdapter } from "./figma-palette-adapter.js";
import { assertVectorContent } from "./figma-vector-composition.js";

export function resizeSceneObject(node: EditableObject, width: number): void {
  const scale = width / node.width;
  const height = node.height * scale;
  if (![width, height, node.width, node.height, scale].every(value => Number.isFinite(value) && value > 0) ||
    width < 1 || width > 10000 || height > 10000) {
    throw new Error("Укажите размер предмета от 1 до 10000 пикселей.");
  }
  const oldWidth = node.width, oldHeight = node.height;
  const [[a, c, x], [b, d, y]] = node.relativeTransform;
  node.rescale(scale);
  const dx = (oldWidth - node.width) / 2, dy = (oldHeight - node.height) / 2;
  node.relativeTransform = [[a, c, x + a * dx + c * dy], [b, d, y + b * dx + d * dy]];
}

export async function replaceSceneObject(
  node: EditableObject, adapter: FigmaAssetAdapter, resourceKey: string, name: string, palette: ColorPalette
): Promise<EditableObject> {
  const parent = node.parent;
  if (!parent || (parent.type !== "FRAME" && parent.type !== "GROUP")) {
    throw new Error("Предмет должен находиться внутри композиции.");
  }
  const copy = await adapter.cloneInto(resourceKey, parent);
  try {
    if (node.removed || node.parent !== parent) throw new Error("Предмет изменён или удалён. Выберите его заново.");
    assertVectorContent(copy);
    const fit = fitCompositionTemplate(copy, node);
    const [[a, c, x], [b, d, y]] = node.relativeTransform;
    copy.rescale(fit.scale);
    copy.relativeTransform = [[a, c, x + a * fit.x + c * fit.y], [b, d, y + b * fit.x + d * fit.y]];
    copy.name = name;
    copy.locked = false;
    copy.visible = node.visible;
    copy.setSharedPluginData("illustrationComposer", "composition-role",
      node.getSharedPluginData("illustrationComposer", "composition-role") === "background" ? "background" : "main");
    new FigmaPaletteAdapter().apply(copy, palette);
    parent.insertChild(parent.children.indexOf(node), copy);
    node.remove();
    return copy;
  } catch (error) { copy.remove(); throw error; }
}
