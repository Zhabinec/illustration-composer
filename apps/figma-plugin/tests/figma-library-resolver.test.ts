
import { describe, expect, it } from "vitest";
import { resolveLibrary } from "../src/figma-library-resolver.js";
import type { ScannedAsset } from "../src/figma-library-scanner.js";

describe("Library resolution", () => {
  const assets: ScannedAsset[] = [
    {
      nodeId: "1:1",
      name: "Книга",
      size: "L",
      role: "main",
      vectorCount: 53,
      width: 1446,
      height: 977,
      identified: true
    },
    {
      nodeId: "1:2",
      name: "Group 123",
      size: "S",
      role: "main",
      vectorCount: 1,
      width: 723,
      height: 488,
      identified: false
    },
    {
      nodeId: "1:3",
      name: "Group 456",
      size: "L",
      role: "main",
      vectorCount: 30,
      width: 500,
      height: 500,
      identified: false
    }
  ];

  it("resolves names without modifying source assets", () => {
    const result = resolveLibrary(assets, [
      {
        nodeId: "1:2",
        name: "Книга",
        referenceNodeId: "1:1"
      }
    ]);

    expect(result.resolved).toHaveLength(2);
    expect(result.unresolved).toHaveLength(1);

    expect(result.resolved[0]?.match).toBe("named");
    expect(result.resolved[1]?.match).toBe("suggested");
    expect(result.resolved[1]?.name).toBe("Книга");

    expect(result.unresolved[0]?.nodeId).toBe("1:3");
    expect(assets[1]?.name).toBe("Group 123");
  });
});
