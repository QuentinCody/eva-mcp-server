import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { evaFetch } from "../lib/http";
import {
    createCodeModeResponse,
    createCodeModeError,
} from "@bio-mcp/shared/codemode/response";
import { shouldStage, stageToDoAndRespond } from "@bio-mcp/shared/staging/utils";

interface SearchEnv {
    EVA_DATA_DO?: {
        idFromName(name: string): unknown;
        get(id: unknown): { fetch(req: Request): Promise<Response> };
    };
}

/**
 * Convenience lookup for a single EVA variant (preferred over broad genomic windows).
 * For anything more complex, use Code Mode (eva_search + eva_execute).
 */
export function registerSearch(server: McpServer, env?: SearchEnv): void {
    server.registerTool(
        "eva_variant_lookup",
        {
            title: "Lookup EVA variant",
            description:
                "Lookup a single variant in the European Variation Archive by rsID or chr:pos:ref:alt.",
            inputSchema: {
                variant_id: z
                    .string()
                    .min(1)
                    .describe("rsID (e.g. rs699) or chr:pos:ref:alt identifier."),
                species: z
                    .string()
                    .optional()
                    .describe("Taxonomy code (e.g. 'hsapiens_grch38')."),
            },
        },
        async (args, extra) => {
            const runtimeEnv = env || (extra as { env?: SearchEnv })?.env;
            try {
                const params: Record<string, unknown> = {};
                if (args.species) params.species = String(args.species);
                const response = await evaFetch(`/variants/${args.variant_id}`, params);

                if (!response.ok) {
                    const body = await response.text().catch(() => "");
                    throw new Error(
                        `EVA API error: HTTP ${response.status}${body ? ` - ${body.slice(0, 300)}` : ""}`,
                    );
                }

                const data = await response.json();

                const responseSize = JSON.stringify(data).length;
                if (shouldStage(responseSize) && runtimeEnv?.EVA_DATA_DO) {
                    const staged = await stageToDoAndRespond(
                        data,
                        runtimeEnv.EVA_DATA_DO as DurableObjectNamespace,
                        "variant_lookup",
                        undefined,
                        undefined,
                        "eva",
                        (extra as { sessionId?: string })?.sessionId,
                    );
                    return createCodeModeResponse(
                        {
                            staged: true,
                            data_access_id: staged.dataAccessId,
                            total_rows: staged.totalRows,
                            _staging: staged._staging,
                            message: `Results staged. Use eva_query_data with data_access_id '${staged.dataAccessId}' to query.`,
                        },
                        { meta: { staged: true, data_access_id: staged.dataAccessId } },
                    );
                }

                return createCodeModeResponse(
                    { data },
                    { meta: { fetched_at: new Date().toISOString() } },
                );
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return createCodeModeError("API_ERROR", `eva_variant_lookup failed: ${msg}`);
            }
        },
    );
}
