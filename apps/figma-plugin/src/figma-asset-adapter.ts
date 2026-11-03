
type AssetRole = "main" | "background";
type AssetSize = "s" | "l";

export class FigmaAssetAdapter {
  private readonly names: Record<string, readonly string[]> = {
    book: ["Книга"]
  };

  constructor(private readonly library: PageNode) {}

  find(resourceKey: string): GroupNode {
    const parts = resourceKey.split("/");

    if (parts.length !== 3) {
      throw new Error(`Invalid resource key: ${resourceKey}`);
    }

    const [assetId, role, size] = parts;

    if (
      !assetId ||
      (role !== "main" && role !== "background") ||
      (size !== "s" && size !== "l")
    ) {
      throw new Error(`Invalid resource key: ${resourceKey}`);
    }

    const names = this.names[assetId];

    if (!names) {
      throw new Error(`Unknown asset: ${assetId}`);
    }

    const section = this.library.children.find(
      node =>
        node.type === "SECTION" &&
        node.name === `Размер ${size.toUpperCase()}`
    );

    if (!section || section.type !== "SECTION") {
      throw new Error(`Section not found: ${size}`);
    }

    const backgroundLabel = section.children.find(
      node =>
        node.type === "TEXT" &&
        node.name === "Фоновые объекты"
    );

    if (!backgroundLabel) {
      throw new Error("Background label not found");
    }

    const matches = section.children.filter(
      (node): node is GroupNode =>
        node.type === "GROUP" &&
        names.includes(node.name) &&
        (
          role === "main"
            ? node.y < backgroundLabel.y
            : node.y > backgroundLabel.y
        )
    );

    if (matches.length !== 1) {
      throw new Error(
        `Expected one resource for ${resourceKey}, found ${matches.length}`
      );
    }

    return matches[0]!;
  }

  cloneInto(resourceKey: string, target: FrameNode): GroupNode {
    const source = this.find(resourceKey);
    const copy = source.clone();

    target.appendChild(copy);

    return copy;
  }
}
