import { describe, expect, it } from "vitest";
import source from "../src/library.json";
import { prepareDecorationAssets, arrangeDecorations, decorationVariant } from "../src/decorations";
import { arrange, compositionSubjects } from "../src/composition";
import { resizeElement } from "../src/resize-element";
import { findVariant, type VectorAsset } from "../src/model";

const assets = prepareDecorationAssets(source.assets as VectorAsset[]);

describe("scene controls", () => {
  it("uses a background drawing when requested and keeps explicit foreground choice", () => {
    const chosen = [assets.find(a => a.id === "book")!, assets.find(a => a.id === "lamp")!];
    const depth = compositionSubjects(chosen, 1200, true);
    expect(findVariant(assets, depth[0]!).role).toBe("main");
    expect(findVariant(assets, depth[1]!).role).toBe("background");
    expect(compositionSubjects(chosen, 1200, false).every(e => findVariant(assets,e).role === "main")).toBe(true);
  });

  it("keeps source vectors intact and makes flattened decorative lines visible", () => {
    const line = assets.find(a => a.id.startsWith("decor-") && /^line/i.test(a.name))!;
    const normalized = decorationVariant(line);
    expect(normalized.height).toBeGreaterThan(10);
    expect(normalized.svg).toBe(line.variants[0]!.svg);
    expect(prepareDecorationAssets(assets).find(a => a.id === line.id)!.variants).toHaveLength(line.variants.length);
  });

  it("adds editable decor from the original library, away from subjects", () => {
    const chosen = [assets.find(a => a.id === "book")!, assets.find(a => a.id === "lamp")!];
    const subjects = arrange(compositionSubjects(chosen,1200,true), assets,1200,800,"automatic");
    const decor = arrangeDecorations(subjects,assets,1200,800);
    expect(decor.length).toBeGreaterThan(1);
    expect(new Set(decor.map(e => e.id)).size).toBe(decor.length);
    expect(decor.every(e => findVariant(assets,e).svg.length > 0 && e.width > 0 && e.x >= 0 && e.y >= 0)).toBe(true);
  });

  it("resizes without a scale ceiling and anchors the rotated opposite corner", () => {
    const variant = { id:"v",width:200,height:100,size:"L" as const,role:"main" as const,svg:"" };
    const item = { id:"e",assetId:"a",variantId:"v",name:"A",x:10,y:20,width:200,rotation:90 };
    const resized = resizeElement(item,variant,-100,200);
    expect(resized.width).toBeCloseTo(400);
    const anchor = (e:typeof item) => ({ x:e.x + e.width / 2 + e.width / 4, y:e.y + e.width / 4 - e.width / 2 });
    expect(anchor(resized).x).toBeCloseTo(anchor(item).x);
    expect(anchor(resized).y).toBeCloseTo(anchor(item).y);
    expect(resizeElement({...item,rotation:0},variant,1000,500).width).toBeCloseTo(1200);
  });
});
