
import { FigmaLibraryScanner } from "./figma-library-scanner.js";
import { suggestAssetNames } from "./figma-asset-matcher.js";
import { resolveLibrary } from "./figma-library-resolver.js";

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

    figma.notify(`Найдено объектов: ${assets.length}`);
  } catch (error) {
    console.error("Library scanning failed:", error);
    figma.notify("Ошибка сканирования библиотеки");
  } finally {
    figma.closePlugin();
  }
}

void main();
