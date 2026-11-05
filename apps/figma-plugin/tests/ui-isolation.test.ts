import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { describe, expect, it, vi } from "vitest";

const html = readFileSync(new URL("../src/ui.html", import.meta.url), "utf8");
const script = buildSync({
  entryPoints: [fileURLToPath(new URL("../src/ui/index.js", import.meta.url))],
  bundle: true, write: false, format: "iife"
}).outputFiles[0]!.text;

function node() {
  return {
    value: "", textContent: "", hidden: false,
    dataset: {}, classList: { toggle: vi.fn() },
    append: vi.fn(), appendChild: vi.fn(), replaceChildren: vi.fn(), setAttribute: vi.fn()
  };
}

describe("independent UI panels", () => {
  it.each(["compose", "templates", "edit", "library", "palettes"])("starts with only %s present", panel => {
    const markup = html.replace(/<section id="([^"]+)"[^>]*>[\s\S]*?<\/section>/g,
      (section, id) => id === panel ? section : "");
    const nodes = new Map([...markup.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], node()]));
    const window: { onmessage?: (event: unknown) => void } = {};
    const postMessage = vi.fn();
    runInNewContext(script, {
      window, parent: { postMessage },
      document: {
        getElementById: (id: string) => nodes.get(id) ?? null,
        querySelector: () => node(), querySelectorAll: () => [], createElement: node, addEventListener: vi.fn()
      }
    });
    const receive = (pluginMessage: unknown) => window.onmessage!({ data: { pluginMessage } });
    receive({ type: "ready", assets: [], candidates: [], palettes: [{ id: "original", name: "Исходная" }] });
    receive({ type: "scene-state", scene: null });
    receive({ type: "error", operation: "create", message: "Ошибка" });

    expect(nodes.get(panel)?.hidden).toBe(false);
    for (const other of ["compose", "templates", "edit", "library", "palettes"].filter(name => name !== panel)) {
      expect(nodes.get(`tab-${other}`)?.hidden).toBe(true);
    }
    if (panel === "edit") expect(postMessage).toHaveBeenCalledWith({ pluginMessage: { type: "scene-state" } }, "*");
    if (panel === "templates") expect(postMessage).toHaveBeenCalledWith({ pluginMessage: { type: "template-list" } }, "*");
    if (panel === "palettes") expect(nodes.get("palette-from-figma")?.hidden).toBe(true);
  });
});
