import type { Scene } from "./model";

export class SceneHistory {
  private past: Scene[] = [];
  private future: Scene[] = [];

  record(scene: Scene): void {
    this.past.push(structuredClone(scene));
    if (this.past.length > 60) this.past.shift();
    this.future = [];
  }

  undo(current: Scene): Scene | undefined {
    const previous = this.past.pop();
    if (previous) this.future.push(structuredClone(current));
    return previous;
  }

  redo(current: Scene): Scene | undefined {
    const next = this.future.pop();
    if (next) this.past.push(structuredClone(current));
    return next;
  }
}
