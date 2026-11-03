
import {
  AssetId,
  createFocusComposition,
  createRowComposition,
  findAssetVariant,
  resolvePalette
} from "@illustration-composer/core";

import type { CompositionSource } from "@illustration-composer/core";

import { FigmaLibraryScanner } from "./figma-library-scanner.js";
import { suggestAssetNames } from "./figma-asset-matcher.js";
import { resolveLibrary } from "./figma-library-resolver.js";
import { indexResolvedAssets } from "./figma-asset-index.js";
import { createAssetCatalog } from "./figma-catalog-factory.js";
import { FigmaAssetAdapter } from "./figma-asset-adapter.js";
import { FigmaSceneRenderer } from "./figma-scene-renderer.js";

const canvasPresets = {
  landscape: { width: 1200, height: 800 },
  square: { width: 1000, height: 1000 },
  portrait: { width: 800, height: 1200 }
} as const;

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
    const renderer = new FigmaSceneRenderer(adapter);

    figma.showUI(__html__, {
      width: 340,
      height: 560,
      themeColors: true
    });

    let isCreating = false;

    figma.ui.onmessage = async (message: unknown): Promise<void> => {
      if (
        typeof message !== "object" ||
        message === null ||
        !("type" in message) ||
        message.type !== "create" ||
        !("primaryId" in message) ||
        !("secondaryId" in message) ||
        !("layout" in message) ||
        !("format" in message) ||
        !("palette" in message) ||
        typeof message.primaryId !== "string" ||
        typeof message.secondaryId !== "string" ||
        (message.layout !== "focus" && message.layout !== "row") ||
        (
          message.format !== "landscape" &&
          message.format !== "square" &&
          message.format !== "portrait"
        ) ||
        isCreating
      ) {
        return;
      }

      isCreating = true;

      try {
        const palette = resolvePalette(message.palette);
        const canvas = canvasPresets[message.format];

        const selections = [
          {
            id: message.primaryId,
            size: "L",
            emphasis: "primary"
          },
          {
            id: message.secondaryId,
            size: "S",
            emphasis: "secondary"
          }
        ] as const;

        const sources: CompositionSource[] = [];
        const names: string[] = [];

        for (const selection of selections) {
          const asset = catalog.getById(
            AssetId.create(selection.id)
          );

          if (!asset) {
            throw new Error(`Asset not found: ${selection.id}`);
          }

          const variant = findAssetVariant(
            asset,
            selection.size,
            "main"
          );

          if (!variant) {
            throw new Error(`Variant not found: ${selection.id}`);
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

          names.push(asset.name);
        }

        const [primary, secondary] = sources;

        if (!primary || !secondary) {
          throw new Error("Two objects are required");
        }

        const scene = message.layout === "row"
          ? createRowComposition(
              canvas.width,
              canvas.height,
              sources
            )
          : createFocusComposition(
              canvas.width,
              canvas.height,
              primary,
              secondary
            );

        const previewPage = figma.root.children.find(
          page => page.name === "Composer Preview"
        ) ?? figma.createPage();

        previewPage.name = "Composer Preview";

        await figma.setCurrentPageAsync(previewPage);

        const layoutName = message.layout === "row"
          ? "Row"
          : "Focus";

        const frame = await renderer.render(
          scene,
          `${layoutName} - ${names.join(" + ")} - ${canvas.width}x${canvas.height}`,
          palette
        );

        figma.viewport.scrollAndZoomIntoView([frame]);

        figma.ui.postMessage({
          type: "created"
        });

        console.log("Composition created:", {
          layout: message.layout,
          format: message.format,
          palette: palette.name,
          objects: names,
          width: scene.width,
          height: scene.height
        });
      } catch (error) {
        console.error("Composition failed:", error);

        figma.ui.postMessage({
          type: "error",
          message: error instanceof Error
            ? error.message
            : String(error)
        });
      } finally {
        isCreating = false;
      }
    };

    figma.ui.postMessage({
      type: "ready",
      assets: catalog.getAll().map(asset => ({
        id: asset.id.value,
        name: asset.name
      }))
    });
  } catch (error) {
    console.error("Illustration Composer failed:", error);
    figma.notify("Illustration Composer initialization failed");
    figma.closePlugin();
  }
}

void main();
