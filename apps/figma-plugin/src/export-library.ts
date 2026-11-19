import type { RegistryDocument } from "./figma-registry-store.js";
import { resourceNode } from "./figma-resource-preview.js";
import { assertVectorContent } from "./figma-vector-composition.js";
import { discoverExampleTemplates } from "./figma-example-templates.js";
import { paletteSourceNodeIds } from "./figma-registry-store.js";
import { referenceDecor } from "./figma-scene-style.js";

async function vectorData(node: SceneNode) {
  const svg = await node.exportAsync({ format: "SVG_STRING", svgIdAttribute: true });
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1]?.split(/[\s,]+/).map(Number);
  if (!viewBox || ![viewBox[2], viewBox[3]].every(value => value !== undefined && Number.isFinite(value) && value > 0)) {
    throw new Error(`Не удалось экспортировать размеры слоя «${node.name}».`);
  }
  return { width: viewBox[2]!, height: viewBox[3]!, svg };
}

export async function exportVectorLibrary(state: RegistryDocument): Promise<string> {
  const assets = [];
  for (const asset of state.registry.assets) {
    const variants = [];
    for (const variant of asset.variants.filter(item => item.active)) {
      const node = await resourceNode(state.sourceNodeIds[variant.resourceKey]!);
      assertVectorContent(node);
      variants.push({ ...variant, ...await vectorData(node) });
    }
    assets.push({ id: asset.id, name: asset.name, variants });
  }
  const templates = [];
  const { templates: sources } = await discoverExampleTemplates(paletteSourceNodeIds(state.palettes));
  for (const source of sources) {
    const frame = await figma.getNodeByIdAsync(source.sourceNodeId);
    if (frame?.type !== "FRAME") continue;
    const decorIds = new Set(referenceDecor(frame).map(node => node.id));
    const elements = [];
    for (const node of frame.children.filter(node => node.visible)) {
      assertVectorContent(node);
      const id = "reference-" + node.id.replace(":", "-");
      const vector = await vectorData(node);
      const bounds = ("absoluteRenderBounds" in node ? node.absoluteRenderBounds : null) ?? node.absoluteBoundingBox;
      if (!bounds) throw new Error(`Нет границ слоя «${node.name}».`);
      assets.push({ id: decorIds.has(node.id) ? "decor-" + id : id, name: node.name, variants: [{
        id, size: "L", role: "main", ...vector
      }] });
      elements.push({ id, assetId: decorIds.has(node.id) ? "decor-" + id : id,
        variantId: id, name: node.name, x: bounds.x - frame.absoluteTransform[0][2],
        y: bounds.y - frame.absoluteTransform[1][2], width: vector.width, rotation: 0 });
    }
    templates.push({ id: source.sourceNodeId, name: source.name, width: frame.width, height: frame.height, elements });
  }
  return JSON.stringify({ version: 1, assets, templates });
}
