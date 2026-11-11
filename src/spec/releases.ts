import type { ApiEndpoint, ParamDef, WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";

const guard: ParamDef = { name: "expected_listing_sha256", type: "string", required: false, description: "Optional previous listing_text_sha256; reject changed listing text. Does not pin artifact bytes." };
export const releaseEndpoints: ApiEndpoint[] = [
  { method: "GET", path: "/releases", category: "releases", summary: "Discover numbered non-human RS releases from the official FTP HTTPS directory; retain the native listing and its text hash.", queryParams: [guard] },
  { method: "GET", path: "/releases/{release}/files", category: "releases", summary: "Browse one explicit RS release and its species/assembly file directories. Returns observed links and full listing; no artifact download.",
    pathParams: [{ name: "release", type: "string", required: true, description: "Numeric release selected from /releases; no latest alias." }],
    queryParams: [{ name: "directory", type: "string", required: false, description: "Observed relative directory, with trailing slash: by_assembly/[<assembly_accession>/[<species>/]] or by_species/[<species>/[<assembly_name_or_accession>/]]. For example by_assembly/GCA_000003055.5/bos_taurus/ or by_species/bos_taurus/Btau_4.6.1/. Omit for release root; select observed links rather than guessing availability." }, guard] },
];
export const releaseWorkflow: WorkflowRecipe = {
  title: "Discover RS releases before selecting an assembly snapshot",
  description: "Return numbered releases with native listing evidence. Browse an explicitly selected release, then its observed species/assembly directories; retain README, known issues and merge/deprecation files. File links do not validate contents.",
  keywords: ["RS", "release", "VCF", "bulk", "assembly", "species"],
  code: 'return await api.get("/releases");',
};
