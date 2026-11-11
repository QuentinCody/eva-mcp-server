import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";
import { contigNaming, identifierEndpoints, identifierWorkflow } from "./identifiers";
import { releaseEndpoints, releaseWorkflow } from "./releases";

export const evaCatalog: ApiCatalog = {
    name: "European Variation Archive (EVA)",
    baseUrl: "https://www.ebi.ac.uk/eva/webservices/rest/v1",
    version: "v1",
    auth: "none",
    endpointCount: 24 + releaseEndpoints.length,
    notes:
        "- Preserve every native response/result group, placement, warning and error; do not assume only response[0] matters. Evidence helpers wrap the complete provider payload as native.\n" +
        "- Prefer metadata (`meta/species/list`, `meta/studies/all`) and targeted variant lookups over broad genomic windows.\n" +
        "- Region queries require species+assembly context; keep windows narrow (a few kb) to avoid huge payloads.\n" +
        "- Select species as taxonomyCode_assemblyCode from /meta/species/list. This is an assembly-qualified browser code, not a numeric taxon ID.\n" +
        "- Variant IDs accepted: rsID (e.g. rs699) or chr:pos:ref:alt.\n" +
        "- /identifiers routes use the separate identifiers/v1 service: RS is a locus/class cluster; SS is a submitted observation. Preserve taxon, assembly, contig, alleles, study and mapping history; never join solely by position.\n" +
        "- Region paging uses limit (<=10000) and skip; respect the provider's 5 requests/second limit. Reads are mutable, not release-pinned.\n" +
        "- Bulk non-human RS VCF releases contain positional evidence, not genotype/annotation data. Select an explicit release and species/assembly, retain README/known-issues and merge/deprecation files. Bulk ingestion is not implemented.",
    workflows: [{
        title: "RS/SS provenance without collapsing placements",
        description: "Read a documented example RS and preserve native taxonomy/assembly evidence. Follow the submitted endpoint separately when needed; do not assume the identifiers API equals a particular bulk release.",
        keywords: ["rs", "ss", "taxonomy", "assembly", "provenance"],
        code: "return await api.get('/evidence/identifiers/rs17870277');",
    }, {
        title: "Discover browser species and assembly before regional paging",
        description: "Return native discovery metadata; choose taxonomyCode_assemblyCode from it before calling /evidence/regions/{region}. Full groups and metadata may be staged.",
        keywords: ["species", "assembly", "region", "pagination"],
        code: "return await api.get('/meta/species/list', { loaded: true });",
    }, identifierWorkflow, releaseWorkflow],
    endpoints: [
        {
            method: "GET",
            path: "/meta/species/list",
            summary: "List species and assemblies available in EVA (includes taxonomy + assembly codes).",
            category: "metadata",
            queryParams: [{ name: "loaded", type: "boolean", required: false, description: "Restrict to species/assemblies loaded in the browser." }],
        },
        {
            method: "GET",
            path: "/meta/studies/all",
            summary: "List all studies deposited in EVA.",
            category: "metadata",
            queryParams: [
                { name: "structural", type: "boolean", required: false, description: "Select structural variation studies; use /meta/studies/list for browser species/assembly filtering." },
            ],
        },
        {
            method: "GET",
            path: "/meta/studies/{study_id}/summary",
            summary: "Compatibility alias for /studies/{study_id}/summary.",
            deprecated: true,
            category: "metadata",
            pathParams: [
                { name: "study_id", type: "string", required: true, description: "EVA study identifier (e.g. PRJEB12345)." },
            ],
        },
        {
            method: "GET",
            path: "/meta/studies/{study_id}/files",
            summary: "Compatibility alias for /studies/{study_id}/files; requires species/assembly.",
            deprecated: true,
            category: "metadata",
            pathParams: [
                { name: "study_id", type: "string", required: true, description: "EVA study identifier." },
            ],
        },
        {
            method: "GET",
            path: "/variants/{variant_id}",
            summary: "Compatibility alias for /variants/{variant_id}/info; supply species/assembly.",
            deprecated: true,
            category: "variants",
            pathParams: [
                { name: "variant_id", type: "string", required: true, description: "rsID (e.g. rs699) or chr:pos:ref:alt." },
            ],
            queryParams: [
                { name: "species", type: "string", required: true, description: "Browser species/assembly code from discovery." },
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
                { name: "species", type: "string", required: true, description: "Browser species/assembly code from discovery." },
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
                { name: "species", type: "string", required: true, description: "Browser species/assembly code from discovery." },
                { name: "studies", type: "string", required: false, description: "Comma-separated study filter." },
                { name: "maf", type: "string", required: false, description: "Minor allele frequency filter (e.g. '>0.01')." },
                { name: "limit", type: "number", required: false, description: "Integer page size from 1 to 10000; larger pages fail locally." },
                { name: "skip", type: "number", required: false, description: "Nonnegative safe-integer offset; paging does not pin a snapshot." },
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
                { name: "species", type: "string", required: true, description: "Browser species/assembly code from discovery." },
                { name: "limit", type: "number", required: false, description: "Result cap." },
                { name: "skip", type: "number", required: false, description: "Number of records to skip." },
            ],
        },
        {
            method: "GET",
            path: "/files/{file_id}",
            summary: "Legacy unverified file path; prefer documented /files/{file_id}/url or study files.",
            deprecated: true,
            category: "files",
            pathParams: [
                { name: "file_id", type: "string", required: true, description: "EVA file identifier." },
            ],
        },
        {
            method: "GET",
            path: "/meta/studies/stats",
            summary: "Legacy unverified statistics path; no release identity is established by this route.",
            deprecated: true,
            category: "metadata",
            queryParams: [
                { name: "species", type: "string", required: false, description: "Taxonomy code filter." },
            ],
        },
        { method: "GET", path: "/studies/{study_id}/summary", summary: "Native study summary.", category: "metadata",
            pathParams: [{ name: "study_id", type: "string", required: true, description: "Study accession, e.g. PRJEB4019." }] },
        { method: "GET", path: "/studies/{study_id}/files", summary: "Browsable files for a study and species/assembly.", category: "metadata",
            pathParams: [{ name: "study_id", type: "string", required: true, description: "Study accession." }],
            queryParams: [{ name: "species", type: "string", required: true, description: "Discovered taxonomyCode_assemblyCode." }] },
        { method: "GET", path: "/meta/studies/list", summary: "Browsable studies for a species/assembly; distinct from all archived studies.", category: "metadata",
            queryParams: [{ name: "species", type: "string", required: true, description: "Discovered taxonomyCode_assemblyCode." }] },
        { method: "GET", path: "/files/{file_id}/url", summary: "Provider download URLs selected by submitted fileName.", category: "files",
            pathParams: [{ name: "file_id", type: "string", required: true, description: "Use fileName from /studies/{study_id}/files. The distinct fileId/ERZ accession can return an empty envelope." }] },
        { method: "GET", path: "/identifiers/clustered-variants/{accession}", summary: "RS locus/class evidence with native placements from identifiers/v1.", category: "identifiers",
            queryParams: contigNaming,
            pathParams: [{ name: "accession", type: "string", required: true, description: "Numeric part only, e.g. 17870277; keep as a string." }] },
        { method: "GET", path: "/identifiers/clustered-variants/{accession}/submitted", summary: "Submitted SS evidence associated with an RS cluster.", category: "identifiers",
            queryParams: contigNaming,
            pathParams: [{ name: "accession", type: "string", required: true, description: "Numeric RS accession without rs prefix." }] },
        { method: "GET", path: "/identifiers/submitted-variants/{accession}", summary: "Native SS submission context from identifiers/v1.", category: "identifiers",
            queryParams: contigNaming,
            pathParams: [{ name: "accession", type: "string", required: true, description: "Numeric SS accession without ss prefix." }] },
        { method: "GET", path: "/evidence/identifiers/{identifier}", summary: "Local evidence wrapper preserving all native RS/SS groups plus request provenance and parsed-payload hash.", category: "evidence",
            pathParams: [{ name: "identifier", type: "string", required: true, description: "rs or ss prefix followed by the accession." }] },
        { method: "GET", path: "/evidence/regions/{region}", summary: "Local bounded region evidence with explicit requested species/assembly and complete native response.", category: "evidence",
            pathParams: [{ name: "region", type: "string", required: true, description: "Chromosome:start-end, using the provider's coordinate convention." }],
            queryParams: [{ name: "species", type: "string", required: true, description: "Discovered taxonomyCode_assemblyCode; not inferred from rsID." },
                { name: "limit", type: "number", required: false, description: "1-10000, default 100." },
                { name: "skip", type: "number", required: false, description: "Nonnegative offset, default 0." },
                { name: "studies", type: "string", required: false, description: "Comma-separated study filter." }] },
        ...identifierEndpoints,
        ...releaseEndpoints,
    ],
};
