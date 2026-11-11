import { afterEach, expect, it, vi } from "vitest";
import { fetchEvaListing, readEvaBody } from "./response";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it.each([
  ["<html>failure</html>", 200, {}], ["{broken", 200, { "content-type": "application/json" }],
  ['{"response":[]}', 206, { "content-type": "application/json" }],
  ['{"response":[]}', 200, { "content-type": "application/json", "content-range": "bytes 0-14/99" }],
])("retains complete malformed/non-JSON/partial evidence %s", async (text, status, headers) => {
  await expect(readEvaBody(new Response(text, { status, headers }))).rejects.toMatchObject({ status: 502, data: text });
});

it("retains a complete Beacon failure body instead of interpreting exists:false as absence", async () => {
  const text = JSON.stringify({ exists: false, error: { errorCode: 500, errorMessage: "β".repeat(5000) } });
  await expect(readEvaBody(new Response(text, { status: 500 }))).rejects.toMatchObject({ status: 500, data: text });
});

it("preserves failed HTTP status and Retry-After when the body stalls without awaiting cancel", async () => {
  vi.useFakeTimers(); const cancel = vi.fn(() => new Promise<void>(() => {}));
  const pending = expect(readEvaBody(new Response(new ReadableStream({ cancel }), { status: 429, headers: { "retry-after": "60" } })))
    .rejects.toMatchObject({ status: 429, data: { http_status: 429, body_unavailable: true, retry_after: "60" } });
  await vi.advanceTimersByTimeAsync(10001); await pending;
  expect(cancel).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});

it("bounds uncooperative listing headers and cancels a late body", async () => {
  vi.useFakeTimers(); let resolve!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  const pending = expect(fetchEvaListing("https://ftp.ebi.ac.uk/example/")).rejects.toMatchObject({ status: 504 });
  await vi.advanceTimersByTimeAsync(10001); await pending;
  const cancel = vi.fn(); resolve(new Response(new ReadableStream({ cancel })));
  await Promise.resolve(); expect(cancel).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});

it("rejects advertised and streamed oversize bodies, plus malformed UTF-8", async () => {
  for (const response of [new Response("small", { headers: { "content-length": "4194305" } }), new Response("é".repeat(2100000))])
    await expect(readEvaBody(response)).rejects.toMatchObject({ status: 413, data: { body_unavailable: true } });
  await expect(readEvaBody(new Response(new Uint8Array([0xc3, 0x28])))).rejects.toMatchObject({ status: 502, data: { body_unavailable: true } });
});

it("accepts a BOM while preserving empty alleles and zero measurements", async () => {
  const native = [{ accession: 1, data: { alternateAllele: "", start: 0, validated: false } }];
  expect(await readEvaBody(new Response("\uFEFF" + JSON.stringify(native), { headers: { "content-type": "application/json" } }))).toEqual({ status: 200, data: native });
});
