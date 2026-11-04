import { createAutomaticComposition, tryCreateSurfaceComposition } from "@illustration-composer/core";
import type { CompositionSource, SurfaceReference } from "@illustration-composer/core";
import { discoverExampleTemplates } from "./figma-example-templates.js";
import { getVectorComposition } from "./figma-vector-composition.js";
import { bookSurfaceProfile } from "./library-composition-profiles.js";

// Only this relationship has been identified in the supplied examples.
const surfaceSubjects: ReadonlySet<string> = new Set(bookSurfaceProfile.subjects);

export function readBookSurfaceReference(
  source: FrameNode | GroupNode, supportIndex: number, subjectIndex: number
): SurfaceReference | null {
  const groups = source.children.filter(node => node.type === "GROUP" || node.type === "FRAME");
  const supports = groups.filter(node => node.name.trim() === "Книга");
  const subjects = groups.filter(node => node.name.trim() === "Телефон");
  const support = supports[0];
  const subject = subjects[0];
  if (supports.length !== 1 || subjects.length !== 1 || !support || !subject || support.width <= 0 || support.height <= 0 ||
    subject.width <= 0 || subject.height <= 0 ||
    source.children.indexOf(support) >= source.children.indexOf(subject)) return null;
  const aligned = (node: SceneNode) => {
    const [[a, c], [b, d]] = node.relativeTransform;
    return Math.abs(a - 1) < 0.001 && Math.abs(d - 1) < 0.001 && Math.abs(b) < 0.001 && Math.abs(c) < 0.001;
  };
  if (!aligned(support) || !aligned(subject)) return null;
  return { supportIndex, subjectIndex, supportAspect: support.width / support.height, surface: bookSurfaceProfile.surface,
    subject: { x: (subject.x - support.x) / support.width, y: (subject.y - support.y) / support.height,
      width: subject.width / support.width, height: subject.height / support.height } };
}

export async function planAutomaticScene(
  width: number, height: number, sources: readonly CompositionSource[], paletteSourceIds: readonly string[]
) {
  const supportIndex = sources.findIndex(source => source.assetId.value === bookSurfaceProfile.supportId &&
    source.variant.role === bookSurfaceProfile.role && source.variant.size === bookSurfaceProfile.size);
  const subjectIndex = sources.findIndex(source => surfaceSubjects.has(source.assetId.value) && source.variant.role === "main");
  if (sources.length === 2 && supportIndex >= 0 && subjectIndex >= 0) {
    const { templates } = await discoverExampleTemplates(paletteSourceIds);
    const examples: { reference: SurfaceReference; distance: number }[] = [];
    for (const template of templates) {
      const source = await getVectorComposition(template.sourceNodeId);
      const reference = readBookSurfaceReference(source, supportIndex, subjectIndex);
      if (reference) examples.push({ reference, distance: Math.abs(Math.log(source.width / source.height / (width / height))) });
    }
    examples.sort((a, b) => a.distance - b.distance);
    for (const example of examples) {
      const scene = tryCreateSurfaceComposition(width, height, sources, example.reference);
      if (scene) return { scene, description: "Предмет на книге" };
    }
  }
  return { scene: createAutomaticComposition(width, height, sources), description: "Свободная расстановка" };
}
