import { element, fillSelect } from "./dom.js";

function numberField(labelText, value, min, max, placeholder) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  label.appendChild(input);
  return { label, input };
}

export function mountCompositionItems(send) {
  const root = element("compose-items");
  const primary = element("compose-primary");
  let cards = [];
  let signature = "";

  function updateVariants() {
    cards.forEach(({ asset, variant, heading, item, card, preview }, index) => {
      const isPrimary = index === Number(primary.value);
      heading.textContent = `${asset.name}${isPrimary ? " · главный" : ""}`;
      const options = asset.variants.filter(entry => entry.active && (!isPrimary || entry.role === "main"));
      const preferred = options.find(entry => entry.role === item.role && entry.size === item.size);
      const previous = variant.value;
      fillSelect(variant, options.map(entry => ({
        value: entry.id, label: `${entry.role === "main" ? "Передний план" : "Фоновый предмет"} · версия ${entry.size}`
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
      help.textContent = "Фоновый вариант ставится позади других предметов. Выберите версию S или L по миниатюре.";
      const x = numberField("Центр слева, %", "", 0, 100, "Авто");
      const y = numberField("Центр сверху, %", "", 0, 100, "Авто");
      const positionLabel = document.createElement("label");
      positionLabel.textContent = "Куда поставить";
      const preset = document.createElement("select");
      fillSelect(preset, [
        { value: "", label: "Выбрать автоматически" }, { value: "25,25", label: "Сверху слева" },
        { value: "75,25", label: "Сверху справа" }, { value: "50,50", label: "По центру" },
        { value: "25,75", label: "Снизу слева" }, { value: "75,75", label: "Снизу справа" }
      ]);
      preset.onchange = () => {
        const [left = "", top = ""] = preset.value.split(",");
        x.input.value = left;
        y.input.value = top;
      };
      positionLabel.appendChild(preset);
      const scale = numberField("Размер от автоматического, %", "100", 25, 250);
      const rotation = numberField("Поворот, °", "0", -180, 180);
      const position = document.createElement("div");
      position.className = "inline";
      position.append(x.label, y.label);
      const transform = document.createElement("div");
      transform.className = "inline";
      transform.append(scale.label, rotation.label);
      const coordinates = document.createElement("details");
      const coordinatesLabel = document.createElement("summary");
      coordinatesLabel.textContent = "Точное положение центра";
      coordinates.append(coordinatesLabel, position);
      card.append(heading, variantLabel, thumbnail, help, positionLabel, transform, coordinates);
      root.appendChild(card);
      cards.push({ asset, item, heading, variant, card, preview, thumbnail,
        x: x.input, y: y.input, scale: scale.input, rotation: rotation.input });
    });
    fillSelect(primary, cards.length ? cards.flatMap(({ asset }, index) =>
      asset.variants.some(entry => entry.active && entry.role === "main") ? [{ value: String(index), label: asset.name }] : []
    ) : [{ value: "", label: "Выбрать автоматически" }], false);
    updateVariants();
  }

  function read() {
    const settings = [];
    for (const { asset, variant, x, y, scale, rotation } of cards) {
      if (!variant.value || ![x, y, scale, rotation].every(input => input.reportValidity())) return null;
      settings.push({ assetId: asset.id, variantId: variant.value,
        x: x.value === "" ? undefined : Number(x.value), y: y.value === "" ? undefined : Number(y.value),
        scale: Number(scale.value || 100), rotation: Number(rotation.value || 0) });
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
  return { show, read, receiveThumbnail };
}
