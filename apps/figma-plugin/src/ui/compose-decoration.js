import { element, fillSelect } from "./dom.js";
import { numberField, placementFields } from "./compose-items.js";

export function mountCompositionDecoration(send, dimensions, invalidatePreview) {
  const root = element("compose-decoration-items");
  const choice = element("compose-decoration-choice");
  const type = element("compose-decoration-type");
  const add = element("compose-decoration-add");
  const image = element("compose-decoration-image");
  const cards = [];
  let choices = [];

  function updateChoice() {
    add.disabled = !choice.value || cards.length >= 12;
    const selected = choices.find(entry => entry.id === choice.value);
    const thumbnail = selected?.image;
    image.hidden = !thumbnail;
    if (thumbnail) image.src = thumbnail;
    else if (selected && selected.image === undefined) {
      send({ type: "compose-decoration-preview", sourceId: selected.sourceId, layerId: selected.id });
    }
  }
  function filterChoices() {
    const filtered = choices.filter(item => item.type === type.value);
    fillSelect(choice, [{ value: "", label: filtered.length ? "Выберите украшение" : "Декор недоступен" },
      ...filtered.map(item => ({ value: item.id, label: item.name }))], false);
    updateChoice();
  }
  function load(decorations) {
    choices = decorations;
    fillSelect(type, [...new Set(choices.map(item => item.type))].map(name => ({ value: name, label: name })));
    filterChoices();
  }
  type.onchange = filterChoices;
  choice.onchange = updateChoice;
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
    const position = placementFields(dimensions, "Как в примере");
    const scale = numberField("Размер, %", "100", 25);
    const rotation = numberField("Поворот, °", "0", -180, 180);
    const transform = document.createElement("div");
    transform.className = "inline";
    transform.append(scale.label, rotation.label);
    const remove = document.createElement("button");
    remove.textContent = "Убрать украшение";
    const entry = { sourceId: item.sourceId, layerId: item.id, thumbnail,
      x: position.x, y: position.y, scale: scale.input, rotation: rotation.input };
    remove.onclick = () => {
      cards.splice(cards.indexOf(entry), 1);
      card.remove();
      updateChoice();
      invalidatePreview();
    };
    card.append(title, thumbnail, position.label, position.row, transform, remove);
    root.appendChild(card);
    cards.push(entry);
    updateChoice();
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
  function receiveThumbnail(layerId, thumbnail) {
    const item = choices.find(entry => entry.id === layerId);
    if (item) item.image = thumbnail;
    if (choice.value === layerId) updateChoice();
    if (!thumbnail) return;
    for (const entry of cards.filter(entry => entry.layerId === layerId)) {
      entry.thumbnail.src = thumbnail;
      entry.thumbnail.hidden = false;
    }
  }
  return { load, read, receiveThumbnail };
}
