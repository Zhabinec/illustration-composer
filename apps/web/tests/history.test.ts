import { expect, it } from "vitest";
import { SceneHistory } from "../src/history";
import type { Scene } from "../src/model";

it("restores independent snapshots and discards redo after a new edit", () => {
  const history = new SceneHistory();
  const scene: Scene = { width: 1200, height: 800, background: "light", paletteId: "original", elements: [] };
  history.record(scene);
  scene.width = 800;
  const previous = history.undo(scene)!;
  expect(previous.width).toBe(1200);
  expect(history.redo(previous)!.width).toBe(800);
  history.undo(scene);
  history.record(previous);
  expect(history.redo(previous)).toBeUndefined();
});
