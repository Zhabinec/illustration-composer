export class FigmaAssetAdapter {
  constructor(private readonly sourceNodeIds: Readonly<Record<string, string>>) {}

  private async getSource(resourceKey: string): Promise<GroupNode | FrameNode | VectorNode> {
    const nodeId = this.sourceNodeIds[resourceKey];
    if (!nodeId) throw new Error(`Resource not registered: ${resourceKey}`);

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || (node.type !== "GROUP" && node.type !== "FRAME" && node.type !== "VECTOR")) {
      throw new Error(`Source node missing or unsupported: ${nodeId}`);
    }
    return node;
  }

  async getDimensions(resourceKey: string): Promise<{ width: number; height: number }> {
    const source = await this.getSource(resourceKey);
    return { width: source.width, height: source.height };
  }

  async cloneInto(resourceKey: string, frame: FrameNode | GroupNode): Promise<GroupNode | FrameNode | VectorNode> {
    const source = await this.getSource(resourceKey);
    const copy = source.clone();
    frame.appendChild(copy);
    return copy;
  }
}
