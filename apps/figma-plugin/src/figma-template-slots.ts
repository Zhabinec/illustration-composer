import { fitCompositionTemplate } from "@illustration-composer/core";
import type { AssetRole, LibraryRegistrySnapshot } from "@illustration-composer/core";
import { FigmaAssetAdapter } from "./figma-asset-adapter.js";
import { assertVectorContent } from "./figma-vector-composition.js";
import type { VectorCompositionNode } from "./figma-vector-composition.js";

export interface TemplateSlot {
  id: string;
  name: string;
  index: number;
  kind: "primary" | "secondary" | "decoration";
}

export interface TemplateReplacement {
  slotId: string;
  resourceKey: string;
  name: string;
  role: AssetRole;
}

export function getTemplateSlots(source: VectorCompositionNode): TemplateSlot[] {
  const groups = source.children.flatMap((node, index) =>
    (node.type === "GROUP" || node.type === "FRAME") && !node.isMask
      ? [{ id: node.id, name: node.name, index, area: node.width * node.height }]
      : []);
  // These are decoration layer names in the supplied reference library.
  const isDecoration = (name: string): boolean => /^(конфетти|confetti|декор|decor)$/i.test(name.trim());
  const objects = groups.filter(item => !isDecoration(item.name)).sort((a, b) => b.area - a.area);
  return [...objects, ...groups.filter(item => isDecoration(item.name))].map(item => ({
    id: item.id,
    name: item.name,
    index: item.index,
    kind: isDecoration(item.name) ? "decoration" : item.id === objects[0]?.id ? "primary" : "secondary"
  }));
}

export function resolveTemplateReplacements(
  value: unknown, slots: readonly TemplateSlot[], registry: LibraryRegistrySnapshot
): TemplateReplacement[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Некорректный список замен предметов.");
  const result: TemplateReplacement[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null ||
        !("slotId" in item) || typeof item.slotId !== "string" ||
        !("assetId" in item) || typeof item.assetId !== "string" ||
        !("variantId" in item) || typeof item.variantId !== "string") {
      throw new Error("Некорректная замена предмета.");
    }
    if (!slots.some(slot => slot.id === item.slotId) || result.some(slot => slot.slotId === item.slotId)) {
      throw new Error("Слот композиции изменён или указан повторно. Обнови шаблон.");
    }
    const asset = registry.assets.find(asset => asset.id === item.assetId);
    const variant = asset?.variants.find(variant => variant.id === item.variantId && variant.active);
    if (!asset || !variant) throw new Error("Выбранный вариант предмета недоступен. Обнови каталог.");
    result.push({ slotId: item.slotId, resourceKey: variant.resourceKey, name: asset.name, role: variant.role });
  }
  return result;
}

export async function replaceTemplateSlots(
  source: VectorCompositionNode,
  copy: VectorCompositionNode,
  replacements: readonly TemplateReplacement[],
  adapter: FigmaAssetAdapter
): Promise<Map<string, SceneNode>> {
  const slots = getTemplateSlots(source);
  const originals = [...copy.children];
  const nodes = new Map(slots.flatMap(slot => {
    const node = originals[slot.index];
    return node ? [[slot.id, node] as const] : [];
  }));
  for (const replacement of replacements) {
    const slot = slots.find(slot => slot.id === replacement.slotId);
    const old = slot ? originals[slot.index] : undefined;
    if (!slot || !old) throw new Error("Источник шаблона изменился. Обнови предпросмотр.");
    const node = await adapter.cloneInto(replacement.resourceKey, copy);
    assertVectorContent(node);
    const fit = fitCompositionTemplate(node, old);
    node.rescale(fit.scale);
    node.name = replacement.name;
    node.locked = false;
    const [[a, c, x], [b, d, y]] = old.relativeTransform;
    node.relativeTransform = [
      [a, c, x + a * fit.x + c * fit.y],
      [b, d, y + b * fit.x + d * fit.y]
    ];
    copy.insertChild(slot.index, node);
    old.remove();
    nodes.set(slot.id, node);
  }
  return nodes;
}
