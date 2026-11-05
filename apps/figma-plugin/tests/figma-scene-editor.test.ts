import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetId, LibraryRegistry, VariantId, palettePresets } from "@illustration-composer/core";
import { addSceneObject, duplicateSceneObject, getEditableScene, getSceneObject, moveSceneLayer,
  postSceneEditorState, resizeScene, transformSceneObject } from "../src/figma-scene-editor.js";
import { handleSceneMessage } from "../src/scene-messages.js";
import { FigmaPaletteAdapter } from "../src/figma-palette-adapter.js";
import { replaceSceneObject, resizeSceneObject } from "../src/figma-object-editor.js";

afterEach(() => vi.unstubAllGlobals());
function metadata(initial: Record<string, string> = {}) {
  const values = { ...initial };
  return { getSharedPluginData: (_namespace: string, key: string) => values[key] ?? "",
    setSharedPluginData: (_namespace: string, key: string, value: string) => { values[key] = value; } };
}
function object(id: string, role = "main") {
  let parent: object | null = null;
  return { id, name: id, type: "GROUP", width: 200, height: 100, x: 40, y: 50, rotation: 0, locked: false, visible: true,
    ...metadata({ "composition-role": role }), relativeTransform: [[1, 0, 40], [0, 1, 50]],
    get parent() { return parent; }, attach: (owner: object) => { parent = owner; },
    clone: vi.fn(), remove: vi.fn(), rescale: vi.fn() };
}
function canvas(children = [object("coin"), object("wallet")]) {
  const frame = { id: "scene", name: "Composition", type: "FRAME", width: 1200, height: 800,
    parent: { type: "PAGE", name: "Composer Preview" }, children, ...metadata({ scene: "1", "palette-id": "original" }),
    findAll: () => children,
    resize: vi.fn((width: number, height: number) => { frame.width = width; frame.height = height; }),
    resizeWithoutConstraints: vi.fn((width: number, height: number) => { frame.width = width; frame.height = height; }),
    insertChild: (index: number, node: ReturnType<typeof object>) => {
      const previous = children.indexOf(node);
      if (previous >= 0) children.splice(previous, 1);
      children.splice(index, 0, node);
      node.attach(frame);
    },
    appendChild: (node: ReturnType<typeof object>) => frame.insertChild(children.length, node)
  };
  children.forEach(node => node.attach(frame));
  return frame;
}

