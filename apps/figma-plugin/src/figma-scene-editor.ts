import type { AssetRole, ColorPalette } from "@illustration-composer/core";
import { FigmaAssetAdapter } from "./figma-asset-adapter.js";
import { FigmaPaletteAdapter } from "./figma-palette-adapter.js";
import { getTemplateSlots } from "./figma-template-slots.js";

const namespace = "illustrationComposer";
export type EditableObject = FrameNode | GroupNode | VectorNode | RectangleNode | EllipseNode |
  PolygonNode | StarNode | BooleanOperationNode;
function isEditableObject(node: SceneNode): node is EditableObject {
  return node.type === "FRAME" || node.type === "GROUP" || node.type === "VECTOR" ||
    node.type === "RECTANGLE" || node.type === "ELLIPSE" || node.type === "POLYGON" ||
    node.type === "STAR" || node.type === "BOOLEAN_OPERATION";
}

export function isComposerScene(node: BaseNode): node is FrameNode {
  return node.type === "FRAME" && (node.getSharedPluginData(namespace, "scene") === "1" ||
    (node.parent?.type === "PAGE" && node.parent.name === "Composer Preview" && node.children.length > 0 &&
      node.children.every(child => ["main", "background"].includes(child.getSharedPluginData(namespace, "composition-role")))));
}

export function sceneObjects(scene: FrameNode): EditableObject[] {
  const contentId = scene.getSharedPluginData(namespace, "template-content");
  const content = scene.children.find(node => node.id === contentId);
  if (content && (content.type === "FRAME" || content.type === "GROUP")) {
    const slots = getTemplateSlots(content);
    return [...slots.flatMap(slot => content.children[slot.index] ? [content.children[slot.index]!] : []),
      ...scene.children.filter(node => node !== content)].filter(isEditableObject);
  }
  return scene.children.filter(isEditableObject);
}

export function postSceneEditorState(scene?: FrameNode): void {
  const selected = figma.currentPage.selection[0];
  let ancestor: BaseNode | null = selected ?? null;
  let nearestFrame: FrameNode | undefined;
  while (!scene && ancestor) {
    if (isComposerScene(ancestor)) scene = ancestor;
    if (!nearestFrame && ancestor.type === "FRAME") nearestFrame = ancestor;
    ancestor = ancestor.parent;
  }
  scene ??= nearestFrame;
  if (scene && !canEditFrame(scene)) scene = undefined;
  if (!scene) { figma.ui.postMessage({ type: "scene-state", scene: null }); return; }
  const objects = sceneObjects(scene);
  let selectedObject: SceneNode | undefined;
  ancestor = selected ?? null;
  while (ancestor && ancestor !== scene) {
    selectedObject = objects.find(node => node.id === ancestor!.id);
    if (selectedObject) break;
    ancestor = ancestor.parent;
  }
  figma.ui.postMessage({ type: "scene-state", scene: {
    id: scene.id, name: scene.name, width: scene.width, height: scene.height,
    isTemplate: Boolean(scene.getSharedPluginData(namespace, "template-content")),
    paletteId: scene.getSharedPluginData(namespace, "palette-id"), selectedId: selectedObject?.id ?? "",
    items: objects.map(node => ({ id: node.id, name: node.name, x: node.x, y: node.y, rotation: node.rotation,
      width: node.width, height: node.height,
      role: node.getSharedPluginData(namespace, "composition-role") === "background" ? "background" : "main" }))
  } });
}

function canEditFrame(scene: FrameNode): boolean {
  if (scene.layoutMode && scene.layoutMode !== "NONE") return false;
  for (let node: BaseNode | null = scene; node; node = node.parent) {
    if ("locked" in node && node.locked) return false;
    if (node.type === "PAGE" && ["Библиотека компонентов", "Примеры композиций"].includes(node.name)) return false;
  }
  return true;
}

export async function getEditableScene(id: string, protectedIds: readonly string[] = []): Promise<FrameNode> {
  const scene = await figma.getNodeByIdAsync(id);
  if (scene?.type !== "FRAME" || !canEditFrame(scene)) throw new Error("Выделите незаблокированный фрейм без авторазметки. Исходную библиотеку и примеры редактировать нельзя.");
  if (protectedIds.length) {
    const protectedNodes = new Set(protectedIds);
    for (let node: BaseNode | null = scene; node; node = node.parent) {
      if (protectedNodes.has(node.id)) throw new Error("Этот фрейм входит в исходную библиотеку.");
    }
    if (scene.findAll(node => protectedNodes.has(node.id)).some(node => protectedNodes.has(node.id))) {
      throw new Error("В этом фрейме есть исходный ресурс библиотеки.");
    }
  }
  if (isComposerScene(scene) && scene.getSharedPluginData(namespace, "scene") !== "1") scene.setSharedPluginData(namespace, "scene", "1");
  return scene;
}

