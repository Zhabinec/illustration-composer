import { element, fillSelect } from "./dom.js";

export function numberField(labelText, value, min, max, placeholder) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.step = "any";
  input.min = String(min);
  if (max !== undefined) input.max = String(max);
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  label.appendChild(input);
  return { label, input };
}

export function placementFields(dimensions, placeholder = "Авто") {
  const x = numberField("X, px", "", -10000, 10000, placeholder);
  const y = numberField("Y, px", "", -10000, 10000, placeholder);
  const label = document.createElement("label");
  label.textContent = "Куда поставить";
  const preset = document.createElement("select");
  fillSelect(preset, [
    { value: "", label: placeholder }, { value: "custom", label: "По координатам X и Y" },
    { value: "8,40", label: "Слева" }, { value: "65,40", label: "Справа" },
    { value: "8,10", label: "Сверху слева" }, { value: "65,10", label: "Сверху справа" },
    { value: "40,40", label: "В центре холста" },
    { value: "8,65", label: "Снизу слева" }, { value: "65,65", label: "Снизу справа" }
  ]);
  preset.onchange = () => {
    if (preset.value === "custom") return;
    const [width, height] = dimensions();
    const [left, top] = preset.value.split(",").map(Number);
    x.input.value = preset.value ? String(Math.round(left * width / 100)) : "";
    y.input.value = preset.value ? String(Math.round(top * height / 100)) : "";
  };
  x.input.oninput = y.input.oninput = () => { preset.value = "custom"; };
  label.appendChild(preset);
  const row = document.createElement("div");
  row.className = "inline";
  row.append(x.label, y.label);
  return { label, row, x: x.input, y: y.input };
}

export function mountCompositionItems(send, dimensions) {
  const root = element("compose-items");
  const primary = element("compose-primary");
  let cards = [];
  let signature = "";

  function updateVariants() {
    cards.forEach(({ asset, variant, heading, item, card, preview }, index) => {
      const isPrimary = index === Number(primary.value);
      heading.textContent = `${asset.name}${isPrimary ? " · главный" : ""}`;
      const options = asset.variants.filter(entry => entry.active);
      const preferred = options.find(entry => entry.role === "main" && entry.size === item.size)
        ?? options.find(entry => entry.role === "main");
      const previous = variant.value;
      fillSelect(variant, options.map(entry => ({
        value: entry.id, label: `Версия ${entry.size} · ${entry.role === "main" ? "цветной рисунок" : "рисунок в цветах фона"}`
      })));
      if (!options.some(entry => entry.id === previous) && preferred) variant.value = preferred.id;
      if (card.open) preview();
    });
  }
  primary.onchange = updateVariants;

  function show(items, assets) {
    const next = JSON.stringify(items.map(item => [item.id, assets.find(asset => asset.id === item.id)?.variants]));
    if (next === signature) return;
    signature = next;
    cards = [];
    root.replaceChildren();
    items.forEach(item => {
      const asset = assets.find(entry => entry.id === item.id);
      if (!asset) return;
      const card = document.createElement("details");
      card.className = "panel";
      const heading = document.createElement("summary");
      const variantLabel = document.createElement("label");
      variantLabel.textContent = "Вариант из библиотеки";
      const variant = document.createElement("select");
      variantLabel.appendChild(variant);
      const layerLabel = document.createElement("label");
      layerLabel.textContent = "Слой в композиции";
      const layer = document.createElement("select");
      fillSelect(layer, [{ value: "auto", label: "Обычный порядок" },
        { value: "main", label: "Впереди всех предметов" },
        { value: "background", label: "Позади всех предметов" }], false);
      layerLabel.appendChild(layer);
      const priority = numberField("Приоритет слоя", "", -10000, 10000, "По порядку");
      const priorityHelp = document.createElement("p");
      priorityHelp.className = "muted";
      priorityHelp.textContent = "Большее число — слой выше. Можно изменить число после выбора слоя.";
      layer.onchange = () => {
        if (layer.value === "auto") {
          priority.input.value = "";
          return;
        }
        const ranks = cards.filter(item => item.layer !== layer).map(item => item.priority.value === ""
          ? Number(item.layer.value !== "background") : Number(item.priority.value));
        priority.input.value = String(layer.value === "main" ? Math.max(1, ...ranks) + 1 : Math.min(0, ...ranks) - 1);
      };
      const thumbnail = document.createElement("img");
      thumbnail.className = "preview";
      thumbnail.alt = `Выбранный вариант предмета «${asset.name}»`;
      thumbnail.hidden = true;
      const preview = () => {
        thumbnail.hidden = true;
        if (variant.value) send({ type: "compose-variant-preview", assetId: asset.id, variantId: variant.value });
      };
      variant.onchange = preview;
      card.ontoggle = () => { if (card.open) preview(); };
      const help = document.createElement("p");
      help.className = "muted";
      help.textContent = "Рисунок можно выбрать по миниатюре. Слой задаётся отдельно.";
      const position = placementFields(dimensions);
      const scale = numberField("Размер от автоматического, %", "100", 25);
      const width = numberField("Точная ширина, px", "", 1, undefined, "По масштабу");
      width.input.oninput = () => { scale.input.disabled = width.input.value !== ""; };
      const rotation = numberField("Поворот, °", "0", -180, 180);
      const transform = document.createElement("div");
      transform.className = "inline";
      transform.append(scale.label, rotation.label);
      const coordinates = document.createElement("details");
      const coordinatesLabel = document.createElement("summary");
      coordinatesLabel.textContent = "Точное положение в пикселях";
      coordinates.append(coordinatesLabel, position.row, width.label);
      card.append(heading, variantLabel, thumbnail, help, layerLabel, priority.label, priorityHelp, position.label, transform, coordinates);
      root.appendChild(card);
      cards.push({ asset, item, heading, variant, layer, priority: priority.input, card, preview, thumbnail, coordinates,
        x: position.x, y: position.y, width: width.input, scale: scale.input, rotation: rotation.input });
    });
    fillSelect(primary, cards.length ? cards.map(({ asset }, index) => ({ value: String(index), label: asset.name }))
      : [{ value: "", label: "Выбрать автоматически" }], false);
    updateVariants();
  }

  function read() {
    const settings = [];
    for (const { asset, variant, layer, priority, x, y, width, scale, rotation } of cards) {
      if (!variant.value || ![x, y, width, scale, rotation, priority].every(input => input.reportValidity())) return null;
      settings.push({ assetId: asset.id, variantId: variant.value, layer: layer.value === "background" ? "background" : "main",
        layerPriority: priority.value === "" ? undefined : Number(priority.value),
        x: x.value === "" ? undefined : Number(x.value), y: y.value === "" ? undefined : Number(y.value),
        width: width.value === "" ? undefined : Number(width.value),
        scale: scale.disabled ? 100 : Number(scale.value || 100), rotation: Number(rotation.value || 0) });
    }
    return { itemSettings: settings, primaryIndex: Number(primary.value) };
  }
  function receiveThumbnail(variantId, image) {
    if (!image) return;
    for (const { variant, thumbnail } of cards) {
      if (variant.value !== variantId) continue;
      thumbnail.src = image;
      thumbnail.hidden = false;
    }
  }
  function openPlacement() {
    for (const { card, coordinates } of cards) {
      card.open = true;
      coordinates.open = true;
    }
  }
  return { show, read, receiveThumbnail, openPlacement };
}
