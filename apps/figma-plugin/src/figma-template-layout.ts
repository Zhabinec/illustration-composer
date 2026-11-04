import { fitCompositionTemplate, spaceCompositionObjects } from "@illustration-composer/core";
import type { CompositionBox, SpacedCompositionBox } from "@illustration-composer/core";
import { FigmaAssetAdapter } from "./figma-asset-adapter.js";
import { getTemplateSlots } from "./figma-template-slots.js";
import type { TemplateReplacement } from "./figma-template-slots.js";
import type { VectorCompositionNode } from "./figma-vector-composition.js";

function transformedBounds(width: number, height: number, transform: Transform) {
  const [[a, c, x], [b, d, y]] = transform;
  const corners = [[0, 0], [width, 0], [0, height], [width, height]];
  const xs = corners.map(([px = 0, py = 0]) => a * px + c * py + x);
  const ys = corners.map(([px = 0, py = 0]) => b * px + d * py + y);
  return { x: Math.min(...xs), y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

export async function planTemplateLayout(
  source: VectorCompositionNode,
  replacements: readonly TemplateReplacement[],
  adapter: FigmaAssetAdapter
): Promise<SpacedCompositionBox[]> {
  const boxes: CompositionBox[] = [];
  for (const slot of getTemplateSlots(source)) {
    const node = source.children[slot.index];
    if (!node) throw new Error("Источник шаблона изменён. Обнови предпросмотр.");
    const replacement = replacements.find(item => item.slotId === slot.id);
    const dimensions = replacement ? await adapter.getDimensions(replacement.resourceKey) : node;
    const fit = fitCompositionTemplate(dimensions, node);
    const [[a, c, x], [b, d, y]] = node.relativeTransform;
    const bounds = transformedBounds(dimensions.width * fit.scale, dimensions.height * fit.scale, [
      [a, c, x + a * fit.x + c * fit.y], [b, d, y + b * fit.x + d * fit.y]
    ]);
    const storedRole = node.getSharedPluginData("illustrationComposer", "composition-role");
    boxes.push({ id: slot.id, name: replacement?.name ?? slot.name, ...bounds,
      kind: replacement && slot.kind === "decoration" ? "secondary" : slot.kind,
      role: replacement?.role ?? (storedRole === "background" ? "background" : "main") });
  }
  return spaceCompositionObjects(source, boxes);
}

export function applyTemplateLayout(
  copy: VectorCompositionNode, nodes: ReadonlyMap<string, SceneNode>, layout: readonly SpacedCompositionBox[]
): void {
  const subjectRoles = new Map<string, "main" | "background">();
  for (const item of layout) {
    const node = nodes.get(item.id);
    if (!node || (node.type !== "GROUP" && node.type !== "FRAME" && node.type !== "VECTOR")) {
      throw new Error("Слот композиции потерян при создании копии.");
    }
    const [[a, c, x], [b, d, y]] = node.relativeTransform;
    const bounds = transformedBounds(node.width, node.height, node.relativeTransform);
    if (item.scale !== 1) node.rescale(item.scale);
    node.relativeTransform = [
      [a, c, item.x - (bounds.x - x) * item.scale],
      [b, d, item.y - (bounds.y - y) * item.scale]
    ];
    node.setSharedPluginData("illustrationComposer", "composition-role", item.role);
    if (item.kind !== "decoration" || item.role === "background") subjectRoles.set(node.id, item.role);
  }
  const subjects = copy.children.filter(node => subjectRoles.has(node.id)).sort((a, b) =>
    Number(subjectRoles.get(a.id) === "main") - Number(subjectRoles.get(b.id) === "main"));
  let index = 0;
  const ordered = copy.children.map(node => subjectRoles.has(node.id) ? subjects[index++] : node);
  ordered.forEach((node, position) => { if (node) copy.insertChild(position, node); });
}
