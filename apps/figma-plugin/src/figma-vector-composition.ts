export type VectorCompositionNode = FrameNode | GroupNode;

export function assertVectorComposition(node: SceneNode): asserts node is VectorCompositionNode {
  if (node.type !== "FRAME" && node.type !== "GROUP") {
    throw new Error("Выдели целиком фрейм или группу композиции, а не отдельный предмет.");
  }
  if (!node.children.length || node.width <= 0 || node.height <= 0) {
    throw new Error("Композиция пуста или имеет некорректный размер.");
  }
  assertVectorContent(node);
}

export function assertVectorContent(node: SceneNode): void {
  const allowed = new Set([
    "FRAME", "GROUP", "VECTOR", "BOOLEAN_OPERATION", "RECTANGLE", "ELLIPSE", "POLYGON", "STAR", "LINE"
  ]);
  const descendants = "findAll" in node ? node.findAll(() => true) : [];
  for (const item of [node, ...descendants]) {
    if (!allowed.has(item.type)) {
      throw new Error(`Слой «${item.name}» (${item.type}) не поддерживается в векторном шаблоне.`);
    }
    const paints: Paint[] = [];
    if ("fills" in item && Array.isArray(item.fills)) paints.push(...item.fills);
    if ("strokes" in item && Array.isArray(item.strokes)) paints.push(...item.strokes);
    if (paints.some(paint => paint.type !== "SOLID" && !paint.type.startsWith("GRADIENT_"))) {
      throw new Error(`Слой «${item.name}» содержит растровую или неподдерживаемую заливку.`);
    }
  }
}

export async function getVectorComposition(nodeId: string): Promise<VectorCompositionNode> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
    throw new Error("Источник шаблона удалён. Выдели существующую композицию и сохрани её заново.");
  }
  assertVectorComposition(node);
  return node;
}
