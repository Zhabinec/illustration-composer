
import {
  AssetId,
  createRowComposition,
  findAssetVariant
} from "@illustration-composer/core";
import type { CompositionSource } from "@illustration-composer/core";

import { FigmaLibraryScanner } from "./figma-library-scanner.js";
import { suggestAssetNames } from "./figma-asset-matcher.js";
import { resolveLibrary } from "./figma-library-resolver.js";
import { indexResolvedAssets } from "./figma-asset-index.js";
import { createAssetCatalog } from "./figma-catalog-factory.js";
import { FigmaAssetAdapter } from "./figma-asset-adapter.js";

async function main(): Promise<void> {
  try {
    const library = figma.root.children.find(
      page => page.name === "Библиотека компонентов"
    );

    if (!library) {
      throw new Error("Library not found");
    }

    await library.loadAsync();

    const scanner = new FigmaLibraryScanner(library);
    const assets = scanner.scan();
    const suggestions = suggestAssetNames(assets);
    const resolution = resolveLibrary(assets, suggestions);
    const index = indexResolvedAssets(resolution.resolved);
    const catalog = createAssetCatalog(index);
    const adapter = new FigmaAssetAdapter(catalog, index);

    const selections = [
      { assetId: "book", size: "L", emphasis: "primary" },
      { assetId: "pen", size: "S", emphasis: "secondary" }
    ] as const;

    const sources: CompositionSource[] = [];

    for (const selection of selections) {
      const asset = catalog.getById(
        AssetId.create(selection.assetId)
      );

      if (!asset) {
        throw new Error(`Asset not found: ${selection.assetId}`);
      }

      const variant = findAssetVariant(
        asset,
        selection.size,
        "main"
      );

      if (!variant) {
        throw new Error(`Variant not found: ${selection.assetId}`);
      }

      const dimensions = await adapter.getDimensions(
        variant.resourceKey
      );

      sources.push({
        assetId: asset.id,
        variant,
        ...dimensions,
        emphasis: selection.emphasis
      });
    }

    const scene = createRowComposition(1200, 800, sources);

    const previewPage = figma.root.children.find(
      page => page.name === "Composer Preview"
    ) ?? figma.createPage();

    previewPage.name = "Composer Preview";
    await figma.setCurrentPageAsync(previewPage);

    const frame = figma.createFrame();
    frame.name = "Composition - Book + Pen";
    frame.resize(scene.width, scene.height);

    const maxX = previewPage.children
      .filter(node => node.id !== frame.id)
      .reduce(
        (max, node) => Math.max(max, node.x + node.width),
        0
      );

    frame.x = maxX + 100;

    for (const item of scene.items) {
      const copy = await adapter.cloneInto(
        item.variant.resourceKey,
        frame
      );

      copy.rescale(item.scale);
      copy.rotation = item.rotation;
      copy.x = item.x;
      copy.y = item.y;
    }

    figma.viewport.scrollAndZoomIntoView([frame]);

    console.log("Composition created:", {
      width: scene.width,
      height: scene.height,
      items: scene.items.length,
      resources: scene.items.map(
        item => item.variant.resourceKey
      )
    });

    figma.notify("Composition created");
  } catch (error) {
    console.error("Illustration Composer failed:", error);
    figma.notify("Illustration Composer failed");
  } finally {
    figma.closePlugin();
  }
}

void main();
