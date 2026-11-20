import { expect, it } from "vitest";
import { historyShortcut } from "../src/history-shortcuts";

const shortcut = { code: "KeyZ", key: "z", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, isComposing: false };

it("undoes with the physical Z key in either keyboard layout", () => {
  expect(historyShortcut(shortcut, false)).toBe("undo");
  expect(historyShortcut({ ...shortcut, key: "я" }, false)).toBe("undo");
  expect(historyShortcut({ ...shortcut, ctrlKey: false, metaKey: true }, false)).toBe("undo");
});

it("supports both standard redo combinations", () => {
  expect(historyShortcut({ ...shortcut, shiftKey: true }, false)).toBe("redo");
  expect(historyShortcut({ ...shortcut, code: "KeyY", key: "н" }, false)).toBe("redo");
});

it("preserves native text undo and ignores unrelated or composing keys", () => {
  expect(historyShortcut(shortcut, true)).toBeUndefined();
  expect(historyShortcut({ ...shortcut, ctrlKey: false }, false)).toBeUndefined();
  expect(historyShortcut({ ...shortcut, isComposing: true }, false)).toBeUndefined();
  expect(historyShortcut({ ...shortcut, altKey: true }, false)).toBeUndefined();
});
