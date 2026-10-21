import { describe, expect, it, vi } from "vitest";
import { createClaudeHttpState, createClaudeTransport, type ClaudeEndpoint, type ClaudeHttpResult } from "../src/providers/claude/transport";
import type { RuntimeDependencies } from "../src/runtime";
import { createLogger } from "../src/utils/logging";

function harness(fetch: RuntimeDependencies["fetch"], start = Date.UTC(2026, 0, 1)) {
  let now = start;
  const deps: RuntimeDependencies = {
    clock: { now: () => new Date(now) },
    fetch,
    logger: createLogger(() => undefined),
  };
  return { deps, now: () => now, advance: (ms: number) => { now += ms; } };
}

function jsonResponse(payload: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", ...headers } });
}

const parseObject = (payload: unknown) => {
  if (typeof payload !== "object" || payload === null) throw new Error("invalid");
  return payload as { value?: string };
};

function failure<T>(result: ClaudeHttpResult<T>) {
  if (result.ok) throw new Error("Expected transport failure");
  return result;
}

describe("Claude HTTP transport", () => {
  it("shares the final failure/backoff result with concurrent callers", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValue(jsonResponse(null));
    const h = harness(fetch);
    const state = createClaudeHttpState();
    const transport = createClaudeTransport(h.deps, state);
    const [a, b] = await Promise.all([
      transport.get("status", new URLSearchParams(), parseObject),
      transport.get("status", new URLSearchParams(), parseObject),
    ]);
    expect(a).toEqual(b);
    expect(failure(a).retryAt).toBe(new Date(state.retryUntil.get("status?")!).toISOString());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects overflowing HTTP delay headers without throwing or creating an immortal cache", async () => {
    const giant = "9".repeat(100);
    const fetch = vi.fn<RuntimeDependencies["fetch"]>()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": giant } }))
      .mockResolvedValueOnce(jsonResponse({ value: "saved" }, { "Cache-Control": `max-age=${giant}` }))
      .mockResolvedValueOnce(jsonResponse({ value: "fresh" }));
    const h = harness(fetch);
    const transport = createClaudeTransport(h.deps);
    const failed = failure(await transport.get("status", new URLSearchParams(), parseObject));
    expect(Number.isFinite(Date.parse(failed.retryAt))).toBe(true);
    h.advance(Date.parse(failed.retryAt) - h.now());
    expect(await transport.get("status", new URLSearchParams(), parseObject)).toMatchObject({ ok: true });
    h.advance(60_000);
    expect(await transport.get("status", new URLSearchParams(), parseObject)).toMatchObject({ ok: true, origin: "network", value: { value: "fresh" } });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("keys cache and validators by endpoint and canonical query, with a 60 second minimum", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>()
      .mockResolvedValueOnce(jsonResponse({ value: "one" }, { etag: '"one"', "cache-control": "max-age=5" }))
      .mockResolvedValueOnce(jsonResponse({ value: "two" }))
      .mockResolvedValueOnce(jsonResponse({ value: "three" }));
    const h = harness(fetch);
    const transport = createClaudeTransport(h.deps);
    const first = await transport.get("resets", new URLSearchParams("b=2&a=1"), parseObject);
    expect(first).toMatchObject({ ok: true, origin: "network", value: { value: "one" } });
    expect(fetch.mock.calls[0]?.[1]?.redirect).toBe("error");
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("user-agent")).toBe("ResetRadar/0.1 (public Claude reset monitoring; local adapter)");
    const cached = await transport.get("resets", new URLSearchParams("a=1&b=2"), parseObject);
    expect(cached).toMatchObject({ ok: true, origin: "cache" });
    await transport.get("resets", new URLSearchParams("a=1"), parseObject);
    await transport.get("status", new URLSearchParams("a=1&b=2"), parseObject);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://clauderesets.com/api/v1/resets?a=1&b=2",
      "https://clauderesets.com/api/v1/resets?a=1",
      "https://clauderesets.com/api/v1/status?a=1&b=2",
    ]);
    h.advance(59_999);
    const nearExpiry = await transport.get("resets", new URLSearchParams("a=1&b=2"), parseObject);
    expect(nearExpiry.ok && nearExpiry.origin).toBe("cache");
    h.advance(1);
    fetch.mockResolvedValueOnce(jsonResponse({ value: "fresh" }));
    expect(await transport.get("resets", new URLSearchParams("a=1&b=2"), parseObject)).toMatchObject({ ok: true, origin: "network", value: { value: "fresh" } });
  });

  it("honors larger Cache-Control max-age adjusted by Age and defaults sources to five minutes", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>()
      .mockResolvedValueOnce(jsonResponse({ value: "long" }, { "cache-control": "public, max-age=180", age: "30" }))
      .mockResolvedValueOnce(jsonResponse({ value: "refreshed" }))
      .mockResolvedValueOnce(jsonResponse({ value: "sources" }));
    const h = harness(fetch);
    const transport = createClaudeTransport(h.deps);
    await transport.get("status", new URLSearchParams(), parseObject);
    h.advance(149_999);
    const cachedStatus = await transport.get("status", new URLSearchParams(), parseObject);
    expect(cachedStatus.ok && cachedStatus.origin).toBe("cache");
    h.advance(1);
    const refreshedStatus = await transport.get("status", new URLSearchParams(), parseObject);
    expect(refreshedStatus.ok && refreshedStatus.origin).toBe("network");
    await transport.get("sources", new URLSearchParams(), parseObject);
    h.advance(299_999);
    const cachedSources = await transport.get("sources", new URLSearchParams(), parseObject);
    expect(cachedSources.ok && cachedSources.origin).toBe("cache");
  });

  it("uses ETag for conditional requests and handles 304 with or without a replacement validator", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>()
      .mockResolvedValueOnce(jsonResponse({ value: "saved" }, { etag: '"old"' }))
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: { "cache-control": "max-age=90" } }))
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: { etag: '"new"' } }));
    const h = harness(fetch);
    const state = createClaudeHttpState();
    const transport = createClaudeTransport(h.deps, state);
    const query = new URLSearchParams();
    await transport.get("resets", query, parseObject);
    h.advance(60_000);
    expect(await transport.get("resets", query, parseObject)).toMatchObject({ ok: true, origin: "not_modified", value: { value: "saved" } });
    expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({});
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get("if-none-match")).toBe('"old"');
    h.advance(90_000);
    await transport.get("resets", query, parseObject);
    expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get("if-none-match")).toBe('"old"');
    expect(state.entries.get("resets?")?.etag).toBe('"new"');
  });

  it("rejects a 304 without a valid saved representation", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValue(new Response(null, { status: 304 }));
    const h = harness(fetch);
    const result = await createClaudeTransport(h.deps).get("status", new URLSearchParams(), parseObject);
    expect(result).toMatchObject({ ok: false, code: "not_modified_without_snapshot", lastValid: null });
  });

  it("retains the last valid snapshot for invalid JSON and schema rejection", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>()
      .mockResolvedValueOnce(jsonResponse({ value: "valid" }))
      .mockResolvedValueOnce(new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(jsonResponse({ value: "bad" }));
    const h = harness(fetch);
    const state = createClaudeHttpState();
    const transport = createClaudeTransport(h.deps, state);
    const query = new URLSearchParams();
    await transport.get("resets", query, parseObject);
    h.advance(60_000);
    const invalidJson = await transport.get("resets", query, parseObject);
    expect(invalidJson).toMatchObject({ ok: false, code: "invalid_response", lastValid: { value: "valid" } });
    h.advance(120_000);
    const reject = await transport.get("resets", query, () => { throw new Error("schema detail must not escape"); });
    expect(reject).toMatchObject({ ok: false, code: "invalid_response", lastValid: { value: "valid" }, rejected: { payload: { value: "bad" }, sourceUrl: "https://clauderesets.com/api/v1/resets", reason: "schema_rejected" } });
    expect(Date.parse(failure(reject).retryAt)).toBeGreaterThan(Date.parse(failure(invalidJson).retryAt));
    expect(Date.parse(failure(reject).retryAt)).toBe(state.retryUntil.get("resets?"));
    expect(state.entries.get("resets?")?.value).toEqual({ value: "valid" });
  });

  it("coalesces simultaneous same-key requests across transports sharing state", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetch = vi.fn<RuntimeDependencies["fetch"]>(() => new Promise((resolve) => { resolveFetch = resolve; }));
    const h = harness(fetch);
    const state = createClaudeHttpState();
    const one = createClaudeTransport(h.deps, state);
    const two = createClaudeTransport(h.deps, state);
    const query = new URLSearchParams("b=2&a=1");
    const first = one.get("resets", query, parseObject);
    const second = two.get("resets", new URLSearchParams("a=1&b=2"), parseObject);
    expect(fetch).toHaveBeenCalledTimes(1);
    resolveFetch(jsonResponse({ value: "once" }));
    expect(await first).toMatchObject({ ok: true, origin: "network", value: { value: "once" } });
    expect(await second).toMatchObject({ ok: true, origin: "network", value: { value: "once" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("requires application/json and rejects every status except 200 and 304", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>()
      .mockResolvedValueOnce(new Response('{"value":"not accepted"}', { status: 200, headers: { "content-type": "text/plain" } }))
      .mockResolvedValueOnce(jsonResponse({ value: "created" }, {}, 201));
    const h = harness(fetch);
    const transport = createClaudeTransport(h.deps);
    const query = new URLSearchParams();
    expect(await transport.get("status", query, parseObject)).toMatchObject({ ok: false, code: "invalid_response", lastValid: null });
    h.advance(120_000);
    expect(await transport.get("status", query, parseObject)).toMatchObject({ ok: false, code: "http_error", lastValid: null });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("bounds successful response bodies using Content-Length and streaming byte count", async () => {
    const tooLong = new Response(new ReadableStream({ pull() {} }), {
      status: 200,
      headers: { "content-type": "application/json", "content-length": String(2 * 1024 * 1024 + 1) },
    });
    const tooWide = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
        controller.close();
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
    const fetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValueOnce(tooLong).mockResolvedValueOnce(tooWide);
    const h = harness(fetch);
    const transport = createClaudeTransport(h.deps);
    const query = new URLSearchParams();
    expect(await transport.get("status", query, parseObject)).toMatchObject({ ok: false, code: "response_too_large" });
    h.advance(120_000);
    expect(await transport.get("status", query, parseObject)).toMatchObject({ ok: false, code: "response_too_large" });
  });

  it.each([
    ["429 seconds", 429, { "retry-after": "2" }, "rate_limited"],
    ["429 date", 429, { "retry-after": "Thu, 01 Jan 2026 00:02:00 GMT" }, "rate_limited"],
    ["503 seconds", 503, { "retry-after": "2" }, "service_unavailable"],
    ["503 date", 503, { "retry-after": "Thu, 01 Jan 2026 00:02:00 GMT" }, "service_unavailable"],
  ] as const)("honors Retry-After for %s and applies a minimum cooldown", async (_label, status, headers, code) => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValue(jsonResponse({}, headers, status));
    const h = harness(fetch);
    const state = createClaudeHttpState();
    const transport = createClaudeTransport(h.deps, state);
    const query = new URLSearchParams();
    const result = await transport.get("status", query, parseObject);
    expect(result).toMatchObject({ ok: false, code });
    const retryAt = Date.parse((result as { retryAt: string }).retryAt);
    expect(retryAt - h.now()).toBeGreaterThanOrEqual(60_000);
    expect(await transport.get("status", query, parseObject)).toMatchObject({ ok: false, code });
    if (status === 429) {
      expect(await transport.get("sources", query, parseObject)).toMatchObject({ ok: false, code: "rate_limited" });
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("times out a fetch that ignores AbortSignal and a body that stalls", async () => {
    vi.useFakeTimers();
    try {
      const stalledFetch = vi.fn<RuntimeDependencies["fetch"]>(() => new Promise(() => undefined));
      const h = harness(stalledFetch);
      const transport = createClaudeTransport(h.deps, createClaudeHttpState(), { timeoutMs: 25 });
      const pending = transport.get("status", new URLSearchParams(), parseObject);
      await vi.advanceTimersByTimeAsync(25);
      const timeoutResult = await pending;
      expect(timeoutResult).toMatchObject({ ok: false, code: "timeout" });
      expect(Date.parse(failure(timeoutResult).retryAt) - h.now()).toBe(120_000);

      const bodyFetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValue(new Response(new ReadableStream({ pull() {} }), { headers: { "content-type": "application/json" } }));
      const h2 = harness(bodyFetch);
      const pendingBody = createClaudeTransport(h2.deps, createClaudeHttpState(), { timeoutMs: 25 }).get("status", new URLSearchParams(), parseObject);
      await vi.advanceTimersByTimeAsync(25);
      const timeoutBodyResult = await pendingBody;
      expect(timeoutBodyResult).toMatchObject({ ok: false, code: "timeout" });
      expect(Date.parse(failure(timeoutBodyResult).retryAt) - h2.now()).toBe(120_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not accept user-controlled endpoint strings or invalid timeout options", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>();
    const h = harness(fetch);
    const transport = createClaudeTransport(h.deps, createClaudeHttpState(), { timeoutMs: Number.NaN });
    const result = await transport.get("status" as ClaudeEndpoint, new URLSearchParams(), parseObject);
    expect(result).toMatchObject({ ok: false, code: "invalid_request" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
