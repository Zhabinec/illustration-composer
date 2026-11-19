import "./styles.css";
import { palettePresets, resolvePalette, type ColorPalette } from "@illustration-composer/core";
import source from "./library.json";
import { canvasFormats } from "../../figma-plugin/src/canvas-formats";
import { icon } from "./icons";
import { arrange, newElement, pickObjects } from "./composition";
import { artwork, downloadText, importedVariant, sceneSvg } from "./svg";
import { createId, elementHeight, findVariant, type Scene, type SceneElement, type VectorAsset } from "./model";
import { SceneHistory } from "./history";
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
let palettes: ColorPalette[] = [...Object.values(palettePresets), ...(saved?.palettes ?? []).filter(p => !palettePresets[p.id])];
let scene: Scene = saved?.scene ?? { width: 1200, height: 800, paletteId: "original", background: "light", elements: [] };
let selected: string | undefined;
let libraryTab = "objects";
let zoom = 100;
let viewScale = 1;
const history = new SceneHistory();
const palette = () => palettes.find(item => item.id === scene.paletteId) ?? palettePresets.original!;
const current = () => scene.elements.find(item => item.id === selected);

$("app").innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Illustration Composer"><b class="brand-symbol">ic<span>✦</span></b><span>Illustration<br><strong>Composer</strong></span></a>
    <div class="header-divider"></div><span class="header-caption">Студия векторных иллюстраций</span>
    <span class="save-note" id="save-note">Сохраняется в браузере</span>
    <button class="quiet" id="save-project">${icon("download")}<span>Сохранить проект</span></button>
    <button class="primary" id="export">${icon("download")} Скачать SVG</button>
  </header>
  <main class="workspace">
    <aside class="library-panel">
      <section class="create-panel">
        <div class="section-heading"><h1>Соберите свою историю</h1><span class="tiny-tag">SVG</span></div>
        <p class="muted">Из готовых предметов — в вашу иллюстрацию.</p>
        <div class="segmented" aria-label="Способ подбора"><button id="mode-metaphor" aria-pressed="true">По теме</button><button id="mode-names" aria-pressed="false">По предметам</button></div>
        <label for="query" id="query-label">О чём будет иллюстрация?</label>
        <textarea id="query" rows="3" maxlength="1000" placeholder="Например, финансовая безопасность"></textarea>
        <button class="primary full" id="generate">${icon("spark")} Собрать композицию</button>
        <p id="feedback" class="feedback" aria-live="polite">Подберите предметы по теме или добавьте их ниже.</p>
      </section>
      <section class="assets-section">
        <div class="tabs" aria-label="Библиотека"><button data-tab="objects" aria-pressed="true">Предметы</button><button data-tab="decor" aria-pressed="false">Декор</button><button data-tab="templates" aria-pressed="false">Шаблоны</button></div>
        <p class="muted small" id="library-help">Нажмите на предмет, чтобы добавить его на холст.</p>
        <label class="search-field">${icon("search")}<input id="search" aria-label="Поиск по библиотеке" placeholder="Найти предмет"></label>
        <div id="asset-grid" class="asset-grid"></div>
        <label class="upload-button">${icon("plus")} Добавить свой SVG<input id="import-svg" type="file" accept=".svg,image/svg+xml" hidden></label>
        <details class="library-import"><summary>Библиотека и проекты</summary><label class="upload-button">${icon("upload")} Загрузить JSON<input id="import-json" type="file" accept=".json,application/json" hidden></label><p class="muted small">Загрузите библиотеку из Figma или ранее сохранённый проект.</p></details>
      </section>
    </aside>
    <section class="canvas-panel" aria-label="Холст композиции">
      <div class="canvas-toolbar"><div><span class="eyebrow">ВАША КОМПОЗИЦИЯ</span><h2 id="canvas-size"></h2></div><div class="history-buttons"><button id="undo" class="icon-button" aria-label="Отменить" title="Отменить (Ctrl+Z)">${icon("undo")}</button><button id="redo" class="icon-button" aria-label="Повторить" title="Повторить (Ctrl+Shift+Z)">${icon("redo")}</button></div></div>
      <div id="canvas-viewport"><div id="canvas-mount"></div></div>
      <div class="canvas-footer"><span id="canvas-hint">${icon("info")} Перетаскивайте предметы прямо на холсте</span><label>Масштаб <select id="zoom"><option value="75">75%</option><option value="100" selected>По размеру окна</option><option value="125">125%</option><option value="150">150%</option></select></label></div>
    </section>
    <aside class="inspector-panel">
      <section><div class="section-heading"><h2>Оформление</h2>${icon("grid")}</div>
        <label for="format">Формат холста</label><select id="format"></select>
        <div class="two-fields"><label>Ширина, px<input id="canvas-width" type="number" min="100" max="10000"></label><label>Высота, px<input id="canvas-height" type="number" min="100" max="10000"></label></div>
        <label for="palette">Цветовая палитра</label><select id="palette"></select><div id="swatches" class="swatches"></div>
        <label class="text-button">${icon("plus")} Добавить палитру<input type="file" id="import-palette" accept=".json,application/json" hidden></label>
        <label for="background">Фон холста</label><div class="background-control"><select id="background"><option value="light">Цвет палитры</option><option value="pale">Светлый цвет палитры</option><option value="#FFFFFF">Белый</option><option value="transparent">Прозрачный</option><option value="custom">Свой цвет</option></select><input id="background-color" type="color" aria-label="Свой цвет фона"></div>
        <label for="auto-decor">Декор при сборке</label><select id="auto-decor"><option value="auto">Подобрать из примеров</option><option value="manual">Добавлю вручную</option><option value="none">Без декора</option></select>
      </section>
      <section class="object-section"><div class="section-heading"><h2 id="object-title">Выбранный предмет</h2><span class="selection-dot"></span></div>
        <p id="selection-empty" class="muted">Нажмите на предмет на холсте или в списке слоёв.</p>
        <div id="object-controls" hidden>
          <label for="replace">Заменить предмет</label><select id="replace"></select>
          <label for="variant">Рисунок из библиотеки</label><select id="variant"></select>
          <div class="two-fields"><label>X, px<input id="object-x" type="number" step="any"></label><label>Y, px<input id="object-y" type="number" step="any"></label></div>
          <div class="two-fields"><label>Ширина, px<input id="object-width" type="number" min="1" step="any"></label><label>Поворот, °<input id="object-rotation" type="number" step="any"></label></div>
          <button id="apply-object" class="full secondary">Применить положение и размер</button>
          <div class="two-fields layer-actions"><button id="backward">На слой ниже</button><button id="forward">На слой выше</button></div>
          <div class="two-fields"><button id="to-back">Позади всех</button><button id="to-front">Впереди всех</button></div>
          <div class="two-fields object-actions"><button id="duplicate">${icon("copy")} Дублировать</button><button id="delete" class="danger">${icon("trash")} Удалить</button></div>
        </div>
      </section>
      <section><div class="section-heading"><h2>Расстановка</h2>${icon("layers")}</div>
        <label for="layout">Как расположить предметы</label><select id="layout"><option value="automatic">Подобрать автоматически</option><option value="focus">Главный крупнее</option><option value="row">Слева направо</option></select>
        <label for="primary">Главный предмет</label><select id="primary"></select>
        <button id="rearrange" class="full secondary">${icon("spark")} Расставить заново</button>
        <p class="muted small">Положение каждого предмета можно настроить вручную.</p>
        <div class="section-heading layers-heading"><h2>Слои</h2><span id="layer-count" class="tiny-tag">0</span></div><div id="layers"></div>
      </section>
    </aside>
  </main>`;

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
  $("save-note").textContent = okay ? "Изменения сохранены" : "Сохраните проект файлом";
}
function commit(action: () => void): void {
  history.record(scene);
  action();
  render();
  persist();
}
function optionList(select: HTMLSelectElement, entries: { value: string; label: string }[], value?: string): void {
  select.replaceChildren(...entries.map(entry => new Option(entry.label, entry.value)));
  if (value !== undefined) select.value = value;
}
function thumbnail(asset: VectorAsset, index: number): SVGSVGElement {
  const variant = asset.variants.find(v => v.size === "S" && v.role === "main") ?? asset.variants[0]!;
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
    const entries = assets.filter(asset => (libraryTab === "decor" ? asset.id.startsWith("decor-") : !/^(decor-|reference-)/.test(asset.id)) &&
      asset.name.toLowerCase().includes(search));
    entries.forEach((asset, index) => {
      const button = document.createElement("button");
      button.className = "asset-card";
      const label = document.createElement("span");
      label.textContent = asset.id.startsWith("decor-") ? decorationName(asset.name) : asset.name;
      button.append(thumbnail(asset, index), label);
      button.title = "Добавить " + label.textContent;
      button.onclick = () => commit(() => {
        if (scene.elements.length >= 200) throw new Error("На холсте уже 200 элементов.");
        const element = newElement(asset, scene.width);
        if (libraryTab === "decor") {
          element.width = scene.width * 0.16;
          element.name = decorationName(asset.name);
        }
        scene.elements.push(element);
        selected = element.id;
      });
      grid.append(button);
    });
  }
  if (!grid.children.length) grid.innerHTML = '<p class="muted small empty-library">Пока ничего не найдено.</p>';
}
function decorationName(name: string): string {
  if (/line|линия/i.test(name)) return "Линия";
  return /vector|ellipse/i.test(name) ? "Точка" : "Конфетти";
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
    }
    group.onpointerdown = event => startDrag(event, item);
    group.onkeydown = event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectElement(item.id); }
    };
  });
  svg.onpointerdown = event => { if (!(event.target as Element).closest("[data-element]")) selectElement(undefined); };
  $("canvas-mount").replaceChildren(svg);
  $("canvas-size").textContent = scene.width + " × " + scene.height;
  $("canvas-hint").innerHTML = icon("info") + (scene.elements.length ? " Перетаскивайте предметы прямо на холсте" : " Добавьте первый предмет из библиотеки");
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
}
function renderInspector(): void {
  const item = current();
  $("object-controls").hidden = !item;
  $("selection-empty").hidden = Boolean(item);
  $("object-title").textContent = item?.name ?? "Выбранный предмет";
  if (!item) return;
  optionList($<HTMLSelectElement>("replace"), assets.filter(a => !/^(decor-|reference-)/.test(a.id) || a.id === item.assetId)
    .map(asset => ({ value: asset.id, label: asset.name })), item.assetId);
  const asset = assets.find(asset => asset.id === item.assetId)!;
  optionList($<HTMLSelectElement>("variant"), asset.variants.map(variant => ({
    value: variant.id, label: variant.size + " · " + (variant.role === "main" ? "цветной рисунок" : "в цветах фона")
  })), item.variantId);
  for (const [field, value] of [["x", item.x], ["y", item.y], ["width", item.width], ["rotation", item.rotation]] as const) {
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
  optionList($<HTMLSelectElement>("primary"), scene.elements.filter(item => !item.assetId.startsWith("decor-"))
    .map(item => ({ value: item.id, label: item.name })), $<HTMLSelectElement>("primary").value);
  if (!$<HTMLSelectElement>("primary").value && scene.elements.length) $<HTMLSelectElement>("primary").selectedIndex = 0;
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
  if (choice === "none") {
    scene.elements = scene.elements.filter(item => !item.assetId.startsWith("decor-"));
    return;
  }
  if (choice !== "auto" || scene.elements.some(item => item.assetId.startsWith("decor-"))) return;
  const template = [...templates].filter(template => template.elements.some(item => item.assetId.startsWith("decor-")))
    .sort((a, b) => Math.abs(Math.log(a.width / a.height / (scene.width / scene.height))) -
      Math.abs(Math.log(b.width / b.height / (scene.width / scene.height))))[0];
  if (!template) return;
  const scale = Math.min(scene.width / template.width, scene.height / template.height);
  const x = (scene.width - template.width * scale) / 2;
  const y = (scene.height - template.height * scale) / 2;
  scene.elements.unshift(...template.elements.filter(item => item.assetId.startsWith("decor-")).map(item => ({
    ...item, id: createId(), name: decorationName(item.name),
    x: x + item.x * scale, y: y + item.y * scale, width: item.width * scale
  })));
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
    const items = chosen.map(asset => newElement(asset, scene.width));
    scene.elements = [...decor, ...arrange(items, assets, scene.width, scene.height, $<HTMLSelectElement>("layout").value)];
    automaticDecor();
    selected = items[0]?.id;
  });
  feedback("Композиция собрана. Вы можете изменить каждый предмет.");
});
$("rearrange").onclick = () => guarded(() => commit(layoutObjects));
$("search").oninput = renderLibrary;
document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(button => {
  button.onclick = () => {
    libraryTab = button.dataset.tab!;
    document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(tab => tab.setAttribute("aria-pressed", String(tab === button)));
    input("search").value = "";
    $("library-help").textContent = libraryTab === "templates" ? "Готовая расстановка. Каждый элемент можно изменить."
      : libraryTab === "decor" ? "Линии, точки и украшения из исходных иллюстраций." : "Нажмите на предмет, чтобы добавить его на холст.";
    renderLibrary();
  };
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
$("apply-object").onclick = () => guarded(() => {
  const item = current();
  if (!item) return;
  const fields = ["x", "y", "width", "rotation"] as const;
  const values = fields.map(name => input("object-" + name).valueAsNumber);
  if (!fields.every(name => input("object-" + name).reportValidity()) || !values.every(Number.isFinite)) return;
  commit(() => fields.forEach((name, index) => { item[name] = values[index]!; }));
});
$("replace").onchange = () => guarded(() => commit(() => {
  const item = current();
  const asset = assets.find(asset => asset.id === $<HTMLSelectElement>("replace").value);
  if (!item || !asset) return;
  const variant = findVariant(assets, item);
  item.assetId = asset.id;
  item.variantId = (asset.variants.find(v => v.size === variant.size && v.role === variant.role) ?? asset.variants[0]!).id;
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
$("undo").onclick = () => { const previous = history.undo(scene); if (previous) { scene = previous; render(); persist(); } };
$("redo").onclick = () => { const next = history.redo(scene); if (next) { scene = next; render(); persist(); } };
$("export").onclick = () => guarded(() => {
  const svg = sceneSvg(scene, assets, palette());
  svg.querySelectorAll("[data-element]").forEach(node => node.removeAttribute("data-element"));
  downloadText(new XMLSerializer().serializeToString(svg), "illustration-" + scene.width + "x" + scene.height + ".svg", "image/svg+xml");
  feedback("SVG сохранён. Предметы остаются отдельными векторными группами.");
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
    feedback("Предмет добавлен в библиотеку и на холст.");
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
        assets = [...assets.filter(item => !ids.has(item.id)), ...project.assets];
        palettes = project.palettes;
        scene = project.scene;
      });
    } else {
      const library = validateLibrary(value);
      commit(() => {
        const ids = new Set(library.assets.map(item => item.id));
        assets = [...assets.filter(item => !ids.has(item.id)), ...library.assets];
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
    feedback("Палитра добавлена и применена.");
  } catch (error) { feedback(error instanceof Error ? error.message : String(error), true); }
  input("import-palette").value = "";
};
window.addEventListener("keydown", event => {
  if ((event.target as Element).closest("input,textarea,select")) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); $(event.shiftKey ? "redo" : "undo").click(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") { event.preventDefault(); $("duplicate").click(); }
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
