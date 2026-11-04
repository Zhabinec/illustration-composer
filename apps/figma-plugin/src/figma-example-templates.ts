import type { FigmaCompositionTemplate } from "./figma-composition-template-store.js";
import { assertVectorComposition } from "./figma-vector-composition.js";
import { getTemplateSlots } from "./figma-template-slots.js";

export interface ListedCompositionTemplate extends FigmaCompositionTemplate {
  origin: "example" | "custom";
}

export async function discoverExampleTemplates(paletteSourceIds: readonly string[]) {
  const page = figma.root.children.find(node => node.name === "Примеры композиций");
  const templates: ListedCompositionTemplate[] = [];
  const warnings: string[] = [];
  if (!page) return { templates, warnings: ["Страница «Примеры композиций» не найдена. Пользовательские шаблоны доступны отдельно."] };
  await page.loadAsync();
  const frames = page.findAllWithCriteria({ types: ["FRAME"] });
  const frameIds = new Set(frames.map(node => node.id));
  const scenes = frames.filter(node => {
    let parent = node.parent;
    while (parent && parent.id !== page.id) {
      if (frameIds.has(parent.id)) return false;
      parent = parent.parent;
    }
    return true;
  }).sort((a, b) => a.absoluteTransform[1][2] - b.absoluteTransform[1][2] ||
    a.absoluteTransform[0][2] - b.absoluteTransform[0][2] || a.id.localeCompare(b.id));
  for (const source of scenes) {
    try {
      assertVectorComposition(source);
      if ([source, ...source.findAll(() => true)].some(node => paletteSourceIds.includes(node.id))) {
        throw new Error("Сцена содержит ресурс палитры.");
      }
      const subjects = getTemplateSlots(source).filter(slot => slot.kind !== "decoration");
      const generic = (name: string) => /^(group|frame|vector)(\s+\d+)?$/i.test(name.trim());
      const names = [...new Set(subjects.map(slot => slot.name.trim()).filter(name => !generic(name)))];
      const extra = subjects.some(slot => generic(slot.name)) ? " + дополнительные элементы" : "";
      const title = names.length ? names.join(" + ") + extra : "Композиция";
      const format = source.width === source.height ? "квадрат" : source.width > source.height ? "горизонтальный" : "вертикальный";
      const label = `${title.slice(0, 65)} — ${format}, ${Math.round(source.width)}×${Math.round(source.height)}`;
      templates.push({ id: `example-${source.id}`, name: label, sourceNodeId: source.id, origin: "example" });
    } catch (error) {
      warnings.push(`«${source.name}» (${source.id}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!scenes.length) warnings.push("На странице примеров нет фреймов композиций.");
  return { templates, warnings };
}

export function mergeCompositionTemplates(
  examples: readonly ListedCompositionTemplate[], saved: readonly FigmaCompositionTemplate[]
): ListedCompositionTemplate[] {
  const customSources = new Set(saved.map(item => item.sourceNodeId));
  return [...examples.filter(item => !customSources.has(item.sourceNodeId)),
    ...saved.map(item => ({ ...item, origin: "custom" as const }))];
}
