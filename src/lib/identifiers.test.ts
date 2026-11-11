import { afterEach, expect, it, vi } from "vitest";
import { createEvaApiFetch } from "./api-adapter";
import { evaCatalog } from "../spec/catalog";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";

afterEach(() => vi.unstubAllGlobals());
const api = createEvaApiFetch();
const locus = { assemblyId: "GCA_000002305.1", referenceName: "CM000392.2", start: 66275332 };
// Synthetic native shapes from the provider's /identifiers/v2/api-docs (Swagger 2).
const history = { operations: [
  { accession: 43678406, type: "MERGED", mergedInto: 43678407, destinationAccession: 43678407, version: 2, reason: "provider reason", createdDate: "2026-05-01T00:00:00Z", data: [{ assemblyAccession: locus.assemblyId, contig: locus.referenceName, start: locus.start, taxonomyAccession: 9796, type: "SNV" }] },
  { accession: 43678406, type: "UNDO_MERGE", version: 3 },
  { accession: 43678406, type: "RS_SPLIT", splitInto: 43678408, version: 4 },
  { accession: 43678406, type: "DEPRECATED", version: 5 },
], variants: [{ accession: 43678408, version: 1, data: { assemblyAccession: locus.assemblyId, contig: locus.referenceName, start: locus.start, type: "SNV" } }] };

it("preserves every history operation and placement without rewriting current identity", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(history)); vi.stubGlobal("fetch", fetch);
  expect(await api({ method: "GET", path: "/identifiers/clustered-variants/43678406/history", params: { contigNamingConvention: "REFSEQ" } })).toMatchObject({ status: 200, data: history, completeness: { complete: false, returned: 1 } });
  expect(String(fetch.mock.calls[0][0])).toBe("https://www.ebi.ac.uk/eva/webservices/identifiers/v1/clustered-variants/43678406/history?contigNamingConvention=REFSEQ");
});

it.each([false, true])("encodes datasetIds as repeated parameters and retains empty native alleles (beacon=%s)", async beacon => {
  const native = beacon ? { exists: false, error: { errorCode: 400, errorMessage: "native context" }, alleleRequest: { ...locus, referenceBases: "", alternateBases: "T" } } : [{ accession: 99308221, version: 1, data: { referenceAllele: "", alternateAllele: "T", allelesMatch: false, validated: false, projectAccession: "PRJEB30116" } }];
  const fetch = vi.fn().mockResolvedValue(Response.json(native)); vi.stubGlobal("fetch", fetch);
  expect(await api({ method: "GET", path: `/identifiers/submitted-variants${beacon ? "/beacon/query" : ""}`, params: { ...locus, referenceBases: "", alternateBases: "T", datasetIds: ["PRJEB30116", "PRJEB4019"] } })).toMatchObject({ status: 200, data: native });
  const url = new URL(String(fetch.mock.calls[0][0]));
  expect(url.pathname).toBe(`/eva/webservices/identifiers/v1/submitted-variants${beacon ? "/beacon/query" : ""}`);
  expect(url.searchParams.getAll("datasetIds")).toEqual(["PRJEB30116", "PRJEB4019"]);
  expect(url.searchParams.get("referenceBases")).toBe("");
  expect(url.searchParams.get("start")).toBe("66275332");
});

it.each([false, true])("preserves RS class queries and the provider's Beacon spelling (beacon=%s)", async beacon => {
  const native = beacon ? { exists: true, alleleRequest: locus } : [{ accession: 17870277, data: { type: "SNV" } }];
  const fetch = vi.fn().mockResolvedValue(Response.json(native)); vi.stubGlobal("fetch", fetch);
  expect(await api({ method: "GET", path: `/identifiers/clustered-variants${beacon ? "/beacon/query" : ""}`, params: { ...locus, variantType: "SNV", ...(beacon ? { includeDatasetReponses: false } : { contigNamingConvention: "INSDC" }) } })).toMatchObject({ status: 200, data: native });
  const url = new URL(String(fetch.mock.calls[0][0]));
  expect(url.searchParams.get("variantType")).toBe("SNV");
  expect(url.searchParams.get("includeDatasetReponses")).toBe(beacon ? "false" : null);
  expect(url.searchParams.has("includeDatasetResponses")).toBe(false);
});

