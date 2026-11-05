import { element, fillSelect } from "./dom.js";

export function mountCompose({ send, setStatus, cancelAdjustment, choosePalette }) {
  const ui = { primary: element("primary"),
    secondary: element("secondary"),
    size: element("size"),
    secondaryRole: element("secondary-role"),
    layout: element("layout"),
    format: element("format"),
    palette: element("palette"),
    create: element("create") };

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
      size: ui.size.value, secondaryRole: ui.secondaryRole.value });
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
    element("secondary-role-label").textContent = named ? "Дополнительные предметы" : "Второй предмет";
    updateCreateButton();
    if (named) requestNames();
  };
  ui.size.onchange = requestNames;
  ui.secondaryRole.onchange = requestNames;

  element("scene-new").onclick = () => {
    const dimensions = { landscape: [1200, 800], square: [1000, 1000], portrait: [800, 1200] }[ui.format.value];
    send({ type: "scene-new", width: dimensions[0], height: dimensions[1], palette: ui.palette.value });
  };

  ui.create.onclick = () => {
    compositionBusy = true;
    ui.create.disabled = true;
    setStatus("Создаём композицию…");
    send({
      type: "create", primaryId: ui.primary.value, secondaryId: ui.secondary.value,
      mode: element("compose-mode").value === "metaphor" && metaphorSelectionEdited
        ? "names" : element("compose-mode").value,
      query: element("metaphor-query").value, names: element("object-names").value,
      size: ui.size.value, secondaryRole: ui.secondaryRole.value,
      layout: ui.layout.value, format: ui.format.value,
      palette: ui.palette.value
    });
  };

  ui.palette.onchange = () => choosePalette(ui.palette.value);

  function receive(message) {
    switch (message.type) {
      case "ready": {
        const assets = message.assets;
        element("available-names").textContent = assets.map(asset => asset.name).join(", ");
        fillSelect(ui.primary, assets.filter(asset => asset.variants.some(item => item.active && item.role === "main"))
          .map(asset => ({ value: asset.id, label: asset.name })));
        fillSelect(ui.secondary, assets.map(asset => ({ value: asset.id, label: asset.name })));
        if (!ui.primary.value && assets.some(item => item.id === "wallet")) ui.primary.value = "wallet";
        if (!ui.secondary.value && assets.some(item => item.id === "coin")) ui.secondary.value = "coin";
        updateCreateButton();
        fillSelect(ui.palette, message.palettes.map(item => ({ value: item.id, label: item.name })));
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
        if (message.query !== element("object-names").value || message.size !== ui.size.value ||
            message.role !== ui.secondaryRole.value) break;
        namesValid = !message.errors.length && message.items.length > 0;
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
      case "error":
        if (message.operation === "resolve-metaphor" && metaphorBusy) {
          invalidateMetaphor();
          element("metaphor-feedback").textContent = message.message;
        }
        if (message.operation === "create" || message.operation === "resolve-names") setBusy(false);
        break;
    }
  }

  function setBusy(busy) {
    compositionBusy = busy;
    updateCreateButton();
  }
  return { receive, setBusy, setPalette: id => { ui.palette.value = id; }, preferredSize: () => ui.size.value };
}
