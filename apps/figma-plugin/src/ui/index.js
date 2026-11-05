import { element } from "./dom.js";
import { mountCompose } from "./compose.js";
import { mountEdit } from "./edit.js";
import { mountTemplates } from "./templates.js";
import { mountLibrary } from "./library.js";
import { mountPalettes } from "./palettes.js";

const sections = {
  compose: ["Новая композиция", "Подберите предметы по названиям или теме."],
  templates: ["Вариация шаблона", "Готовая расстановка. Замените предметы и выберите цвета."],
  edit: ["Редактирование", "Меняйте предметы, оформление и размер выбранного фрейма."],
  library: ["Библиотека предметов", "Предметы для сцен и их варианты. Здесь можно добавить свои."],
  palettes: ["Цветовые схемы", "Палитра меняет цвета всей сцены. Здесь можно добавить свою."]
};
const tabs = Object.keys(sections).filter(name => element(name));
const controllers = {};
const send = message => parent.postMessage({ pluginMessage: message }, "*");
const setStatus = text => { element("status").textContent = text; };
const workspace = element("workspace");
const adjustment = element("composition-adjustment");
let selectedPalette = "original";
let activeTab;
let pendingAdjustment;

function choosePalette(id) {
  selectedPalette = id;
  for (const controller of Object.values(controllers)) controller.setPalette?.(id);
}

function adjustmentOwner(request) {
  return controllers[request.type === "template-create" ? "templates" : "compose"];
}

function cancelAdjustment() {
  if (!pendingAdjustment) return;
  adjustmentOwner(pendingAdjustment)?.setBusy(false);
  pendingAdjustment = undefined;
  adjustment.hidden = true;
}

function displayTab(name) {
  if (!controllers[name]) return;
  cancelAdjustment();
  activeTab = name;
  for (const key of Object.keys(sections)) {
    const panel = element(key);
    const button = element(`tab-${key}`);
    if (panel) panel.hidden = key !== name;
    if (!button) continue;
    button.hidden = !controllers[key];
    button.classList.toggle("current", key === name);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(key === name));
    button.setAttribute("aria-controls", key);
    button.tabIndex = key === name ? 0 : -1;
  }
  [element("section-title").textContent, element("section-help").textContent] = sections[name];
  workspace.scrollTop = 0;
  for (const [id, owner] of [["create", "compose"], ["template-create", "templates"], ["svg-export", "edit"]]) {
    const control = element(id);
    if (control) control.hidden = name !== owner;
  }
  element("action-bar").hidden = !["compose", "templates", "edit"].includes(name);
  controllers[name].activate?.();
}

const mounts = {
  compose: () => mountCompose({ send, setStatus, cancelAdjustment, choosePalette }),
  templates: () => mountTemplates({ send, setStatus }),
  edit: () => mountEdit({
    send, preferredPalette: () => selectedPalette,
    preferredSize: () => controllers.compose?.preferredSize() ?? "L",
    resetScroll: () => { if (activeTab === "edit") workspace.scrollTop = 0; }
  }),
  library: () => mountLibrary({ send, setStatus }),
  palettes: () => mountPalettes({ send, setStatus, choosePalette,
    openPaletteRegistration: controllers.library ? () => {
      displayTab("library");
      controllers.library.registerPalette();
    } : undefined })
};

for (const name of tabs) {
  controllers[name] = mounts[name]();
  const button = element(`tab-${name}`);
  if (button) button.onclick = () => displayTab(name);
}

const tabList = document.querySelector(".tabs");
tabList.setAttribute("role", "tablist");
tabList.setAttribute("aria-label", "Разделы студии");
tabList.onkeydown = event => {
  const available = tabs.filter(name => element(`tab-${name}`));
  const index = available.findIndex(name => event.target.id === `tab-${name}`);
  if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1
    : (index + (event.key === "ArrowRight" ? 1 : -1) + available.length) % available.length;
  displayTab(available[next]);
  element(`tab-${available[next]}`).focus();
};

document.addEventListener("input", cancelAdjustment);
document.addEventListener("change", cancelAdjustment);
element("composition-adjustment-cancel").onclick = () => {
  cancelAdjustment();
  setStatus("Создание отменено. Можно изменить предметы или расстановку.");
};
element("composition-adjustment-accept").onclick = () => {
  const request = pendingAdjustment;
  if (!request) return;
  cancelAdjustment();
  adjustmentOwner(request)?.setBusy(true);
  setStatus("Создаём композицию с согласованным уменьшением…");
  send(request);
};

const resizeHandle = element("resize-window");
resizeHandle.onpointerdown = event => {
  const start = { x: event.clientX, y: event.clientY, width: innerWidth, height: innerHeight };
  resizeHandle.setPointerCapture(event.pointerId);
  resizeHandle.onpointermove = next => send({ type: "resize-ui",
    width: start.width + next.clientX - start.x, height: start.height + next.clientY - start.y });
  resizeHandle.onpointerup = resizeHandle.onpointercancel = () => { resizeHandle.onpointermove = null; };
};
resizeHandle.onkeydown = event => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  send({ type: "resize-ui", width: innerWidth + (event.key === "ArrowRight" ? 40 : event.key === "ArrowLeft" ? -40 : 0),
    height: innerHeight + (event.key === "ArrowDown" ? 40 : event.key === "ArrowUp" ? -40 : 0) });
};

window.onmessage = event => {
  const message = event.data?.pluginMessage;
  if (!message) return;
  if (message.type === "ready") setStatus("Можно начинать");
  for (const controller of Object.values(controllers)) controller.receive(message);

  switch (message.type) {
    case "ready":
      if (!activeTab && tabs.length) displayTab(tabs[0]);
      break;
    case "created":
      setStatus("Композиция создана");
      controllers.edit?.activate();
      break;
    case "scene-new-created":
      if (controllers.edit) {
        displayTab("edit");
        element("tab-edit")?.focus();
      } else {
        setStatus("Холст создан");
      }
      break;
    case "composition-adjustment-required":
      if (!adjustmentOwner(message.request)) break;
      pendingAdjustment = message.request;
      adjustmentOwner(pendingAdjustment).setBusy(false);
      element("composition-adjustment-details").textContent = message.suggestions
        .map(item => `${item.name}: до ${item.percent}% текущего размера`).join("; ");
      adjustment.hidden = false;
      setStatus("Композиция ещё не создана. Подтверди уменьшение или измени настройки.");
      adjustment.scrollIntoView({ block: "nearest" });
      break;
    case "error":
      setStatus(message.message);
      break;
  }
};
