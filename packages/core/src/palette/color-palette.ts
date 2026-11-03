
export const sourceColors = {
  dark: "#7864D7",
  medium: "#AA9BF0",
  light: "#D7CDF5",
  pale: "#EEE2F6",
  pink: "#F9A3AA",
  pinkLight: "#FFE3E1",
  yellow: "#F9ECB0"
} as const;

export type ColorRole = keyof typeof sourceColors;

export interface ColorPalette {
  id: string;
  name: string;
  colors: Readonly<Record<ColorRole, string>>;
}

export const palettePresets: Readonly<Record<string, ColorPalette>> = {
  original: {
    id: "original",
    name: "Фиолетовая",
    colors: sourceColors
  },
  mint: {
    id: "mint",
    name: "Мятная",
    colors: {
      ...sourceColors,
      dark: "#5ABEBE",
      medium: "#80DADA",
      light: "#BEEBEB",
      pale: "#E8F8F8"
    }
  },
  peach: {
    id: "peach",
    name: "Персиковая",
    colors: {
      ...sourceColors,
      dark: "#D27532",
      medium: "#FAC896",
      light: "#FDD7B9",
      pale: "#FEEFE4"
    }
  }
};

const colorRoles = Object.keys(sourceColors) as ColorRole[];

const originalColorRoles = new Map<string, ColorRole>(
  colorRoles.map(role => [sourceColors[role], role])
);

const hexPattern = /^#[0-9A-Fa-f]{6}$/;

export function getReplacementColor(
  sourceColor: string,
  palette: ColorPalette
): string | undefined {
  const role = originalColorRoles.get(sourceColor.toUpperCase());

  return role ? palette.colors[role] : undefined;
}

export function resolvePalette(value: unknown): ColorPalette {
  if (typeof value === "string") {
    const preset = palettePresets[value];

    if (!preset) {
      throw new Error(`Unknown palette: ${value}`);
    }

    return preset;
  }

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("Invalid palette");
  }

  const input = value as Record<string, unknown>;

  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 80
  ) {
    throw new Error("Invalid palette name");
  }

  const colors: Record<ColorRole, string> = {
    ...sourceColors
  };

  for (const role of colorRoles) {
    const color = input[role];

    if (color === undefined) {
      if (
        role === "dark" ||
        role === "medium" ||
        role === "light"
      ) {
        throw new Error(`Missing palette color: ${role}`);
      }

      continue;
    }

    if (
      typeof color !== "string" ||
      !hexPattern.test(color)
    ) {
      throw new Error(`Invalid palette color: ${role}`);
    }

    colors[role] = color.toUpperCase();
  }

  return {
    id: "custom",
    name: input.name.trim(),
    colors
  };
}
