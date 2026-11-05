type ResourceNode = GroupNode | FrameNode | VectorNode;

export async function resourceNode(
  nodeId: string
): Promise<ResourceNode> {
  const node = await figma.getNodeByIdAsync(nodeId);

  if (
    !node ||
    (
      node.type !== "GROUP" &&
      node.type !== "FRAME" &&
      node.type !== "VECTOR"
    )
  ) {
    throw new Error("Source node is missing or unsupported");
  }

  return node;
}

export async function thumbnail(
  nodeId: string
): Promise<string | null> {
  try {
    const node = await resourceNode(nodeId);

    const image = await node.exportAsync({
      format: "PNG",
      constraint: {
        type: "WIDTH",
        value: 160
      }
    });

    return `data:image/png;base64,${figma.base64Encode(image)}`;
  } catch {
    return null;
  }
}