it.each([
  { assemblyId: undefined }, { assemblyId: "GCA_000002305" }, { referenceName: "" }, { start: 0 }, { start: 1.5 }, { start: "66275332" },
  { start: Number.MAX_SAFE_INTEGER + 1 }, { referenceBases: undefined }, { alternateBases: null }, { alternateBases: "A T" },
  { datasetIds: "PRJEB30116" }, { datasetIds: [] }, { datasetIds: [1] }, { contigNamingConvention: ["INSDC"] }, { limit: 1 },
])("rejects missing/ambiguous field scope or unsupported parameters before fetching: %j", async change => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(api({ method: "GET", path: "/identifiers/submitted-variants", params: { ...locus, referenceBases: "A", alternateBases: "T", ...change } })).rejects.toMatchObject({ status: 400 });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  { path: "/identifiers/submitted-variants/99308221/history" },
  { path: "/identifiers/clustered-variants/rs43678406/history" },
  { path: "/identifiers/clustered-variants", params: { ...locus, variantType: "unknown" } },
  { path: "/identifiers/clustered-variants/beacon/query", params: { ...locus, variantType: "SNV", includeDatasetResponses: true } },
  { path: "/identifiers/clustered-variants/beacon/query", params: { ...locus, variantType: "SNV", includeDatasetReponses: "true" } },
  { path: "/identifiers/submitted-variants/beacon/query", params: { ...locus, referenceBases: "A", alternateBases: "T", contigNamingConvention: "INSDC" } },
  { path: "/identifiers/clustered-variants/43678406/history", body: {} },
])("rejects unsupported history/Beacon contracts: %j", async request => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(api({ method: "GET", ...request })).rejects.toMatchObject({ status: 400 });
  expect(fetch).not.toHaveBeenCalled();
});

it("makes all new routes executable through Code Mode's actual proxy catalog", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ fixture: true })));
  const proxy = createApiProxyTool({ apiFetch: api, catalog: evaCatalog });
  for (const kind of ["clustered", "submitted"]) {
    for (const beacon of [false, true]) {
      const result = await proxy.handler({ method: "GET", path: `/identifiers/${kind}-variants${beacon ? "/beacon/query" : ""}`, params: { ...locus, ...(kind === "clustered" ? { variantType: "SNV" } : { referenceBases: "C", alternateBases: "T" }) } }, { sql: () => [] });
      expect(result).toMatchObject({ fixture: true });
    }
  }
  expect(await proxy.handler({ method: "GET", path: "/identifiers/clustered-variants/{accession}/history", params: { accession: "43678406" } }, { sql: () => [] })).toMatchObject({ fixture: true });
});

it("stages large native history with all events and variants intact", async () => {
  const native = { ...history, operations: history.operations.map(event => ({ ...event, reason: "β".repeat(15000) })) };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(native)));
  const stored: unknown[] = [];
  const doNamespace = { idFromName: (name: string) => name, get: () => ({ fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      const payload = await request.json() as { data: unknown }; stored.push(payload.data);
      return Response.json({ success: true, tables_created: ["payloads"], total_rows: 1 });
    }
    return Response.json({ success: true, schema: { tables: { payloads: { columns: [{ name: "payload_json" }] } } } });
  } }) };
  const proxy = createApiProxyTool({ apiFetch: api, catalog: evaCatalog, doNamespace, stagingPrefix: "eva", maxInlineBytes: 30 * 1024 });
  const result = await proxy.handler({ method: "GET", path: "/identifiers/clustered-variants/{accession}/history", params: { accession: "43678406" } }, { sql: () => [] });
  expect(result).toMatchObject({ __staged: true, _staging: expect.any(Object) });
  expect(stored.map(value => typeof value === "string" ? JSON.parse(value) : value)).toContainEqual(native);
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(100000);
});
