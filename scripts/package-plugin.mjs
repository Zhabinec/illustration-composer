import { mkdirSync, copyFileSync, cpSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname, basename } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = join(root, "artifacts");
const folder = join(artifacts, `package-${randomUUID()}`, "Illustration Composer");
const archive = join(artifacts, "illustration-composer-plugin.zip");
mkdirSync(join(folder, "dist"), { recursive: true });
mkdirSync(join(folder, "src"), { recursive: true });
copyFileSync(join(root, "apps/figma-plugin/manifest.json"), join(folder, "manifest.json"));
copyFileSync(join(root, "apps/figma-plugin/dist/code.js"), join(folder, "dist/code.js"));
copyFileSync(join(root, "apps/figma-plugin/src/ui.html"), join(folder, "src/ui.html"));
cpSync(join(root, "docs"), join(folder, "docs"), { recursive: true });
writeFileSync(join(folder, "README.md"), `# Illustration Composer — готовый Figma-плагин

1. Распакуйте эту папку.
2. В Figma Desktop откройте Plugins → Development → Import plugin from manifest.
3. Выберите manifest.json из этой папки.
4. Откройте исходный Figma-файл библиотеки и запустите Illustration Composer.

Для готового пакета не нужны Node.js, сервер и API-ключ.
Исходный проект пересобирается командами npm ci, npm run check, npm run package.
Библиотека: https://www.figma.com/design/tf9r6w2FlDXhb0EXrEcvTh/?node-id=26-11438

Короткая демонстрация: docs/demo.html. Приёмка: docs/acceptance.md.
Поддерживаются сборка по заголовку и названиям, редактирование объектов,
палитры и векторный SVG-экспорт. Подбор локальный по образам библиотеки,
а не внешняя LLM. При разработке использован Codex: анализ, код, тесты и UI-проверки.
`);
execFileSync("tar.exe", ["--format=zip", "-cf", archive, "-C", dirname(folder), basename(folder)], { stdio: "inherit" });
console.log(archive);
