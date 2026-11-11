export const CONTIG_NAMES = ["GENBANK_SEQUENCE_NAME", "ENA_SEQUENCE_NAME", "INSDC", "REFSEQ", "UCSC", "MD5_CHECKSUM", "TRUNC512_CHECKSUM", "NO_REPLACEMENT"];
export const VARIANT_TYPES = ["SNV", "DEL", "INS", "INDEL", "TANDEM_REPEAT", "SEQUENCE_ALTERATION", "NO_SEQUENCE_ALTERATION", "NO_ALTERNATE", "MNV", "SV", "CNV"];

function invalid(message: string): never { throw Object.assign(new Error(message), { status: 400 }); }

/** Provider identifiers/v1 contract, with explicit locus scope for field queries. */
export function identifierRequest(path: string, params: Record<string, unknown> = {}): string {
  const route = path.slice("/identifiers".length);
  const lookup = /^\/(clustered|submitted)-variants(?:\/beacon\/query)?$/.exec(route);
  const byId = /^\/(?:clustered-variants\/[1-9]\d*(?:\/(?:submitted|history))?|submitted-variants\/[1-9]\d*)$/.test(route);
  if (!lookup && !byId) invalid("Identifier routes require a numeric RS or SS accession, without its prefix, or a documented field query");
  const beacon = route.endsWith("/beacon/query");
  const clustered = lookup?.[1] === "clustered";
  const allowed = lookup ? ["assemblyId", "referenceName", "start", ...(clustered ? ["variantType"] : ["referenceBases", "alternateBases", "datasetIds"]),
    ...(beacon ? clustered ? ["includeDatasetReponses"] : [] : ["contigNamingConvention"])] : ["contigNamingConvention"];
  if (Object.keys(params).some(key => !allowed.includes(key))) invalid("Unsupported identifier query parameter; use the route's documented parameter names");
  if (params.contigNamingConvention !== undefined && (typeof params.contigNamingConvention !== "string" || !CONTIG_NAMES.includes(params.contigNamingConvention))) invalid("Unsupported contigNamingConvention");
  if (!lookup) return route;
  if (typeof params.assemblyId !== "string" || !/^GCA_\d+\.\d+$/.test(params.assemblyId)) invalid("Field lookups require an explicit versioned GCA assemblyId");
  if (typeof params.referenceName !== "string" || !/^\S{1,200}$/.test(params.referenceName)) invalid("Field lookups require a referenceName in the provider's naming convention");
  if (!Number.isSafeInteger(params.start) || Number(params.start) < 1) invalid("start must be a positive safe integer in the provider's coordinate convention; no conversion is performed");
  if (clustered) {
    if (typeof params.variantType !== "string" || !VARIANT_TYPES.includes(params.variantType)) invalid("Choose a documented variantType for RS class lookup");
    if (params.includeDatasetReponses !== undefined && typeof params.includeDatasetReponses !== "boolean") invalid("includeDatasetReponses must be boolean (provider spelling)");
  } else {
    for (const name of ["referenceBases", "alternateBases"]) {
      if (typeof params[name] !== "string" || params[name].length > 10_000 || /\s/.test(params[name])) invalid(`${name} must be an explicit allele string of at most 10000 characters; empty alleles are preserved`);
    }
    if (params.datasetIds !== undefined && (!Array.isArray(params.datasetIds) || params.datasetIds.length < 1 || params.datasetIds.length > 100 || params.datasetIds.some(value => typeof value !== "string" || !/^\S{1,100}$/.test(value)))) invalid("datasetIds must contain 1–100 study accession strings");
  }
  return route;
}
