import { element, fillSelect } from "./dom.js";
import { numberField } from "./compose-items.js";

export function mountCompositionDecoration(invalidatePreview) {
  const root = element("compose-decoration-items");
  const choice = element("compose-decoration-choice");
  const add = element("compose-decoration-add");
  const image = element("compose-decoration-image");
  const cards = [];
  let sourceId = "";
  let choices = [];

  function updateButton() {
    add.disabled = !choice.value || cards.length >= 12;
    const thumbnail = choices.find(entry => entry.id === choice.value)?.image;
    image.hidden = !thumbnail;
    if (thumbnail) image.src = thumbnail;
  }
  function load(referenceId, decorations) {
    sourceId = referenceId;
    choices = decorations;
    fillSelect(choice, [{ value: "", label: choices.length ? "Выберите линию или украшение" : "Декора нет" },
      ...choices.map(item => ({ value: item.id, label: item.name }))], false);
    updateButton();
  }
  choice.onchange = updateButton;
  add.onclick = () => {
    const item = choices.find(entry => entry.id === choice.value);
    if (!item || cards.length >= 12) return;
    const card = document.createElement("details");
    card.className = "panel";
    card.open = true;
    const title = document.createElement("summary");
    title.textContent = item.name;
    const thumbnail = document.createElement("img");
    thumbnail.className = "preview";
    thumbnail.alt = item.name;
    thumbnail.hidden = !item.image;
    if (item.image) thumbnail.src = item.image;
    const x = numberField("Центр слева, %", "", 0, 100, "Как в примере");
    const y = numberField("Центр сверху, %", "", 0, 100, "Как в примере");
    const scale = numberField("Размер, %", "100", 25, 250);
    const rotation = numberField("Поворот, °", "0", -180, 180);
    const position = document.createElement("div");
    position.className = "inline";
    position.append(x.label, y.label);
    const transform = document.createElement("div");
    transform.className = "inline";
    transform.append(scale.label, rotation.label);
    const remove = document.createElement("button");
    remove.textContent = "Убрать украшение";
    const entry = { sourceId, layerId: item.id, x: x.input, y: y.input, scale: scale.input, rotation: rotation.input };
    remove.onclick = () => {
      cards.splice(cards.indexOf(entry), 1);
      card.remove();
      updateButton();
      invalidatePreview();
    };
    card.append(title, thumbnail, position, transform, remove);
    root.appendChild(card);
    cards.push(entry);
    updateButton();
    invalidatePreview();
  };
  function read() {
    const decorations = [];
    for (const { sourceId, layerId, x, y, scale, rotation } of cards) {
      if (![x, y, scale, rotation].every(input => input.reportValidity())) return null;
      decorations.push({ sourceId, layerId, x: x.value === "" ? undefined : Number(x.value),
        y: y.value === "" ? undefined : Number(y.value), scale: Number(scale.value || 100), rotation: Number(rotation.value || 0) });
    }
    return decorations;
  }
  return { load, read };
}
