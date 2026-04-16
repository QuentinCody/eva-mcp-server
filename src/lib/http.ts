import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const EVA_BASE = "https://www.ebi.ac.uk/eva/webservices/rest/v1";

export interface EvaFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
}

/**
 * Fetch from the European Variation Archive REST API.
 * Wraps responses in {response:[{result:[...]}]} — callers unwrap downstream.
 */
export async function evaFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: EvaFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? EVA_BASE;
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(baseUrl, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503, 504],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent: "eva-mcp-server/1.0 (bio-mcp)",
    });
}
