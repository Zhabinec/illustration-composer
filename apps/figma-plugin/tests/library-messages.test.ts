import { afterEach, expect, it, vi } from "vitest";
import { initializeLibrary } from "../src/library-messages.js";

afterEach(() => vi.unstubAllGlobals());

it("rejects a raster inside a registered group before writing to the catalog", async () => {
  const layer = { type: "RECTANGLE", name: "Обложка", fills: [{ type: "IMAGE" }] };
  const source = { type: "GROUP", id: "1:1", findAll: () => [layer] };
  const setSharedPluginData = vi.fn();
  vi.stubGlobal("figma", {
    root: {
      children: [{
        name: "Библиотека компонентов",
        loadAsync: async () => {},
        children: ["S", "L"].map(size => ({
          type: "SECTION", name: `Размер ${size}`,
          children: [{ name: "Главные объекты" }, { name: "Фоновые объекты" }]
        }))
      }],
      getSharedPluginData: () => JSON.stringify({
        version: 1, registry: { version: 1, assets: [] }, sourceNodeIds: {}, palettes: []
      }),
      setSharedPluginData
    },
    getNodeByIdAsync: async () => source,
    ui: { postMessage: vi.fn() }
  });
  const library = await initializeLibrary();
  const command = { type: "register", kind: "new", nodeId: source.id, name: "Книга", size: "L", role: "main" };

  await expect(library.handleMessage(command)).rejects.toThrow(/Обложка.*растровую/);
  expect(setSharedPluginData).not.toHaveBeenCalled();
  expect(library.state.registry.assets).toHaveLength(0);

  layer.fills = [{ type: "SOLID" }];
  await expect(library.handleMessage(command)).resolves.toBe(true);
  expect(setSharedPluginData).toHaveBeenCalledOnce();
  expect(library.state.registry.assets.map(asset => asset.name)).toEqual(["Книга"]);
});
