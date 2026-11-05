import { element, fillSelect } from "./dom.js";

export function mountEdit({ send, preferredSize, preferredPalette, resetScroll }) {
  let assets = [];
  let editingScene = null;

  function sceneCommand(type, data = {}) {
    if (!editingScene) return;
    send({ type, sceneId: editingScene.id, nodeId: element("scene-object").value,
      palette: element("scene-palette").value || preferredPalette(), ...data });
  }
  function showSceneObject() {
    const item = editingScene?.items.find(item => item.id === element("scene-object").value);
    element("scene-object-actions").disabled = !item;
    for (const [field, value] of [["scene-x", item?.x], ["scene-y", item?.y], ["scene-rotation", item?.rotation],
        ["scene-object-width", item?.width], ["scene-object-height", item?.height]]) {
      element(field).value = value === undefined ? "" : Math.round(value * 100) / 100;
    }
    const currentName = item?.name.replace(/(?: — копия)+$/, "").trim().toLowerCase();
    element("scene-replace-asset").value = assets.find(asset => asset.name.trim().toLowerCase() === currentName)?.id ?? "";
    updateReplacementVariants(item?.role);
  }
  function updateReplacementVariants(preferredRole = element("scene-replace-role").value) {
    const item = editingScene?.items.find(item => item.id === element("scene-object").value);
    const asset = assets.find(asset => asset.id === element("scene-replace-asset").value);
    const active = asset?.variants.filter(variant => variant.active) ?? [];
    const roleSelect = element("scene-replace-role");
    const roles = [
      { value: "main", label: "Основной" }, { value: "background", label: "Фоновый" }
    ].filter(role => active.some(variant => variant.role === role.value));
    fillSelect(roleSelect, roles, false);
    if (roles.some(role => role.value === preferredRole)) roleSelect.value = preferredRole;
    roleSelect.disabled = !roles.length;
    const variants = active.filter(variant => variant.role === roleSelect.value);
    fillSelect(element("scene-replace-size"), variants.map(variant => ({ value: variant.size,
      label: variant.size === "L" ? "Подробный" : "Упрощённый" })), false);
    const size = preferredSize();
    if (variants.some(variant => variant.size === size)) element("scene-replace-size").value = size;
    element("scene-replace").disabled = !item || !variants.length;
    element("scene-replace-help").textContent = variants.length && roleSelect.value !== item?.role
      ? (roleSelect.value === "background" ? "Фоновый вариант переместится под основные предметы." : "Основной вариант переместится над фоновыми предметами.")
      : "Новый рисунок впишется в текущий размер без растяжения.";
  }
  element("scene-replace-asset").onchange = () => updateReplacementVariants();
  element("scene-replace-role").onchange = () => updateReplacementVariants();
  element("scene-replace").onclick = () => sceneCommand("scene-replace", {
    assetId: element("scene-replace-asset").value, size: element("scene-replace-size").value,
    role: element("scene-replace-role").value
  });
  element("scene-object-width").oninput = () => {
    const item = editingScene?.items.find(item => item.id === element("scene-object").value);
    const width = Number(element("scene-object-width").value);
    if (item?.width > 0 && Number.isFinite(width) && width > 0) element("scene-object-height").value = Math.round(width * item.height / item.width * 100) / 100;
  };
  element("scene-object-height").oninput = () => {
    const item = editingScene?.items.find(item => item.id === element("scene-object").value);
    const height = Number(element("scene-object-height").value);
    if (item?.height > 0 && Number.isFinite(height) && height > 0) element("scene-object-width").value = Math.round(height * item.width / item.height * 100) / 100;
  };
  element("scene-resize-object").onclick = () => sceneCommand("scene-resize-object", {
    width: Number(element("scene-object-width").value)
  });
  element("scene-object").onchange = () => { showSceneObject(); sceneCommand("scene-select"); };
  element("scene-transform").onclick = () => sceneCommand("scene-transform", {
    x: Number(element("scene-x").value), y: Number(element("scene-y").value), rotation: Number(element("scene-rotation").value)
  });
  element("scene-duplicate").onclick = () => sceneCommand("scene-duplicate");
  element("scene-delete").onclick = () => sceneCommand("scene-delete");
  element("scene-forward").onclick = () => sceneCommand("scene-layer", { direction: "forward" });
  element("scene-backward").onclick = () => sceneCommand("scene-layer", { direction: "backward" });
  element("scene-add").onclick = () => sceneCommand("scene-add", {
    assetId: element("scene-add-asset").value, size: element("scene-add-size").value, role: element("scene-add-role").value
  });
  element("scene-settings").onclick = () => sceneCommand("scene-settings", {
    width: Number(element("scene-width").value), height: Number(element("scene-height").value)
  });
  element("scene-background").onclick = () => sceneCommand("scene-background", {
    background: element("scene-background-choice").value
  });
  element("scene-style").ontoggle = () => {
    if (element("scene-style").open && editingScene && !editingScene.isTemplate) send({ type: "scene-style-list" });
  };
  element("scene-reference-style").onclick = () => sceneCommand("scene-reference-style", {
    sourceId: element("scene-reference-choice").value, mode: element("scene-reference-mode").value
  });

  element("export-svg").onclick = () => {
    element("export-svg").disabled = true;
    element("export-feedback").textContent = "Экспортируем SVG и проверяем повторным импортом в Figma…";
    send({ type: "export-svg", ...(editingScene ? { sceneId: editingScene.id } : {}) });
  };

  function receive(message) {
    switch (message.type) {
      case "ready": {
        assets = message.assets;
        fillSelect(element("scene-add-asset"), assets.map(asset => ({ value: asset.id, label: asset.name })));
        fillSelect(element("scene-replace-asset"), [{ value: "", label: "Выберите новый предмет" },
          ...assets.map(asset => ({ value: asset.id, label: asset.name }))], false);
        fillSelect(element("scene-palette"), message.palettes.map(item => ({ value: item.id, label: item.name })));
        if (editingScene) showSceneObject();
        break;
      }
      case "scene-styles":
        fillSelect(element("scene-reference-choice"), message.styles.map(style => ({ value: style.id, label: style.name })));
        element("scene-reference-style").disabled = !message.styles.length;
        element("scene-style-help").textContent = message.styles.length ? "Линии и украшения добавляются отдельным слоем." : "Исходные примеры оформления не найдены.";
        break;
      case "scene-state": {
        const previousId = editingScene?.id;
        editingScene = message.scene;
        element("scene-editor").hidden = !editingScene;
        element("scene-empty").hidden = Boolean(editingScene);
        if (!editingScene) break;
        element("scene-reference-controls").hidden = editingScene.isTemplate;
        if (previousId !== editingScene.id && !editingScene.isTemplate && element("scene-style").open) send({ type: "scene-style-list" });
        element("scene-info").textContent = `${editingScene.name} · ${Math.round(editingScene.width)} × ${Math.round(editingScene.height)}`;
        const previousObject = element("scene-object").value;
        fillSelect(element("scene-object"), editingScene.items.map(item => ({ value: item.id, label: item.name })));
        if (editingScene.selectedId) element("scene-object").value = editingScene.selectedId;
        else if (previousId === editingScene.id && editingScene.items.some(item => item.id === previousObject)) element("scene-object").value = previousObject;
        else element("scene-object").value = editingScene.items.find(item => item.role === "main")?.id ?? editingScene.items[0]?.id ?? "";
        element("scene-width").value = Math.round(editingScene.width);
        element("scene-height").value = Math.round(editingScene.height);
        element("scene-palette").value = editingScene.paletteId || "original";
        showSceneObject();
        if (previousId !== editingScene.id) {
          element("scene-editor").open = true;
          resetScroll();
        }
        break;
      }
      case "svg-exported": {
        const blob = new Blob([message.svg], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = message.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        element("export-svg").disabled = false;
        element("export-feedback").textContent = `SVG ${message.width} × ${message.height} передан на скачивание. Повторный импорт проверен: ${message.vectorCount} векторных элементов.`;
        break;
      }
      case "error":
        if (message.operation === "export-svg") {
          element("export-svg").disabled = false;
          element("export-feedback").textContent = message.message;
        }
        break;
    }
  }
  return { receive, activate: () => send({ type: "scene-state" }) };
}
