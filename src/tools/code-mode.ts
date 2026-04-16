import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { evaCatalog } from "../spec/catalog";
import { createEvaApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
    EVA_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
    const apiFetch = createEvaApiFetch();

    const searchTool = createSearchTool({
        prefix: "eva",
        catalog: evaCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    const executeTool = createExecuteTool({
        prefix: "eva",
        catalog: evaCatalog,
        apiFetch,
        doNamespace: env.EVA_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
