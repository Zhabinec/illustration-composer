import { scaleCompositionTemplate } from "@illustration-composer/core";
import type { ColorPalette, SpacedCompositionBox } from "@illustration-composer/core";
import type { FigmaCompositionTemplate } from "./figma-composition-template-store.js";
import { getVectorComposition } from "./figma-vector-composition.js";
import { FigmaPaletteAdapter } from "./figma-palette-adapter.js";
import { FigmaAssetAdapter } from "./figma-asset-adapter.js";
import { replaceTemplateSlots } from "./figma-template-slots.js";
import type { TemplateReplacement } from "./figma-template-slots.js";
import { applyTemplateLayout } from "./figma-template-layout.js";

interface TemplateRenderOptions {
  scale: number;
  replacements: readonly TemplateReplacement[];
  sourceNodeIds: Readonly<Record<string, string>>;
  layout: readonly SpacedCompositionBox[];
}

export async function renderCompositionTemplate(
  template: FigmaCompositionTemplate,
  palette: ColorPalette,
  options: TemplateRenderOptions
): Promise<FrameNode> {
  const { scale, replacements, sourceNodeIds, layout } = options;
  const source = await getVectorComposition(template.sourceNodeId);
  const canvas = scaleCompositionTemplate(source, scale);
  const page = figma.root.children.find(item => item.name === "Composer Preview") ?? figma.createPage();
  page.name = "Composer Preview";
  await figma.setCurrentPageAsync(page);
  const right = page.children.reduce((value, item) => Math.max(value, item.x + item.width), 0);
  const frame = figma.createFrame();
  try {
    const changed = replacements.length ? ` · ${replacements.map(item => item.name).join(" + ")}` : "";
    frame.name = `${template.name}${changed} — ${canvas.width}×${canvas.height}`;
    frame.resize(canvas.width, canvas.height);
    frame.x = right + 100;
    frame.y = 0;
    frame.fills = [];
    const copy = source.clone();
    frame.appendChild(copy);
    const nodes = await replaceTemplateSlots(source, copy, replacements, new FigmaAssetAdapter(sourceNodeIds));
    if (layout.length) applyTemplateLayout(copy, nodes, layout);
    copy.locked = false;
    copy.rescale(scale);
    copy.rotation = 0;
    copy.x = 0;
    copy.y = 0;
    new FigmaPaletteAdapter().apply(frame, palette);
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
    return frame;
  } catch (error) {
    frame.remove();
    throw error;
  }
}
