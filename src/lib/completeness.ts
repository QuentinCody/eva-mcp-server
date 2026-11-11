import type { Completeness } from "@bio-mcp/shared";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const total = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const bounded = (returned: number, detail: string): Completeness => ({ complete: false, returned,
  truncation: { reason: "unknown", detail, remedy: "Retain all native groups, paging, assembly and identifier history. Counts are occurrences, not unique variants or an immutable release." } });

function direct(value: unknown): Completeness | undefined {
  if (Array.isArray(value) && value.length && value.every(row => record(row) && "accession" in row && record(row.data)))
    return bounded(value.length, "One mutable identifier lookup, preserving every returned placement or submission.");
  if (!record(value)) return undefined;
  if (record(value.provenance) && value.provenance.complete_dataset === false)
    return direct(value.native) ?? bounded(0, "Evidence scope is the requested lookup; empty observations do not establish biological absence.");
  if (typeof value.native_listing === "string" && Array.isArray(value.data))
    return bounded(value.data.length, "Immediate directory links only; listing hashes do not verify artifact bytes or pin an immutable release.");
  if (Array.isArray(value.response)) {
    const groups = value.response.filter(record);
    const returned = groups.reduce((n, group) => n + (Array.isArray(group.result) ? group.result.length : 0), 0);
    const coverage = bounded(returned, "One native response with independently scoped result groups. Zero numTotalResults can be a count-disabled placeholder, even for nonempty pages.");
    const available = groups.length === 1 ? total(groups[0].numTotalResults) : undefined;
    if (available !== undefined && available >= returned) {
      coverage.total_available = available;
      if (available > returned && coverage.truncation) coverage.truncation.reason = "page_limit";
    }
    return coverage;
  }
  if (Array.isArray(value.operations) && Array.isArray(value.variants))
    return bounded(value.variants.length, "Native history events and placements are separate evidence; no canonical successor or release completeness is inferred.");
  return undefined;
}

/** Carry native scope through inline, staged and composed Code Mode results. */
export function evaCompleteness(value: unknown): Completeness | undefined {
  const pending = [value]; const observations: Completeness[] = [];
  while (pending.length) {
    const item = pending.pop(); if (!item || typeof item !== "object") continue;
    if (record(item) && item.__staged === true) {
      if (record(item._staging) && record(item._staging.completeness) && item._staging.completeness.complete === false)
        observations.push({ ...item._staging.completeness, complete: false });
      continue;
    }
    const coverage = direct(item);
    if (coverage) observations.push(coverage);
    else pending.push(...Object.values(item));
  }
  if (observations.length < 2) return observations[0];
  return { complete: false, truncation: { reason: "unknown", detail: "Composed EVA evidence includes multiple independently bounded observations.",
    remedy: "Keep each source's groups, counts, paging, assembly and release context separately." } };
}
