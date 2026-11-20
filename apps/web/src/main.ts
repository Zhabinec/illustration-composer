import "./styles.css";
import { workspaceView } from "./workspace-view";
import { palettePresets, resolvePalette, type ColorPalette } from "@illustration-composer/core";
import source from "./library.json";
import { canvasFormats } from "../../figma-plugin/src/canvas-formats";
import { icon } from "./icons";
import { arrange, newElement, pickObjects, compositionSubjects } from "./composition";
import { artwork, downloadText, importedVariant, sceneSvg } from "./svg";
import { createId, elementHeight, findVariant, type Scene, type SceneElement, type VectorAsset } from "./model";
import { SceneHistory } from "./history";
import { historyShortcut } from "./history-shortcuts";
import { arrangeDecorations, decorationName, decorationVariant, newDecoration, prepareDecorationAssets, isDecoration, uniqueDecorations } from "./decorations";
import { resizeElement } from "./resize-element";
import { restoreProject, saveProject, validateLibrary, validateProject, type LibraryTemplate, type Project } from "./storage";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const saved = restoreProject();
let assets: VectorAsset[] = (source as { assets: VectorAsset[] }).assets;
let templates: LibraryTemplate[] = (source as { templates?: LibraryTemplate[] }).templates ?? [];
if (saved) {
  const ids = new Set(saved.assets.map(asset => asset.id));
  assets = [...assets.filter(asset => !ids.has(asset.id)), ...saved.assets];
}
assets = prepareDecorationAssets(assets);
let palettes: ColorPalette[] = [...Object.values(palettePresets), ...(saved?.palettes ?? []).filter(p => !palettePresets[p.id])];
let scene: Scene = saved?.scene ?? { width: 1200, height: 800, paletteId: "original", background: "light", elements: [] };
let selected: string | undefined;
let libraryTab = "objects";
let zoom = 100;
let viewScale = 1;
const history = new SceneHistory();
const palette = () => palettes.find(item => item.id === scene.paletteId) ?? palettePresets.original!;
const current = () => scene.elements.find(item => item.id === selected);

$("app").innerHTML = workspaceView;

