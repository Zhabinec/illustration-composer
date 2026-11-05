import { element, fillSelect } from "./dom.js";

export function mountPalettes({ send, setStatus, choosePalette, openPaletteRegistration }) {
  const ui = { paletteFile: element("palette-file") };

  let paletteImportBusy = false;
  let selectedPalette = "original";

  function updatePaletteCards() {
    for (const card of document.querySelectorAll(".palette-card")) {
      card.setAttribute("aria-pressed", String(card.dataset.palette === selectedPalette));
    }
  }

  function importPalette(raw) {
    if (paletteImportBusy) return;
    try {
      if (new TextEncoder().encode(raw).length > 16384) throw new Error("Слишком большой файл палитры (максимум 16 КБ)");
      const palette = JSON.parse(raw);
      paletteImportBusy = true;
      element("palette-import").disabled = true;
      ui.paletteFile.disabled = true;
      element("palette-feedback").textContent = "Сохраняем палитру…";
      send({ type: "import-palette", palette });
    } catch (error) {
      element("palette-feedback").textContent = error.message;
    }
  }
  ui.paletteFile.onchange = async () => {
    const file = ui.paletteFile.files[0];
    if (!file) return;
    try {
      if (file.size > 16384) throw new Error("Слишком большой файл палитры");
      importPalette(await file.text());
    } catch (error) {
      element("palette-feedback").textContent = error.message;
    } finally {
      ui.paletteFile.value = "";
    }
  };
  element("palette-import").onclick = () => importPalette(element("palette-json").value);

  const fromFigma = element("palette-from-figma");
  fromFigma.hidden = !openPaletteRegistration;
  fromFigma.onclick = openPaletteRegistration;

  function receive(message) {
    switch (message.type) {
      case "ready": {
        element("palette-list").replaceChildren();
        for (const palette of message.palettes) {
          const row = document.createElement("button");
          row.className = "palette-card";
          row.dataset.palette = palette.id;
          row.setAttribute("aria-pressed", String(selectedPalette === palette.id));
          const name = document.createElement("span");
          name.textContent = palette.name;
          const swatches = document.createElement("div");
          swatches.className = "palette-swatches";
          swatches.setAttribute("aria-hidden", "true");
          for (const role of ["dark", "medium", "light", "pink", "yellow"]) {
            if (!palette.colors?.[role]) continue;
            const swatch = document.createElement("span");
            swatch.style.backgroundColor = palette.colors[role];
            swatches.appendChild(swatch);
          }
          row.append(name, swatches);
          row.onclick = () => {
            choosePalette(palette.id);
            setStatus(`Палитра «${palette.name}» выбрана для следующей сцены`);
          };
          element("palette-list").appendChild(row);
        }
        break;
      }
      case "palette-imported":
        paletteImportBusy = false;
        ui.paletteFile.disabled = false;
        element("palette-import").disabled = false;
        choosePalette(message.id);
        element("palette-feedback").textContent = `«${message.name}» сохранена в Figma-файле и выбрана для следующих композиций.`;
        break;
      case "error":
        if (message.operation === "import-palette") {
          paletteImportBusy = false;
          ui.paletteFile.disabled = false;
          element("palette-import").disabled = false;
          element("palette-feedback").textContent = message.message;
        }
        break;
    }
  }
  return { receive, setPalette(id) { selectedPalette = id; updatePaletteCards(); } };
}
