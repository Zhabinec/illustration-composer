
export interface ScannedAsset {
  nodeId: string;
  name: string;
  size: "S" | "L";
  role: "main" | "background";
  vectorCount: number;
  identified: boolean;
  width: number;
  height: number;
}

export class FigmaLibraryScanner {
  constructor(private readonly library: PageNode) {}

  scan(): ScannedAsset[] {
    const assets: ScannedAsset[] = [];

    for (const size of ["S", "L"] as const) {
      const section = this.library.children.find(
        node =>
          node.type === "SECTION" &&
          node.name === `Размер ${size}`
      );

      if (!section || section.type !== "SECTION") {
        throw new Error(`Section ${size} not found`);
      }

      const mainLabel = section.children.find(
        node => node.name === "Главные объекты"
      );

      const backgroundLabel = section.children.find(
        node => node.name === "Фоновые объекты"
      );

      if (!mainLabel || !backgroundLabel) {
        throw new Error(`Asset labels missing in ${size}`);
      }

      for (const node of section.children) {
        if (node.type !== "GROUP") continue;
        if (node.y < mainLabel.y) continue;

        const role = node.y < backgroundLabel.y
          ? "main"
          : "background";

        assets.push({
          nodeId: node.id,
          name: node.name,
          size,
          role,
          width: Math.round(node.width),
          height: Math.round(node.height),
          vectorCount: node.children.filter(
            child => child.type === "VECTOR"
          ).length,
          identified: !/^Group(?:\s|$)/i.test(node.name)
        });
      }
    }

    return assets;
  }
}
