// Conservative usable region of the right page in the supplied open-book L/main drawing.
// This is curated geometry, not a surface inferred from an arbitrary asset name or size.
export const bookSurfaceProfile = {
  supportId: "book",
  size: "L",
  role: "main",
  subjects: ["phone", "wallet"],
  surface: { x: 0.50, y: 0.16, width: 0.28, height: 0.24 }
} as const;
