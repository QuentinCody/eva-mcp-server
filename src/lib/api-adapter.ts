import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { EVA_IDENTIFIERS_BASE, readEva } from "./http";
import { readEvidence } from "./evidence";
import { identifierRequest } from "./identifiers";
import { validateRegionPaging } from "./region-paging";
import { readReleases } from "./releases";
import { evaCompleteness } from "./completeness";

function normalizePath(path: string): string {
    if (path.startsWith("//") || path.includes("://") || decodeURIComponent(path).includes("..") || /[?#\\]/.test(path)) {
        throw Object.assign(new Error("Use a relative EVA path and separate query parameters"), { status: 400 });
    }
    return `/${path.replace(/^\//, "")}`.replace(/^\/meta\/studies\/([^/]+)\/(summary|files)$/, "/studies/$1/$2")
        .replace(/^\/variants\/([^/]+)$/, "/variants/$1/info");
}

export function createEvaApiFetch(): ApiFetchFn {
    return async (request) => {
        if (request.method !== "GET") throw Object.assign(new Error("EVA queries are GET-only"), { status: 405 });
        if (request.body !== undefined) throw Object.assign(new Error("EVA GET queries do not accept a body"), { status: 400 });
        const path = normalizePath(request.path);
        if (/^\/segments\/[^/]+\/variants$/.test(path)) validateRegionPaging(request.params);
        const result = path === "/releases" || path.startsWith("/releases/") ? await readReleases(path, request.params)
            : path.startsWith("/evidence/") ? await readEvidence(path, request.params)
            : path.startsWith("/identifiers/") ? await readEva(identifierRequest(path, request.params), request.params, EVA_IDENTIFIERS_BASE)
            : await readEva(path, request.params);
        const completeness = evaCompleteness(result.data);
        return { ...result, ...(completeness ? { completeness, upstreamTotal: completeness.total_available ?? null } : {}) };
    };
}