export function getSceneObject(scene: FrameNode, id: string): EditableObject {
  const node = sceneObjects(scene).find(item => item.id === id);
  if (!node) throw new Error("Предмет больше не находится в этой композиции. Выберите его заново.");
  return node;
}

export async function addSceneObject(
  scene: FrameNode, adapter: FigmaAssetAdapter, resourceKey: string, name: string, role: AssetRole, palette: ColorPalette
): Promise<void> {
  const dimensions = await adapter.getDimensions(resourceKey);
  const scale = Math.min(scene.width * 0.35 / dimensions.width, scene.height * 0.35 / dimensions.height);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("У исходного предмета некорректные размеры.");
  const node = await adapter.cloneInto(resourceKey, scene);
  try {
    node.name = name;
    node.locked = false;
    node.rescale(scale);
    node.x = (scene.width - node.width) / 2;
    node.y = (scene.height - node.height) / 2;
    node.setSharedPluginData(namespace, "composition-role", role);
    new FigmaPaletteAdapter().apply(node, palette);
    if (role === "background") scene.insertChild(0, node);
    figma.currentPage.selection = [node];
  } catch (error) { node.remove(); throw error; }
}

export function transformSceneObject(node: EditableObject, x: number, y: number, rotation: number): void {
  if (![x, y, rotation].every(value => Number.isFinite(value) && Math.abs(value) <= 100000)) {
    throw new Error("Укажите корректные координаты и угол поворота.");
  }
  node.rotation = rotation;
  node.x = x;
  node.y = y;
}

export function duplicateSceneObject(node: EditableObject): EditableObject {
  const parent = node.parent;
  if (!parent || (parent.type !== "FRAME" && parent.type !== "GROUP")) {
    throw new Error("Предмет должен находиться внутри композиции.");
  }
  const index = parent.children.indexOf(node);
  const [[a, c, x], [b, d, y]] = node.relativeTransform;
  const copy = node.clone();
  try {
    parent.insertChild(index + 1, copy);
    copy.relativeTransform = [[a, c, x + 24], [b, d, y + 24]];
    copy.locked = false;
    copy.name = `${node.name} — копия`;
    return copy;
  } catch (error) { copy.remove(); throw error; }
}

export function moveSceneLayer(node: SceneNode, direction: "forward" | "backward"): void {
  const parent = node.parent;
  if (!parent || !("insertChild" in parent)) return;
  const siblings = [...parent.children];
  const index = siblings.indexOf(node);
  const target = index + (direction === "forward" ? 1 : -1);
  const other = siblings[target];
  if (!other) return;
  const role = node.getSharedPluginData(namespace, "composition-role");
  const otherRole = other.getSharedPluginData(namespace, "composition-role");
  if ((role === "background" && otherRole === "main") || (role === "main" && otherRole === "background")) return;
  parent.insertChild(target, node);
}

export function resizeScene(scene: FrameNode, width: number, height: number, palette: ColorPalette): void {
  if (![width, height].every(value => Number.isFinite(value) && value >= 100 && value <= 10000)) {
    throw new Error("Размер холста должен быть от 100 до 10000 пикселей.");
  }
  const scale = Math.min(width / scene.width, height / scene.height);
  if (scale !== 1 && scene.children.some(child => !("rescale" in child))) throw new Error("Один из слоёв не поддерживает масштабирование.");
  const offsetX = (width - scene.width * scale) / 2;
  const offsetY = (height - scene.height * scale) / 2;
  for (const child of scene.children) {
    const [[a, c, x], [b, d, y]] = child.relativeTransform;
    if (scale !== 1 && "rescale" in child) child.rescale(scale);
    child.relativeTransform = [[a, c, x * scale + offsetX], [b, d, y * scale + offsetY]];
  }
  scene.resizeWithoutConstraints(width, height);
  new FigmaPaletteAdapter().apply(scene, palette);
  scene.setSharedPluginData(namespace, "palette-id", palette.id);
}
