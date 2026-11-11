# eva-mcp-server

MCP server wrapping the [European Variation Archive (EVA) REST API](https://www.ebi.ac.uk/eva/?Help#REST%20Web%20Services) — EMBL-EBI's open archive for all types of genetic variation data across species.

Runs on Cloudflare Workers. Exposes `eva_search`, `eva_execute`, `eva_query_data`,
and `eva_get_schema`, each also registered under its `mcp_` alias.

- Upstream docs: https://www.ebi.ac.uk/eva/?Help
- Base URL: `https://www.ebi.ac.uk/eva/webservices/rest/v1`
- Local dev port: 8879
- Category focus: metadata (species, studies) and targeted variant lookups (by ID, region, or gene).

Preserve all native response/result groups, warnings and errors. A response can
contain multiple placements; taking only `response[0]` can lose evidence.

## Identifier and assembly provenance

The September 29, 2026 review checked the [provider's API examples](https://www.ebi.ac.uk/training/online/courses/eva-quick-tour/searching-and-visualising-data/the-eva-api/)
and [official web-service documentation](https://github.com/EBIvariation/eva-ws/wiki).
The catalog now exposes the separate `identifiers/v1` service through:

- `/identifiers/clustered-variants/{accession}`
- `/identifiers/clustered-variants/{accession}/submitted`
- `/identifiers/submitted-variants/{accession}`
- `/identifiers/clustered-variants/{accession}/history`

These routes use numeric accession strings without the rs/ss prefix. The local
`/evidence/identifiers/{identifier}` helper accepts the prefix and returns
`{ native, provenance }`, preserving the provider payload. RS clusters and SS
observations have different meanings: retain native taxon, assembly, contig,
alleles, study and mapping history when joining data. An accession does not
establish a unique current assembly placement.

The October 1 review of the [published identifiers schema](https://www.ebi.ac.uk/eva/webservices/identifiers/v2/api-docs)
also adds field lookup and existence queries:

- `/identifiers/clustered-variants` — RS class lookup
- `/identifiers/submitted-variants` — SS allele lookup
- `/identifiers/clustered-variants/beacon/query` — RS existence
- `/identifiers/submitted-variants/beacon/query` — SS existence

Field queries require an explicit versioned `GCA_...` assembly, `referenceName`
and positive safe-integer `start` locally, even where the provider schema marks
them optional. RS queries require `variantType`; SS queries require explicit
`referenceBases` and `alternateBases`. Empty allele strings remain empty.
No coordinate conversion, allele normalization or inferred assembly is applied.
Optional `datasetIds` uses an array of study strings, encoded as repeated query
parameters. `contigNamingConvention` applies to record/history and non-Beacon
field lookups. The RS Beacon flag uses the provider's exact spelling,
`includeDatasetReponses`. Unsupported parameters fail before a request is sent.

```javascript
return await api.get('/identifiers/submitted-variants', {
  assemblyId: 'GCA_000002305.1', referenceName: 'CM000392.2',
  start: 12856868, referenceBases: 'C', alternateBases: 'T',
  datasetIds: ['PRJEB30116']
});
```

RS history returns native `operations` and `variants`. Keep event destinations,
reasons, versions and placements; split/merge events do not establish a single
canonical successor. Beacon results retain the native request, `exists` and error
fields; an error or empty response must not be interpreted as biological absence.
These mutable APIs are not bulk-release snapshots. Large results use the existing
Code Mode staging and SQL flow, including the entire history payload.

`/evidence/regions/{region}` requires a species/assembly code selected from
`/meta/species/list`, and supports bounded `limit`/`skip` paging. Its provenance
records the requested context, retrieval time and parsed-payload SHA-256, without
claiming that returned placements were independently validated or release-pinned.
The default limit is 100 and maximum is 10,000. Native raw routes remain available.

Direct `/segments/{region}/variants` calls also validate explicit pagination:
`limit` must be an integer from 1 to 10,000 and `skip` a nonnegative safe integer.
Invalid values (including explicit nulls) return a local 400 before any upstream
request. Omitted pagination retains provider defaults on the direct route and
the bounded defaults on the evidence helper. Filters and native response groups
are preserved. This follows EVA's documented [region query limits](https://www.ebi.ac.uk/eva/?Help).

Canonical study paths are `/studies/{study_id}/summary` and
`/studies/{study_id}/files`; previous `/meta/studies/...` calls redirect internally.
The legacy `/variants/{variant_id}` invocation uses the documented `/info` path.
`/meta/studies/list` selects browsable studies by species/assembly; `/all` is the
archive listing. Unverified legacy file/statistics entries are marked deprecated.

## Bulk RS releases and validation

[EVA's data-access documentation](https://www.ebi.ac.uk/eva/?Help) describes
non-human RS release VCFs by species/assembly, alongside identifier change files.
They provide positional evidence rather than genotypes or annotations. For bulk
work, select an explicit [RS release](https://www.ebi.ac.uk/eva/?RS-Release), inspect
its README/known issues and retain merge/deprecation evidence. Do not equate the
mutable identifier API with a bulk snapshot.

Code Mode now exposes `GET /releases` and `GET /releases/{release}/files`
over the [official HTTPS directory](https://ftp.ebi.ac.uk/pub/databases/eva/rs_releases/).
Select a numbered release, then pass an observed relative `directory` such as
`by_assembly/` and its assembly/species subdirectories (including the trailing
slash). Native release 9 examples are
`by_assembly/GCA_000003055.5/bos_taurus/` and
`by_species/bos_taurus/Btau_4.6.1/`; species directories expose both assembly
names and accessions. One assembly directory may contain several species.
The results retain immediate child links, the complete native listing, retrieval
time and `listing_text_sha256`. An optional `expected_listing_sha256` rejects
changed listing text while retaining the newly observed evidence. A listing hash
does not pin file contents. README, checksum and identifier-change links remain
available alongside VCF links; artifact downloads and ingestion are separate.
The release is explicit; no latest release is hard-coded. Species/assembly paths
must be selected from discovery, not inferred from browser codes or RS IDs.
Release-listing reads reject redirects, have no retries, and cap headers and body
at ten seconds each with a 4 MiB body limit. Large listings/errors use staging.
October 4 native acceptance reaches releases 1–9 and both nested layouts. A
complete 786,695-byte Absiella unmapped-ID gzip matches the published MD5;
its four columns (`RS_ID`, `SS_ID`, `SEQ5`, `SEQ3`) contain 26,337 observations
and 24,615 distinct RS IDs, matching its README. A separate 65,536-byte range
from the Bos taurus current VCF confirms VCF 4.2, the assembly reference and
provider INFO flags. That partial read does not verify the full VCF or release.

A [Scientific Data paper published April 16, 2026](https://www.nature.com/articles/s41597-026-07208-0)
documents agricultural rsID adoption and EVA release reuse in crop databases.
It supports prioritizing non-human identifier joins; it does not establish a
new API endpoint or validate this deployment's release coverage.

Reads cap each body at 4 MiB and 10 seconds, after a 25-second header/retry budget.
Payloads over 30 KiB stage with their full native context; oversized reads fail
explicitly instead of truncating records. No dependency or credential is added.

All four tool families cite their results and errors through both aliases.
Whole MCP envelopes also stage above 30 KiB, including schema and escaped SQL
output. `payloads` retains the complete original response; SQL projections keep
REST groups, identifier placements, history events, and per-variant
`source_entries` separately. Each source entry has its original key, study/file
IDs and complete `source_payload` JSON. Use discovered schemas and parent IDs.

Coverage is conservative: native `numTotalResults: 0` occurs with nonempty pages
when counting is disabled. Returned counts refer to result occurrences, not the
number of response groups or distinct variants. Empty responses, short pages and
requested browser codes do not prove biological absence or release completeness.

123 focused tests, 13 static checks and native/local MCP acceptance pass.
The local bundled Worker uses verified TLS and real SQLite staging. Discovery
returns 315 assembly records; two region pages return five then one variant.
RS `17870277` retains four placements; `43678406` history retains four placements
and both native merge/split operations. Study `PRJEB15197` resolves its download
URL using `fileName`; the distinct `fileId` returns an empty envelope. Both
Beacon examples return provider HTTP 500; the full native body is preserved and
flagged as an error. Positive Beacon answers and whole-release integrity remain
unverified. See the [acceptance record](../../docs/plans/2026-09-26-upstream-api-implementation.md#eva-native-acceptance-and-release-directory-repairs--october-4-2026).

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from European Variation Archive and stays under the terms of that source: EMBL-EBI terms.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
