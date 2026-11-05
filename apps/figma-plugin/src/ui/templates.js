import { element, fillSelect } from "./dom.js";

export function mountTemplates({ send, setStatus }) {
  let assets = [];
  let templateSlots = [];
  let templateDimensions = null;
  let templateCatalogLoaded = false;

  function previewTemplate() {
    element("template-image").hidden = true;
    element("template-slots").replaceChildren();
    element("template-decoration").replaceChildren();
    templateSlots = [];
    templateDimensions = null;
    element("template-output-size").textContent = "";
    element("template-size").textContent = "";
    element("template-create").disabled = true;
    if (element("template-select").value) {
      send({ type: "template-preview", id: element("template-select").value });
    }
  }
  element("template-select").onchange = previewTemplate;
  function renderTemplateSlots(slots) {
    templateSlots = [];
    element("template-slots").replaceChildren();
    element("template-decoration").replaceChildren();
    const subjects = slots.filter(slot => slot.kind !== "decoration");
    const decorations = slots.filter(slot => slot.kind === "decoration");
    element("template-subjects-heading").hidden = !subjects.length;
    let decorationPanel = null;
    if (decorations.length) {
      decorationPanel = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `Декор шаблона · ${decorations.length}`;
      decorationPanel.appendChild(summary);
      element("template-decoration").appendChild(decorationPanel);
    }
    element("template-fixed-note").textContent = subjects.length
      ? "Остальное останется как в образце." : "Для этой сцены можно изменить цвета и размер.";
    for (const slot of slots) {
      const panel = document.createElement("div");
      panel.className = "slot-row";
      const label = document.createElement("label");
      const select = document.createElement("select");
      select.id = `slot-${slot.index}`;
      label.htmlFor = select.id;
      label.textContent = slot.kind === "decoration" ? "Декор" : slot.name;
      const role = document.createElement("span");
      role.className = "slot-role";
      role.textContent = slot.kind === "primary" ? "Основа" : slot.kind === "secondary" ? "Дополнение" : "Из образца";
      label.appendChild(role);
      fillSelect(select, [
        { value: "", label: "Как в образце" },
        ...assets.map(asset => ({ value: asset.id, label: asset.name }))
      ], false);
      const variantLabel = document.createElement("label");
      const variant = document.createElement("select");
      variant.id = `slot-variant-${slot.index}`;
      variantLabel.htmlFor = variant.id;
      variantLabel.textContent = "Рисунок и роль";
      const variantSettings = document.createElement("details");
      variantSettings.className = "slot-variant";
      const variantSummary = document.createElement("summary");
      variantSummary.textContent = "Вариант предмета";
      variantSettings.append(variantSummary, variantLabel, variant);
      const update = () => {
        const asset = assets.find(asset => asset.id === select.value);
        const variants = asset ? asset.variants.filter(item => item.active) : [];
        fillSelect(variant, variants.map(item => ({
          value: item.id, label: `${item.size === "S" ? "Проще" : "Подробнее"} · ${item.role === "main" ? "основной" : "фоновый"}`
        })), false);
        const preferred = variants.find(item => item.size === "L" && item.role === "main") ?? variants[0];
        if (preferred) variant.value = preferred.id;
        variantSettings.hidden = !asset || variants.length < 2;
      };
      select.onchange = update;
      update();
      panel.append(label, select, variantSettings);
      (slot.kind === "decoration" ? decorationPanel : element("template-slots")).appendChild(panel);
      templateSlots.push({ id: slot.id, select, variant });
    }
  }
  element("template-save").onclick = () => {
    element("template-save").disabled = true;
    setStatus("Проверяем и сохраняем векторный источник…");
    send({ type: "template-save", name: element("template-name").value });
  };
  function updateTemplateOutputSize() {
    if (!templateDimensions) return;
    const scale = Number(element("template-scale").value) / 100;
    element("template-output-size").textContent = Number.isFinite(scale) && scale >= 0.1 && scale <= 4
      ? `Размер результата: ${Math.round(templateDimensions.width * scale)} × ${Math.round(templateDimensions.height * scale)}`
      : "Укажи масштаб от 10% до 400%";
  }
  element("template-scale").oninput = updateTemplateOutputSize;
  element("template-create").onclick = () => {
    if (!element("template-scale").reportValidity()) return;
    element("template-create").disabled = true;
    setStatus("Создаём редактируемую копию…");
    send({ type: "template-create", id: element("template-select").value,
      scale: Number(element("template-scale").value) / 100, palette: element("template-palette").value,
      replacements: templateSlots.filter(slot => slot.select.value).map(slot => ({
        slotId: slot.id, assetId: slot.select.value, variantId: slot.variant.value
      })) });
  };

  function receive(message) {
    switch (message.type) {
      case "ready": {
        if (JSON.stringify(assets) !== JSON.stringify(message.assets)) templateCatalogLoaded = false;
        assets = message.assets;
        fillSelect(element("template-palette"), message.palettes.map(item => ({ value: item.id, label: item.name })));
        break;
      }
      case "templates":
        templateCatalogLoaded = true;
        fillSelect(element("template-select"), message.templates.map(item => ({ value: item.id,
          label: `${item.origin === "example" ? "Пример" : "Свой"}: ${item.name}` })));
        element("template-catalog-status").textContent = `${message.templates.length} готовых сцен`;
        for (const warning of message.warnings ?? []) {
          const line = document.createElement("p");
          line.textContent = warning;
          element("template-catalog-status").appendChild(line);
        }
        if (message.selectedId) element("template-select").value = message.selectedId;
        element("template-save").disabled = false;
        if (message.saved) setStatus("Шаблон сохранён в документе");
        else if (!message.templates.length) setStatus("Выдели готовую векторную композицию и сохрани первый шаблон");
        previewTemplate();
        break;
      case "template-preview":
        if (message.id !== element("template-select").value) break;
        element("template-image").src = message.image;
        element("template-image").hidden = false;
        element("template-size").textContent = `${Math.round(message.width)} × ${Math.round(message.height)}`;
        templateDimensions = { width: message.width, height: message.height };
        updateTemplateOutputSize();
        element("template-create").disabled = false;
        renderTemplateSlots(message.slots);
        break;
      case "template-created":
        element("template-create").disabled = false;
        setStatus("Композиция создана из независимых редактируемых векторов");
        break;
      case "error":
        if (message.operation === "template-save") element("template-save").disabled = false;
        if (message.operation === "template-create") setBusy(false);
        break;
    }
  }

  function setBusy(busy) {
    element("template-create").disabled = busy || !templateDimensions;
  }
  return { receive, setBusy, setPalette: id => { element("template-palette").value = id; },
      activate: () => { if (!templateCatalogLoaded) send({ type: "template-list" }); } };
}
