import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverExampleTemplates, mergeCompositionTemplates } from "../src/figma-example-templates.js";

function frame(id: string, width = 1000, height = 1000, x = 0, y = 0) {
  const children = [
    { id: `${id}-phone`, name: "Телефон", type: "GROUP", width: 500, height: 400 },
    { id: `${id}-puzzle`, name: "Пазлы", type: "GROUP", width: 200, height: 100 },
    { id: `${id}-decor`, name: "конфетти", type: "GROUP", width: 800, height: 700 }
  ];
  return { id, name: "Фон", type: "FRAME", width, height, children,
    absoluteTransform: [[1, 0, x], [0, 1, y]], parent: { id: "section", parent: null },
    findAll: () => children };
}
function environment(frames: ReturnType<typeof frame>[]) {
  const page = { id: "page", name: "Примеры композиций", loadAsync: vi.fn(async () => {}),
    findAllWithCriteria: vi.fn(() => frames) };
  vi.stubGlobal("figma", { root: { children: [page] } });
  return page;
}
afterEach(() => vi.unstubAllGlobals());

describe("Default templates from reference examples", () => {
  it("discovers all formats with descriptive names, preserving the source nodes", async () => {
    const frames = [frame("portrait", 800, 1200, 0, 3000), frame("square"), frame("wide", 1200, 800, 0, 1500)];
    const before = JSON.stringify(frames);
    const page = environment(frames);
    const result = await discoverExampleTemplates([]);
    expect(page.loadAsync).toHaveBeenCalledOnce();
    expect(result.warnings).toEqual([]);
    expect(result.templates.map(item => item.sourceNodeId)).toEqual(["square", "wide", "portrait"]);
    expect(result.templates.map(item => item.name)).toEqual([
      "Телефон + Пазлы — квадрат, 1000×1000",
      "Телефон + Пазлы — горизонтальный, 1200×800",
      "Телефон + Пазлы — вертикальный, 800×1200"
    ]);
    expect(JSON.stringify(frames)).toBe(before);
  });
  it("excludes nested object frames from the template list", async () => {
    const outer = frame("outer");
    const nested = frame("nested");
    nested.parent = { id: "outer", parent: null };
    environment([outer, nested]);
    expect((await discoverExampleTemplates([])).templates.map(item => item.sourceNodeId)).toEqual(["outer"]);
  });
  it("reports invalid examples and palette resources without hiding the other scenes", async () => {
    const invalid = frame("invalid");
    invalid.children[0]!.type = "TEXT";
    environment([invalid, frame("palette"), frame("valid")]);
    const result = await discoverExampleTemplates(["palette-phone"]);
    expect(result.templates.map(item => item.sourceNodeId)).toEqual(["valid"]);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join(" ")).toContain("invalid");
    expect(result.warnings.join(" ")).toContain("палитры");
  });
  it("supports changed node IDs after copying the Figma file", async () => {
    environment([frame("copied-123")]);
    expect((await discoverExampleTemplates([])).templates[0]?.id).toBe("example-copied-123");
  });
  it("does not invent a semantic identity for unnamed source groups", async () => {
    const source = frame("unknown");
    source.children[1]!.name = "Group 2136136347";
    environment([source]);
    const result = await discoverExampleTemplates([]);
    expect(result.templates[0]?.name).toBe("Телефон — квадрат, 1000×1000");
    expect(source.children[1]!.name).toBe("Group 2136136347");
  });
  it("shows a useful warning when the page is absent", async () => {
    vi.stubGlobal("figma", { root: { children: [] } });
    const result = await discoverExampleTemplates([]);
    expect(result.templates).toEqual([]);
    expect(result.warnings[0]).toContain("не найдена");
  });
  it("preserves existing custom templates without duplicating their reference source", async () => {
    environment([frame("old"), frame("new")]);
    const examples = (await discoverExampleTemplates([])).templates;
    const saved = [{ id: "template-old", name: "Мой первый шаблон", sourceNodeId: "old" }];
    const result = mergeCompositionTemplates(examples, saved);
    expect(result).toHaveLength(2);
    expect(result.find(item => item.sourceNodeId === "old")).toEqual({ ...saved[0], origin: "custom" });
    expect(mergeCompositionTemplates(examples, saved)).toEqual(result);
  });
});
