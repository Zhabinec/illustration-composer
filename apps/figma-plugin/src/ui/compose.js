import { element, fillSelect } from "./dom.js";
import { mountCompositionItems } from "./compose-items.js";
import { mountCompositionDecoration } from "./compose-decoration.js";
import { canvasFormats } from "../canvas-formats.js";

export function mountCompose({ send, setStatus, cancelAdjustment, choosePalette }) {
  const ui = { primary: element("primary"),
    secondary: element("secondary"),
    layout: element("layout"),
    format: element("format"),
    palette: element("palette"),
    create: element("create") };
  fillSelect(ui.format, Object.entries(canvasFormats).map(([value, { name, width, height }]) =>
    ({ value, label: `${name} · ${width} × ${height}` })));
  const dimensions = () => {
    const { width, height } = canvasFormats[ui.format.value];
    return [width, height];
  };
  const items = mountCompositionItems(send, dimensions);
  let assets = [];
  let previewRequestId = 0;
  let previewBusy = false;
  let referencesLoaded = false;
  let decorCatalogLoaded = false;
  const previewButton = element("compose-preview");
  const previewImage = element("compose-preview-image");
  const reference = element("compose-reference");
  const examplePanel = element("compose-example-panel");
  const referenceImage = element("compose-reference-image");
  const backgroundExample = element("compose-background-example");
  const backgroundReference = element("compose-background-reference");
  const backgroundImage = element("compose-background-image");
  const decorationChoices = element("compose-decoration-choices");
  const decorItems = mountCompositionDecoration(send, dimensions, () => invalidatePreview());
  let palettes = [];

  let compositionBusy = false;
  let namesTimer;
  let metaphorRequestId = 0;
  let metaphorBusy = false;
  let metaphorSelectionEdited = false;
  let namesValid = false;

  function invalidateMetaphor() {
    metaphorRequestId++;
    metaphorBusy = false;
    element("metaphor-pick").disabled = false;
    element("metaphor-feedback").textContent = "";
    metaphorSelectionEdited = false;
    items.show([], assets);
    updateCreateButton();
  }
  element("metaphor-query").oninput = () => {
    invalidateMetaphor();
    element("object-names").value = "";
    element("names-selection").hidden = true;
    requestNames();
  };
  element("metaphor-pick").onclick = () => {
    cancelAdjustment();
    metaphorBusy = true;
    namesValid = false;
    updateCreateButton();
    element("metaphor-pick").disabled = true;
    element("metaphor-feedback").textContent = "Подбираем предметы…";
    send({ type: "resolve-metaphor", query: element("metaphor-query").value, requestId: ++metaphorRequestId });
  };

  function updateCreateButton() {
    const mode = element("compose-mode").value;
    const ready = mode === "metaphor" && !metaphorSelectionEdited
      ? Boolean(element("metaphor-query").value.trim())
      : mode !== "manual" ? namesValid : Boolean(ui.primary.value && ui.secondary.value);
    ui.create.disabled = compositionBusy || metaphorBusy || !ready;
    previewButton.disabled = ui.create.disabled || previewBusy;
  }

  function requestNames() {
    if (element("compose-mode").value === "manual") return;
    namesValid = false;
    updateCreateButton();
    if (!element("object-names").value.trim()) {
      element("names-feedback").textContent = "";
      return;
    }
    element("names-feedback").textContent = "Проверяем названия…";
    send({ type: "resolve-names", names: element("object-names").value,
      size: "L", secondaryRole: "independent" });
  }
  element("object-names").oninput = () => {
    if (element("compose-mode").value === "metaphor") metaphorSelectionEdited = true;
    namesValid = false;
    updateCreateButton();
    clearTimeout(namesTimer);
    namesTimer = setTimeout(requestNames, 250);
  };
  element("compose-mode").onchange = () => {
    invalidateMetaphor();
    const named = element("compose-mode").value !== "manual";
    element("metaphor-selection").hidden = element("compose-mode").value !== "metaphor";
    element("names-selection").hidden = !named ||
      (element("compose-mode").value === "metaphor" && !element("object-names").value.trim());
    element("manual-selection").hidden = named;
    if (!named) showManualItems();
    updateCreateButton();
    if (named) requestNames();
  };
  function showManualItems() {
    items.show([{ id: ui.primary.value, role: "main", size: "L" },
      { id: ui.secondary.value, role: "background", size: "L" }].filter(item => item.id), assets);
    updateCreateButton();
  }
  ui.primary.onchange = ui.secondary.onchange = showManualItems;
  ui.layout.onchange = () => {
    const manual = ui.layout.value === "manual";
    element("compose-manual-help").hidden = !manual;
    if (manual) items.openPlacement();
  };

  function loadReferences() {
    if (!referencesLoaded) send({ type: "scene-style-list" });
  }
  function updateAppearance() {
    const background = element("compose-background").value;
    const decoration = element("compose-decoration").value;
    element("compose-background-help").textContent = {
      pale: "Заливка под всеми предметами. Берётся самый светлый цвет выбранной палитры.",
      light: "Заливка под всеми предметами. Цвет заметнее, чем в самом светлом варианте палитры.",
      white: "Под всеми предметами будет сплошной белый цвет.",
      custom: "Укажите свой цвет. Палитра применяется к предметам и декору.",
      transparent: "Холст без заливки. В SVG фон останется прозрачным.",
      reference: "Берём заливку холста выбранного шаблона и применяем вашу палитру."
    }[background];
    element("compose-decoration-help").textContent = {
      auto: "Плагин выбирает украшения, которые помещаются между предметами.",
      reference: "Переносим декор выбранного шаблона целиком.",
      choose: "Выберите украшение и нажмите «Добавить декор». Настройте каждый элемент отдельно.",
      none: "На холсте останутся только предметы и выбранная заливка."
    }[decoration];
    examplePanel.hidden = decoration !== "reference";
    backgroundExample.hidden = background !== "reference";
    decorationChoices.hidden = decoration !== "choose";
    element("compose-decoration-items").hidden = decoration !== "choose";
    if (decoration === "choose" && !decorCatalogLoaded) send({ type: "compose-decoration-catalog" });
    element("compose-color-label").hidden = background !== "custom";
    updateBackgroundSwatch();
    if (!examplePanel.hidden) {
      loadReferences();
      if (referencesLoaded && referenceImage.hidden) previewReference();
    }
    if (!backgroundExample.hidden) {
      loadReferences();
      if (referencesLoaded && backgroundImage.hidden) previewBackgroundReference();
    }
  }
  element("compose-background").onchange = element("compose-decoration").onchange = updateAppearance;
  function updateBackgroundSwatch() {
    const background = element("compose-background").value;
    const colors = palettes.find(palette => palette.id === ui.palette.value)?.colors;
    const swatch = element("compose-background-swatch");
    swatch.hidden = background === "reference";
    swatch.style.backgroundColor = background === "custom" ? element("compose-color").value
      : background === "white" ? "#ffffff" : colors?.[background] ?? "transparent";
  }
  element("compose-color").oninput = updateBackgroundSwatch;
  function previewReference() {
    referenceImage.hidden = true;
    updateCreateButton();
    if (reference.value) send({ type: "compose-reference-preview", referenceId: reference.value });
  }
  reference.onchange = previewReference;
  function previewBackgroundReference() {
    backgroundImage.hidden = true;
    if (backgroundReference.value) send({ type: "compose-reference-preview", referenceId: backgroundReference.value });
  }
  backgroundReference.onchange = previewBackgroundReference;

  element("scene-new").onclick = () => {
    const [width, height] = dimensions();
    send({ type: "scene-new", width, height, palette: ui.palette.value });
  };

  function request(type) {
    const settings = items.read();
    if (!settings) return;
    const mode = element("compose-mode").value;
    const background = element("compose-background").value;
    const decoration = element("compose-decoration").value;
    if ((background === "reference" && !backgroundReference.value) ||
      (decoration === "reference" && !reference.value)) {
      loadReferences();
      setStatus("Выберите авторский пример для оформления.");
      return;
    }
    const decorations = decoration === "choose" ? decorItems.read() : undefined;
    if (decoration === "choose" && !decorations?.length) {
      setStatus("Добавьте хотя бы одно украшение.");
      return;
    }
    if (type === "preview-composition") previewBusy = true;
    else compositionBusy = true;
    updateCreateButton();
    setStatus(type === "create" ? "Создаём композицию…" : "Готовим предпросмотр…");
    send({
      type, requestId: ++previewRequestId, primaryId: ui.primary.value, secondaryId: ui.secondary.value,
      mode: mode === "metaphor" && (metaphorSelectionEdited || settings.itemSettings.length) ? "names" : mode,
      query: element("metaphor-query").value, names: element("object-names").value,
      size: "L", secondaryRole: "independent", ...settings,
      layout: ui.layout.value, format: ui.format.value,
      palette: ui.palette.value, background: background === "custom" ? element("compose-color").value : background,
      decoration, decorations, referenceId: reference.value, backgroundReferenceId: backgroundReference.value
    });
  }
  ui.create.onclick = () => request("create");
  previewButton.onclick = () => request("preview-composition");
  const invalidatePreview = () => {
    previewImage.hidden = true;
    previewBusy = false;
    previewRequestId++;
    updateCreateButton();
  };
  element("compose").oninput = invalidatePreview;
  element("compose").onchange = invalidatePreview;

  ui.palette.onchange = () => choosePalette(ui.palette.value);

  function receive(message) {
    switch (message.type) {
      case "ready": {
        assets = message.assets;
        palettes = message.palettes;
        element("available-names").textContent = assets.map(asset => asset.name).join(", ");
        fillSelect(ui.primary, assets.filter(asset => asset.variants.some(item => item.active && item.role === "main"))
          .map(asset => ({ value: asset.id, label: asset.name })));
        fillSelect(ui.secondary, assets.map(asset => ({ value: asset.id, label: asset.name })));
        if (!ui.primary.value && assets.some(item => item.id === "wallet")) ui.primary.value = "wallet";
        if (!ui.secondary.value && assets.some(item => item.id === "coin")) ui.secondary.value = "coin";
        updateCreateButton();
        fillSelect(ui.palette, message.palettes.map(item => ({ value: item.id, label: item.name })));
        updateBackgroundSwatch();
        if (element("compose-mode").value === "manual") showManualItems();
        updateCreateButton();
        requestNames();
        break;
      }
      case "metaphor-resolved": {
        if (message.requestId !== metaphorRequestId || message.query !== element("metaphor-query").value ||
            element("compose-mode").value !== "metaphor") break;
        metaphorBusy = false;
        metaphorSelectionEdited = false;
        element("metaphor-pick").disabled = false;
        const feedback = element("metaphor-feedback");
        feedback.replaceChildren();
        let explanation = feedback;
        if (!message.errors.length) {
          const note = document.createElement("p");
          note.textContent = `Подобрали предметы: ${message.items.length}. Состав ниже можно изменить.`;
          const details = document.createElement("details");
          const summary = document.createElement("summary");
          summary.textContent = "Почему эти предметы";
          details.appendChild(summary);
          feedback.append(note, details);
          explanation = details;
        }
        for (const text of message.errors.length ? message.errors : [
          `Темы: ${message.themes.join(", ")}.`,
          ...message.items.map((item, index) => `${index === 0 ? "Главный" : "Дополнительный"}: ${item.name}. ${item.reason}`),
          "Состав ниже можно изменить. Порядок названий определяет главный предмет."
        ]) {
          const line = document.createElement("p");
          line.textContent = text;
          if (message.errors.length) line.style.color = "var(--figma-color-text-danger, #b42318)";
          explanation.appendChild(line);
        }
        element("object-names").value = message.errors.length ? "" : message.items.map(item => item.name).join("\n");
        element("names-selection").hidden = Boolean(message.errors.length);
        requestNames();
        if (message.errors.length) setStatus("Подбор не выполнен. Уточни заголовок или укажи названия предметов.");
        break;
      }
      case "names-resolved": {
        if (message.query !== element("object-names").value || message.size !== "L" || message.role !== "independent" ||
            element("compose-mode").value === "manual") break;
        namesValid = !message.errors.length && message.items.length > 0;
        items.show(namesValid ? message.items : [], assets);
        if (ui.layout.value === "manual") items.openPlacement();
        if (!namesValid) compositionBusy = false;
        const feedback = element("names-feedback");
        feedback.replaceChildren();
        if (message.items.length) {
          const found = document.createElement("p");
          found.textContent = `Предметы найдены: ${message.items.length}`;
          feedback.appendChild(found);
        }
        for (const text of [...message.errors, ...message.warnings]) {
          const line = document.createElement("p");
          line.textContent = text;
          line.style.color = message.errors.includes(text) ? "var(--figma-color-text-danger, #b42318)" : "var(--figma-color-text-secondary, #666)";
          feedback.appendChild(line);
        }
        updateCreateButton();
        if (!compositionBusy) setStatus(namesValid
          ? "Состав проверен. Можно создать композицию."
          : "Исправь названия или варианты перед созданием композиции.");
        break;
      }
      case "created":
        setBusy(false);
        break;
      case "scene-styles":
        referencesLoaded = true;
        fillSelect(reference, message.styles.map(style => ({ value: style.id, label: style.name })));
        fillSelect(backgroundReference, message.styles.map(style => ({ value: style.id, label: style.name })));
        if (!examplePanel.hidden) previewReference();
        if (!backgroundExample.hidden) previewBackgroundReference();
        break;
      case "compose-variant-image":
        items.receiveThumbnail(message.variantId, message.image);
        break;
      case "compose-reference-image":
        if (message.referenceId === backgroundReference.value && message.image) {
          backgroundImage.src = message.image;
          backgroundImage.hidden = false;
        }
        if (message.referenceId !== reference.value) break;
        if (message.image) {
          referenceImage.src = message.image;
          referenceImage.hidden = false;
        }
        break;
      case "compose-decoration-catalog":
        decorCatalogLoaded = true;
        decorItems.load(message.decorations);
        break;
      case "compose-decoration-image":
        decorItems.receiveThumbnail(message.layerId, message.image);
        break;
      case "composition-preview":
        if (message.requestId !== previewRequestId) break;
        previewBusy = false;
        previewImage.src = message.image;
        previewImage.hidden = false;
        previewImage.scrollIntoView({ block: "nearest" });
        updateCreateButton();
        setStatus("Предпросмотр готов.");
        break;
      case "error":
        if (message.operation === "resolve-metaphor" && metaphorBusy) {
          invalidateMetaphor();
          element("metaphor-feedback").textContent = message.message;
        }
        if (message.operation === "preview-composition") {
          previewBusy = false;
          updateCreateButton();
        }
        if (["create", "resolve-names"].includes(message.operation)) setBusy(false);
        break;
    }
  }

  function setBusy(busy) {
    compositionBusy = busy;
    updateCreateButton();
  }
  return { receive, setBusy, setPalette: id => { ui.palette.value = id; updateBackgroundSwatch(); invalidatePreview(); }, preferredSize: () => "L" };
}
