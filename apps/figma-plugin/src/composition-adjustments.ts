export function requestCompositionAdjustment(
  request: Record<string, unknown>,
  suggestions: readonly { name: string; percent: number }[],
  layoutKey: string
): boolean {
  if (!suggestions.length || request.acceptShrinkFor === layoutKey) return false;
  figma.ui.postMessage({
    type: "composition-adjustment-required",
    request: { ...request, acceptShrinkFor: layoutKey },
    suggestions
  });
  return true;
}
