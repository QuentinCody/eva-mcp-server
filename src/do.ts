import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Native source-entry keys stay explicit rather than becoming sparse, per-study columns. */
function variantProjection(value: unknown): unknown {
  if (!record(value) || !record(value.sourceEntries)) return value;
  const { sourceEntries, ...variant } = value;
  return { ...variant, source_entries: Object.entries(sourceEntries).map(([source_key, native]) => ({
    source_key, study_id: record(native) ? native.studyId : undefined, file_id: record(native) ? native.fileId : undefined,
    source_payload: JSON.stringify(native),
  })) };
}

export class EvaDataDO extends RestStagingDO {
  protected getTabularData(value: unknown): unknown {
    let data = record(value) && Array.isArray(value.content) && record(value.structuredContent) && "data" in value.structuredContent
      ? value.structuredContent.data : value;
    if (record(data) && typeof data.sql === "string" && Array.isArray(data.rows)) return { query_rows: data.rows.map(native => ({ native })) };
    if (record(data) && record(data.provenance) && "native" in data) data = data.native;
    if (Array.isArray(data) && data.every(row => record(row) && "accession" in row)) return { variants: data };
    if (!record(data)) return data;
    if (Array.isArray(data.response)) return { response: data.response.map(group => record(group) && Array.isArray(group.result)
      ? { ...group, result: group.result.map(variantProjection) } : group) };
    if (typeof data.native_listing === "string" && Array.isArray(data.data)) return { release_files: data.data };
    return data;
  }
}
