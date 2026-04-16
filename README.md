# eva-mcp-server

MCP server wrapping the [European Variation Archive (EVA) REST API](https://www.ebi.ac.uk/eva/?Help#REST%20Web%20Services) — EMBL-EBI's open archive for all types of genetic variation data across species.

Runs on Cloudflare Workers. Exposes four Code Mode tools (`eva_search`, `eva_execute`, `eva_query_data`, `eva_get_schema`) plus a convenience `eva_variant_lookup`.

- Upstream docs: https://www.ebi.ac.uk/eva/?Help
- Base URL: `https://www.ebi.ac.uk/eva/webservices/rest/v1`
- Local dev port: 8879
- Category focus: metadata (species, studies) and targeted variant lookups (by ID, region, or gene).

EVA wraps results as `{ response: [{ result: [...] }] }` — Code Mode callers should unwrap via `data.response[0].result`. Prefer narrow coordinate windows and targeted variant IDs over broad genomic queries.
