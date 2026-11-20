import { icon } from "./icons";

export const workspaceView = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Illustration Composer"><b class="brand-symbol">ic.</b><span>Illustration<br><strong>Composer</strong></span></a>
    <div class="header-divider"></div><span class="header-caption">Векторная мастерская</span>
    <span class="save-note" id="save-note">Сохраняется в браузере</span>
    <button class="quiet" id="save-project">${icon("download")}<span>Сохранить проект</span></button>
    <button class="primary" id="export">${icon("download")} Скачать SVG</button>
  </header>
  <main class="workspace">
    <aside class="library-panel">
      <section class="create-panel">
        <div class="section-heading"><h1>От идеи<br>к иллюстрации.</h1></div>
        <p class="muted">Тема, предметы, композиция.<br>Всё на одном холсте.</p>
        <div class="segmented" aria-label="Способ подбора"><button id="mode-metaphor" aria-pressed="true">По теме</button><button id="mode-names" aria-pressed="false">По предметам</button></div>
        <label for="query" id="query-label">О чём будет иллюстрация?</label>
        <textarea id="query" rows="3" maxlength="1000" placeholder="Например, финансовая безопасность"></textarea>
        <button class="primary full" id="generate">${icon("spark")} Собрать композицию</button>
        <p id="feedback" class="feedback" aria-live="polite">Подберите предметы по теме или добавьте их ниже.</p>
      </section>
      <section class="assets-section">
        <div class="tabs" aria-label="Библиотека"><button data-tab="objects" aria-pressed="true">Предметы</button><button data-tab="decor" aria-pressed="false">Декор</button><button data-tab="templates" aria-pressed="false">Шаблоны</button></div>
        <p class="muted small" id="library-help">Нажмите на предмет, чтобы добавить его на холст.</p>
        <label class="search-field">${icon("search")}<input id="search" aria-label="Поиск по библиотеке" placeholder="Найти предмет"></label>
        <div id="asset-grid" class="asset-grid"></div>
        <label class="upload-button">${icon("plus")} Добавить свой SVG<input id="import-svg" type="file" accept=".svg,image/svg+xml" hidden></label>
        <details class="library-import"><summary>Библиотека и проекты</summary><label class="upload-button">${icon("upload")} Загрузить JSON<input id="import-json" type="file" accept=".json,application/json" hidden></label><p class="muted small">Загрузите библиотеку из Figma или ранее сохранённый проект.</p></details>
      </section>
    </aside>
    <section class="canvas-panel" aria-label="Холст композиции">
      <div class="canvas-toolbar"><div><span class="eyebrow">КОМПОЗИЦИЯ / SVG</span><h2 class="canvas-title">Собрано вами.</h2><span id="canvas-size"></span></div><div class="history-buttons"><button id="undo" class="icon-button" aria-label="Отменить" title="Отменить (Ctrl+Z)">${icon("undo")}</button><button id="redo" class="icon-button" aria-label="Повторить" title="Повторить (Ctrl+Shift+Z)">${icon("redo")}</button></div></div>
      <div id="canvas-viewport"><div id="canvas-mount"></div></div>
      <div class="canvas-footer"><span id="canvas-hint">${icon("info")} Перетаскивайте предметы прямо на холсте</span><label>Масштаб <select id="zoom"><option value="75">75%</option><option value="100" selected>По размеру окна</option><option value="125">125%</option><option value="150">150%</option></select></label></div>
    </section>
    <aside class="inspector-panel">
      <section><div class="section-heading"><h2>Оформление</h2>${icon("grid")}</div>
        <label for="format">Формат холста</label><select id="format"></select>
        <div class="two-fields"><label>Ширина, px<input id="canvas-width" type="number" min="100" max="10000"></label><label>Высота, px<input id="canvas-height" type="number" min="100" max="10000"></label></div>
        <label for="palette">Цветовая палитра</label><select id="palette"></select><div id="swatches" class="swatches"></div>
        <label class="text-button">${icon("plus")} Добавить палитру<input type="file" id="import-palette" accept=".json,application/json" hidden></label>
        <label for="background">Фон холста</label><div class="background-control"><select id="background"><option value="light">Цвет палитры</option><option value="pale">Светлый цвет палитры</option><option value="#FFFFFF">Белый</option><option value="transparent">Прозрачный</option><option value="custom">Свой цвет</option></select><input id="background-color" type="color" aria-label="Свой цвет фона"></div>
        <label for="auto-decor">Декор при сборке</label><select id="auto-decor"><option value="auto">Подобрать из примеров</option><option value="manual">Добавлю вручную</option><option value="none">Без декора</option></select>
      </section>
      <section class="object-section"><div class="section-heading"><h2 id="object-title">Выбранный предмет</h2><span class="selection-dot"></span></div>
        <p id="selection-empty" class="muted">Нажмите на предмет на холсте или в списке слоёв.</p>
        <div id="object-controls" hidden>
          <label for="replace">Заменить предмет</label><select id="replace"></select>
          <label for="variant">Рисунок из библиотеки</label><select id="variant"></select>
          <div class="two-fields"><label>X, px<input id="object-x" type="number" step="any"></label><label>Y, px<input id="object-y" type="number" step="any"></label></div>
          <div class="two-fields"><label>Ширина, px<input id="object-width" type="number" min="1" step="any"></label><label>Поворот, °<input id="object-rotation" type="number" step="any"></label></div>
          <button id="apply-object" class="full secondary">Применить положение и размер</button>
          <div class="two-fields layer-actions"><button id="backward">На слой ниже</button><button id="forward">На слой выше</button></div>
          <div class="two-fields"><button id="to-back">Позади всех</button><button id="to-front">Впереди всех</button></div>
          <div class="two-fields object-actions"><button id="duplicate">${icon("copy")} Дублировать</button><button id="delete" class="danger">${icon("trash")} Удалить</button></div>
        </div>
      </section>
      <section><div class="section-heading"><h2>Расстановка</h2>${icon("layers")}</div>
        <label for="layout">Как расположить предметы</label><select id="layout"><option value="automatic">Подобрать автоматически</option><option value="focus">Главный крупнее</option><option value="row">Слева направо</option></select>
        <label for="primary">Главный предмет</label><select id="primary"></select>
        <button id="rearrange" class="full secondary">${icon("spark")} Расставить заново</button>
        <p class="muted small">Положение каждого предмета можно настроить вручную.</p>
        <div class="section-heading layers-heading"><h2>Слои</h2><span id="layer-count" class="tiny-tag">0</span></div><div id="layers"></div>
      </section>
    </aside>
  </main>`;
