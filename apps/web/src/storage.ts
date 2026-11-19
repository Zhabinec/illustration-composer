import type { ColorPalette } from "@illustration-composer/core";
import { resolvePalette } from "@illustration-composer/core";
import type { Scene, VectorAsset } from "./model";
import { parseVector } from "./svg";

export interface LibraryTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  elements: Scene["elements"];
}

export interface LibraryFile {
  version: number;
  assets: VectorAsset[];
  templates?: LibraryTemplate[];
}

export interface Project {
  version: 1;
  scene: Scene;
  assets: VectorAsset[];
  palettes: ColorPalette[];
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateLibrary(value: unknown): LibraryFile {
  if (!value || typeof value !== "object" || !("assets" in value) || !Array.isArray(value.assets) || value.assets.length > 1000) {
    throw new Error("Выберите JSON-библиотеку, экспортированную плагином.");
  }
  const ids = new Set<string>();
  const variants = new Set<string>();
  for (const asset of value.assets) {
    if (!asset || typeof asset.id !== "string" || ids.has(asset.id) || typeof asset.name !== "string" ||
        !Array.isArray(asset.variants) || !asset.variants.length) throw new Error("Некорректная запись предмета в библиотеке.");
    ids.add(asset.id);
    for (const variant of asset.variants) {
      if (!variant || typeof variant.id !== "string" || variants.has(variant.id) ||
          !finite(variant.width) || variant.width <= 0 || !finite(variant.height) || variant.height <= 0 ||
          !["S", "L"].includes(variant.size) || !["main", "background"].includes(variant.role) ||
          typeof variant.svg !== "string") throw new Error("Некорректный вариант предмета.");
      variants.add(variant.id);
      parseVector(variant.svg);
    }
  }
  return value as LibraryFile;
}

export function validateProject(value: unknown): Project {
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 ||
      !("scene" in value) || !("assets" in value) || !("palettes" in value) || !Array.isArray(value.palettes)) {
    throw new Error("Выберите проект Illustration Composer.");
  }
  validateLibrary(value);
  const project = value as Project;
  const scene = project.scene;
  if (!scene || ![scene.width, scene.height].every(v => finite(v) && v >= 100 && v <= 10000) ||
      !Array.isArray(scene.elements) || scene.elements.length > 200 || typeof scene.paletteId !== "string" ||
      typeof scene.background !== "string" || !/^(light|pale|transparent|#[0-9a-f]{6})$/i.test(scene.background)) {
    throw new Error("Некорректные параметры холста.");
  }
  const ids = new Set<string>();
  for (const element of scene.elements) {
    if (!element || typeof element.id !== "string" || ids.has(element.id) || typeof element.name !== "string" ||
        ![element.x, element.y, element.width, element.rotation].every(finite) || element.width <= 0 ||
        !project.assets.some(asset => asset.id === element.assetId && asset.variants.some(v => v.id === element.variantId))) {
      throw new Error("Некорректный предмет на холсте.");
    }
    ids.add(element.id);
  }
  for (const palette of project.palettes) resolvePalette({ name: palette.name, ...palette.colors });
  return project;
}

export function saveProject(project: Project): boolean {
  try {
    localStorage.setItem("illustration-composer-web-v1", JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}

export function restoreProject(): Project | undefined {
  try {
    const saved = localStorage.getItem("illustration-composer-web-v1");
    return saved ? validateProject(JSON.parse(saved)) : undefined;
  } catch {
    return undefined;
  }
}
