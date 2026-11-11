import { afterEach, expect, it, vi } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import type { ExecuteToolOptions } from "@bio-mcp/shared/codemode/execute-tool";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";
import { readEva } from "../lib/http";

const captured = vi.hoisted(() => ({ options: [] as ExecuteToolOptions[] }));
vi.mock("../lib/http", () => ({ EVA_IDENTIFIERS_BASE: "https://www.ebi.ac.uk/eva/webservices/identifiers/v1", readEva: vi.fn() }));
vi.mock("@bio-mcp/shared/codemode/execute-tool", async importOriginal => {
  const actual = await importOriginal<typeof import("@bio-mcp/shared/codemode/execute-tool")>();
  return { ...actual, createExecuteTool: (options: ExecuteToolOptions) => { captured.options.push(options); return actual.createExecuteTool(options); } };
});
afterEach(() => { captured.options.length = 0; vi.clearAllMocks(); });

function registered() {
  const server = new McpServer({ name: "fixture", version: "1" });
  // SAFETY: invalid-code tests never invoke the Worker loader.
  registerCodeMode(server, { CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1]);
  registerQueryData(server, {}); registerGetSchema(server, {});
  // SAFETY: inspect the SDK registry to invoke actual registered callbacks.
  return (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<unknown> }> })._registeredTools;
}

it("registers eight aliases with both fields on success and error", async () => {
  const tools = registered(); expect(Object.keys(tools)).toHaveLength(8);
  for (const prefix of ["", "mcp_"]) {
    expect(await tools[prefix + "eva_search"].handler({ query: "identifier", max_results: 5 }, {})).toMatchObject({ content: expect.any(Array), structuredContent: { success: true } });
    for (const [name, args] of [["eva_execute", { code: "" }], ["eva_query_data", { data_access_id: "fixture", sql: "SELECT 1" }], ["eva_get_schema", { data_access_id: "fixture" }]] as const) {
      expect(await tools[prefix + name].handler(args, {})).toMatchObject({ content: expect.any(Array), structuredContent: expect.any(Object), isError: true });
    }
  }
});

it("returns region paging errors through the Code Mode API proxy before fetching", async () => {
  registered(); const options = captured.options[0];
  const proxy = createApiProxyTool({ apiFetch: options.apiFetch, catalog: options.catalog });
  const result = await proxy.handler({ method: "GET", path: "/segments/{region}/variants", params: {
    region: "1:105000001-105500000", species: "mmusculus_grcm38", limit: 10001,
  } }, { sql: () => [] });
  expect(result).toMatchObject({ __api_error: true, status: 400, message: "limit must be an integer from 1 to 10000" });
  expect(readEva).not.toHaveBeenCalled();
});

it.each([false, true])("stages complete large provider payloads, including error context (failure=%s)", async failure => {
  registered(); const options = captured.options[0];
  expect(options).toMatchObject({ maxInlineBytes: 30 * 1024, stagingThreshold: 30 * 1024, timeout: 60000 });
  const stored: unknown[] = [];
  const namespace = { idFromName: (name: string) => name, get: () => ({ fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      // SAFETY: shared staging protocol sends this envelope.
      const payload = await request.json() as { data: unknown }; stored.push(payload.data);
      return Response.json({ success: true, tables_created: ["evidence"], total_rows: 1 });
    }
    return Response.json({ success: true, schema: { tables: { evidence: { columns: [{ name: "native" }] } } } });
  } }) };
  const native = { response: [{ result: [{ assembly: "GCA_1.1", detail: "é".repeat(18000) }] }, { result: [{ assembly: "GCA_1.2" }] }], errors: ["provider context"] };
  if (failure) vi.mocked(readEva).mockRejectedValue(Object.assign(new Error("provider failed"), { status: 502, data: native }));
  else vi.mocked(readEva).mockResolvedValue({ status: 200, data: native });
  const proxy = createApiProxyTool({ apiFetch: options.apiFetch, catalog: options.catalog, doNamespace: namespace, stagingPrefix: "eva", maxInlineBytes: options.maxInlineBytes });
  const result = await proxy.handler({ method: "GET", path: "/evidence/identifiers/rs17870277" }, { sql: () => [] });
  const plain = JSON.parse(JSON.stringify(result));
  if (failure) expect(plain).toMatchObject({ __api_error: true, incomplete: true, status: 502, data: { __staged: true, data_access_id: expect.any(String) } });
  else expect(plain).toMatchObject({ __staged: true, data_access_id: expect.any(String), _staging: expect.any(Object) });
  const serialized = JSON.stringify(stored);
  const payloads = stored.map(value => typeof value === "string" ? JSON.parse(value) : value);
  if (failure) expect(payloads).toContainEqual(native);
  else expect(payloads).toContainEqual(expect.objectContaining({ native, provenance: expect.objectContaining({ requested_identifier: "rs17870277", release_pinned: false }) }));
  expect(serialized).toContain("GCA_1.1"); expect(serialized).toContain("GCA_1.2");
  expect(serialized).toContain("provider context");
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(100000);
});
