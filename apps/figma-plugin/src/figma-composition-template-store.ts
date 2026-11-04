export interface FigmaCompositionTemplate {
  id: string;
  name: string;
  sourceNodeId: string;
}

const namespace = "illustrationComposer";
const key = "composition-templates-v1";

function parseTemplates(raw: string): FigmaCompositionTemplate[] {
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (typeof data !== "object" || data === null || !("version" in data) || data.version !== 1 ||
      !("templates" in data) || !Array.isArray(data.templates)) {
    throw new Error("Повреждён сохранённый список шаблонов. Данные не изменены.");
  }
  const templates: FigmaCompositionTemplate[] = [];
  for (const item of data.templates) {
    if (typeof item !== "object" || item === null ||
        !("id" in item) || typeof item.id !== "string" || !item.id.trim() ||
        !("name" in item) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 120 ||
        !("sourceNodeId" in item) || typeof item.sourceNodeId !== "string" || !item.sourceNodeId.trim() ||
        templates.some(existing => existing.id === item.id || existing.sourceNodeId === item.sourceNodeId ||
          existing.name.toLocaleLowerCase() === item.name.trim().toLocaleLowerCase())) {
      throw new Error("Некорректная или повторная запись шаблона. Данные не изменены.");
    }
    templates.push({ id: item.id, name: item.name.trim(), sourceNodeId: item.sourceNodeId });
  }
  return templates;
}

export class FigmaCompositionTemplateStore {
  list(): FigmaCompositionTemplate[] {
    return parseTemplates(figma.root.getSharedPluginData(namespace, key));
  }

  add(name: string, sourceNodeId: string): FigmaCompositionTemplate[] {
    const templates = this.list();
    const next = [...templates, { id: `template-${sourceNodeId}`, name: name.trim(), sourceNodeId }];
    const serialized = JSON.stringify({ version: 1, templates: next });
    parseTemplates(serialized);
    // JSON escapes Unicode here, so length is also the UTF-8 byte count.
    const ascii = serialized.replace(/[\u007f-\uffff]/g, character =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
    if (namespace.length + key.length + ascii.length > 95000) {
      throw new Error("Слишком много шаблонов для одной записи Figma.");
    }
    figma.root.setSharedPluginData(namespace, key, ascii);
    return next;
  }
}
