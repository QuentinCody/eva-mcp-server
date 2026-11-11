import { expect, it, vi } from "vitest";
import { evaCatalog } from "./catalog";

it("exposes the documented study and separate identifier contracts", () => {
  expect(evaCatalog.endpointCount).toBe(evaCatalog.endpoints.length);
  for (const path of ["/studies/{study_id}/summary", "/studies/{study_id}/files", "/identifiers/clustered-variants/{accession}", "/identifiers/clustered-variants/{accession}/submitted", "/identifiers/submitted-variants/{accession}"]) {
    expect(evaCatalog.endpoints.some(endpoint => endpoint.method === "GET" && endpoint.path === path)).toBe(true);
  }
  const region = evaCatalog.endpoints.find(endpoint => endpoint.path === "/segments/{region}/variants");
  expect(region?.queryParams).toEqual(expect.arrayContaining([expect.objectContaining({ name: "species", required: true }), expect.objectContaining({ name: "skip" })]));
});

it("keeps discovery recipes executable without claiming bulk ingestion or release pinning", async () => {
  const get = vi.fn().mockResolvedValue({ native: "fixture" });
  const workflows = evaCatalog.workflows ?? []; expect(workflows).toHaveLength(4);
  for (const workflow of workflows) {
    const run = new Function("api", `return (async () => { ${workflow.code} })()`);
    expect(await run({ get })).toEqual({ native: "fixture" });
  }
  expect(get).toHaveBeenCalledWith("/evidence/identifiers/rs17870277");
  expect(get).toHaveBeenCalledWith("/meta/species/list", { loaded: true });
  expect(get).toHaveBeenCalledWith("/identifiers/clustered-variants/{accession}/history", { accession: "43678406", contigNamingConvention: "INSDC" });
  expect(evaCatalog.notes).toContain("Bulk ingestion is not implemented");
});
