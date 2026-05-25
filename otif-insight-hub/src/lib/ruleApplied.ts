/** Normalize a spreadsheet header for loose matching (spaces/underscores/case). */
export function normalizeFieldKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s_]+/g, "_");
}

/**
 * Read a column value from rawData by trying several header spellings dynamically.
 */
export function pickRawField(
  rawData: Record<string, string> | undefined,
  ...candidates: string[]
): string {
  if (!rawData) return "";

  for (const candidate of candidates) {
    const exact = rawData[candidate];
    if (exact?.trim()) return exact.trim();

    const lower = candidate.toLowerCase();
    if (rawData[lower]?.trim()) return rawData[lower].trim();
  }

  const wanted = new Set(candidates.map(normalizeFieldKey));
  for (const [key, value] of Object.entries(rawData)) {
    if (!value?.trim()) continue;
    if (wanted.has(normalizeFieldKey(key))) return value.trim();
  }

  return "";
}

export function pickRuleApplied(rawData: Record<string, string> | undefined): string {
  return pickRawField(rawData, "rule_applied", "RULE_APPLIED", "Rule Applied");
}

export function pickCombinedOtif(rawData: Record<string, string> | undefined): string {
  return pickRawField(rawData, "combined_otif", "COMBINED_OTIF", "Combined OTIF");
}