let mode = "metaphor";
function feedback(message: string, error = false): void {
  $("feedback").textContent = message;
  $("feedback").classList.toggle("error", error);
}
function guarded(action: () => void): void {
  try { action(); } catch (error) { feedback(error instanceof Error ? error.message : String(error), true); }
}
function persist(): void {
  const included = new Set(scene.elements.map(item => item.assetId));
  const custom = assets.filter(asset => included.has(asset.id) || asset.id.startsWith("upload-"));
  const okay = saveProject({ version: 1, scene, assets: custom, palettes });
  $("save-note").textContent = okay ? "" : "Сохраните проект файлом";
  $("save-note").hidden = okay;
}
function commit(action: () => void): void {
  const previousSelection = selected;
  history.record(scene);
  action();
  render();
  if (selected !== previousSelection) $("object-controls").closest("aside")?.scrollTo({ top: 0 });
  persist();
}
function optionList(select: HTMLSelectElement, entries: { value: string; label: string }[], value?: string): void {
  select.replaceChildren(...entries.map(entry => new Option(entry.label, entry.value)));
  if (value !== undefined) select.value = value;
}
function thumbnail(asset: VectorAsset, index: number): SVGSVGElement {
  const variant = isDecoration(asset.id) ? decorationVariant(asset) : asset.variants.find(v => v.size === "S" && v.role === "main") ?? asset.variants[0]!;
  const svg = artwork(variant, palette(), "thumb-" + index);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  return svg;
}
function renderLibrary(): void {
  const grid = $("asset-grid");
  const search = input("search").value.trim().toLowerCase();
  grid.replaceChildren();
  if (libraryTab === "templates") {
    for (const template of templates.filter(item => item.name.toLowerCase().includes(search))) {
      const button = document.createElement("button");
      button.className = "asset-card template-card";
      const example = { ...scene, width: template.width, height: template.height, elements: template.elements };
      button.append(sceneSvg(example, assets, palette()));
      const label = document.createElement("span");
      label.textContent = template.name;
      button.append(label);
      button.onclick = () => commit(() => {
        scene.width = template.width;
        scene.height = template.height;
        scene.elements = template.elements.map(item => ({ ...item, id: createId() }));
        selected = scene.elements[0]?.id;
      });
      grid.append(button);
    }
  } else {
    const entries = (libraryTab === "decor" ? uniqueDecorations(assets) : assets.filter(asset => !/^(decor-|reference-)/.test(asset.id)))
      .filter(asset => (asset.name + " " + (isDecoration(asset.id) ? decorationName(asset.name) : "")).toLowerCase().includes(search));
    entries.forEach((asset, index) => {
      const button = document.createElement("button");
      button.className = "asset-card";
      const label = document.createElement("span");
      label.textContent = asset.id.startsWith("decor-") ? decorationName(asset.name) : asset.name;
      button.append(thumbnail(asset, index), label);
      button.title = "Добавить " + label.textContent;
      button.onclick = () => commit(() => {
        if (scene.elements.length >= 200) throw new Error("На холсте уже 200 элементов.");
        const element = libraryTab === "decor" ? newDecoration(asset, scene.width, scene.height) : newElement(asset, scene.width);
        if (libraryTab === "decor") $<HTMLSelectElement>("auto-decor").value = "manual";
        scene.elements.push(element);
        selected = element.id;
      });
      grid.append(button);
    });
  }
  if (!grid.children.length) grid.innerHTML = '<p class="muted small empty-library">Пока ничего не найдено.</p>';
}
function renderCanvas(): void {
  const svg = sceneSvg(scene, assets, palette());
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Редактируемая композиция");
  svg.querySelectorAll<SVGGElement>("g[data-element]").forEach(group => {
    const item = scene.elements.find(item => item.id === group.dataset.element)!;
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", "Выбрать " + item.name);
    if (item.id === selected) {
      const variant = findVariant(assets, item);
      const outline = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      outline.setAttribute("width", String(variant.width));
      outline.setAttribute("height", String(variant.height));
      outline.setAttribute("class", "selection-outline");
      group.append(outline);
      const handle = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const handleSize = 12 / (viewScale * item.width / variant.width);
      handle.setAttribute("x", String(variant.width - handleSize / 2));
      handle.setAttribute("y", String(variant.height - handleSize / 2));
      handle.setAttribute("width", String(handleSize));
      handle.setAttribute("height", String(handleSize));
      handle.setAttribute("class", "resize-handle");
      handle.setAttribute("aria-label", "Изменить размер " + item.name);
      handle.onpointerdown = event => startResize(event, item);
      group.append(handle);
    }
    group.onpointerdown = event => startDrag(event, item);
    group.onkeydown = event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectElement(item.id); }
    };
  });
  svg.onpointerdown = event => { if (!(event.target as Element).closest("[data-element]")) selectElement(undefined); };
  $("canvas-mount").replaceChildren(svg);
  $("canvas-size").textContent = scene.width + " × " + scene.height;
  $("canvas-hint").textContent = "Добавьте предмет из библиотеки";
  $("canvas-hint").hidden = scene.elements.length > 0;
  fitCanvas();
}
function fitCanvas(): void {
  const viewport = $("canvas-viewport");
  viewScale = Math.min((viewport.clientWidth - 80) / scene.width, (viewport.clientHeight - 80) / scene.height, 1) * zoom / 100;
  viewScale = Math.max(0.05, viewScale);
  $("canvas-mount").style.width = scene.width * viewScale + "px";
  $("canvas-mount").style.height = scene.height * viewScale + "px";
}
function selectElement(id: string | undefined): void {
  selected = id;
  renderCanvas();
  renderInspector();
  renderLayers();
  $("object-controls").closest("aside")?.scrollTo({ top: 0 });
}
function renderInspector(): void {
  const item = current();
  $("object-controls").hidden = !item;
  $("selection-empty").hidden = Boolean(item);
  $("object-title").textContent = item?.name ?? "Выбранный предмет";
  if (!item) return;
  optionList($<HTMLSelectElement>("replace"), assets.filter(a => isDecoration(item.assetId) ? isDecoration(a.id) : !/^(decor-|reference-)/.test(a.id) || a.id === item.assetId)
    .map(asset => ({ value: asset.id, label: asset.name })), item.assetId);
  const asset = assets.find(asset => asset.id === item.assetId)!;
  optionList($<HTMLSelectElement>("variant"), (isDecoration(asset.id) ? [decorationVariant(asset)] : asset.variants).map(variant => ({
    value: variant.id, label: variant.size + " · " + (variant.role === "main" ? "цветной рисунок" : "в цветах фона")
  })), item.variantId);
  for (const [field, value] of [["x", item.x], ["y", item.y], ["width", item.width], ["height", elementHeight(item, findVariant(assets, item))], ["rotation", item.rotation]] as const) {
    input("object-" + field).value = String(Math.round(value * 100) / 100);
  }
}
function renderLayers(): void {
  $("layer-count").textContent = String(scene.elements.length);
  $("layers").replaceChildren(...[...scene.elements].reverse().map((item, index) => {
    const button = document.createElement("button");
    button.className = "layer-item" + (item.id === selected ? " selected" : "");
    button.innerHTML = icon("layers") + "<span>" + escape(item.name) + "</span><small>" + (scene.elements.length - index) + "</small>";
    button.onclick = () => selectElement(item.id);
    return button;
  }));
  const subjects = scene.elements.filter(item => !isDecoration(item.assetId));
  const previous = $<HTMLSelectElement>("primary").value;
  const primary = subjects.some(item => item.id === previous) ? previous
    : (subjects.find(item => findVariant(assets,item).role === "main") ?? subjects[0])?.id;
  optionList($<HTMLSelectElement>("primary"), subjects.map(item => ({ value: item.id, label: item.name })), primary);
}
function render(): void {
  if (!scene.elements.some(item => item.id === selected)) selected = undefined;
  renderCanvas();
  renderInspector();
  renderLayers();
  input("canvas-width").value = String(scene.width);
  input("canvas-height").value = String(scene.height);
  const format = Object.entries(canvasFormats).find(([, item]) => item.width === scene.width && item.height === scene.height);
  $<HTMLSelectElement>("format").value = format?.[0] ?? "custom";
  optionList($<HTMLSelectElement>("palette"), palettes.map(p => ({ value: p.id, label: p.name })), scene.paletteId);
  $<HTMLSelectElement>("background").value = ["light", "pale", "transparent", "#FFFFFF"].includes(scene.background) ? scene.background : "custom";
  input("background-color").value = scene.background.startsWith("#") ? scene.background : palette().colors.light;
  $("swatches").replaceChildren(...Object.values(palette().colors).map(color => {
    const swatch = document.createElement("span");
    swatch.style.backgroundColor = color;
    swatch.title = color;
    return swatch;
  }));
}
function startDrag(event: PointerEvent, item: SceneElement): void {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const start = { clientX: event.clientX, clientY: event.clientY, x: item.x, y: item.y };
  history.record(scene);
  selected = item.id;
  renderCanvas();
  renderInspector();
  renderLayers();
  const move = (event: PointerEvent) => {
    item.x = start.x + (event.clientX - start.clientX) / viewScale;
    item.y = start.y + (event.clientY - start.clientY) / viewScale;
    renderCanvas();
    renderInspector();
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    persist();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}
function layoutObjects(): void {
  const regular = scene.elements.filter(item => !item.assetId.startsWith("decor-"));
  const mainId = $<HTMLSelectElement>("primary").value;
  regular.sort((a, b) => Number(b.id === mainId) - Number(a.id === mainId));
  if (regular.length > 8) throw new Error("Для автоматической расстановки выберите до 8 предметов.");
  const decor = scene.elements.filter(item => item.assetId.startsWith("decor-"));
  scene.elements = [...decor, ...arrange(regular, assets, scene.width, scene.height, $<HTMLSelectElement>("layout").value)];
}
function automaticDecor(): void {
  const choice = $<HTMLSelectElement>("auto-decor").value;
  if (choice === "manual") return;
  const subjects = scene.elements.filter(item => !isDecoration(item.assetId));
  scene.elements = choice === "none" ? subjects : [...arrangeDecorations(subjects, assets, scene.width, scene.height), ...subjects];
}
function startResize(event: PointerEvent, item: SceneElement): void {
  if (event.button !== 0) return;
  event.preventDefault(); event.stopPropagation();
  const initial = { ...item };
  const variant = findVariant(assets, item);
  const x = event.clientX, y = event.clientY, scale = viewScale;
  history.record(scene);
  const move = (event: PointerEvent) => {
    Object.assign(item, resizeElement(initial, variant, (event.clientX - x) / scale, (event.clientY - y) / scale));
    renderCanvas(); renderInspector();
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    persist();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}
function showLibrary(tab: string): void {
  libraryTab = tab;
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.tab === tab)));
  input("search").value = "";
  $("library-help").textContent = tab === "templates" ? "Готовые композиции для редактирования."
    : tab === "decor" ? "Линии, точки и украшения." : "Предметы для вашей композиции.";
  renderLibrary();
  $("asset-grid").scrollIntoView({ block: "nearest" });
}

