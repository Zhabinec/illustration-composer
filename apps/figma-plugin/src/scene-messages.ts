import { AssetId, findAssetVariant, LibraryRegistry, resolvePalette } from "@illustration-composer/core";
import { FigmaAssetAdapter } from "./figma-asset-adapter.js";
import { FigmaSceneRenderer } from "./figma-scene-renderer.js";
import { replaceSceneObject, resizeSceneObject } from "./figma-object-editor.js";
import { paletteSourceNodeIds, toAssetCatalog } from "./figma-registry-store.js";
import { applyReferenceStyle, listReferenceStyles, setSceneBackground } from "./figma-scene-style.js";
import type { RegistryDocument } from "./figma-registry-store.js";
import { addSceneObject, duplicateSceneObject, getEditableScene, getSceneObject, moveSceneLayer,
  postSceneEditorState, resizeScene, transformSceneObject } from "./figma-scene-editor.js";

function text(message: Record<string, unknown>, key: string): string {
  const value = message[key];
  if (typeof value !== "string" || !value) throw new Error("Обновите выделение композиции.");
  return value;
}

export async function handleSceneMessage(message: Record<string, unknown>, state: RegistryDocument): Promise<boolean> {
  if (typeof message.type !== "string" || !message.type.startsWith("scene-")) return false;
  if (message.type === "scene-state") { postSceneEditorState(); return true; }
  if (message.type === "scene-style-list") {
    figma.ui.postMessage({ type: "scene-styles", styles: await listReferenceStyles(paletteSourceNodeIds(state.palettes)) });
    return true;
  }
  if (message.type === "scene-new") {
    if (typeof message.width !== "number" || typeof message.height !== "number" ||
      ![message.width, message.height].every(value => Number.isFinite(value) && value >= 100 && value <= 10000)) throw new Error("Укажите размер холста от 100 до 10000 пикселей.");
    const paletteId = text(message, "palette");
    const palette = state.palettes.find(item => item.id === paletteId) ?? resolvePalette(paletteId);
    const page = figma.root.children.find(item => item.name === "Composer Preview") ?? figma.createPage();
    page.name = "Composer Preview";
    await figma.setCurrentPageAsync(page);
    const scene = await new FigmaSceneRenderer(new FigmaAssetAdapter(state.sourceNodeIds)).render(
      { width: message.width, height: message.height, items: [], background: "pale" }, "Композиция", palette);
    figma.viewport.scrollAndZoomIntoView([scene]);
    figma.commitUndo();
    postSceneEditorState(scene);
    figma.ui.postMessage({ type: "scene-new-created" });
    return true;
  }
  const actions = ["scene-add", "scene-replace", "scene-resize-object", "scene-select", "scene-transform", "scene-duplicate", "scene-delete", "scene-layer", "scene-settings", "scene-background", "scene-reference-style"];
  if (!actions.includes(message.type)) throw new Error("Неизвестная команда редактирования сцены.");
  const scene = await getEditableScene(text(message, "sceneId"),
    [...Object.values(state.sourceNodeIds), ...paletteSourceNodeIds(state.palettes)]);
  const paletteId = message.type === "scene-settings" ? text(message, "palette")
    : scene.getSharedPluginData("illustrationComposer", "palette-id") || text(message, "palette");
  const palette = state.palettes.find(item => item.id === paletteId) ?? resolvePalette(paletteId);
  if (message.type === "scene-background") {
    setSceneBackground(scene, message.background, palette);
  } else if (message.type === "scene-reference-style") {
    await applyReferenceStyle(scene, text(message, "sourceId"), message.mode, paletteSourceNodeIds(state.palettes), palette);
    figma.currentPage.selection = [scene];
  } else if (message.type === "scene-add" || message.type === "scene-replace") {
    const replaced = message.type === "scene-replace" ? getSceneObject(scene, text(message, "nodeId")) : null;
    const asset = toAssetCatalog(new LibraryRegistry(state.registry)).getById(AssetId.create(text(message, "assetId")));
    const role = message.role === "background" || message.role === "main" ? message.role
      : replaced && message.role === undefined
        ? replaced.getSharedPluginData("illustrationComposer", "composition-role") === "background" ? "background" : "main"
        : null;
    const size = message.size === "S" ? "S" : message.size === "L" ? "L" : null;
    if (!asset || !role || !size) throw new Error("Выберите существующий предмет и его вариант.");
    const variant = findAssetVariant(asset, size, role) ?? (replaced ? undefined : findAssetVariant(asset, size === "L" ? "S" : "L", role));
    if (!variant) throw new Error("У этого предмета нет выбранного варианта. Измените роль или предмет.");
    const adapter = new FigmaAssetAdapter(state.sourceNodeIds);
    if (replaced) figma.currentPage.selection = [await replaceSceneObject(replaced, adapter, variant.resourceKey, asset.name, palette, role)];
    else await addSceneObject(scene, adapter, variant.resourceKey, asset.name, role, palette);
  } else if (message.type === "scene-settings") {
    if (typeof message.width !== "number" || typeof message.height !== "number") throw new Error("Укажите размер холста.");
    resizeScene(scene, message.width, message.height, palette);
    figma.currentPage.selection = [scene];
  } else {
    const node = getSceneObject(scene, text(message, "nodeId"));
    if (message.type === "scene-delete") { node.remove(); figma.currentPage.selection = [scene]; }
    else if (message.type === "scene-duplicate") figma.currentPage.selection = [duplicateSceneObject(node)];
    else if (message.type === "scene-resize-object") {
      if (typeof message.width !== "number") throw new Error("Укажите размер предмета.");
      resizeSceneObject(node, message.width);
      figma.currentPage.selection = [node];
    }
    else if (message.type === "scene-transform") {
      if (typeof message.x !== "number" || typeof message.y !== "number" || typeof message.rotation !== "number") throw new Error("Укажите координаты и поворот.");
      transformSceneObject(node, message.x, message.y, message.rotation);
      figma.currentPage.selection = [node];
    } else if (message.type === "scene-layer") {
      if (message.direction !== "forward" && message.direction !== "backward") throw new Error("Выберите направление слоя.");
      moveSceneLayer(node, message.direction);
      figma.currentPage.selection = [node];
    } else figma.currentPage.selection = [node];
  }
  if (message.type !== "scene-select") figma.commitUndo();
  postSceneEditorState(scene);
  return true;
}
