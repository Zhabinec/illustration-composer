import { AssetId, LibraryRegistry, createFocusComposition, createRowComposition, findAssetVariant, resolvePalette } from "@illustration-composer/core";
import type { Asset, AssetRole, AssetSize, ColorPalette, CompositionSource, SecondaryRole } from "@illustration-composer/core";
import { paletteSourceNodeIds, toAssetCatalog } from "./figma-registry-store.js";
import type { RegistryDocument } from "./figma-registry-store.js";
import { FigmaAssetAdapter } from "./figma-asset-adapter.js";
import { FigmaSceneRenderer } from "./figma-scene-renderer.js";
import { planAutomaticScene } from "./automatic-scene-planner.js";
import { addAutomaticDecoration, addChosenDecoration, applyReferenceStyle, decorationLabel, referenceDecor, setSceneBackground } from "./figma-scene-style.js";
import { applyCompositionItemSettings, readCompositionItemSettings } from "./composition-item-settings.js";
import { discoverExampleTemplates } from "./figma-example-templates.js";
import { requestCompositionAdjustment } from "./composition-adjustments.js";
import { postNamedCompositionResolution } from "./named-composition.js";
import { postMetaphorComposition, resolveMetaphorSelection } from "./metaphor-composition.js";
import { thumbnail } from "./figma-resource-preview.js";
import { secondaryRoleField, sizeField, stringField } from "./message-fields.js";
import { canvasFormats } from "./canvas-formats.js";

function activeVariant(
  asset: Asset,
  size: AssetSize,
  role: AssetRole
) {
  return findAssetVariant(asset, size, role) ??
    findAssetVariant(
      asset,
      size === "S" ? "L" : "S",
      role
    );
}

