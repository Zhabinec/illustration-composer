import type { ColorPalette, CompositionScene } from "@illustration-composer/core";
import { sourceColors } from "@illustration-composer/core";
import { FigmaAssetAdapter } from "./figma-asset-adapter.js";
import { FigmaPaletteAdapter } from "./figma-palette-adapter.js";

export class FigmaSceneRenderer {
  private readonly paletteAdapter = new FigmaPaletteAdapter();

  constructor(private readonly adapter: FigmaAssetAdapter) {}

  async render(scene: CompositionScene, name: string, palette: ColorPalette): Promise<FrameNode> {
    const page = figma.currentPage;
    const frame = figma.createFrame();
    try {
      frame.name = name;
      frame.resize(scene.width, scene.height);
      frame.setSharedPluginData("illustrationComposer", "scene", "1");
      frame.setSharedPluginData("illustrationComposer", "palette-id", palette.id);
      if (scene.background) {
        const hex = sourceColors[scene.background];
        frame.fills = [{ type: "SOLID", color: {
          r: parseInt(hex.slice(1, 3), 16) / 255,
          g: parseInt(hex.slice(3, 5), 16) / 255,
          b: parseInt(hex.slice(5, 7), 16) / 255
        } }];
      }
      const maxX = page.children
        .filter(node => node.id !== frame.id)
        .reduce((max, node) => Math.max(max, node.x + node.width), 0);
      frame.x = maxX + 100;
      frame.y = 0;

      const ordered = [...scene.items].sort((a, b) =>
        Number(a.variant.role === "main") - Number(b.variant.role === "main") ||
        (a.zIndex ?? 0) - (b.zIndex ?? 0));
      for (const item of ordered) {
        const copy = await this.adapter.cloneInto(item.variant.resourceKey, frame);
        copy.rescale(item.scale);
        copy.rotation = item.rotation;
        copy.x = item.x;
        copy.y = item.y;
        copy.setSharedPluginData("illustrationComposer", "composition-role", item.variant.role);
      }
      this.paletteAdapter.apply(frame, palette);
      figma.currentPage.selection = [frame];
      return frame;
    } catch (error) {
      frame.remove();
      throw error;
    }
  }
}
