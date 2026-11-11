import { afterEach, expect, it, vi } from "vitest";
import { createEvaApiFetch } from "./api-adapter";
import { readEva } from "./http";

vi.mock("./http", () => ({ EVA_IDENTIFIERS_BASE: "https://www.ebi.ac.uk/eva/webservices/identifiers/v1", readEva: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const api = createEvaApiFetch();
const rawPath = "/segments/1:105000001-105500000/variants";
const evidencePath = "/evidence/regions/1:105000001-105500000";
const species = "mmusculus_grcm38";

it.each([
  { limit: 0 }, { limit: -1 }, { limit: 10001 }, { limit: 1.5 },
  { limit: "100" }, { limit: null }, { limit: Number.NaN }, { limit: Number.POSITIVE_INFINITY },
  { skip: -1 }, { skip: 1.5 }, { skip: "0" }, { skip: null },
  { skip: Number.MAX_SAFE_INTEGER + 1 }, { skip: Number.POSITIVE_INFINITY },
])("rejects invalid paging on both region paths without fetching: %j", async paging => {
  for (const path of [rawPath, evidencePath]) {
    await expect(api({ method: "GET", path, params: { species, ...paging } })).rejects.toMatchObject({ status: 400 });
  }
  expect(readEva).not.toHaveBeenCalled();
});

it.each([{ limit: 1, skip: 0 }, { limit: 10000, skip: Number.MAX_SAFE_INTEGER }])("preserves valid paging, filters and native response groups: %j", async paging => {
  const native = { response: [{ result: [{ id: "rs1" }] }, { result: [{ id: "rs2" }] }], warnings: ["fixture"] };
  vi.mocked(readEva).mockResolvedValue({ status: 200, data: native });
  const params = { species, studies: "PRJEB1", "annot-ct": "SO:0001792", ...paging };
  expect(await api({ method: "GET", path: rawPath, params })).toMatchObject({ status: 200, data: native, completeness: { complete: false, returned: 2 } });
  expect(readEva).toHaveBeenLastCalledWith(rawPath, params);
  expect(await api({ method: "GET", path: evidencePath, params })).toMatchObject({ data: { native, provenance: { query: params } } });
  expect(params).toEqual({ species, studies: "PRJEB1", "annot-ct": "SO:0001792", ...paging });
});

it("keeps raw provider defaults and the evidence helper's bounded defaults", async () => {
  vi.mocked(readEva).mockResolvedValue({ status: 200, data: {} });
  await api({ method: "GET", path: rawPath });
  expect(readEva).toHaveBeenLastCalledWith(rawPath, undefined);
  await api({ method: "GET", path: evidencePath, params: { species } });
  expect(readEva).toHaveBeenLastCalledWith(rawPath, { species, limit: 100, skip: 0 }, undefined);
});
