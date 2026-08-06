import type { Destination } from "@/shared/types/destination";
import { localizePlaceLabel } from "./placeLabels";

/**
 * Normalizes a tag/name for redundancy comparison: lowercase, and strips
 * whitespace, punctuation and separators.
 */
export function normalizeTagText(value: string): string {
  return value.toLowerCase().replace(/[\s_\-–—·•()\[\]'’".,:;!?/\\]+/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strips a trailing municipal suffix from a name so "Shibuya City" yields
 * the core "Shibuya". The name's own suffix may differ from the record's
 * kind label (the catalogue names ward hubs "Shibuya City" with kind
 * "ward"), so both the record kind label and the common municipal suffixes
 * are stripped.
 */
const MUNICIPAL_SUFFIXES = [
  "City",
  "Ward",
  "Town",
  "Village",
  "市",
  "区",
  "町",
  "村",
];

function stripKindLabel(value: string, kindLabel?: string): string {
  if (!kindLabel) return value;
  return value
    .replace(new RegExp(`${escapeRegExp(kindLabel)}\\s*$`, "i"), "")
    .trim();
}

function stripMunicipalSuffix(value: string): string {
  let result = value;
  for (const suffix of MUNICIPAL_SUFFIXES) {
    result = result
      .replace(new RegExp(`${escapeRegExp(suffix)}\\s*$`, "i"), "")
      .trim();
  }
  return result;
}

/**
 * Picks the first tag that adds information beyond the destination's own
 * identity. A tag is redundant when it repeats (case/whitespace/punctuation
 * normalized):
 *
 * - the destination name, localized name, alias, municipality display name,
 *   or the type label alone (duplicating the kind badge), or
 * - the name core plus the type label ("Shibuya Ward" on the Shibuya City
 *   hub, "Osaka City" on the Osaka City hub).
 *
 * Returns the first meaningful tag, or `undefined` when none remains.
 */
export function pickSemanticDestinationTag(
  destination: Destination,
  localized: Destination,
  locale: "en" | "ja",
  parentName?: string | null,
): string | undefined {
  const tags = destination.tags ?? [];
  if (tags.length === 0) return undefined;

  const kindLabelEn = destination.kind
    ? localizePlaceLabel(destination.kind, "en")
    : undefined;
  const kindLabelLoc = destination.kind
    ? localizePlaceLabel(destination.kind, locale)
    : undefined;
  const name = destination.name;
  const localizedName = localized.name;
  const nameCore = stripMunicipalSuffix(stripKindLabel(name, kindLabelEn));
  const localizedCore = stripMunicipalSuffix(
    stripKindLabel(localizedName, kindLabelLoc),
  );

  const references = new Set(
    [
      name,
      localizedName,
      nameCore,
      localizedCore,
      kindLabelEn,
      kindLabelLoc,
      ...(destination.aliases ?? []),
      ...(parentName ? [parentName] : []),
    ]
      .filter((value): value is string => Boolean(value))
      .map(normalizeTagText),
  );
  const composedSuffixes = new Set(
    [
      `${nameCore}${kindLabelEn ?? ""}`,
      `${nameCore}${kindLabelLoc ?? ""}`,
      `${localizedCore}${kindLabelEn ?? ""}`,
      `${localizedCore}${kindLabelLoc ?? ""}`,
      `${name}${kindLabelEn ?? ""}`,
      `${localizedName}${kindLabelLoc ?? ""}`,
    ]
      .filter(Boolean)
      .map(normalizeTagText),
  );

  for (const tag of tags) {
    const normalized = normalizeTagText(tag);
    if (!normalized) continue;
    if (references.has(normalized) || composedSuffixes.has(normalized)) {
      continue;
    }
    return tag;
  }
  return undefined;
}
