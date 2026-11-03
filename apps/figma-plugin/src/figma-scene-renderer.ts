
import type { CompositionScene } from "@illustration-composer/core";
import { FigmaAssetAdapter } from "./figma-asset-adapter.js";

export class FigmaSceneRenderer {
  constructor(private readonly adapter: FigmaAssetAdapter) {}

  async render(
    scene: CompositionScene,
    name: string
  ): Promise<FrameNode> {
    const page = figma.currentPage;

    const frame = figma.createFrame();
    frame.name = name;
    frame.resize(scene.width, scene.height);

    const maxX = page.children
      .filter(node => node.id !== frame.id)
      .reduce(
        (max, node) => Math.max(max, node.x + node.width),
        0
      );

    frame.x = maxX + 100;
    frame.y = 0;

    for (const item of scene.items) {
      const copy = await this.adapter.cloneInto(
        item.variant.resourceKey,
        frame
      );

      copy.rescale(item.scale);
      copy.rotation = item.rotation;
      copy.x = item.x;
      copy.y = item.y;
    }

    return frame;
  }
}
