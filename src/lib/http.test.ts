import { afterEach, expect, it, vi } from "vitest";
import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import { EVA_IDENTIFIERS_BASE, readEva } from "./http";

vi.mock("@bio-mcp/shared/http/rest-fetch", () => ({ restFetch: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });

it("retains native envelopes and routes identifier reads to their own service", async () => {
  const data = { response: [{ result: [{ accession: 17870277, taxonomy: 9615 }] }], errors: [] };
  vi.mocked(restFetch).mockResolvedValue(Response.json(data));
  expect(await readEva("/clustered-variants/17870277", undefined, EVA_IDENTIFIERS_BASE)).toEqual({ status: 200, data });
  expect(restFetch).toHaveBeenCalledWith(EVA_IDENTIFIERS_BASE, "/clustered-variants/17870277", undefined, expect.objectContaining({ deadlineMs: 25000 }));
});

it("retains non-JSON evidence as a failure and preserves HTTP failure bodies", async () => {
  vi.mocked(restFetch).mockResolvedValueOnce(new Response("<error>provider</error>"));
  await expect(readEva("/example")).rejects.toMatchObject({ status: 502, data: "<error>provider</error>" });
  vi.mocked(restFetch).mockResolvedValueOnce(new Response("try later", { status: 429 }));
  await expect(readEva("/example")).rejects.toMatchObject({ status: 429, data: "try later" });
});

it("rejects oversized UTF-8 responses instead of silently truncating evidence", async () => {
  vi.mocked(restFetch).mockResolvedValue(new Response("é".repeat(2100000)));
  await expect(readEva("/example")).rejects.toThrow("4 MiB");
});

it("bounds a stalled stream as well as the initial request", async () => {
  vi.useFakeTimers();
  vi.mocked(restFetch).mockResolvedValue(new Response(new ReadableStream({ start() {} })));
  const assertion = expect(readEva("/example")).rejects.toThrow("10 seconds");
  await vi.advanceTimersByTimeAsync(10001); await assertion;
});
