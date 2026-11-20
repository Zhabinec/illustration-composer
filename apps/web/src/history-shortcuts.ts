type ShortcutKey = Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "isComposing">;

export function historyShortcut(event: ShortcutKey, editingText: boolean): "undo" | "redo" | undefined {
  if (editingText || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
  const key = event.code || "Key" + event.key.toUpperCase();
  if (key === "KeyZ") return event.shiftKey ? "redo" : "undo";
  if (key === "KeyY") return "redo";
}
