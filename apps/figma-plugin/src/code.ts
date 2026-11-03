
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

    const previewPage = figma.root.children.find(
      page => page.name === "Composer Preview"
    ) ?? figma.createPage();

    previewPage.name = "Composer Preview";
    await figma.setCurrentPageAsync(previewPage);

    const frame = figma.createFrame();
    frame.name = "Pen - S - Indexed";
    frame.resize(600, 400);

    const maxX = previewPage.children
      .filter(node => node.id !== frame.id)
      .reduce(
        (max, node) => Math.max(max, node.x + node.width),
        0
      );

    frame.x = maxX + 100;

    const copy = await adapter.cloneInto("pen/main/s", frame);

    copy.x = (frame.width - copy.width) / 2;
    copy.y = (frame.height - copy.height) / 2;

    figma.viewport.scrollAndZoomIntoView([frame]);

    console.log("Composer initialized:", {
      assets: catalog.getAll().length,
      unresolved: resolution.unresolved.length,
      clonedResource: "pen/main/s"
    });

    figma.notify("Illustration Composer initialized");
  } catch (error) {
    console.error("Illustration Composer failed:", error);
    figma.notify("Illustration Composer failed");
  } finally {
    figma.closePlugin();
  }
}

void main();
