import {
  AssetId,
  LibraryRegistry,
  VariantId,
  createFocusComposition,
  createRowComposition,
  findAssetVariant,
  resolvePalette
} from "@illustration-composer/core";

import type {
  Asset,
  ColorPalette,
  CompositionSource
} from "@illustration-composer/core";

import { FigmaLibraryScanner } from "./figma-library-scanner.js";
import { suggestAssetNames } from "./figma-asset-matcher.js";
import { resolveLibrary } from "./figma-library-resolver.js";
import {
  FigmaRegistryStore,
  sourceIdentity,
  toAssetCatalog
} from "./figma-registry-store.js";

import type { RegistryDocument } from "./figma-registry-store.js";

import { FigmaAssetAdapter } from "./figma-asset-adapter.js";
import { FigmaSceneRenderer } from "./figma-scene-renderer.js";
import { handleTemplateMessage } from "./template-messages.js";
import { requestCompositionAdjustment } from "./composition-adjustments.js";
import { postNamedCompositionResolution } from "./named-composition.js";
import { postMetaphorComposition } from "./metaphor-composition.js";

const formats = {
  landscape: { width: 1200, height: 800 },
  square: { width: 1000, height: 1000 },
  portrait: { width: 800, height: 1200 }
} as const;

type Size = "S" | "L";
type Role = "main" | "background";
type ResourceNode = GroupNode | FrameNode | VectorNode;

type Candidate = {
  nodeId: string;
  name: string;
  size: Size;
  role: Role;
};

type Conflict = {
  token: number;
  nodeId: string;
  assetId: string;
  size: Size;
  role: Role;
  activeId: string;
};

