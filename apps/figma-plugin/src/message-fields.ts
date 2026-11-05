import type { AssetRole, AssetSize, SecondaryRole } from "@illustration-composer/core";

export function stringField(
  message: Record<string, unknown>,
  key: string
): string {
  const value = message[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid field: ${key}`);
  }

  return value.trim();
}

export function sizeField(value: unknown): AssetSize {
  if (value !== "S" && value !== "L") {
    throw new Error("Invalid size");
  }

  return value;
}

export function roleField(value: unknown): AssetRole {
  if (value !== "main" && value !== "background") {
    throw new Error("Invalid role");
  }

  return value;
}

export function secondaryRoleField(value: unknown): SecondaryRole {
  return value === "auto" || value === "independent" ? value : roleField(value);
}
