
import { AssetId } from "./asset-id.js";
import type { AssetRole, AssetSize } from "./asset.js";
import { VariantId } from "./variant-id.js";

export interface RegisteredVariant {
  id: string;
  resourceKey: string;
  size: AssetSize;
  role: AssetRole;
  active: boolean;
}

export interface RegisteredAsset {
  id: string;
  name: string;
  variants: RegisteredVariant[];
}

export interface LibraryRegistrySnapshot {
  version: 1;
  assets: RegisteredAsset[];
}

export interface NewVariant {
  id: VariantId;
  resourceKey: string;
  size: AssetSize;
  role: AssetRole;
}

export interface RegisterVariantCommand extends NewVariant {
  assetId: AssetId;
  decision?: "alternative" | "replace";
  expectedActiveId?: VariantId;
}

export type RegistrationResult =
  | { status: "added"; variant: RegisteredVariant }
  | { status: "conflict"; current: RegisteredVariant };

export class LibraryRegistry {
  private readonly assets = new Map<string, RegisteredAsset>();

  constructor(
    snapshot: LibraryRegistrySnapshot = {
      version: 1,
      assets: []
    }
  ) {
    if (snapshot.version !== 1) {
      throw new Error("Unsupported registry version");
    }

    const variantIds = new Set<string>();
    const resourceKeys = new Set<string>();

    for (const asset of snapshot.assets) {
      AssetId.create(asset.id);
      this.validateName(asset.name);

      if (this.assets.has(asset.id) || this.hasName(asset.name)) {
        throw new Error("Duplicate asset");
      }

      const variants = asset.variants.map(variant => {
        VariantId.create(variant.id);
        this.validateVariant(variant);

        if (
          variantIds.has(variant.id) ||
          resourceKeys.has(variant.resourceKey)
        ) {
          throw new Error("Duplicate variant ID or resource");
        }

        variantIds.add(variant.id);
        resourceKeys.add(variant.resourceKey);

        return { ...variant };
      });

      if (!variants.length) {
        throw new Error("Asset must have at least one variant");
      }

      for (const variant of variants) {
        if (
          !variants.some(other =>
            other.size === variant.size &&
            other.role === variant.role &&
            other.active
          )
        ) {
          throw new Error("Variant slot has no active variant");
        }
      }

      for (const variant of variants.filter(item => item.active)) {
        const activeCount = variants.filter(other =>
          other.size === variant.size &&
          other.role === variant.role &&
          other.active
        ).length;

        if (activeCount !== 1) {
          throw new Error("Multiple active variants in one slot");
        }
      }

      this.assets.set(asset.id, {
        id: asset.id,
        name: asset.name.trim(),
        variants
      });
    }
  }

  createAsset(
    id: AssetId,
    name: string,
    variant: NewVariant
  ): void {
    this.validateName(name);
    this.validateVariant(variant);
    this.ensureUniqueVariant(variant);

    if (this.assets.has(id.value) || this.hasName(name)) {
      throw new Error("Asset already exists");
    }

    this.assets.set(id.value, {
      id: id.value,
      name: name.trim(),
      variants: [this.toRecord(variant, true)]
    });
  }

  registerVariant(
    command: RegisterVariantCommand
  ): RegistrationResult {
    const asset = this.assets.get(command.assetId.value);

    if (!asset) {
      throw new Error("Asset not found");
    }

    this.validateVariant(command);
    this.ensureUniqueVariant(command);

    const current = asset.variants.find(variant =>
      variant.active &&
      variant.size === command.size &&
      variant.role === command.role
    );

    if (current && !command.decision) {
      return {
        status: "conflict",
        current: { ...current }
      };
    }

    if (current) {
      if (command.expectedActiveId?.value !== current.id) {
        throw new Error("Variant changed since confirmation");
      }
    } else if (command.decision) {
      throw new Error("No existing variant to resolve");
    }

    if (command.decision === "replace" && current) {
      current.active = false;
    }

    const variant = this.toRecord(
      command,
      command.decision !== "alternative"
    );

    asset.variants.push(variant);

    return {
      status: "added",
      variant: { ...variant }
    };
  }

  activateVariant(
    assetId: AssetId,
    variantId: VariantId,
    expectedActiveId: VariantId
  ): void {
    const asset = this.assets.get(assetId.value);

    const selected = asset?.variants.find(
      variant => variant.id === variantId.value
    );

    if (!asset || !selected) {
      throw new Error("Variant not found");
    }

    const current = asset.variants.find(variant =>
      variant.active &&
      variant.size === selected.size &&
      variant.role === selected.role
    );

    if (!current || current.id !== expectedActiveId.value) {
      throw new Error("Variant changed since confirmation");
    }

    if (current.id === selected.id) {
      return;
    }

    current.active = false;
    selected.active = true;
  }

  getAll(): readonly RegisteredAsset[] {
    return [...this.assets.values()].map(asset => ({
      ...asset,
      variants: asset.variants.map(variant => ({
        ...variant
      }))
    }));
  }

  snapshot(): LibraryRegistrySnapshot {
    return {
      version: 1,
      assets: [...this.getAll()]
    };
  }

  private toRecord(
    variant: NewVariant,
    active: boolean
  ): RegisteredVariant {
    return {
      id: variant.id.value,
      resourceKey: variant.resourceKey.trim(),
      size: variant.size,
      role: variant.role,
      active
    };
  }

  private validateName(name: string): void {
    if (!name.trim() || name.trim().length > 120) {
      throw new Error("Invalid asset name");
    }
  }

  private validateVariant(
    variant: Pick<
      RegisteredVariant,
      "resourceKey" | "size" | "role"
    >
  ): void {
    if (
      !variant.resourceKey.trim() ||
      (variant.size !== "S" && variant.size !== "L") ||
      (variant.role !== "main" && variant.role !== "background")
    ) {
      throw new Error("Invalid variant");
    }
  }

  private hasName(name: string): boolean {
    const normalized = name.trim().toLocaleLowerCase();

    return [...this.assets.values()].some(
      asset => asset.name.toLocaleLowerCase() === normalized
    );
  }

  private ensureUniqueVariant(variant: NewVariant): void {
    for (const asset of this.assets.values()) {
      if (
        asset.variants.some(
          item => item.id === variant.id.value
        )
      ) {
        throw new Error("Variant ID already exists");
      }

      if (
        asset.variants.some(
          item => item.resourceKey === variant.resourceKey.trim()
        )
      ) {
        throw new Error("Resource already registered");
      }
    }
  }
}
