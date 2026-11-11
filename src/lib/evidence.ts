import { EVA_IDENTIFIERS_BASE, readEva } from "./http";
import { validateRegionPaging } from "./region-paging";

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

function regionParams(params: Record<string, unknown>): Record<string, unknown> {
  if (typeof params.species !== "string" || !/^[a-zA-Z0-9]+_[a-zA-Z0-9_.-]+$/.test(params.species)) {
    invalid("Select the species/assembly code from /meta/species/list; do not infer it from an rsID");
  }
  validateRegionPaging(params);
  return { ...params, limit: params.limit ?? 100, skip: params.skip ?? 0 };
}

function regionPath(region: string): string {
  const match = /^([^/:]+):(\d+)-(\d+)$/.exec(region);
  if (!match) invalid("region must be chromosome:start-end");
  const start = Number(match[2]); const end = Number(match[3]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) invalid("Invalid genomic interval");
  return `/segments/${region}/variants`;
}

async function payloadHash(data: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(data)));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

/** Preserve native fields, arrays, placements and errors; provenance never substitutes for them. */
export async function readEvidence(path: string, params: Record<string, unknown> = {}): Promise<{ status: number; data: unknown }> {
  const accession = /^\/evidence\/identifiers\/(rs|ss)([1-9]\d*)$/i.exec(path);
  let upstreamPath: string; let baseUrl: string | undefined; let query: Record<string, unknown>;
  if (accession) {
    if (Object.keys(params).length) invalid("Identifier evidence takes no assembly filter; inspect every native placement");
    upstreamPath = `/${accession[1].toLowerCase() === "rs" ? "clustered" : "submitted"}-variants/${accession[2]}`;
    baseUrl = EVA_IDENTIFIERS_BASE; query = {};
  } else {
    if (!path.startsWith("/evidence/regions/")) invalid("Use /evidence/identifiers/rsID, /ssID or /evidence/regions/chromosome:start-end");
    upstreamPath = regionPath(path.slice("/evidence/regions/".length)); query = regionParams(params);
  }
  const result = await readEva(upstreamPath, query, baseUrl);
  return { status: result.status, data: {
    native: result.data,
    provenance: {
      upstream_url: `${baseUrl ?? "https://www.ebi.ac.uk/eva/webservices/rest/v1"}${upstreamPath}`,
      query, requested_identifier: accession ? `${accession[1].toLowerCase()}${accession[2]}` : null,
      requested_species_assembly: query.species ?? null,
      context_validation: "Request context only; verify native taxonomy, assembly, contig, alleles and study fields before joining",
      release: null, release_pinned: false, retrieved_at: new Date().toISOString(),
      parsed_payload_sha256: await payloadHash(result.data),
      complete_dataset: false,
    },
  } };
}
