import { afterEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
import { verifyCitationEnvelope } from "@bio-mcp/shared";
import { fixture, recover } from "./staging-fixture";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const note = "β\"\\".repeat(11000);

it.each(["", "mcp_"])("preserves every native region group, source entry and parent through %s", async prefix => {
  const f = fixture();
  const sources = { "PRJ_A:file1": { studyId: "PRJ_A", fileId: "file1", attributes: { src: note.slice(0, 12000) }, stats: { maf: 0 } }, "PRJ_B:file2": { studyId: "PRJ_B", fileId: "file2", future: false } };
  const native = { queryOptions: { count: false }, response: [
    { id: "region", numResults: 2, numTotalResults: 0, result: [{ chromosome: "7", start: 1, reference: "A", alternate: "", sourceEntries: sources }, { chromosome: "7", start: 2, sourceEntries: { "PRJ_A:file1": sources["PRJ_A:file1"] } }] },
    { id: "other", numResults: 1, numTotalResults: 0, result: [{ chromosome: "8", start: 3 }] },
  ] };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(native)));
  try {
    const args = { code: "return await api.get('/segments/7:1-10/variants', {species:'hsapiens_grch38',limit:5,skip:0});" };
    const result = await f.tools[prefix + "eva_execute"].handler(args, {});
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    const sc = result.structuredContent;
    expect(sc._meta.completeness).toMatchObject({ complete: false, returned: 3 });
    expect(sc._meta.completeness.total_available).toBeUndefined();
    const id = sc.data.data_access_id;
    const full = await recover(f, id, prefix);
    expect(full).toEqual(native);
    const proof = await verifyCitationEnvelope({ citation: sc._meta.citation, structuredContent: sc, toolArguments: args, materialized: { value: full } });
    expect(proof.verification).toMatchObject({ query: "verified", result: "verified" });
    const sql = async (query: string) => {
      const result = await f.tools[prefix + "eva_query_data"].handler({ data_access_id: id, sql: query }, {});
      expect(result.isError, JSON.stringify(result)).not.toBe(true);
      return result.structuredContent.data.rows;
    };
    expect(await sql("SELECT count(*) AS n FROM response")).toEqual([{ n: 2 }]);
    expect(await sql("SELECT count(*) AS n FROM response_result")).toEqual([{ n: 3 }]);
    expect(await sql("SELECT source_key, study_id, file_id, parent_id FROM response_result_source_entries ORDER BY _rowid")).toEqual([
      { source_key: "PRJ_A:file1", study_id: "PRJ_A", file_id: "file1", parent_id: 1 },
      { source_key: "PRJ_B:file2", study_id: "PRJ_B", file_id: "file2", parent_id: 1 },
      { source_key: "PRJ_A:file1", study_id: "PRJ_A", file_id: "file1", parent_id: 2 },
    ]);
    const queryArgs = { data_access_id: id, sql: "SELECT * FROM response_result_source_entries LIMIT 1" };
    const query = await f.tools[prefix + "eva_query_data"].handler(queryArgs, {});
    expect(query, JSON.stringify(query)).toMatchObject({ structuredContent: { success: true, staged: true } });
    const queryFull = await recover(f, query.structuredContent.data_access_id, prefix);
    expect(JSON.parse(queryFull.structuredContent.data.rows[0].source_payload)).toEqual(sources["PRJ_A:file1"]);
    const sqlProof = await verifyCitationEnvelope({ citation: query.structuredContent._meta.citation, structuredContent: query.structuredContent,
      toolArguments: queryArgs, materialized: { value: queryFull } });
    expect(sqlProof.verification).toMatchObject({ query: "verified", result: "verified" });
  } finally { f.close(); }
});

it.each([false, true])("preserves multiple placements and all history operations (history=%s)", async history => {
  const f = fixture();
  const variants = [{ accession: 1, data: { assemblyAccession: "GCA_1.1", future: note } }, { accession: 1, data: { assemblyAccession: "GCA_2.1", validated: false } }];
  const native = history ? { variants, operations: ["MERGED", "UNDO_MERGE", "RS_SPLIT", "DEPRECATED"].map(type => ({ type, data: variants })) } : variants;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(native)));
  try {
    const result = await f.tools.eva_execute.handler({ code: `return await api.get('/identifiers/clustered-variants/1${history ? "/history" : ""}');` }, {});
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    expect(result.structuredContent._meta.completeness).toMatchObject({ complete: false, returned: 2 });
    const id = result.structuredContent.data.data_access_id;
    expect(await recover(f, id, "mcp_")).toEqual(native);
    const rows = await f.tools.eva_query_data.handler({ data_access_id: id, sql: "SELECT accession, data_assemblyAccession FROM variants ORDER BY _rowid" }, {});
    expect(rows.structuredContent.data.rows).toEqual([{ accession: 1, data_assemblyAccession: "GCA_1.1" }, { accession: 1, data_assemblyAccession: "GCA_2.1" }]);
    if (history) {
      const events = await f.tools.eva_query_data.handler({ data_access_id: id, sql: "SELECT type FROM operations ORDER BY _rowid" }, {});
      expect(events.structuredContent.data.rows.map((r: { type: string }) => r.type)).toEqual(["MERGED", "UNDO_MERGE", "RS_SPLIT", "DEPRECATED"]);
    }
  } finally { f.close(); }
});

it("registers eight names and cites both aliases on discovery, schema, SQL and native errors", async () => {
  const f = fixture();
  const body = JSON.stringify({ exists: false, error: { errorCode: 404, errorMessage: "native context β".repeat(50) } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 404 })));
  try {
    expect(Object.keys(f.tools).sort()).toEqual(["", "mcp_"].flatMap(prefix => ["search", "execute", "get_schema", "query_data"].map(name => prefix + "eva_" + name)).sort());
    for (const prefix of ["", "mcp_"]) for (const [name, args, failed] of [
      ["search", { query: "identifiers", max_results: 2 }, false],
      ["execute", { code: "return await api.get('/identifiers/clustered-variants/1');" }, true],
      ["execute", { code: "throw new Error('fixture');" }, true],
      ["get_schema", { data_access_id: "missing" }, false],
      ["query_data", { data_access_id: "missing", sql: "SELECT * FROM absent" }, true],
    ] as const) {
      const result = await f.tools[prefix + "eva_" + name].handler(args, {});
      expect(result.isError === true, name + JSON.stringify(result)).toBe(failed); expect(result.content.length).toBeGreaterThan(0);
      expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(30720);
      const proof = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: args });
      expect(proof.verification).toMatchObject({ query: "verified", result: "verified" });
      if (name === "execute" && args.code.includes("api.get")) expect(result.structuredContent.data).toMatchObject({ __api_error: true, status: 404, data: body });
    }
  } finally { f.close(); }
});