optionList($<HTMLSelectElement>("format"), [...Object.entries(canvasFormats).map(([value, item]) =>
  ({ value, label: item.name + " · " + item.width + " × " + item.height })), { value: "custom", label: "Свой размер" }]);
for (const name of ["metaphor", "names"]) $("mode-" + name).onclick = () => {
  mode = name;
  for (const value of ["metaphor", "names"]) $("mode-" + value).setAttribute("aria-pressed", String(value === name));
  $("query-label").textContent = name === "metaphor" ? "О чём будет иллюстрация?" : "Какие предметы нужны?";
  $<HTMLTextAreaElement>("query").placeholder = name === "metaphor" ? "Например, финансовая безопасность" : "Например, книга, ручка, лампа";
};
$("generate").onclick = () => guarded(() => {
  const chosen = pickObjects($<HTMLTextAreaElement>("query").value, mode, assets);
  if (!chosen.length || chosen.length > 8) throw new Error("Укажите от 1 до 8 предметов.");
  commit(() => {
    const decor = scene.elements.filter(item => item.assetId.startsWith("decor-"));
    const items = compositionSubjects(chosen, scene.width, input("generation-depth").checked);
    scene.elements = [...decor, ...arrange(items, assets, scene.width, scene.height, $<HTMLSelectElement>("layout").value)];
    automaticDecor();
    selected = items[0]?.id;
  });
  feedback("Композиция собрана.");
});
$("rearrange").onclick = () => guarded(() => commit(() => { layoutObjects(); automaticDecor(); }));
$("search").oninput = renderLibrary;
document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(button => {
  button.onclick = () => showLibrary(button.dataset.tab!);
});
$("add-subject").onclick = () => showLibrary("objects");
$("add-decor").onclick = () => showLibrary("decor");
$("next-layout").onclick = () => guarded(() => {
  const layout = $<HTMLSelectElement>("layout");
  layout.selectedIndex = (layout.selectedIndex + 1) % layout.options.length;
  commit(() => { layoutObjects(); automaticDecor(); });
});
$("format").onchange = () => guarded(() => {
  const format = canvasFormats[$<HTMLSelectElement>("format").value as keyof typeof canvasFormats];
  if (format) commit(() => { scene.width = format.width; scene.height = format.height; });
});
for (const name of ["width", "height"] as const) $("canvas-" + name).onchange = () => guarded(() => {
  const field = input("canvas-" + name);
  if (!field.reportValidity() || !Number.isFinite(field.valueAsNumber)) return;
  commit(() => { scene[name] = field.valueAsNumber; });
});
$("palette").onchange = () => commit(() => { scene.paletteId = $<HTMLSelectElement>("palette").value; renderLibrary(); });
$("background").onchange = () => commit(() => {
  const value = $<HTMLSelectElement>("background").value;
  scene.background = value === "custom" ? input("background-color").value : value;
});
$("background-color").onchange = () => commit(() => { scene.background = input("background-color").value; });
$("auto-decor").onchange = () => commit(automaticDecor);
$("zoom").onchange = () => { zoom = Number($<HTMLSelectElement>("zoom").value); fitCanvas(); };
for (const name of ["x", "y", "width", "rotation"] as const) $("object-" + name).onchange = () => guarded(() => {
  const field = input("object-" + name);
  if (!current() || !field.reportValidity() || !Number.isFinite(field.valueAsNumber)) return;
  commit(() => { current()![name] = field.valueAsNumber; });
});
$("object-height").onchange = () => guarded(() => {
  const item = current();
  const field = input("object-height");
  if (!item || !field.reportValidity() || !Number.isFinite(field.valueAsNumber)) return;
  commit(() => { const v = findVariant(assets, item); item.width = field.valueAsNumber * v.width / v.height; });
});
for (const [id, factor] of [["shrink-object", .8], ["grow-object", 1.25]] as const) $(id).onclick = () => {
  if (current()) commit(() => { current()!.width = Math.max(1, current()!.width * factor); });
};
$("apply-object").onclick = () => guarded(() => {
  const item = current();
  if (!item) return;
  const fields = ["x", "y", "width", "rotation"] as const;
  const values = fields.map(name => input("object-" + name).valueAsNumber);
  if (!fields.every(name => input("object-" + name).reportValidity()) || !values.every(Number.isFinite)) return;
  const heightField = input("object-height");
  if (!heightField.reportValidity() || !Number.isFinite(heightField.valueAsNumber)) return;
  const previousHeight = Math.round(elementHeight(item, findVariant(assets, item)) * 100) / 100;
  const heightChanged = heightField.valueAsNumber !== previousHeight;
  commit(() => {
    fields.forEach((name, index) => { item[name] = values[index]!; });
    if (heightChanged) { const v = findVariant(assets, item); item.width = heightField.valueAsNumber * v.width / v.height; }
  });
});
$("replace").onchange = () => guarded(() => commit(() => {
  const item = current();
  const asset = assets.find(asset => asset.id === $<HTMLSelectElement>("replace").value);
  if (!item || !asset) return;
  const variant = findVariant(assets, item);
  item.assetId = asset.id;
  item.variantId = (isDecoration(asset.id) ? decorationVariant(asset) : asset.variants.find(v => v.size === variant.size && v.role === variant.role) ?? asset.variants[0]!).id;
  item.name = asset.name;
}));
$("variant").onchange = () => commit(() => { if (current()) current()!.variantId = $<HTMLSelectElement>("variant").value; });
for (const direction of ["backward", "forward", "to-back", "to-front"]) $(direction).onclick = () => commit(() => {
  const index = scene.elements.findIndex(item => item.id === selected);
  if (index < 0) return;
  const target = direction === "to-back" ? 0 : direction === "to-front" ? scene.elements.length - 1
    : Math.max(0, Math.min(scene.elements.length - 1, index + (direction === "forward" ? 1 : -1)));
  const [item] = scene.elements.splice(index, 1);
  scene.elements.splice(target, 0, item!);
});
$("duplicate").onclick = () => commit(() => {
  const item = current();
  if (!item || scene.elements.length >= 200) return;
  const duplicate = { ...item, id: createId(), x: item.x + 24, y: item.y + 24 };
  scene.elements.splice(scene.elements.indexOf(item) + 1, 0, duplicate);
  selected = duplicate.id;
});
$("delete").onclick = () => commit(() => { scene.elements = scene.elements.filter(item => item.id !== selected); selected = undefined; });
$("undo").onclick = () => { const previous = history.undo(scene); if (previous) { scene = previous; render(); renderLibrary(); persist(); } };
$("redo").onclick = () => { const next = history.redo(scene); if (next) { scene = next; render(); renderLibrary(); persist(); } };
$("export").onclick = () => guarded(() => {
  const svg = sceneSvg(scene, assets, palette());
  svg.querySelectorAll("[data-element]").forEach(node => node.removeAttribute("data-element"));
  downloadText(new XMLSerializer().serializeToString(svg), "illustration-" + scene.width + "x" + scene.height + ".svg", "image/svg+xml");
  feedback("SVG подготовлен к скачиванию.");
});
$("save-project").onclick = () => {
  const used = new Set(scene.elements.map(item => item.assetId));
  const project: Project = { version: 1, scene, assets: assets.filter(asset => used.has(asset.id)), palettes };
  downloadText(JSON.stringify(project), "illustration-project.json", "application/json");
};
input("import-svg").onchange = async () => {
  const file = input("import-svg").files?.[0];
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error("Выберите SVG размером до 5 МБ.");
    const variant = importedVariant(await file.text());
    const asset = { id: "upload-" + createId(), name: file.name.replace(/\.svg$/i, ""), variants: [variant] };
    commit(() => { assets.push(asset); const item = newElement(asset, scene.width); scene.elements.push(item); selected = item.id; });
    renderLibrary();
    feedback("Предмет добавлен.");
  } catch (error) { feedback(String(error instanceof Error ? error.message : error), true); }
  input("import-svg").value = "";
};
input("import-json").onchange = async () => {
  const file = input("import-json").files?.[0];
  if (!file) return;
  try {
    if (file.size > 25_000_000) throw new Error("Выберите JSON размером до 25 МБ.");
    const value = JSON.parse(await file.text());
    if ("scene" in value) {
      const project = validateProject(value);
      commit(() => {
        const ids = new Set(project.assets.map(item => item.id));
        assets = prepareDecorationAssets([...assets.filter(item => !ids.has(item.id)), ...project.assets]);
        palettes = project.palettes;
        scene = project.scene;
      });
    } else {
      const library = validateLibrary(value);
      commit(() => {
        const ids = new Set(library.assets.map(item => item.id));
        assets = prepareDecorationAssets([...assets.filter(item => !ids.has(item.id)), ...library.assets]);
        templates = library.templates ?? templates;
      });
    }
    renderLibrary();
    feedback("Файл загружен.");
  } catch (error) { feedback(error instanceof Error ? error.message : String(error), true); }
  input("import-json").value = "";
};
input("import-palette").onchange = async () => {
  const file = input("import-palette").files?.[0];
  if (!file) return;
  try {
    if (file.size > 16384) throw new Error("Файл палитры слишком большой.");
    const value = JSON.parse(await file.text());
    const resolved = resolvePalette(value.colors ? { name: value.name, ...value.colors } : value);
    if (palettes.some(p => p.name.toLowerCase() === resolved.name.toLowerCase())) throw new Error("Палитра с таким именем уже есть.");
    commit(() => { const p = { ...resolved, id: "palette-" + createId() }; palettes.push(p); scene.paletteId = p.id; });
    renderLibrary();
    feedback("Палитра применена.");
  } catch (error) { feedback(error instanceof Error ? error.message : String(error), true); }
  input("import-palette").value = "";
};
window.addEventListener("keydown", event => {
  if (event.defaultPrevented) return;
  const target = event.target instanceof Element ? event.target : null;
  const editingText = Boolean(target?.closest('textarea,input:not([type=number]):not([type=range]):not([type=color]):not([type=checkbox]),[contenteditable="true"]'));
  const command = historyShortcut(event, editingText);
  if (command) { event.preventDefault(); $(command).click(); return; }
  if (target?.closest("input,textarea,select,[contenteditable=true]")) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") { event.preventDefault(); $("duplicate").click(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); $("export").click(); }
  else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); $("delete").click(); }
  else if (event.key === "Escape") selectElement(undefined);
  else if (current() && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const distance = event.shiftKey ? 10 : 1;
    commit(() => {
      const item = current()!;
      if (event.key === "ArrowUp") item.y -= distance;
      if (event.key === "ArrowDown") item.y += distance;
      if (event.key === "ArrowLeft") item.x -= distance;
      if (event.key === "ArrowRight") item.x += distance;
    });
  }
});
new ResizeObserver(fitCanvas).observe($("canvas-viewport"));
if (!saved && assets.length) {
  const phone = assets.find(item => item.id === "phone");
  const puzzle = assets.find(item => item.id === "puzzle");
  if (phone && puzzle) {
    scene.width = 1200; scene.height = 630;
    scene.elements = [
      { ...newElement(phone, 1200), x: 104.799, y: 152.847, width: 796.532 },
      { ...newElement(puzzle, 1200), x: 628.926, y: 68.601, width: 544.163 }
    ];
  }
  automaticDecor();
}
guarded(() => { render(); renderLibrary(); });
