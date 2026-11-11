import type { ApiEndpoint, ParamDef, WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";
import { CONTIG_NAMES, VARIANT_TYPES } from "../lib/identifiers";

export const contigNaming: ParamDef[] = [{ name: "contigNamingConvention", type: "string", required: false, enum: CONTIG_NAMES, description: "Provider contig naming convention; default INSDC. Does not change the requested assembly." }];
const locus: ParamDef[] = [
  { name: "assemblyId", type: "string", required: true, description: "Explicit versioned GCA accession, e.g. GCA_000002305.1. Required locally to bound lookup scope." },
  { name: "referenceName", type: "string", required: true, description: "Provider chromosome name/accession. Required locally; no contig mapping is inferred." },
  { name: "start", type: "number", required: true, description: "Positive safe integer in the native EVA coordinate convention. No coordinate conversion or normalization is performed." },
];
const rs: ParamDef[] = [{ name: "variantType", type: "string", required: true, enum: VARIANT_TYPES, description: "RS variant class; this is not an exact allele lookup." }];
const ss: ParamDef[] = [
  { name: "referenceBases", type: "string", required: true, description: "Explicit native reference allele, at most 10000 characters; empty strings are preserved." },
  { name: "alternateBases", type: "string", required: true, description: "Explicit native alternate allele, at most 10000 characters; no allele normalization is inferred." },
  { name: "datasetIds", type: "array", required: false, description: "1–100 study accession strings, encoded as repeated datasetIds query parameters." },
];

export const identifierEndpoints: ApiEndpoint[] = [
  { method: "GET", path: "/identifiers/clustered-variants/{accession}/history", category: "identifiers",
    summary: "RS history with native operations and current variants. Preserve merge/split destinations, reasons, versions and placements; never infer a single canonical successor.",
    pathParams: [{ name: "accession", type: "string", required: true, description: "Numeric RS accession without rs prefix, e.g. 43678406." }], queryParams: contigNaming,
    example: "return await api.get('/identifiers/clustered-variants/{accession}/history', {accession: '43678406'});" },
  ...(["clustered", "submitted"] as const).flatMap(kind => {
    const fields = kind === "clustered" ? rs : ss;
    return ([false, true] as const).map(beacon => ({
      method: "GET" as const, path: `/identifiers/${kind}-variants${beacon ? "/beacon/query" : ""}`, category: "identifiers",
      summary: `${kind === "clustered" ? "RS class" : "SS allele"} lookup by explicit assembly and locus${beacon ? "; native Beacon existence response (retain error and request fields)" : "; all native accession records retained"}. No release pinning or completeness beyond the response is inferred.`,
      queryParams: [...locus, ...fields, ...(beacon ? kind === "clustered" ? [{ name: "includeDatasetReponses", type: "boolean" as const, required: false, description: "Provider's exact query spelling, including Reponses. Preserve the native Beacon result rather than inferring dataset coverage." }] : [] : contigNaming)],
    }));
  }),
];

export const identifierWorkflow: WorkflowRecipe = {
  title: "Inspect RS history before following changed identifiers",
  description: "Keep both operation history and current placements. Split, merge and deprecation events are evidence to inspect, not permission to collapse records or assume a pinned release.",
  keywords: ["history", "merge", "split", "deprecated", "rs"],
  code: "return await api.get('/identifiers/clustered-variants/{accession}/history', {accession: '43678406', contigNamingConvention: 'INSDC'});",
};
