import { describe, expect, it, vi, type MockInstance } from "vitest";
import { createCodexHttpState, createCodexTransport, type CodexHttpResult } from "../src/providers/codex/transport";
import { createClaudeHttpState, createClaudeTransport } from "../src/providers/claude/transport";
import { parseClaudePage } from "../src/providers/claude/schema";
import { codexFeed } from "./fixtures/codex";
import { syntheticPage } from "./fixtures/claude";
import type { RuntimeDependencies } from "../src/runtime";
import { createLogger } from "../src/utils/logging";

const SOURCE_URL = "https://codexreset.ai/api/v1/resets.json";

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

function failure<T>(result: CodexHttpResult<T>) {
  if (result.ok) throw new Error("Expected transport failure");
  return result;
}

describe("Codex HTTP transport", () => {
  it("rejects overflowing Cache-Control and Age headers without an immortal cache", async () => {
    const giant = "9".repeat(400);
    for (const headers of [
      { "cache-control": `max-age=${giant}` },
      { "cache-control": "max-age=300", age: giant },
    ]) {
      const fetch = vi.fn<RuntimeDependencies["fetch"]>()
        .mockResolvedValueOnce(jsonResponse(codexFeed(), headers))
        .mockResolvedValueOnce(jsonResponse(codexFeed()));
      const h = harness(fetch);
      const transport = createCodexTransport(h.deps);
      await expect(transport.get()).resolves.toMatchObject({ ok: true });
      h.advance(60_000);
      await expect(transport.get()).resolves.toMatchObject({ ok: true, origin: "network" });
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  });

  it("uses the fixed selected feed URL and never adds queries or pagination", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValue(jsonResponse(codexFeed()));
    const result = await createCodexTransport(harness(fetch).deps).get();
    expect(result).toMatchObject({ ok: true, origin: "network" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0]?.[0])).toBe(SOURCE_URL);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "error" });
    expect(new URL(String(fetch.mock.calls[0]?.[0])).search).toBe("");
  });

  it("coalesces concurrent same-state requests and isolates separate state instances", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetch = vi.fn<RuntimeDependencies["fetch"]>(() => new Promise((resolve) => { resolveFetch = resolve; }));
    const h = harness(fetch);
    const state = createCodexHttpState();
    const one = createCodexTransport(h.deps, state);
    const two = createCodexTransport(h.deps, state);
    const first = one.get();
    const second = two.get();
    expect(fetch).toHaveBeenCalledOnce();
    resolveFetch(jsonResponse(codexFeed()));
    await expect(first).resolves.toMatchObject({ ok: true, origin: "network" });
    await expect(second).resolves.toMatchObject({ ok: true, origin: "network" });
    expect(state.inFlight.size).toBe(0);

    const isolatedFetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValue(jsonResponse(codexFeed()));
    await createCodexTransport(harness(isolatedFetch).deps, createCodexHttpState()).get();
    expect(isolatedFetch).toHaveBeenCalledOnce();
  });

  it("caches for at least 60 seconds, defaults to 300 seconds, and applies max-age minus Age", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>()
      .mockResolvedValueOnce(jsonResponse(codexFeed(), { "cache-control": "public, max-age=30, s-maxage=900" }))
      .mockResolvedValueOnce(jsonResponse(codexFeed(), { "cache-control": "public, max-age=180, s-maxage=900", age: "30" }))
      .mockResolvedValueOnce(jsonResponse(codexFeed()));
    const h = harness(fetch);
    const transport = createCodexTransport(h.deps);

    await transport.get();
    h.advance(59_999);
    expect(await transport.get()).toMatchObject({ ok: true, origin: "cache" });
    h.advance(1);
    expect(await transport.get()).toMatchObject({ ok: true, origin: "network" });
    h.advance(149_999);
    expect(await transport.get()).toMatchObject({ ok: true, origin: "cache" });
    h.advance(1);
    expect(await transport.get()).toMatchObject({ ok: true, origin: "network" });
    h.advance(299_999);
    expect(await transport.get()).toMatchObject({ ok: true, origin: "cache" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("uses ETag and accepts 304 with a snapshot even when it has no validator", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>()
      .mockResolvedValueOnce(jsonResponse(codexFeed(), { etag: '"codex-v1"', "cache-control": "max-age=60" }))
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: { "cache-control": "max-age=60" } }))
      .mockResolvedValueOnce(jsonResponse(codexFeed({ generated_at: "2026-01-01T00:05:00Z" })));
    const h = harness(fetch);
    const state = createCodexHttpState();
    const transport = createCodexTransport(h.deps, state);
    await transport.get();
    h.advance(60_000);
    expect(await transport.get()).toMatchObject({ ok: true, origin: "not_modified" });
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get("if-none-match")).toBe('"codex-v1"');
    expect(state.entries.get(SOURCE_URL)?.etag).toBe('"codex-v1"');
    h.advance(60_000);
    await transport.get();
    expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get("if-none-match")).toBe('"codex-v1"');
  });

  it("fails a 304 without a snapshot and never creates a cache entry", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValue(new Response(null, { status: 304 }));
    const state = createCodexHttpState();
    const result = await createCodexTransport(harness(fetch).deps, state).get();
    expect(result).toMatchObject({ ok: false, code: "not_modified_without_snapshot", lastValid: null });
    expect(state.entries.has(SOURCE_URL)).toBe(false);
  });

  it("accepts 304 for an expired snapshot that has no validator", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValue(new Response(null, { status: 304 }));
    const state = createCodexHttpState();
    const snapshot = codexFeed();
    state.entries.set(SOURCE_URL, { value: snapshot, checkedAt: "2025-12-31T23:00:00.000Z", expiresAt: 0 });
    const result = await createCodexTransport(harness(fetch).deps, state).get();
    expect(result).toMatchObject({ ok: true, origin: "not_modified", value: snapshot });
    expect(fetch).toHaveBeenCalledOnce();
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has("if-none-match")).toBe(false);
  });

  it("drops an old ETag after a successful 200 response that omits a validator", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>()
      .mockResolvedValueOnce(jsonResponse(codexFeed(), { etag: '"old"', "cache-control": "max-age=60" }))
      .mockResolvedValueOnce(jsonResponse(codexFeed({ generated_at: "2026-01-01T00:01:00Z" }), { "cache-control": "max-age=60" }))
      .mockResolvedValueOnce(jsonResponse(codexFeed({ generated_at: "2026-01-01T00:02:00Z" })));
    const h = harness(fetch);
    const state = createCodexHttpState();
    const transport = createCodexTransport(h.deps, state);
    await transport.get();
    h.advance(60_000);
    await transport.get();
    expect(state.entries.get(SOURCE_URL)?.etag).toBeUndefined();
    h.advance(60_000);
    await transport.get();
    expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).has("if-none-match")).toBe(false);
  });

  it("keeps the previous snapshot on schema drift and retains rejected payload as internal provenance", async () => {
    const drift = { ...codexFeed(), unexpected_stage3_field: "SYNTHETIC drift" };
    const fetch = vi.fn<RuntimeDependencies["fetch"]>()
      .mockResolvedValueOnce(jsonResponse(codexFeed(), { etag: '"valid"', "cache-control": "max-age=60" }))
      .mockResolvedValueOnce(jsonResponse(drift, { etag: '"drift"' }));
    const h = harness(fetch);
    const state = createCodexHttpState();
    const transport = createCodexTransport(h.deps, state);
    const valid = await transport.get();
    h.advance(60_000);
    const rejected = await transport.get();
    expect(rejected).toMatchObject({
      ok: false,
      code: "invalid_response",
      lastValid: valid.ok ? valid.value : null,
      rejected: { payload: drift, sourceUrl: SOURCE_URL, reason: "schema_rejected" },
    });
    expect(state.entries.get(SOURCE_URL)?.value).toBe(valid.ok ? valid.value : undefined);
    expect(state.entries.get(SOURCE_URL)?.etag).toBe('"valid"');
  });

  it("rejects non-JSON, malformed JSON, oversized length headers, and oversized streamed bodies", async () => {
    const tooWide = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
        controller.close();
      },
    }), { headers: { "content-type": "application/json" } });
    const tooLong = new Response("{}", {
      headers: { "content-type": "application/json", "content-length": String(2 * 1024 * 1024 + 1) },
    });
    const fetch = vi.fn<RuntimeDependencies["fetch"]>()
      .mockResolvedValueOnce(new Response(JSON.stringify(codexFeed()), { headers: { "content-type": "text/plain" } }))
      .mockResolvedValueOnce(new Response("{broken", { headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(tooLong)
      .mockResolvedValueOnce(tooWide);
    const h = harness(fetch);
    const transport = createCodexTransport(h.deps);
    let previous = failure(await transport.get());
    expect(previous).toMatchObject({ ok: false, code: "invalid_response" });
    for (const expected of ["invalid_response", "response_too_large", "response_too_large"]) {
      h.advance(Date.parse(previous.retryAt) - h.now());
      const current = await transport.get();
      expect(current).toMatchObject({ ok: false, code: expected });
      previous = failure(current);
    }
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["429 seconds", 429, { "retry-after": "2" }, "rate_limited"],
    ["429 HTTP date", 429, { "retry-after": "Thu, 01 Jan 2026 00:02:00 GMT" }, "rate_limited"],
    ["503 seconds", 503, { "retry-after": "2" }, "service_unavailable"],
    ["503 HTTP date", 503, { "retry-after": "Thu, 01 Jan 2026 00:02:00 GMT" }, "service_unavailable"],
  ] as const)("honors Retry-After and minimum cooldown for %s", async (_label, status, headers, code) => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValue(jsonResponse({}, headers, status));
    const h = harness(fetch);
    const state = createCodexHttpState();
    const result = await createCodexTransport(h.deps, state).get();
    expect(result).toMatchObject({ ok: false, code });
    const retryAt = Date.parse(failure(result).retryAt);
    expect(retryAt - h.now()).toBeGreaterThanOrEqual(60_000);
    expect(await createCodexTransport(h.deps, state).get()).toMatchObject({ ok: false, code });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("caps backoff after repeated failures and clamps unrepresentable Retry-After values", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>();
    const h = harness(fetch);
    const state = createCodexHttpState();
    const transport = createCodexTransport(h.deps, state);
    for (let count = 0; count < 12; count += 1) {
      fetch.mockResolvedValueOnce(new Response(null, { status: 503, headers: { "retry-after": "999999999999999999999999999999999999" } }));
      const result = await transport.get();
      expect(result).toMatchObject({ ok: false, code: "service_unavailable" });
      expect(Number.isFinite(Date.parse(failure(result).retryAt))).toBe(true);
      h.advance(Date.parse(failure(result).retryAt) - h.now());
    }
    expect(state.failureCounts.get(SOURCE_URL)).toBe(12);
    expect(state.retryUntil.get(SOURCE_URL)).toBeLessThanOrEqual(h.now() + 60 * 60_000);
  });

  it("returns network failures with backoff and preserves the last valid snapshot", async () => {
    const fetch = vi.fn<RuntimeDependencies["fetch"]>()
      .mockResolvedValueOnce(jsonResponse(codexFeed(), { "cache-control": "max-age=60" }))
      .mockRejectedValueOnce(new Error("SYNTHETIC network failure"));
    const h = harness(fetch);
    const state = createCodexHttpState();
    const transport = createCodexTransport(h.deps, state);
    const valid = await transport.get();
    h.advance(60_000);
    const networkFailure = await transport.get();
    expect(networkFailure).toMatchObject({ ok: false, code: "network_error", lastValid: valid.ok ? valid.value : null });
    expect(Date.parse(failure(networkFailure).retryAt)).toBeGreaterThan(h.now());
  });

  it("isolates Codex failures and cache from independently executed Claude transport", async () => {
    const codexFetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValue(jsonResponse({}, {}, 503));
    const claudeFetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValue(jsonResponse(syntheticPage()));
    const clock = { now: () => new Date(Date.UTC(2026, 0, 1)) };
    const codex = createCodexTransport({ clock, fetch: codexFetch, logger: createLogger(() => undefined) }, createCodexHttpState());
    const claude = createClaudeTransport({ clock, fetch: claudeFetch, logger: createLogger(() => undefined) }, createClaudeHttpState());
    expect(await codex.get()).toMatchObject({ ok: false, code: "service_unavailable" });
    expect(await claude.get("resets", new URLSearchParams(), parseClaudePage)).toMatchObject({ ok: true, origin: "network" });
    expect(await claude.get("resets", new URLSearchParams(), parseClaudePage)).toMatchObject({ ok: true, origin: "cache" });
    expect(codexFetch).toHaveBeenCalledOnce();
    expect(claudeFetch).toHaveBeenCalledOnce();
  });

  it("times out signal-ignoring fetches and cancels a stalled body reader", async () => {
    vi.useFakeTimers();
    try {
      const stalledFetch = vi.fn<RuntimeDependencies["fetch"]>(() => new Promise(() => undefined));
      const h = harness(stalledFetch);
      const state = createCodexHttpState();
      const pending = createCodexTransport(h.deps, state, { timeoutMs: 25 }).get();
      await vi.advanceTimersByTimeAsync(25);
      expect(await pending).toMatchObject({ ok: false, code: "timeout" });
      expect(stalledFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(state.inFlight.size).toBe(0);

      let cancelCalled = false;
      const body = new ReadableStream<Uint8Array>({
        pull() {},
        cancel() {
          cancelCalled = true;
          return new Promise<void>(() => undefined);
        },
      });
      const bodyFetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValue(new Response(body, { headers: { "content-type": "application/json" } }));
      const h2 = harness(bodyFetch);
      const state2 = createCodexHttpState();
      const pendingBody = createCodexTransport(h2.deps, state2, { timeoutMs: 25 }).get();
      await vi.advanceTimersByTimeAsync(25);
      await expect(pendingBody).resolves.toMatchObject({ ok: false, code: "timeout" });
      expect(bodyFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(cancelCalled).toBe(true);
      expect(body.locked).toBe(false);
      expect(state2.inFlight.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([false, true])("removes the abort listener and reader lock after read error=%s", async (readError) => {
    const response = readError
      ? new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.error(new Error("SYNTHETIC read error")); },
      }), { headers: { "content-type": "application/json" } })
      : jsonResponse(codexFeed());
    let signal: AbortSignal | undefined;
    let add: MockInstance<AbortSignal["addEventListener"]> | undefined;
    let remove: MockInstance<AbortSignal["removeEventListener"]> | undefined;
    const fetch = vi.fn<RuntimeDependencies["fetch"]>(async (_input, init) => {
      signal = init?.signal ?? undefined;
      if (!signal) throw new Error("Expected managed request signal");
      add = vi.spyOn(signal, "addEventListener");
      remove = vi.spyOn(signal, "removeEventListener");
      return response;
    });
    const result = await createCodexTransport(harness(fetch).deps).get();
    expect(result.ok).toBe(!readError);
    expect(response.body?.locked).toBe(false);
    const listener = add?.mock.calls.find(([event]) => event === "abort")?.[1];
    expect(listener).toBeTypeOf("function");
    expect(remove).toHaveBeenCalledWith("abort", listener);
    expect(signal?.aborted).toBe(false);
  });

  it("contains rejected and hanging cancellation promises without unhandled rejections", async () => {
    vi.useFakeTimers();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const bodies = [
        new ReadableStream<Uint8Array>({ pull() {}, cancel() { return Promise.reject(new Error("SYNTHETIC cancel rejection")); } }),
        new ReadableStream<Uint8Array>({ pull() {}, cancel() { return new Promise<void>(() => undefined); } }),
      ];
      for (const body of bodies) {
        const fetch = vi.fn<RuntimeDependencies["fetch"]>().mockResolvedValue(new Response(body, { headers: { "content-type": "application/json" } }));
        const h = harness(fetch);
        const pending = createCodexTransport(h.deps, createCodexHttpState(), { timeoutMs: 10 }).get();
        await vi.advanceTimersByTimeAsync(10);
        await expect(pending).resolves.toMatchObject({ ok: false, code: "timeout" });
        expect(body.locked).toBe(false);
      }
      await vi.waitFor(() => expect(unhandled).not.toHaveBeenCalled());
    } finally {
      process.off("unhandledRejection", unhandled);
      vi.useRealTimers();
    }
  });

  it("does not parse or cache a late response after timeout", async () => {
    vi.useFakeTimers();
    try {
      let resolveFetch!: (response: Response) => void;
      const fetch = vi.fn<RuntimeDependencies["fetch"]>(() => new Promise((resolve) => { resolveFetch = resolve; }));
      const h = harness(fetch);
      const state = createCodexHttpState();
      const transport = createCodexTransport(h.deps, state, { timeoutMs: 25 });
      const pending = transport.get();
      await vi.advanceTimersByTimeAsync(25);
      await expect(pending).resolves.toMatchObject({ ok: false, code: "timeout" });
      const cancel = vi.fn();
      const lateBody = new ReadableStream<Uint8Array>({ cancel });
      resolveFetch(new Response(lateBody, { headers: { "content-type": "application/json" } }));
      await vi.advanceTimersByTimeAsync(0);
      expect(cancel).toHaveBeenCalledOnce();
      expect(lateBody.locked).toBe(false);
      expect(state.entries.has(SOURCE_URL)).toBe(false);
      expect(state.inFlight.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
