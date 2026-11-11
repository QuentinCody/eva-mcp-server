import { afterEach, expect, it, vi } from "vitest";
import { createEvaApiFetch } from "./api-adapter";
import { readEva } from "./http";
vi.mock("./http", () => ({ EVA_IDENTIFIERS_BASE: "https://www.ebi.ac.uk/eva/webservices/identifiers/v1", readEva: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const api = createEvaApiFetch();

it.each([
  ["/meta/studies/PRJEB4019/summary", "/studies/PRJEB4019/summary"],
  ["meta/studies/PRJEB4019/files", "/studies/PRJEB4019/files"],
  ["/variants/rs666", "/variants/rs666/info"],
  ["/variants/rs666/info", "/variants/rs666/info"],
])("preserves the old invocation while fixing the provider path: %s", async (path, target) => {
  const data = { response: [{ result: ["provider fixture"] }] };
  vi.mocked(readEva).mockResolvedValue({ status: 200, data });
  expect(await api({ method: "GET", path, params: { species: "hsapiens_grch37" } })).toMatchObject({ status: 200, data, completeness: { complete: false, returned: 1 } });
  expect(readEva).toHaveBeenCalledWith(target, { species: "hsapiens_grch37" });
});

it.each(["/clustered-variants/17870277", "/clustered-variants/17870277/submitted", "/submitted-variants/99308221"])("routes documented identifier resource %s", async path => {
  vi.mocked(readEva).mockResolvedValue({ status: 200, data: { fixture: true } });
  await api({ method: "GET", path: `/identifiers${path}` });
  expect(readEva).toHaveBeenCalledWith(path, undefined, "https://www.ebi.ac.uk/eva/webservices/identifiers/v1");
});

it.each(["/identifiers/clustered-variants/rs1", "/identifiers/submitted-variants/0", "/../other", "https://example.com/path"])("rejects invalid routing: %s", async path => {
  await expect(api({ method: "GET", path })).rejects.toMatchObject({ status: 400 });
  expect(readEva).not.toHaveBeenCalled();
});

it("rejects writes instead of converting them to reads", async () => {
  await expect(api({ method: "POST", path: "/meta/species/list" })).rejects.toMatchObject({ status: 405 });
  expect(readEva).not.toHaveBeenCalled();
});
