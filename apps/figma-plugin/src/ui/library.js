import { element, fillSelect } from "./dom.js";

export function mountLibrary({ send, setStatus }) {
  const ui = {
    candidate: element("candidate"),
    candidateCount: element("candidate-count"), candidatePreview: element("candidate-preview"),
    registration: element("registration"), kind: element("kind"),
    existingFields: element("existing-fields"), existingAsset: element("existing-asset"),
    nameFields: element("name-fields"), resourceName: element("resource-name"),
    variantFields: element("variant-fields"), variantSize: element("variant-size"),
    variantRole: element("variant-role"), paletteFields: element("palette-fields"),
    colorRoles: element("color-roles"), register: element("register"),
    conflict: element("conflict"), oldPreview: element("old-preview"),
    newPreview: element("new-preview"), confirmReplace: element("confirm-replace"),
    replace: element("replace"), manageAsset: element("manage-asset"),
    variantList: element("variant-list")
  };

  const roleNames = {
    dark: "Тёмный", medium: "Средний", light: "Светлый",
    pale: "Очень светлый", pink: "Розовый", pinkLight: "Светло-розовый", yellow: "Жёлтый"
  };

  let assets = [];
  let candidates = [];
  let detectedColors = [];
  let pendingConflict = null;

  function selectCandidate() {
    const candidate = candidates.find(item => item.nodeId === ui.candidate.value);
    ui.registration.hidden = !candidate;
    ui.conflict.hidden = true;
    pendingConflict = null;
    ui.candidatePreview.hidden = true;
    if (!candidate) return;
    ui.variantSize.value = candidate.size;
    ui.variantRole.value = candidate.role;
    ui.resourceName.value = /^Group(?:\s|$)/i.test(candidate.name) ? "" : candidate.name;
    send({ type: "preview", nodeId: candidate.nodeId });
    if (ui.kind.value === "palette") inspectPalette();
  }

  function inspectPalette() {
    detectedColors = [];
    ui.colorRoles.replaceChildren();
    if (ui.candidate.value) send({ type: "inspect-palette", nodeId: ui.candidate.value });
  }

  function renderColorRoles() {
    ui.colorRoles.replaceChildren();
    for (const [role, label] of Object.entries(roleNames)) {
      const wrapper = document.createElement("div");
      const caption = document.createElement("label");
      caption.textContent = `${label}${["dark", "medium", "light"].includes(role) ? " *" : ""}`;
      const select = document.createElement("select");
      select.dataset.role = role;
      fillSelect(select, [
        { value: "", label: "— не назначен —" },
        ...detectedColors.map(color => ({ value: color, label: color }))
      ], false);
      wrapper.append(caption, select);
      ui.colorRoles.appendChild(wrapper);
    }
  }

  function updateKind() {
    const kind = ui.kind.value;
    ui.existingFields.hidden = kind !== "existing";
    ui.nameFields.hidden = kind === "existing";
    ui.variantFields.hidden = kind === "palette";
    ui.paletteFields.hidden = kind !== "palette";
    ui.register.textContent = kind === "palette" ? "Добавить палитру" : "Зарегистрировать объект";
    if (kind === "palette") inspectPalette();
  }
  ui.kind.onchange = updateKind;
  ui.candidate.onchange = selectCandidate;

  function renderVariants() {
    const asset = assets.find(item => item.id === ui.manageAsset.value);
    ui.variantList.replaceChildren();
    if (!asset) return;
    for (const variant of asset.variants) {
      const line = document.createElement("div");
      line.className = "variant";
      const name = document.createElement("span");
      name.textContent = `${variant.size === "S" ? "Проще" : "Подробнее"} · ${variant.role === "main" ? "основной" : "фоновый"}${variant.active ? " · используется" : " · сохранён"}`;
      line.appendChild(name);
      if (!variant.active) {
        const current = asset.variants.find(other => other.active && other.size === variant.size && other.role === variant.role);
        if (current) {
          const button = document.createElement("button");
          button.textContent = "Использовать";
          button.onclick = () => {
            if (button.dataset.confirm !== "yes") {
              button.dataset.confirm = "yes";
              button.textContent = "Подтвердить";
              return;
            }
            send({ type: "activate", assetId: asset.id, variantId: variant.id, expectedActiveId: current.id });
            button.disabled = true;
          };
          line.appendChild(button);
        }
      }
      ui.variantList.appendChild(line);
    }
  }
  ui.manageAsset.onchange = renderVariants;

  ui.register.onclick = () => {
    if (!ui.candidate.value) return;
    const kind = ui.kind.value;
    const message = {
      type: "register", kind, nodeId: ui.candidate.value,
      assetId: ui.existingAsset.value, name: ui.resourceName.value,
      size: ui.variantSize.value, role: ui.variantRole.value
    };
    if (kind === "palette") {
      const colors = {};
      for (const select of ui.colorRoles.querySelectorAll("select")) {
        if (select.value) colors[select.dataset.role] = select.value;
      }
      message.colors = colors;
    }
    setStatus("Сохраняем ресурс…");
    send(message);
  };

  element("refresh").onclick = () => send({ type: "refresh" });
  element("select-current").onclick = () => send({ type: "select-current" });
  ui.confirmReplace.onchange = () => {
    ui.replace.disabled = !ui.confirmReplace.checked;
  };
  element("alternative").onclick = () => {
    if (pendingConflict !== null) send({ type: "confirm-register", token: pendingConflict, decision: "alternative" });
  };
  ui.replace.onclick = () => {
    if (pendingConflict !== null && ui.confirmReplace.checked) {
      send({ type: "confirm-register", token: pendingConflict, decision: "replace" });
    }
  };
  element("cancel-conflict").onclick = () => {
    pendingConflict = null;
    ui.conflict.hidden = true;
    ui.registration.hidden = false;
    setStatus("Регистрация отменена");
  };

  function receive(message) {
    switch (message.type) {
      case "ready": {
        assets = message.assets;
        candidates = message.candidates;
        fillSelect(ui.existingAsset, assets.map(asset => ({ value: asset.id, label: asset.name })));
        fillSelect(ui.manageAsset, assets.map(asset => ({ value: asset.id, label: asset.name })));
        fillSelect(ui.candidate, candidates.map((item, index) => ({
          value: item.nodeId, label: `${/^(Group|Frame)(\s|$)/i.test(item.name) ? `Элемент ${index + 1}` : item.name} · ${item.role === "main" ? "основной" : "фоновый"}`
        })));
        ui.candidateCount.textContent = `Новых элементов: ${candidates.length}`;
        renderVariants();
        selectCandidate();
        break;
      }
      case "selected":
        ui.candidate.value = message.nodeId;
        selectCandidate();
        break;
      case "preview":
        if (message.nodeId === ui.candidate.value && message.image) {
          ui.candidatePreview.src = message.image;
          ui.candidatePreview.hidden = false;
        }
        break;
      case "palette-colors":
        if (message.nodeId === ui.candidate.value) {
          detectedColors = message.colors;
          renderColorRoles();
        }
        break;
      case "conflict":
        pendingConflict = message.token;
        ui.conflict.hidden = false;
        ui.registration.hidden = true;
        ui.oldPreview.src = message.currentPreview || "";
        ui.newPreview.src = message.incomingPreview || "";
        ui.confirmReplace.checked = false;
        ui.replace.disabled = true;
        setStatus("Нужен выбор: сохранить альтернативу или заменить текущий вариант");
        break;
    }
  }

  function registerPalette() {
    ui.kind.value = "palette";
    updateKind();
    send({ type: "select-current" });
  }
  updateKind();
  return { receive, registerPalette };
}
