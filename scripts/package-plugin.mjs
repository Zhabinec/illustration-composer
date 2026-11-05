import { mkdirSync, copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname, basename } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = join(root, "artifacts");
const archive = join(artifacts, "illustration-composer-plugin.zip");
mkdirSync(artifacts, { recursive: true });
const staging = mkdtempSync(join(artifacts, "package-"));
const folder = join(staging, "Illustration Composer");
try {
  const files = [
    ["apps/figma-plugin/manifest.json", "manifest.json"],
    ["apps/figma-plugin/dist/code.js", "dist/code.js"],
    ["apps/figma-plugin/dist/ui.html", "dist/ui.html"],
    ...["acceptance.md", "demo.md", "demo.html", "examples/mint-compositions.md",
      "examples/finance-azure.svg", "examples/azure-palette.json", "examples/phone-puzzles-composed-mint.svg",
      "examples/headphones-flowers-composed-mint.svg"].map(path => [`docs/${path}`, `docs/${path}`])
  ];
  for (const [source, target] of files) {
    const destination = join(folder, target);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, source), destination);
  }
  writeFileSync(join(folder, "README.md"), `# Illustration Composer — готовый Figma-плагин

1. Распакуйте эту папку.
2. В Figma Desktop откройте Plugins → Development → Import plugin from manifest.
3. Выберите manifest.json из этой папки.
4. Откройте исходный Figma-файл библиотеки и запустите Illustration Composer.

Для готового пакета не нужны Node.js, сервер и API-ключ.
Исходный проект пересобирается командами npm ci, npm run check, npm run package.
Библиотека: https://www.figma.com/design/tf9r6w2FlDXhb0EXrEcvTh/?node-id=26-11438

Короткая демонстрация с тремя SVG: docs/demo.html. Приёмка: docs/acceptance.md.
Поддерживаются сборка по заголовку и названиям, редактирование объектов,
палитры и векторный SVG-экспорт. Подбор локальный по образам библиотеки,
а не внешняя LLM. При разработке использован Codex: анализ, код, тесты и UI-проверки.
`);
  execFileSync("tar.exe", ["--format=zip", "-cf", archive, "-C", staging, basename(folder)], { stdio: "inherit" });
} finally {
  rmSync(staging, { recursive: true, force: true });
}
console.log(archive);