describe("composition editing", () => {
  it("opens a regular selected frame and protects registered sources inside it", async () => {
    const frame = { ...canvas(), ...metadata(), parent: { type: "PAGE", name: "Мои иллюстрации" } };
    const postMessage = vi.fn();
    vi.stubGlobal("figma", { currentPage: { selection: [frame] }, ui: { postMessage }, getNodeByIdAsync: async () => frame });
    postSceneEditorState();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ scene: expect.objectContaining({ id: frame.id }) }));
    await expect(getEditableScene(frame.id)).resolves.toBe(frame);
    await expect(getEditableScene(frame.id, ["coin"])).rejects.toThrow(/исходный ресурс/);
    expect(frame.getSharedPluginData("", "scene")).toBe("");
  });

  it("refuses source library frames and foreign objects", async () => {
    const source = { ...canvas(), ...metadata(), parent: { type: "PAGE", name: "Библиотека компонентов" } };
    vi.stubGlobal("figma", { getNodeByIdAsync: async () => source });
    await expect(getEditableScene("source")).rejects.toThrow(/библиотеку/);
    expect(() => Reflect.apply(getSceneObject, undefined, [canvas(), "foreign"])).toThrow(/больше не/);
  });
  it("moves and rotates a selected copy, rejecting invalid coordinates before mutation", () => {
    const node = object("coin");
    Reflect.apply(transformSceneObject, undefined, [node, 100, -20, 35]);
    expect([node.x, node.y, node.rotation]).toEqual([100, -20, 35]);
    expect(() => Reflect.apply(transformSceneObject, undefined, [node, NaN, 0, 0])).toThrow();
    expect([node.x, node.y, node.rotation]).toEqual([100, -20, 35]);
  });
  it("duplicates an object independently with an offset", () => {
    const node = object("wallet"), copy = object("new-id");
    const frame = canvas([node]);
    node.clone.mockReturnValue(copy);
    expect(Reflect.apply(duplicateSceneObject, undefined, [node])).toBe(copy);
    expect(copy.parent).toBe(frame);
    expect(frame.children).toEqual([node, copy]);
    expect(copy.relativeTransform).toEqual([[1, 0, 64], [0, 1, 74]]);
    expect([node.x, node.y]).toEqual([40, 50]);
    expect(copy.name).toContain("копия");
  });
  it("reparents a page-level clone into the same canvas and keeps it selected and editable", async () => {
    const phone = object("phone"), copy = object("phone-copy"), other = object("coin");
    const frame = canvas([phone, other]);
    phone.relativeTransform = [[0, -1, 100], [1, 0, 200]];
    copy.attach({ type: "PAGE", name: "Composer Preview" });
    copy.relativeTransform = [[0, -1, 41000], [1, 0, 200]];
    phone.clone.mockReturnValue(copy);
    const postMessage = vi.fn();
    const page = { selection: [phone] };
    vi.stubGlobal("figma", { currentPage: page, ui: { postMessage }, getNodeByIdAsync: async () => frame, commitUndo: vi.fn() });
    const state = { version: 1 as const, registry: { assets: [] }, sourceNodeIds: {}, palettes: [] };
    await handleSceneMessage({ type: "scene-duplicate", sceneId: frame.id, nodeId: phone.id, palette: "original" }, state);
    expect(frame.children.map(node => node.id)).toEqual(["phone", "phone-copy", "coin"]);
    expect(copy.relativeTransform).toEqual([[0, -1, 124], [1, 0, 224]]);
    expect(page.selection).toEqual([copy]);
    postSceneEditorState();
    expect(postMessage.mock.lastCall![0].scene.id).toBe(frame.id);
    expect(postMessage.mock.lastCall![0].scene.selectedId).toBe(copy.id);
    expect(postMessage.mock.lastCall![0].scene.items.map((item: { id: string }) => item.id)).toContain(copy.id);
    await handleSceneMessage({ type: "scene-transform", sceneId: frame.id, nodeId: copy.id, palette: "original", x: 150, y: 400, rotation: 30 }, state);
    expect([copy.x, copy.y, copy.rotation]).toEqual([150, 400, 30]);
    expect([phone.x, phone.y, phone.rotation]).toEqual([40, 50, 0]);
    expect(page.selection).toEqual([copy]);
  });
  it("changes layer order while keeping background objects behind main objects", () => {
    const background = object("lamp", "background"), coin = object("coin"), wallet = object("wallet");
    const frame = canvas([background, coin, wallet]);
    Reflect.apply(moveSceneLayer, undefined, [coin, "forward"]);
    expect(frame.children.map(node => node.id)).toEqual(["lamp", "wallet", "coin"]);
    Reflect.apply(moveSceneLayer, undefined, [background, "forward"]);
    expect(frame.children.map(node => node.id)).toEqual(["lamp", "wallet", "coin"]);
  });
  it("adds a vector copy to the existing canvas and selects it", async () => {
    const frame = canvas(), copy = object("new-lamp", "background");
    const adapter = { getDimensions: vi.fn(async () => ({ width: 200, height: 100 })), cloneInto: vi.fn(async () => { frame.children.push(copy); return copy; }) };
    vi.stubGlobal("figma", { currentPage: { selection: [] } });
    await Reflect.apply(addSceneObject, undefined, [frame, adapter, "registered-lamp", "Лампа", "background", palettePresets.original]);
    expect(adapter.cloneInto).toHaveBeenCalledWith("registered-lamp", frame);
    expect(frame.children[0]).toBe(copy);
    expect(copy.rescale).toHaveBeenCalled();
    expect(copy.name).toBe("Лампа");
  });
  it("resizes the canvas and scales all copies uniformly, preserving rotation", () => {
    const frame = canvas(), node = frame.children[0]!;
    node.relativeTransform = [[0, -1, 40], [1, 0, 50]];
    Reflect.apply(resizeScene, undefined, [frame, 600, 800, palettePresets.mint]);
    expect(frame.resizeWithoutConstraints).toHaveBeenCalledWith(600, 800);
    expect(frame.resize).not.toHaveBeenCalled();
    expect(node.rescale).toHaveBeenCalledWith(0.5);
    expect(node.relativeTransform).toEqual([[0, -1, 20], [1, 0, 225]]);
    expect(frame.getSharedPluginData("illustrationComposer", "palette-id")).toBe("mint");
  });
  it("reports the selected object and deletes only a copy with an undo boundary", async () => {
    const frame = canvas(), target = frame.children[0]!;
    target.remove.mockImplementation(() => frame.children.splice(frame.children.indexOf(target), 1));
    const postMessage = vi.fn(), commitUndo = vi.fn();
    vi.stubGlobal("figma", { currentPage: { selection: [target] }, ui: { postMessage }, getNodeByIdAsync: async () => frame, commitUndo });
    postSceneEditorState();
    expect(postMessage.mock.calls[0]![0].scene.selectedId).toBe(target.id);
    await handleSceneMessage({ type: "scene-delete", sceneId: frame.id, nodeId: target.id, palette: "original" },
      { version: 1, registry: { assets: [] }, sourceNodeIds: {}, palettes: [] });
    expect(frame.children.map(node => node.id)).toEqual(["wallet"]);
    expect(target.remove).toHaveBeenCalledOnce();
    expect(commitUndo).toHaveBeenCalledOnce();
  });
  it("keeps a legacy canvas editable after its last object is deleted", async () => {
    const target = object("phone"), frame = Object.assign(canvas([target]), metadata());
    target.remove.mockImplementation(() => frame.children.splice(0, 1));
    const postMessage = vi.fn();
    vi.stubGlobal("figma", { currentPage: { selection: [target] }, ui: { postMessage }, getNodeByIdAsync: async () => frame, commitUndo: vi.fn() });
    await handleSceneMessage({ type: "scene-delete", sceneId: frame.id, nodeId: target.id, palette: "original" },
      { version: 1, registry: { assets: [] }, sourceNodeIds: {}, palettes: [] });
    expect(frame.children).toEqual([]);
    expect(await getEditableScene(frame.id)).toBe(frame);
    expect(postMessage.mock.lastCall![0].scene.id).toBe(frame.id);
    expect(postMessage.mock.lastCall![0].scene.items).toEqual([]);
  });
});

