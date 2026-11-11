import { decodeResponseText, readResponseBytes } from "@bio-mcp/shared/http/response-reader";

/** Read errors as carefully as success; no truncation or unbounded cancellation. */
export async function readEvaBody(response: Response, textAllowed = false): Promise<{ status: number; data: unknown }> {
  let text: string;
  try {
    text = decodeResponseText(await readResponseBytes(response, { label: "EVA", maxBytes: 4 * 1024 * 1024, timeoutMs: 10000 }), "EVA");
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? error.status : 502;
    const message = status === 413 ? "EVA response exceeds 4 MiB; reduce limit or use bulk releases" : status === 504 ? "EVA body read exceeded 10 seconds" : String(error);
    throw Object.assign(new Error(message), { status: response.ok ? status : response.status,
      data: { http_status: response.status, body_unavailable: true, retry_after: response.headers.get("retry-after"), body_error: message } });
  }
  if (!response.ok) throw Object.assign(new Error(`EVA HTTP ${response.status}: ${text.slice(0, 200)}`), { status: response.status, data: text });
  if (response.status !== 200 || response.headers.has("content-range")) throw Object.assign(new Error("EVA returned a partial representation"), { status: 502, data: text });
  if (textAllowed) return { status: response.status, data: text };
  if (!response.headers.get("content-type")?.includes("json")) throw Object.assign(new Error("Expected EVA JSON, not an upstream error page"), { status: 502, data: text });
  try { return { status: response.status, data: JSON.parse(text.replace(/^\uFEFF/, "")) }; }
  catch { throw Object.assign(new Error("EVA returned malformed JSON"), { status: 502, data: text }); }
}

/** Fixed-host release reads keep independent 10-second header/body budgets. */
export async function fetchEvaListing(url: string): Promise<{ status: number; data: unknown }> {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const pending = fetch(url, { redirect: "manual", signal: controller.signal, headers: { Accept: "text/html" } });
    void pending.then(late => { if (controller.signal.aborted) void late.body?.cancel().catch(() => {}); }, () => {});
    const response = await Promise.race([pending, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error("EVA listing headers exceeded 10 seconds"), { status: 504 })); }, 10000);
    })]);
    if (timer !== undefined) clearTimeout(timer);
    return await readEvaBody(response, true);
  } finally { if (timer !== undefined) clearTimeout(timer); controller.abort(); }
}
