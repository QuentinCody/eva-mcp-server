import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { evaCatalog } from "../spec/catalog";
import { createEvaApiFetch } from "../lib/api-adapter";
import { evaResponse } from "../lib/tool-result";

interface CodeModeEnv {
    EVA_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
    const apiFetch = createEvaApiFetch();
    const registrar = { tool: (...args: unknown[]) => {
        const [name, ...rest] = args;
        const handler = rest.pop() as (input: unknown, extra: unknown) => ReturnType<typeof evaResponse>;
        const respond = (input: unknown, extra: unknown) => evaResponse(() => handler(input, extra), env, String(name), extra, input);
        // SAFETY: shared factories provide SDK arguments; only aliases and the response boundary change.
        const register = server.tool.bind(server) as (...values: unknown[]) => void;
        register(name, ...rest, respond); register(`mcp_${String(name)}`, ...rest, respond);
    } };

    const searchTool = createSearchTool({
        prefix: "eva",
        catalog: evaCatalog,
    });
    searchTool.register(registrar);

    const executeTool = createExecuteTool({
        prefix: "eva",
        // Verifiable provenance: eva_execute results carry a _meta.citation.
        source: { id: "eva", name: "European Variation Archive", url: "https://www.ebi.ac.uk/eva" },
        catalog: evaCatalog,
        apiFetch,
        preserveApiErrors: true,
        doNamespace: env.EVA_DATA_DO,
        loader: env.CODE_MODE_LOADER,
        maxInlineBytes: 30 * 1024,
        stagingThreshold: 30 * 1024,
        timeout: 60000,
    });
    executeTool.register(registrar);
}
