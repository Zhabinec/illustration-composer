import { getReplacementColor } from "@illustration-composer/core";
import type { ColorPalette } from "@illustration-composer/core";

export class FigmaPaletteAdapter {
  apply(root: GroupNode | FrameNode | VectorNode, palette: ColorPalette): void {
    const descendants = "findAll" in root ? root.findAll(() => true) : [];
    const nodes: SceneNode[] = [root, ...descendants];
    for (const node of nodes) {
      if ("fills" in node) {
        const fills = node.fills;
        if (Array.isArray(fills)) {
          const updated = fills.map(paint => this.recolorPaint(paint, palette));
          if (updated.some((paint, index) => paint !== fills[index])) {
            node.fills = updated;
          }
        }
      }
      if ("strokes" in node) {
        const strokes = node.strokes;
        if (Array.isArray(strokes)) {
          const updated = strokes.map(paint => this.recolorPaint(paint, palette));
          if (updated.some((paint, index) => paint !== strokes[index])) {
            node.strokes = updated;
          }
        }
      }
    }
  }

  private recolorPaint(paint: Paint, palette: ColorPalette): Paint {
    if (paint.type !== "SOLID") return paint;
    const current = this.toHex(paint.color);
    const replacement = getReplacementColor(current, palette);
    if (!replacement || replacement.toUpperCase() === current) return paint;
    return { ...paint, color: this.toRgb(replacement) };
  }

  private toHex(color: RGB): string {
    const hex = [color.r, color.g, color.b]
      .map(channel => Math.round(channel * 255).toString(16).padStart(2, "0"))
      .join("").toUpperCase();
    return `#${hex}`;
  }

  private toRgb(hex: string): RGB {
    return {
      r: parseInt(hex.slice(1, 3), 16) / 255,
      g: parseInt(hex.slice(3, 5), 16) / 255,
      b: parseInt(hex.slice(5, 7), 16) / 255
    };
  }
}
