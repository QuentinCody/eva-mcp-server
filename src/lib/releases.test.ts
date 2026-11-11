import { afterEach, expect, it, vi } from "vitest";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { createEvaApiFetch } from "./api-adapter";
import { evaCatalog } from "../spec/catalog";

const api = createEvaApiFetch();
const root = "https://ftp.ebi.ac.uk/pub/databases/eva/rs_releases/";
function listing(links: string, padding = "") { return `<html><title>Index of /pub/databases/eva/rs_releases/</title>${links}${padding}</html>`; }
function serve(html: string, status = 200) {
  return vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(html, { status, headers: { "Content-Type": "text/html" } })));
}
afterEach(() => vi.unstubAllGlobals());

it("discovers only numbered release directories, preserving all native listing evidence", async () => {
  const html = listing('<a href="release_9/">9</a><a href="release_8/">8</a><a href="latest/">latest</a><a href="README">notes</a><a href="../">parent</a>');
  serve(html);
  const result = await api({ method: "GET", path: "/releases" });
  expect(fetch).toHaveBeenCalledWith(root, expect.any(Object));
  expect(result.data).toMatchObject({ native_listing: html, data: [
    { name: "release_9/", url: `${root}release_9/`, kind: "directory" },
    { name: "release_8/", url: `${root}release_8/`, kind: "directory" },
  ], provenance: { requested_release: null, immutable_snapshot: false, artifact_contents_validated: false, listing_text_sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } });
});

it.each(["", "by_assembly/", "by_assembly/GCA_000002035.4/", "by_species/danio_rerio/", "by_species/danio_rerio/GCA_000002035.4/", "by_assembly/GCA_000003055.5/bos_taurus/", "by_species/bos_taurus/Btau_4.6.1/", "by_species/bos_taurus/Bos_taurus_UMD_3.1.1/"])("preserves explicit release selection and directory %s", async directory => {
  serve(listing('<a href="README.txt">README</a><a href="GCA_000002035.4_current_ids.vcf.gz">VCF</a><a href="changes.tsv.gz">changes</a><a href="checksums.md5">checksums</a>'));
  const result = await api({ method: "GET", path: "/releases/9/files", params: { directory } });
  expect(fetch).toHaveBeenCalledWith(`${root}release_9/${directory}`, expect.any(Object));
  expect(result.data).toMatchObject({ data: expect.arrayContaining([{ name: "README.txt", kind: "file", url: `${root}release_9/${directory}README.txt` }]), provenance: { requested_release: "9" } });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("filters external, parent, nested, query and credential links without fetching them", async () => {
  serve(listing(`<a href="https://elsewhere.test/a">external</a><a href="../README">parent</a><a href="a/b">nested</a><a href="file?x=1">query</a><a href="file#part">fragment</a><a href="https://user:pass@ftp.ebi.ac.uk/pub/databases/eva/rs_releases/release_9/private">credential</a><a href="ok.vcf.gz">ok</a><a href='ok.vcf.gz'>duplicate</a>`));
  const result = await api({ method: "GET", path: "/releases/9/files" });
  expect(result.data).toMatchObject({ data: [{ name: "ok.vcf.gz", kind: "file", url: `${root}release_9/ok.vcf.gz` }] });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
  ["/releases/latest/files", {}], ["/releases/0/files", {}], ["/releases/9/files", { directory: "by_assembly/../../" }],
  ["/releases/9/files", { directory: "https://elsewhere.test/" }], ["/releases/9/files", { directory: "by_assembly/GCA_1.1/file.gz" }],
  ["/releases", { directory: "by_species/" }], ["/releases", { expected_listing_sha256: "invalid" }],
  ["/releases/9/files", { directory: "by_species/bos_taurus/../" }],
  ["/releases/9/files", { directory: "by_species/bos_taurus/%2e%2e/" }],
  ["/releases/9/files", { directory: "by_species/bos_taurus/Btau_4.6.1/extra/" }],
  ["/releases/9/files", { directory: "by_assembly/GCA_000003055.5/bos_taurus/extra/" }],
])("rejects invalid release request %s %j before fetching", async (path, params) => {
  serve("");
  await expect(api({ method: "GET", path, params })).rejects.toMatchObject({ status: 400 });
  expect(fetch).not.toHaveBeenCalled();
});

it("enforces listing change guards while preserving the newly observed evidence", async () => {
  const html = listing('<a href="release_9/">release</a>'); serve(html);
  const first = await api({ method: "GET", path: "/releases" });
  const data = first.data as { provenance: { listing_text_sha256: string } };
  await expect(api({ method: "GET", path: "/releases", params: { expected_listing_sha256: data.provenance.listing_text_sha256 } })).resolves.toMatchObject({ data: { native_listing: html } });
  await expect(api({ method: "GET", path: "/releases", params: { expected_listing_sha256: "0".repeat(64) } })).rejects.toMatchObject({ status: 409, data: { native_listing: html } });
});

it("rejects a successful HTML error page instead of presenting an empty release set", async () => {
  serve("<html><h1>Service unavailable</h1></html>");
  await expect(api({ method: "GET", path: "/releases" })).rejects.toMatchObject({ status: 502, data: expect.stringContaining("Service unavailable") });
});

it("preserves bounded upstream error bodies", async () => {
  serve("Not found: release withdrawn", 404);
  await expect(api({ method: "GET", path: "/releases/9/files" })).rejects.toMatchObject({ status: 404, data: "Not found: release withdrawn" });
});

it("rejects release redirects without retries or silent release substitution", async () => {
  serve("Moved to latest", 302);
  await expect(api({ method: "GET", path: "/releases/9/files" })).rejects.toMatchObject({ status: 302, data: "Moved to latest" });
  expect(fetch).toHaveBeenCalledWith(`${root}release_9/`, expect.objectContaining({ redirect: "manual" }));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("substitutes release path parameters through the Code Mode proxy", async () => {
  serve(listing('<a href="by_assembly/">assemblies</a>'));
  const proxy = createApiProxyTool({ apiFetch: api, catalog: evaCatalog });
  await proxy.handler({ method: "GET", path: "/releases/{release}/files", params: { release: "9" } }, { sql: () => [] });
  expect(fetch).toHaveBeenCalledWith(`${root}release_9/`, expect.any(Object));
});

it.each([false, true])("stages the full Unicode listing on success and drift failure (%s)", async failure => {
  const html = listing('<a href="release_9/">release</a>', "é".repeat(18000)); serve(html);
  const stored: unknown[] = [];
  const namespace = { idFromName: (id: string) => id, get: () => ({ fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      const payload = await request.json() as { data: unknown }; stored.push(payload.data);
      return Response.json({ success: true, tables_created: ["listing"], total_rows: 1 });
    }
    return Response.json({ success: true, schema: { tables: { listing: { columns: [{ name: "native_listing" }] } } } });
  } }) };
  const proxy = createApiProxyTool({ apiFetch: api, catalog: evaCatalog, doNamespace: namespace, stagingPrefix: "eva", maxInlineBytes: 30 * 1024 });
  const result = await proxy.handler({ method: "GET", path: "/releases", params: failure ? { expected_listing_sha256: "0".repeat(64) } : {} }, { sql: () => [] });
  const payloads = stored.map(value => typeof value === "string" ? JSON.parse(value) : value);
  expect(payloads).toContainEqual(expect.objectContaining({ native_listing: html }));
  expect(result).toMatchObject(failure ? { __api_error: true, status: 409, data: { __staged: true } } : { __staged: true, _staging: expect.any(Object) });
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(100000);
});
