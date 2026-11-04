import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTemplateLayout } from "../src/figma-template-layout.js";
import { requestCompositionAdjustment } from "../src/composition-adjustments.js";

afterEach(() => vi.unstubAllGlobals());

function node(id: string, x: number, y: number) {
  return { id, type: "GROUP", width: 200, height: 100,
    relativeTransform: [[1, 0, x], [0, 1, y]],
    rescale: vi.fn(), setSharedPluginData: vi.fn() };
}

describe("Template layout application", () => {
  it("puts a background wallet behind a main coin without moving fixed decoration", () => {
    const coin = node("coin", 200, 300);
    const wallet = node("wallet", 300, 200);
    const decor = node("decor", 50, 50);
    const children = [coin, decor, wallet];
    const copy = { children, insertChild: (index: number, item: typeof coin) => {
      const previous = children.indexOf(item);
      if (previous >= 0) children.splice(previous, 1);
      children.splice(index, 0, item);
    } };
    Reflect.apply(applyTemplateLayout, undefined, [copy, new Map([["p", coin], ["s", wallet], ["d", decor]]), [
      { id: "p", name: "Монета", x: 200, y: 300, width: 200, height: 100, role: "main", kind: "primary", scale: 1 },
      { id: "s", name: "Кошелёк", x: 300, y: 200, width: 200, height: 100, role: "background", kind: "secondary", scale: 1 },
      { id: "d", name: "Конфетти", x: 50, y: 50, width: 200, height: 100, role: "main", kind: "decoration", scale: 1 }
    ]]);
    expect(children).toEqual([wallet, decor, coin]);
    expect(wallet.relativeTransform).toEqual([[1, 0, 300], [0, 1, 200]]);
    expect(wallet.setSharedPluginData).toHaveBeenCalledWith("illustrationComposer", "composition-role", "background");
    expect(coin.rescale).not.toHaveBeenCalled();
  });

  it("applies a smaller rotated object at the planned bounds", () => {
    const item = node("wallet", 300, 400);
    item.relativeTransform = [[0, -1, 300], [1, 0, 400]];
    Reflect.apply(applyTemplateLayout, undefined, [{ children: [item], insertChild: vi.fn() }, new Map([["s", item]]), [
      { id: "s", name: "Кошелёк", x: 500, y: 200, width: 50, height: 100, role: "main", kind: "secondary", scale: 0.5 }
    ]]);
    expect(item.rescale).toHaveBeenCalledWith(0.5);
    expect(item.relativeTransform).toEqual([[0, -1, 550], [1, 0, 200]]);
  });
});

describe("Composition resize confirmation", () => {
  it("requests explicit acceptance of the computed layout before proceeding", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("figma", { ui: { postMessage } });
    const request = { type: "template-create", id: "example" };
    const suggestions = [{ name: "Кошелёк", percent: 65 }];
    expect(requestCompositionAdjustment(request, suggestions, "layout-a")).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "composition-adjustment-required",
      request: { ...request, acceptShrinkFor: "layout-a" }, suggestions });
    expect(requestCompositionAdjustment({ ...request, acceptShrinkFor: "layout-a" }, suggestions, "layout-a")).toBe(false);
    expect(requestCompositionAdjustment({ ...request, acceptShrinkFor: "layout-a" }, suggestions, "layout-b")).toBe(true);
  });

  it("proceeds without confirmation when no objects need shrinking", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("figma", { ui: { postMessage } });
    expect(requestCompositionAdjustment({ type: "template-create" }, [], "layout")).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });
});
