import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL("./src/ui/index.js", import.meta.url))],
  bundle: true,
  platform: "browser",
  target: "es2020",
  format: "iife",
  write: false
});
const template = await readFile(new URL("./src/ui.html", import.meta.url), "utf8");
const script = outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
await writeFile(new URL("./dist/ui.html", import.meta.url),
  template.replace("<!-- UI_SCRIPT -->", () => `<script>\n${script}</script>`));