async function createComposition(
  message: Record<string, unknown>,
  state: RegistryDocument
): Promise<void> {
  const preview = message.type === "preview-composition";
  const format = stringField(message, "format");

  if (!Object.prototype.hasOwnProperty.call(canvasFormats, format)) {
    throw new Error("Invalid canvas format");
  }

  const canvas = canvasFormats[
    format as keyof typeof canvasFormats
  ];

  const layout = stringField(message, "layout");

  if (!["focus", "row", "automatic", "manual", "left", "right"].includes(layout)) {
    throw new Error("Invalid layout");
  }

  const size = sizeField(message.size);
  const secondaryRole = secondaryRoleField(
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

  const named = message.mode === "metaphor" ? resolveMetaphorSelection(
    typeof message.query === "string" ? message.query : "", catalog, size, secondaryRole
  ) : message.mode === "names" ? postNamedCompositionResolution(
    typeof message.names === "string" ? message.names : "", catalog, size, secondaryRole
  ) : null;
  if (named?.errors.length) {
    throw new Error(named.errors.join(" "));
  }

  let selection: { id: string; role: SecondaryRole; emphasis: "primary" | "secondary" }[] = named ? named.selection.map(item => ({
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
  let settings = readCompositionItemSettings(message.itemSettings);
  if (settings.length && (settings.length !== selection.length ||
    settings.some((item, index) => item.assetId !== selection[index]!.id))) {
    throw new Error("Состав изменился. Проверьте настройки предметов.");
  }
  if (settings.length) {
    const primaryIndex = message.primaryIndex ?? 0;
    if (typeof primaryIndex !== "number" || !Number.isInteger(primaryIndex) ||
      primaryIndex < 0 || primaryIndex >= selection.length) throw new Error("Выберите главный предмет.");
    const order = [primaryIndex, ...selection.keys()].filter((index, position) => position === 0 || index !== primaryIndex);
    selection = order.map((index, position) => ({ ...selection[index]!, emphasis: position === 0 ? "primary" : "secondary" }));
    settings = order.map(index => settings[index]!);
  }

  for (const [index, item] of selection.entries()) {
    const asset = catalog.getById(
      AssetId.create(item.id)
    );

    if (!asset) {
      throw new Error(`Unknown asset: ${item.id}`);
    }

    const setting = settings[index];
    const chosen = setting && state.registry.assets.find(entry => entry.id === item.id)?.variants
      .find(entry => entry.id === setting.variantId && entry.active);
    if (setting && !chosen) {
      throw new Error(`«${asset.name}»: выберите доступный вариант предмета.`);
    }
    const variant = chosen ? { role: index === 0 ? "main" as const : setting?.layer ?? chosen.role,
      size: chosen.size, resourceKey: chosen.resourceKey } : item.role === "auto" || item.role === "independent"
      ? (item.role === "auto" ? activeVariant(asset, size, "background") ?? activeVariant(asset, size, "main")
        : activeVariant(asset, size, "main") ?? activeVariant(asset, size, "background"))
      : activeVariant(asset, size, item.role);

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
      variant: secondaryRole === "independent" && !setting ? { ...variant, role: "main" } : variant,
      ...dimensions,
      emphasis: item.emphasis
    });

    names.push(asset.name);
  }

  const [primary, secondary] = sources;

  if (!primary) {
    throw new Error("Укажи хотя бы один предмет.");
  }

  const automatic = layout === "automatic"
    ? await planAutomaticScene(canvas.width, canvas.height, sources, paletteSourceNodeIds(state.palettes)) : null;
  const planned = automatic
    ? automatic.scene
    : layout === "row" || layout === "left" || layout === "right"
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

  const positioned = layout === "right" ? { ...planned, items: planned.items.map((item, index) => ({
    ...item, x: planned.width - item.x - sources[index]!.width * item.scale
  })) } : planned;
  const scene = applyCompositionItemSettings(positioned, sources, settings);
  if (!preview && layout !== "manual" && requestCompositionAdjustment(message,
    (scene.shrinkSuggestions ?? []).map(item => ({
      name: catalog.getById(item.assetId)?.name ?? item.assetId.value,
      percent: Math.round(item.scale * 100)
    })), JSON.stringify(scene))) return;

  if (!preview) {
    const previewPage = figma.root.children.find(page => page.name === "Composer Preview") ?? figma.createPage();
    previewPage.name = "Composer Preview";
    await figma.setCurrentPageAsync(previewPage);
  }

  const frame = await renderer.render(
    scene,
    `${automatic?.description ?? ({ row: "В ряд", focus: "Акцент", left: "Главный слева",
      right: "Главный справа", manual: "Ручная расстановка" } as Record<string, string>)[layout]} - ${names.join(" + ")} - ${canvas.width}x${canvas.height}`,
    palette, false
  );

  try {
    const background = message.background ?? "pale";
    const decoration = message.decoration ?? "auto";
    if (background === "reference") {
      await applyReferenceStyle(frame, stringField(message, "backgroundReferenceId"), "background",
        paletteSourceNodeIds(state.palettes), palette);
    } else {
      setSceneBackground(frame, background, palette);
    }
    if (decoration === "reference") {
      await applyReferenceStyle(frame, stringField(message, "referenceId"), "decor", paletteSourceNodeIds(state.palettes), palette);
    } else if (decoration === "choose") {
      await addChosenDecoration(frame, message.decorations, paletteSourceNodeIds(state.palettes), palette);
    } else if (decoration === "auto") {
      await addAutomaticDecoration(frame, paletteSourceNodeIds(state.palettes), palette);
    }
    if (preview) {
      const bytes = await frame.exportAsync({ format: "PNG", constraint: { type: "WIDTH", value: 420 } });
      figma.ui.postMessage({ type: "composition-preview", requestId: message.requestId,
        image: `data:image/png;base64,${figma.base64Encode(bytes)}` });
      frame.remove();
      return;
    }
  } catch (error) {
    frame.remove();
    throw error;
  }
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);

  figma.ui.postMessage({
    type: "created"
  });
}

export async function handleCompositionMessage(message: Record<string, unknown>, state: RegistryDocument): Promise<boolean> {
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
        catalog, sizeField(message.size), secondaryRoleField(message.secondaryRole));
      break;
    }
    case "create":
    case "preview-composition": {
      await createComposition(message, state);
      break;
    }
    case "compose-variant-preview": {
      const asset = state.registry.assets.find(item => item.id === message.assetId);
      const variant = asset?.variants.find(item => item.id === message.variantId && item.active);
      const nodeId = variant && state.sourceNodeIds[variant.resourceKey];
      figma.ui.postMessage({ type: "compose-variant-image", variantId: message.variantId,
        image: nodeId ? await thumbnail(nodeId) : null });
      break;
    }
    case "compose-reference-preview": {
      const { templates } = await discoverExampleTemplates(paletteSourceNodeIds(state.palettes));
      const template = templates.find(item => item.sourceNodeId === message.referenceId);
      if (!template) throw new Error("Пример недоступен.");
      figma.ui.postMessage({ type: "compose-reference-image", referenceId: template.sourceNodeId,
        image: await thumbnail(template.sourceNodeId) });
      break;
    }
    case "compose-decoration-catalog": {
      const { templates } = await discoverExampleTemplates(paletteSourceNodeIds(state.palettes));
      const decorations = [];
      const counts = new Map<string, number>();
      for (const template of templates) {
        const source = await figma.getNodeByIdAsync(template.sourceNodeId);
        if (source?.type !== "FRAME") continue;
        for (const layer of referenceDecor(source)) {
          const { type, name } = decorationLabel(layer);
          const number = (counts.get(type) ?? 0) + 1;
          counts.set(type, number);
          decorations.push({ id: layer.id, sourceId: source.id, type,
            name: `${name} · ${number}` });
        }
      }
      figma.ui.postMessage({ type: "compose-decoration-catalog", decorations });
      break;
    }
    case "compose-decoration-preview": {
      const source = typeof message.sourceId === "string" ? await figma.getNodeByIdAsync(message.sourceId) : null;
      const layer = source?.type === "FRAME" && referenceDecor(source).find(item => item.id === message.layerId);
      if (!layer) break;
      let image: string | null = null;
      try {
        const bytes = await layer.exportAsync({ format: "PNG", constraint: { type: "WIDTH", value: 160 } });
        image = `data:image/png;base64,${figma.base64Encode(bytes)}`;
      } catch { /* A zero-height line may not have a raster preview. */ }
      figma.ui.postMessage({ type: "compose-decoration-image", layerId: layer.id, image });
      break;
    }
    default: return false;
  }
  return true;
}