describe("recoloring an existing composition", () => {
  it("can apply successive palettes and restore original colors without recoloring black outlines", () => {
    const node = { type: "VECTOR", ...metadata(), fills: [{ type: "SOLID", color: { r: 120 / 255, g: 100 / 255, b: 215 / 255 } }],
      strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }] };
    const adapter = new FigmaPaletteAdapter();
    Reflect.apply(adapter.apply, adapter, [node, palettePresets.mint]);
    expect(node.fills[0]!.color).toEqual({ r: 90 / 255, g: 190 / 255, b: 190 / 255 });
    Reflect.apply(adapter.apply, adapter, [node, palettePresets.peach]);
    expect(node.fills[0]!.color).toEqual({ r: 210 / 255, g: 117 / 255, b: 50 / 255 });
    Reflect.apply(adapter.apply, adapter, [node, palettePresets.original]);
    expect(node.fills[0]!.color).toEqual({ r: 120 / 255, g: 100 / 255, b: 215 / 255 });
    expect(node.strokes[0]!.color).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe("replacing and resizing an individual object", () => {
  it("resizes proportionally around the center of a rotated object", () => {
    const node = object("phone");
    node.relativeTransform = [[0, -1, 100], [1, 0, 200]];
    node.rescale.mockImplementation((scale: number) => { node.width *= scale; node.height *= scale; });
    Reflect.apply(resizeSceneObject, undefined, [node, 400]);
    expect([node.width, node.height]).toEqual([400, 200]);
    expect(node.relativeTransform).toEqual([[0, -1, 150], [1, 0, 100]]);
    const [[a, c, x], [b, d, y]] = node.relativeTransform;
    expect([x! + a! * node.width / 2 + c! * node.height / 2,
      y! + b! * node.width / 2 + d! * node.height / 2]).toEqual([50, 300]);
  });
  it.each([0, -1, NaN, Infinity, 10001])("rejects invalid width %s before changing the drawing", width => {
    const node = object("phone");
    expect(() => Reflect.apply(resizeSceneObject, undefined, [node, width])).toThrow();
    expect(node.rescale).not.toHaveBeenCalled();
    expect([node.width, node.height]).toEqual([200, 100]);
  });
  it("replaces a vector in the same layer and container, retaining its center, angle and background role", async () => {
    const below = object("below"), old = object("phone", "background"), above = object("above"), copy = object("new-wallet");
    const frame = canvas([below, old, above]);
    old.relativeTransform = [[0, -1, 100], [1, 0, 200]];
    old.remove.mockImplementation(() => frame.children.splice(frame.children.indexOf(old), 1));
    copy.width = 100; copy.height = 100;
    copy.rescale.mockImplementation((scale: number) => { copy.width *= scale; copy.height *= scale; });
    const adapter = { cloneInto: vi.fn(async () => { frame.children.push(copy); copy.attach(frame); return copy; }) };
    const result = await Reflect.apply(replaceSceneObject, undefined, [old, adapter, "wallet-background", "Кошелёк", palettePresets.mint]);
    expect(result).toBe(copy);
    expect(adapter.cloneInto).toHaveBeenCalledWith("wallet-background", frame);
    expect(frame.children.map(node => node.id)).toEqual(["below", "new-wallet", "above"]);
    expect(copy.relativeTransform).toEqual([[0, -1, 100], [1, 0, 250]]);
    expect([copy.width, copy.height]).toEqual([100, 100]);
    expect(copy.getSharedPluginData("illustrationComposer", "composition-role")).toBe("background");
    expect(copy.name).toBe("Кошелёк");
    expect(old.remove).toHaveBeenCalledOnce();
    expect([below.x, below.y, above.x, above.y]).toEqual([40, 50, 40, 50]);
    expect(Reflect.apply(getSceneObject, undefined, [frame, copy.id])).toBe(copy);
  });
  it("keeps the old drawing when a replacement is invalid", async () => {
    const old = object("phone"), copy = { ...object("raster"), fills: [{ type: "IMAGE" }] };
    const frame = canvas([old]);
    copy.remove.mockImplementation(() => frame.children.splice(frame.children.indexOf(copy), 1));
    const adapter = { cloneInto: async () => { frame.children.push(copy); copy.attach(frame); return copy; } };
    await expect(Reflect.apply(replaceSceneObject, undefined, [old, adapter, "invalid", "Предмет", palettePresets.original])).rejects.toThrow(/растров/);
    expect(old.remove).not.toHaveBeenCalled();
    expect(frame.children).toEqual([old]);
    expect(copy.remove).toHaveBeenCalledOnce();
  });
  it("keeps the old drawing when its source is missing", async () => {
    const old = object("phone"), frame = canvas([old]);
    const adapter = { cloneInto: async () => { throw new Error("Source missing"); } };
    await expect(Reflect.apply(replaceSceneObject, undefined, [old, adapter, "missing", "Предмет", palettePresets.original])).rejects.toThrow(/missing/);
    expect(frame.children).toEqual([old]);
    expect(old.remove).not.toHaveBeenCalled();
  });
  it("keeps the resized object selected inside the same composition", async () => {
    const node = object("phone"), frame = canvas([node]);
    node.rescale.mockImplementation((scale: number) => { node.width *= scale; node.height *= scale; });
    const postMessage = vi.fn();
    const page = { selection: [node] };
    vi.stubGlobal("figma", { currentPage: page, ui: { postMessage }, getNodeByIdAsync: async () => frame, commitUndo: vi.fn() });
    await handleSceneMessage({ type: "scene-resize-object", sceneId: frame.id, nodeId: node.id, width: 300, palette: "original" },
      { version: 1, registry: { assets: [] }, sourceNodeIds: {}, palettes: [] });
    expect(page.selection).toEqual([node]);
    expect(postMessage.mock.lastCall![0].scene.selectedId).toBe(node.id);
    expect(postMessage.mock.lastCall![0].scene.items[0].width).toBe(300);
    expect(postMessage.mock.lastCall![0].scene.items[0].height).toBe(150);
  });
  it.each(["L", "S"])("resolves a replacement against the current catalog for requested size %s", async size => {
    const registry = new LibraryRegistry();
    registry.createAsset(AssetId.create("wallet"), "Кошелёк", {
      id: VariantId.create("wallet-main"), size: "L", role: "main", resourceKey: "wallet-resource"
    });
    const old = object("phone"), copy = object("wallet-copy"), frame = canvas([old]);
    const source = object("library-wallet");
    source.clone.mockReturnValue(copy);
    old.remove.mockImplementation(() => frame.children.splice(frame.children.indexOf(old), 1));
    const postMessage = vi.fn(), page = { selection: [old] };
    vi.stubGlobal("figma", { currentPage: page, ui: { postMessage }, commitUndo: vi.fn(),
      getNodeByIdAsync: async (id: string) => id === frame.id ? frame : id === source.id ? source : null });
    const request = { type: "scene-replace", sceneId: frame.id, nodeId: old.id, assetId: "wallet", size,
      role: "background", palette: "original" };
    const state = { version: 1 as const, registry: registry.snapshot(), sourceNodeIds: { "wallet-resource": source.id }, palettes: [] };
    if (size === "S") {
      await expect(handleSceneMessage(request, state)).rejects.toThrow(/нет выбранного варианта/);
      expect(source.clone).not.toHaveBeenCalled();
      expect(old.remove).not.toHaveBeenCalled();
      return;
    }
    await handleSceneMessage(request, state);
    expect(frame.children).toEqual([copy]);
    expect(page.selection).toEqual([copy]);
    expect(copy.name).toBe("Кошелёк");
    expect(copy.getSharedPluginData("illustrationComposer", "composition-role")).toBe("main");
    expect(postMessage.mock.lastCall![0].scene.selectedId).toBe(copy.id);
    expect(source.name).toBe("library-wallet");
    expect(source.rescale).not.toHaveBeenCalled();
  });
});
