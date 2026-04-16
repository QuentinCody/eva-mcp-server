import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const evaCatalog: ApiCatalog = {
    name: "European Variation Archive (EVA)",
    baseUrl: "https://www.ebi.ac.uk/eva/webservices/rest/v1",
    version: "v1",
    auth: "none",
    endpointCount: 10,
    notes:
        "- EVA wraps results as `{ response: [{ result: [...] }] }` — unwrap via `data.response[0].result`.\n" +
        "- Prefer metadata (`meta/species/list`, `meta/studies/all`) and targeted variant lookups over broad genomic windows.\n" +
        "- Region queries require species+assembly context; keep windows narrow (a few kb) to avoid huge payloads.\n" +
        "- `species` parameter uses taxonomy codes like 'hsapiens_grch38' (sometimes 'hsapiens_grch37').\n" +
        "- Variant IDs accepted: rsID (e.g. rs699) or chr:pos:ref:alt.\n" +
        "- Legacy endpoints under the EVA REST v1 root; some responses can be XML for feature paths — request JSON.",
    endpoints: [
        {
            method: "GET",
            path: "/meta/species/list",
            summary: "List species and assemblies available in EVA (includes taxonomy + assembly codes).",
            category: "metadata",
            queryParams: [],
        },
        {
            method: "GET",
            path: "/meta/studies/all",
            summary: "List all studies deposited in EVA.",
            category: "metadata",
            queryParams: [
                { name: "species", type: "string", required: false, description: "Taxonomy code filter (e.g. 'hsapiens_grch38')." },
            ],
        },
        {
            method: "GET",
            path: "/meta/studies/{study_id}/summary",
            summary: "Summary metadata for a single study.",
            category: "metadata",
            pathParams: [
                { name: "study_id", type: "string", required: true, description: "EVA study identifier (e.g. PRJEB12345)." },
            ],
        },
        {
            method: "GET",
            path: "/meta/studies/{study_id}/files",
            summary: "Files associated with a study (VCF/TAB submissions).",
            category: "metadata",
            pathParams: [
                { name: "study_id", type: "string", required: true, description: "EVA study identifier." },
            ],
        },
        {
            method: "GET",
            path: "/variants/{variant_id}",
            summary: "Lookup a single variant by rsID or chr:pos:ref:alt across species.",
            category: "variants",
            pathParams: [
                { name: "variant_id", type: "string", required: true, description: "rsID (e.g. rs699) or chr:pos:ref:alt." },
            ],
            queryParams: [
                { name: "species", type: "string", required: false, description: "Taxonomy code (e.g. 'hsapiens_grch38')." },
                { name: "studies", type: "string", required: false, description: "Comma-separated study ID filter." },
            ],
        },
        {
            method: "GET",
            path: "/variants/{variant_id}/info",
            summary: "Extended info for a variant (frequencies, consequences, cross-references).",
            category: "variants",
            pathParams: [
                { name: "variant_id", type: "string", required: true, description: "rsID or chr:pos:ref:alt." },
            ],
            queryParams: [
                { name: "species", type: "string", required: false, description: "Taxonomy code." },
            ],
        },
        {
            method: "GET",
            path: "/segments/{region}/variants",
            summary: "Variants in a genomic region. Keep windows small — wide regions return huge payloads.",
            category: "variants",
            pathParams: [
                { name: "region", type: "string", required: true, description: "Chromosome:start-end (e.g. '13:32315474-32315475')." },
            ],
            queryParams: [
                { name: "species", type: "string", required: false, description: "Taxonomy code (required in practice)." },
                { name: "studies", type: "string", required: false, description: "Comma-separated study filter." },
                { name: "maf", type: "string", required: false, description: "Minor allele frequency filter (e.g. '>0.01')." },
                { name: "limit", type: "number", required: false, description: "Result cap." },
            ],
        },
        {
            method: "GET",
            path: "/genes/{gene}/variants",
            summary: "Variants in a named gene. Useful for small genes; otherwise paginate.",
            category: "variants",
            pathParams: [
                { name: "gene", type: "string", required: true, description: "HGNC gene symbol (e.g. BRCA2)." },
            ],
            queryParams: [
                { name: "species", type: "string", required: false, description: "Taxonomy code." },
                { name: "limit", type: "number", required: false, description: "Result cap." },
            ],
        },
        {
            method: "GET",
            path: "/files/{file_id}",
            summary: "Metadata for a submitted file (VCF/TAB).",
            category: "files",
            pathParams: [
                { name: "file_id", type: "string", required: true, description: "EVA file identifier." },
            ],
        },
        {
            method: "GET",
            path: "/meta/studies/stats",
            summary: "Aggregate statistics over EVA studies (species / assembly counts).",
            category: "metadata",
            queryParams: [
                { name: "species", type: "string", required: false, description: "Taxonomy code filter." },
            ],
        },
    ],
};
