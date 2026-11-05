import { getSourceColorRole, sourceColors } from "@illustration-composer/core";
import type { ColorPalette, ColorRole } from "@illustration-composer/core";

export class FigmaPaletteAdapter {
  applyToSurface(frame: FrameNode, palette: ColorPalette): void {
    if (frame.getSharedPluginData("illustrationComposer", "fixed-background") !== "1" &&
      Array.isArray(frame.fills)) frame.fills = this.recolorPaints(frame, "fills", frame.fills, palette);
  }

  apply(root: SceneNode, palette: ColorPalette): void {
    const descendants = "findAll" in root ? root.findAll(() => true) : [];
    const nodes: SceneNode[] = [root, ...descendants];
    for (const node of nodes) {
      if ("fills" in node && node.getSharedPluginData("illustrationComposer", "fixed-background") !== "1") {
        const fills = node.fills;
        if (Array.isArray(fills)) {
          const updated = this.recolorPaints(node, "fills", fills, palette);
          if (updated.some((paint, index) => paint !== fills[index])) {
            node.fills = updated;
          }
        }
      }
      if ("strokes" in node) {
        const strokes = node.strokes;
        if (Array.isArray(strokes)) {
          const updated = this.recolorPaints(node, "strokes", strokes, palette);
          if (updated.some((paint, index) => paint !== strokes[index])) {
            node.strokes = updated;
          }
        }
      }
    }
  }

  private recolorPaints(node: SceneNode, property: "fills" | "strokes", paints: readonly Paint[], palette: ColorPalette): Paint[] {
    let saved: unknown;
    try { saved = JSON.parse(node.getSharedPluginData("illustrationComposer", `${property}-roles`) || "null"); }
    catch { saved = null; }
    const isRole = (value: unknown): value is ColorRole =>
      typeof value === "string" && Object.prototype.hasOwnProperty.call(sourceColors, value);
    const roles = paints.map((paint, index) => {
      const previous: unknown = Array.isArray(saved) && saved.length === paints.length ? saved[index] : null;
      return isRole(previous) ? previous : paint.type === "SOLID" ? getSourceColorRole(this.toHex(paint.color)) ?? null : null;
    });
    if (roles.some(role => role !== null)) node.setSharedPluginData("illustrationComposer", `${property}-roles`, JSON.stringify(roles));
    return paints.map((paint, index) => {
      const role = roles[index];
      if (paint.type !== "SOLID" || !role) return paint;
      const replacement = palette.colors[role];
      return replacement.toUpperCase() === this.toHex(paint.color) ? paint : { ...paint, color: this.toRgb(replacement) };
    });
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
