
export class VariantId {
  private constructor(public readonly value: string) {
    Object.freeze(this);
  }

  static create(value: unknown): VariantId {
    if (
      typeof value !== "string" ||
      !/^[a-z][a-z0-9-]*$/.test(value)
    ) {
      throw new Error("Invalid VariantId");
    }

    return new VariantId(value);
  }

  equals(other: VariantId): boolean {
    return this.value === other.value;
  }
}
