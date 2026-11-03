
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

    console.log(
    "Domain catalog:",
    catalog.getAll().map(asset => ({
        id: asset.id.value,
        name: asset.name,
        variants: asset.variants
    }))
    );
    console.log("Asset index:", index);

    console.log("Asset index summary:", {
    assets: index.length,
    complete: index.filter(
        asset => asset.variants.length === 4
    ).length,
    incomplete: index
        .filter(asset => asset.variants.length !== 4)
        .map(asset => asset.name)
    });

    console.log("Unresolved assets:", resolution.unresolved);

    console.log("Suggested asset names:", suggestions);

    console.log("Matching summary:", {
    total: assets.length,
    alreadyNamed: assets.filter(a => a.identified).length,
    suggested: suggestions.length,
    unresolved:
        assets.filter(a => !a.identified).length -
        suggestions.length
    });

    console.log("Scanned assets:", assets);

    console.log("Library scan:", {
      total: assets.length,
      identified: assets.filter(a => a.identified).length,
      unidentified: assets.filter(a => !a.identified).length
    });

    console.log("Library resolution:", {
        resolved: resolution.resolved.length,
        unresolved: resolution.unresolved.length,
        suggested: resolution.resolved.filter(
            asset => asset.match === "suggested"
        ).length
    });

    
    const adapter = new FigmaAssetAdapter(catalog, index);

    const previewPage =
    figma.root.children.find(
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

    const copy = await adapter.cloneInto(
    "pen/main/s",
    frame
    );

    copy.x = (frame.width - copy.width) / 2;
    copy.y = (frame.height - copy.height) / 2;

    console.log("Indexed cloning:", {
    resourceKey: "pen/main/s",
    copiedId: copy.id,
    vectorCount: copy.children.length
    });

    figma.viewport.scrollAndZoomIntoView([frame]);


    figma.notify(`Найдено объектов: ${assets.length}`);
  } catch (error) {
    console.error("Library scanning failed:", error);
    figma.notify("Ошибка сканирования библиотеки");
  } finally {
    figma.closePlugin();
  }
}

void main();
