
export class AssetId {
  private constructor(public readonly value: string) {
    Object.freeze(this);
  }

  static create(value: unknown): AssetId {
    if (
      typeof value !== "string" ||
      !/^[a-z][a-z0-9-]*$/.test(value)
    ) {
      throw new Error("Invalid AssetId");
    }

    return new AssetId(value);
  }

  equals(other: AssetId): boolean {
    return this.value === other.value;
  }
}
