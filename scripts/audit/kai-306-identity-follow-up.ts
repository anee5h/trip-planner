export type ManifestIdentityField = "name" | "kind" | "role";

export type ManifestIdentityCorrection = {
  before: string;
  after: string;
  checkedAt: string;
  relatedTicket: "KAI-306";
  sourceUrls: string[];
  rationale: string;
};

export type ManifestIdentityFollowUp = Partial<
  Record<ManifestIdentityField, ManifestIdentityCorrection>
>;

export type VersionedManifestIdentity = {
  id: string;
  identity: Partial<Record<ManifestIdentityField, string>>;
  identityFollowUp?: ManifestIdentityFollowUp;
};

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Preserve a cohort's recorded identity while accepting only explicit,
 * source-backed KAI-306 corrections to the current canonical identity.
 */
export function currentManifestIdentityValue(
  entry: VersionedManifestIdentity,
  field: ManifestIdentityField,
): string | undefined {
  const recorded = entry.identity[field] ?? undefined;
  const correction = entry.identityFollowUp?.[field];
  if (!correction) return recorded;

  if (!recorded || correction.before !== recorded) {
    throw new Error(
      `${entry.id}: identity follow-up ${field}.before does not match the recorded manifest value`,
    );
  }
  if (!correction.after.trim() || correction.after === recorded) {
    throw new Error(`${entry.id}: invalid identity follow-up for ${field}`);
  }
  if (correction.relatedTicket !== "KAI-306") {
    throw new Error(`${entry.id}: unsupported identity follow-up ticket`);
  }
  if (!isIsoDate(correction.checkedAt)) {
    throw new Error(`${entry.id}: invalid identity follow-up check date`);
  }
  if (
    !correction.rationale.trim() ||
    correction.sourceUrls.length === 0 ||
    correction.sourceUrls.some((url) => {
      try {
        return new URL(url).protocol !== "https:";
      } catch {
        return true;
      }
    })
  ) {
    throw new Error(`${entry.id}: identity follow-up lacks source evidence`);
  }
  return correction.after;
}
