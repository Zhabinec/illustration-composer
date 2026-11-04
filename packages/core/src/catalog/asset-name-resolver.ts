import type { Asset } from "./asset.js";
import type { AssetCatalog } from "./asset-catalog.js";

export interface AssetNameIssue {
  query: string;
  kind: "unknown" | "ambiguous" | "empty" | "too-long";
  candidates: readonly Asset[];
}

export interface AssetNameResolution {
  assets: readonly Asset[];
  issues: readonly AssetNameIssue[];
}

export function normalizeAssetName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ru").replace(/ё/g, "е").trim().replace(/\s+/g, " ");
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

export function resolveAssetNames(
  query: string, catalog: AssetCatalog,
  aliases: Readonly<Record<string, readonly string[]>> = {}
): AssetNameResolution {
  const issue = (kind: AssetNameIssue["kind"]): AssetNameResolution => ({
    assets: [], issues: [{ query, kind, candidates: [] }]
  });
  if (query.length > 1000) return issue("too-long");
  if (!query.trim()) return issue("empty");
  const names = new Map<string, Asset[]>();
  for (const asset of catalog.getAll()) {
    for (const name of [asset.name, ...asset.tags, ...(aliases[asset.id.value] ?? [])]) {
      const normalized = normalizeAssetName(name);
      if (!normalized) continue;
      const matches = names.get(normalized) ?? [];
      if (!matches.some(item => item.id.value === asset.id.value)) matches.push(asset);
      names.set(normalized, matches);
    }
  }
  const phrases = [...names.keys()].sort((a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length);
  const assets: Asset[] = [];
  const issues: AssetNameIssue[] = [];
  function match(words: readonly string[], start: number): string | undefined {
    return phrases.find(phrase => words.slice(start, start + phrase.split(" ").length).join(" ") === phrase);
  }
  for (const chunk of query.split(/[,;\n+]+/).map(normalizeAssetName).filter(Boolean)) {
    const words = chunk.split(" ");
    for (let index = 0; index < words.length;) {
      const phrase = match(words, index);
      if (phrase) {
        const candidates = names.get(phrase)!;
        if (candidates.length === 1) assets.push(candidates[0]!);
        else issues.push({ query: phrase, kind: "ambiguous", candidates });
        index += phrase.split(" ").length;
        continue;
      }
      if (words[index] === "и") { index++; continue; }
      const start = index++;
      while (index < words.length && words[index] !== "и" && !match(words, index)) index++;
      const unknown = words.slice(start, index).join(" ");
      const suggestions = phrases
        .filter(name => unknown.length <= 80 && Math.abs(name.length - unknown.length) <= 2 &&
          distance(name, unknown) <= Math.min(2, Math.max(1, Math.floor(unknown.length / 4))))
        .flatMap(name => names.get(name) ?? []);
      const candidates = [...new Map(suggestions.map(asset => [asset.id.value, asset])).values()].slice(0, 3);
      issues.push({ query: unknown, kind: "unknown", candidates });
    }
  }
  if (!assets.length && !issues.length) return issue("empty");
  return { assets, issues };
}
