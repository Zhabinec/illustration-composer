import { resolvePalette } from "@illustration-composer/core";
import type { ColorPalette, LibraryRegistrySnapshot } from "@illustration-composer/core";
import { FigmaCompositionTemplateStore } from "./figma-composition-template-store.js";
import { assertVectorComposition, getVectorComposition } from "./figma-vector-composition.js";
import { renderCompositionTemplate } from "./figma-template-renderer.js";
import { getTemplateSlots, resolveTemplateReplacements } from "./figma-template-slots.js";
import { planTemplateLayout } from "./figma-template-layout.js";
import { FigmaAssetAdapter } from "./figma-asset-adapter.js";
import { requestCompositionAdjustment } from "./composition-adjustments.js";
import { discoverExampleTemplates, mergeCompositionTemplates } from "./figma-example-templates.js";

interface TemplateContext {
  palettes: readonly ColorPalette[];
  paletteSourceIds: readonly string[];
  registry: LibraryRegistrySnapshot;
  sourceNodeIds: Readonly<Record<string, string>>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Заполни название или выбери шаблон.");
  return value.trim();
}

export async function handleTemplateMessage(
  message: Record<string, unknown>, context: TemplateContext
): Promise<boolean> {
  if (typeof message.type !== "string" || !message.type.startsWith("template-")) return false;
  const store = new FigmaCompositionTemplateStore();
  const examples = await discoverExampleTemplates(context.paletteSourceIds);
  const templates = mergeCompositionTemplates(examples.templates, store.list());
  switch (message.type) {
    case "template-list":
      figma.ui.postMessage({ type: "templates", templates,
        exampleCount: examples.templates.length, warnings: examples.warnings });
      break;
    case "template-save": {
      const selection = figma.currentPage.selection;
      if (selection.length !== 1 || !selection[0]) {
        throw new Error("Выдели один фрейм или группу готовой векторной композиции в Figma.");
      }
      const source = selection[0];
      assertVectorComposition(source);
      const nodes = [source, ...source.findAll(() => true)];
      if (nodes.some(node => context.paletteSourceIds.includes(node.id))) {
        throw new Error("Ресурс палитры нельзя использовать как предмет композиции.");
      }
      const saved = store.add(text(message.name), source.id);
      figma.ui.postMessage({ type: "templates", templates: mergeCompositionTemplates(examples.templates, saved),
        exampleCount: examples.templates.length, warnings: examples.warnings,
        selectedId: `template-${source.id}`, saved: true });
      break;
    }
    case "template-preview": {
      const template = templates.find(item => item.id === text(message.id));
      if (!template) throw new Error("Шаблон не найден.");
      const source = await getVectorComposition(template.sourceNodeId);
      const bytes = await source.exportAsync({ format: "PNG", constraint: { type: "WIDTH", value: 280 } });
      figma.ui.postMessage({
        type: "template-preview", id: template.id,
        width: source.width, height: source.height,
        slots: getTemplateSlots(source),
        image: `data:image/png;base64,${figma.base64Encode(bytes)}`
      });
      break;
    }
    case "template-create": {
      const template = templates.find(item => item.id === text(message.id));
      if (!template) throw new Error("Шаблон не найден.");
      const source = await getVectorComposition(template.sourceNodeId);
      if ([source, ...source.findAll(() => true)].some(node => context.paletteSourceIds.includes(node.id))) {
        throw new Error("В источнике шаблона обнаружен ресурс палитры. Исправь состав композиции.");
      }
      const scale = message.scale;
      if (typeof scale !== "number" || !Number.isFinite(scale) || scale < 0.1 || scale > 4) {
        throw new Error("Масштаб шаблона должен быть от 10% до 400%.");
      }
      const palette = context.palettes.find(item => item.id === message.palette) ?? resolvePalette(message.palette);
      const replacements = resolveTemplateReplacements(message.replacements, getTemplateSlots(source), context.registry);
      const layout = await planTemplateLayout(source, replacements, new FigmaAssetAdapter(context.sourceNodeIds));
      const suggestions = layout.filter(item => item.scale < 1);
      if (requestCompositionAdjustment(message,
        suggestions.map(item => ({ name: item.name, percent: Math.round(item.scale * 100) })),
        JSON.stringify(layout))) return true;
      await renderCompositionTemplate(template, palette, { scale, replacements,
        sourceNodeIds: context.sourceNodeIds, layout });
      figma.ui.postMessage({ type: "template-created" });
      break;
    }
    default:
      return false;
  }
  return true;
}
