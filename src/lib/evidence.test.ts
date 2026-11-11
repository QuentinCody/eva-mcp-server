import { afterEach, expect, it, vi } from "vitest";
import { readEva } from "./http";
import { readEvidence } from "./evidence";
vi.mock("./http", () => ({ EVA_IDENTIFIERS_BASE: "https://www.ebi.ac.uk/eva/webservices/identifiers/v1", readEva: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it.each(["rs17870277", "ss99308221", "rs9007199254740993"])("keeps the exact accession and native evidence for %s", async identifier => {
  const native = { response: [{ result: [{ taxonomy: 9615, assembly: "GCA_000002285.2", alleles: ["A", "T"], study: "PRJEB24066" }, { assembly: "GCA_000002285.3" }] }], warnings: ["fixture"] };
  vi.mocked(readEva).mockResolvedValue({ status: 200, data: native });
  const result = await readEvidence(`/evidence/identifiers/${identifier}`);
  expect(result).toMatchObject({ data: { native, provenance: { requested_identifier: identifier, release: null, release_pinned: false, complete_dataset: false, parsed_payload_sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } } });
  expect(readEva).toHaveBeenCalledWith(`/${identifier.startsWith("rs") ? "clustered" : "submitted"}-variants/${identifier.slice(2)}`, {}, "https://www.ebi.ac.uk/eva/webservices/identifiers/v1");
});

it("preserves region filters and uses bounded paging without claiming a snapshot", async () => {
  vi.mocked(readEva).mockResolvedValue({ status: 200, data: { response: [{ result: [] }] } });
  const params = { species: "mmusculus_grcm38", studies: "PRJEB1", limit: 20, skip: 40, "annot-ct": "SO:0001792" };
  expect(await readEvidence("/evidence/regions/1:105000001-105500000", params)).toMatchObject({ data: { provenance: { query: params, requested_species_assembly: "mmusculus_grcm38" } } });
  expect(readEva).toHaveBeenCalledWith("/segments/1:105000001-105500000/variants", params, undefined);
});

it.each([
  ["/evidence/identifiers/rs1", { species: "mmusculus_grcm38" }],
  ["/evidence/identifiers/ss0", {}],
  ["/evidence/regions/1:2-1", { species: "mmusculus_grcm38" }],
  ["/evidence/regions/1:1-2", {}],
  ["/evidence/regions/1:1-2", { species: "mmusculus_grcm38", limit: 10001 }],
  ["/evidence/regions/1:1-2", { species: "mmusculus_grcm38", skip: -1 }],
])("rejects invalid evidence scope before fetching: %s", async (path, params) => {
  await expect(readEvidence(path, params)).rejects.toMatchObject({ status: 400 });
  expect(readEva).not.toHaveBeenCalled();
});