function stringField(
  message: Record<string, unknown>,
  key: string
): string {
  const value = message[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid field: ${key}`);
  }

  return value.trim();
}

function sizeField(value: unknown): Size {
  if (value !== "S" && value !== "L") {
    throw new Error("Invalid size");
  }

  return value;
}

function roleField(value: unknown): Role {
  if (value !== "main" && value !== "background") {
    throw new Error("Invalid role");
  }

  return value;
}

async function resourceNode(
  nodeId: string
): Promise<ResourceNode> {
  const node = await figma.getNodeByIdAsync(nodeId);

  if (
    !node ||
    (
      node.type !== "GROUP" &&
      node.type !== "FRAME" &&
      node.type !== "VECTOR"
    )
  ) {
    throw new Error("Source node is missing or unsupported");
  }

  return node;
}

async function thumbnail(
  nodeId: string
): Promise<string | null> {
  try {
    const node = await resourceNode(nodeId);

    const image = await node.exportAsync({
      format: "PNG",
      constraint: {
        type: "WIDTH",
        value: 160
      }
    });

    return `data:image/png;base64,${figma.base64Encode(image)}`;
  } catch {
    return null;
  }
}
function extractSolidColors(node: ResourceNode): string[] {
  const counts = new Map<string, number>();

  const descendants = "findAll" in node
    ? node.findAll(() => true)
    : [];

  for (const item of [node, ...descendants]) {
    const paints: Paint[] = [];

    if ("fills" in item && Array.isArray(item.fills)) {
      paints.push(...item.fills);
    }

    if ("strokes" in item && Array.isArray(item.strokes)) {
      paints.push(...item.strokes);
    }

    for (const paint of paints) {
      if (paint.type !== "SOLID") {
        continue;
      }

      const hex = `#${[
        paint.color.r,
        paint.color.g,
        paint.color.b
      ]
        .map(channel =>
          Math.round(channel * 255)
            .toString(16)
            .padStart(2, "0")
        )
        .join("")
        .toUpperCase()}`;

      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);
}

function activeVariant(
  asset: Asset,
  size: Size,
  role: Role
) {
  return findAssetVariant(asset, size, role) ??
    findAssetVariant(
      asset,
      size === "S" ? "L" : "S",
      role
    );
}

async function main(): Promise<void> {
  try {
    const library = figma.root.children.find(
      page => page.name === "Библиотека компонентов"
    );

    if (!library) {
      throw new Error("Library page not found");
    }

    await library.loadAsync();

    const scanner = new FigmaLibraryScanner(library);
    const store = new FigmaRegistryStore();

    let scanned = scanner.scan();
    let document = store.load();

    if (!document) {
      const suggestions = suggestAssetNames(scanned);
      const resolution = resolveLibrary(
        scanned,
        suggestions
      );

      document = store.bootstrap(resolution.resolved);
      store.save(document);
    }

    let state: RegistryDocument = document;

    const manuallySelected = new Map<string, Candidate>();

    let conflict: Conflict | null = null;
    let conflictSequence = 0;
    let messageQueue: Promise<void> = Promise.resolve();

    function knownNodes(): Set<string> {
      return new Set([
        ...Object.values(state.sourceNodeIds),
        ...state.palettes.map(
          palette => palette.sourceNodeId
        )
      ]);
    }

    function candidates(): Candidate[] {
      const registered = knownNodes();
      const byId = new Map<string, Candidate>();

      for (const item of scanned) {
        if (registered.has(item.nodeId)) {
          continue;
        }

        byId.set(item.nodeId, {
          nodeId: item.nodeId,
          name: item.name,
          size: item.size,
          role: item.role
        });
      }

      for (const item of manuallySelected.values()) {
        if (!registered.has(item.nodeId)) {
          byId.set(item.nodeId, item);
        }
      }

      return [...byId.values()];
    }

    function save(
      nextRegistry: LibraryRegistry,
      nextDocument: RegistryDocument
    ): void {
      const updated: RegistryDocument = {
        ...nextDocument,
        registry: nextRegistry.snapshot()
      };

      store.save(updated);
      state = updated;
    }

    function sendReady(): void {
      const registry = new LibraryRegistry(state.registry);

      figma.ui.postMessage({
        type: "ready",
        assets: registry.getAll(),
        candidates: candidates(),
        palettes: [
          { id: "original", name: "Фиолетовая" },
          { id: "mint", name: "Мятная" },
          { id: "peach", name: "Персиковая" },
          ...state.palettes.map(item => ({
            id: item.id,
            name: item.name
          }))
        ]
      });
    }

    async function register(
      message: Record<string, unknown>,
      decision?: "replace" | "alternative"
    ): Promise<void> {
      const nodeId = stringField(message, "nodeId");
      const kind = stringField(message, "kind");
      const node = await resourceNode(nodeId);

      if (knownNodes().has(nodeId)) {
        throw new Error("Resource already registered");
      }

      if (kind === "palette") {
        if (decision) {
          throw new Error(
            "Palette conflicts cannot be resolved as variants"
          );
        }

        const name = stringField(message, "name");

        const duplicatePreset = [
          "Фиолетовая",
          "Мятная",
          "Персиковая"
        ].some(
          item => item.toLowerCase() === name.toLowerCase()
        );

        const duplicateCustom = state.palettes.some(
          item => item.name.toLowerCase() === name.toLowerCase()
        );

        if (duplicatePreset || duplicateCustom) {
          throw new Error("Palette name already exists");
        }

        const colors = message.colors;

        if (
          typeof colors !== "object" ||
          colors === null ||
          Array.isArray(colors)
        ) {
          throw new Error("Select palette colors");
        }

        const supplied = colors as Record<string, unknown>;
        const available = new Set(extractSolidColors(node));

        if (available.size < 3) {
          throw new Error(
            "Palette source needs at least three colors"
          );
        }

        for (const value of Object.values(supplied)) {
          if (
            typeof value !== "string" ||
            !available.has(value.toUpperCase())
          ) {
            throw new Error(
              "Palette contains a color missing from this source"
            );
          }
        }

        const normalized = resolvePalette({
          name,
          ...supplied
        });

        const identity = sourceIdentity(nodeId);
        const registry = new LibraryRegistry(state.registry);

        save(registry, {
          ...state,
          palettes: [
            ...state.palettes,
            {
              ...normalized,
              id: identity.paletteId,
              sourceNodeId: nodeId
            }
          ]
        });

        conflict = null;
        sendReady();

        return;
      }

      const size = sizeField(message.size);
      const role = roleField(message.role);

      const identity = sourceIdentity(nodeId);

      const variant = {
        id: identity.variantId,
        resourceKey: identity.resourceKey,
        size,
        role
      };

      const registry = new LibraryRegistry(state.registry);

      if (kind === "new") {
        if (decision) {
          throw new Error(
            "New asset does not need replacement"
          );
        }

        registry.createAsset(
          identity.assetId,
          stringField(message, "name"),
          variant
        );
      } else if (kind === "existing") {
        const assetId = AssetId.create(
          stringField(message, "assetId")
        );

        const result = registry.registerVariant({
          ...variant,
          assetId,
          ...(decision
            ? {
                decision,
                expectedActiveId: VariantId.create(
                  stringField(message, "expectedActiveId")
                )
              }
            : {})
        });

        if (result.status === "conflict") {
          const currentNodeId =
            state.sourceNodeIds[result.current.resourceKey];

          conflict = {
            token: ++conflictSequence,
            nodeId,
            assetId: assetId.value,
            size,
            role,
            activeId: result.current.id
          };

          figma.ui.postMessage({
            type: "conflict",
            token: conflict.token,
            current: result.current,
            currentPreview: currentNodeId
              ? await thumbnail(currentNodeId)
              : null,
            incomingPreview: await thumbnail(nodeId)
          });

          return;
        }
      } else {
        throw new Error("Unknown registration type");
      }

      save(registry, {
        ...state,
        sourceNodeIds: {
          ...state.sourceNodeIds,
          [variant.resourceKey]: nodeId
        }
      });

      manuallySelected.delete(nodeId);
      conflict = null;

      sendReady();
    }

    async function createComposition(
      message: Record<string, unknown>
    ): Promise<void> {
      const format = stringField(message, "format");

      if (!Object.prototype.hasOwnProperty.call(formats, format)) {
        throw new Error("Invalid canvas format");
      }

      const canvas = formats[
        format as keyof typeof formats
      ];

      const layout = stringField(message, "layout");

      if (layout !== "focus" && layout !== "row") {
        throw new Error("Invalid layout");
      }

      const size = sizeField(message.size);
      const secondaryRole = roleField(
        message.secondaryRole
      );

      const registry = new LibraryRegistry(state.registry);
      const catalog = toAssetCatalog(registry);

      const adapter = new FigmaAssetAdapter(
        state.sourceNodeIds
      );

      const renderer = new FigmaSceneRenderer(adapter);

      let palette: ColorPalette;

      if (typeof message.palette === "string") {
        palette =
          state.palettes.find(
            item => item.id === message.palette
          ) ?? resolvePalette(message.palette);
      } else {
        palette = resolvePalette(message.palette);
      }

      const named = message.mode === "names" ? postNamedCompositionResolution(
        typeof message.names === "string" ? message.names : "", catalog, size, secondaryRole
      ) : null;
      if (named?.errors.length) return;

      const selection = named ? named.selection.map(item => ({
        id: item.asset.id.value, role: item.variant.role, emphasis: item.emphasis
      })) : [
        {
          id: stringField(message, "primaryId"),
          role: "main" as const,
          emphasis: "primary" as const
        },
        {
          id: stringField(message, "secondaryId"),
          role: secondaryRole,
          emphasis: "secondary" as const
        }
      ];

      const sources: CompositionSource[] = [];
      const names: string[] = [];

      for (const item of selection) {
        const asset = catalog.getById(
          AssetId.create(item.id)
        );

        if (!asset) {
          throw new Error(`Unknown asset: ${item.id}`);
        }

        const variant = activeVariant(
          asset,
          size,
          item.role
        );

        if (!variant) {
          throw new Error(
            `No ${item.role} variant registered for ${asset.name}`
          );
        }

        const dimensions = await adapter.getDimensions(
          variant.resourceKey
        );

        sources.push({
          assetId: asset.id,
          variant,
          ...dimensions,
          emphasis: item.emphasis
        });

        names.push(asset.name);
      }

      const [primary, secondary] = sources;

      if (!primary) {
        throw new Error("Укажи хотя бы один предмет.");
      }

      const scene = layout === "row"
        ? createRowComposition(
            canvas.width,
            canvas.height,
            sources
          )
        : createFocusComposition(
            canvas.width,
            canvas.height,
            primary,
            secondary,
            ...sources.slice(2)
          );

      if (requestCompositionAdjustment(message,
        (scene.shrinkSuggestions ?? []).map(item => ({
          name: catalog.getById(item.assetId)?.name ?? item.assetId.value,
          percent: Math.round(item.scale * 100)
        })), JSON.stringify(scene))) return;

      const previewPage = figma.root.children.find(
        page => page.name === "Composer Preview"
      ) ?? figma.createPage();

      previewPage.name = "Composer Preview";

      await figma.setCurrentPageAsync(previewPage);

      const frame = await renderer.render(
        scene,
        `${layout === "row" ? "Row" : "Focus"} - ${names.join(" + ")} - ${canvas.width}x${canvas.height}`,
        palette
      );

      figma.viewport.scrollAndZoomIntoView([frame]);

      figma.ui.postMessage({
        type: "created"
      });
    }

    figma.showUI(__html__, {
      width: 420,
      height: 620,
      themeColors: true
    });

    async function processMessage(
      unknownMessage: unknown
    ): Promise<void> {
      if (
        typeof unknownMessage !== "object" ||
        unknownMessage === null ||
        !("type" in unknownMessage)
      ) {
        return;
      }

      try {
        const message =
          unknownMessage as Record<string, unknown>;

        if (await handleTemplateMessage(message, {
          palettes: state.palettes,
          paletteSourceIds: state.palettes.map(item => item.sourceNodeId),
          registry: state.registry,
          sourceNodeIds: state.sourceNodeIds
        })) return;

        switch (message.type) {
          case "resolve-metaphor": {
            if (typeof message.requestId !== "number" || !Number.isSafeInteger(message.requestId)) {
              throw new Error("Некорректный запрос подбора.");
            }
            const catalog = toAssetCatalog(new LibraryRegistry(state.registry));
            postMetaphorComposition(typeof message.query === "string" ? message.query : "", catalog, message.requestId);
            break;
          }
          case "resolve-names": {
            const catalog = toAssetCatalog(new LibraryRegistry(state.registry));
            postNamedCompositionResolution(typeof message.names === "string" ? message.names : "",
              catalog, sizeField(message.size), roleField(message.secondaryRole));
            break;
          }
          case "refresh": {
            scanned = scanner.scan();
            sendReady();
            break;
          }

          case "select-current": {
            const selected = figma.currentPage.selection;

            if (selected.length !== 1) {
              throw new Error(
                "Select exactly one group, frame, or vector in Figma"
              );
            }

            const node = selected[0];

            if (
              !node ||
              (
                node.type !== "GROUP" &&
                node.type !== "FRAME" &&
                node.type !== "VECTOR"
              )
            ) {
              throw new Error(
                "Select a group, frame, or vector"
              );
            }

            if (!knownNodes().has(node.id)) {
              manuallySelected.set(node.id, {
                nodeId: node.id,
                name: node.name,
                size: "L",
                role: "main"
              });
            }

            sendReady();

            figma.ui.postMessage({
              type: "selected",
              nodeId: node.id
            });

            break;
          }

          case "preview": {
            const nodeId = stringField(
              message,
              "nodeId"
            );

            figma.ui.postMessage({
              type: "preview",
              nodeId,
              image: await thumbnail(nodeId)
            });

            break;
          }

          case "inspect-palette": {
            const nodeId = stringField(
              message,
              "nodeId"
            );

            figma.ui.postMessage({
              type: "palette-colors",
              nodeId,
              colors: extractSolidColors(
                await resourceNode(nodeId)
              )
            });

            break;
          }

          case "register": {
            conflict = null;
            await register(message);
            break;
          }

          case "confirm-register": {
            if (
              !conflict ||
              message.token !== conflict.token
            ) {
              throw new Error(
                "Registration confirmation has expired"
              );
            }

            const decision = stringField(
              message,
              "decision"
            );

            if (
              decision !== "replace" &&
              decision !== "alternative"
            ) {
              throw new Error(
                "Invalid conflict decision"
              );
            }

            const accepted = conflict;
            conflict = null;

            await register({
              kind: "existing",
              nodeId: accepted.nodeId,
              assetId: accepted.assetId,
              size: accepted.size,
              role: accepted.role,
              expectedActiveId: accepted.activeId
            }, decision);

            break;
          }

          case "activate": {
            const assetId = AssetId.create(
              stringField(message, "assetId")
            );

            const variantId = VariantId.create(
              stringField(message, "variantId")
            );

            const expectedActiveId = VariantId.create(
              stringField(message, "expectedActiveId")
            );

            const registry = new LibraryRegistry(
              state.registry
            );

            registry.activateVariant(
              assetId,
              variantId,
              expectedActiveId
            );

            save(registry, state);
            sendReady();

            break;
          }

          case "create": {
            await createComposition(message);
            break;
          }
        }
      } catch (error) {
        console.error(
          "Illustration Composer failed:",
          error
        );

        figma.ui.postMessage({
          type: "error",
          message: error instanceof Error
            ? error.message
            : String(error)
        });
      }
    }

    figma.ui.onmessage = (
      message: unknown
    ): Promise<void> => {
      messageQueue = messageQueue.then(
        () => processMessage(message)
      );

      return messageQueue;
    };

    sendReady();
  } catch (error) {
    console.error(
      "Illustration Composer initialization failed:",
      error
    );

    figma.notify(
      error instanceof Error
        ? error.message
        : "Initialization failed"
    );

    figma.closePlugin();
  }
}

void main();
