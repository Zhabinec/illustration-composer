import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetCatalog, AssetId } from "@illustration-composer/core";
import { postNamedCompositionResolution } from "../src/named-composition.js";

afterEach(() => vi.unstubAllGlobals());

const catalog = new AssetCatalog([{
  id: AssetId.create("phone"), name: "Телефон", tags: [],
  variants: [{ size: "L", role: "main", resourceKey: "phone/main" }]
}]);

describe("Named composition feedback", () => {
  it("returns real IDs and displays the available size for a known synonym", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("figma", { ui: { postMessage } });
    const result = postNamedCompositionResolution("смартфон", catalog, "S", "main");
    expect(result.errors).toEqual([]);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "names-resolved", query: "смартфон", size: "S", role: "main",
      items: [{ id: "phone", name: "Телефон", size: "L", role: "main", emphasis: "primary" }]
    }));
    expect(result.warnings).toHaveLength(1);
  });

  it("does not produce a partial selection when any requested name is unknown", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("figma", { ui: { postMessage } });
    const result = postNamedCompositionResolution("телефон, дракон", catalog, "L", "main");
    expect(result.selection).toEqual([]);
    expect(result.errors[0]).toContain("дракон");
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ items: [], errors: result.errors }));
  });
});
