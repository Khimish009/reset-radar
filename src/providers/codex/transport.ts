/** Isolated transport for the single, unpaginated, owner-approved CodexReset feed.
 * Deliberately source-specific; no fallback, public route or scheduler wiring. */
import type { RuntimeDependencies } from "../../runtime";
import { parseCodexFeed, type CodexFeed } from "./schema";

export const CODEX_FEED_URL = "https://codexreset.ai/api/v1/resets.json";
const MIN_CACHE_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_DATE_MS = 8_640_000_000_000_000;

export type CodexHttpErrorCode =
  | "invalid_request"
  | "timeout"
  | "network_error"
  | "http_error"
  | "rate_limited"
  | "service_unavailable"
  | "invalid_response"
  | "response_too_large"
  | "not_modified_without_snapshot";

export interface CodexHttpSuccess<T> {
  ok: true;
  value: T;
  origin: "network" | "not_modified" | "cache";
  checkedAt: string;
}

export interface CodexHttpFailure<T> {
  ok: false;
  code: CodexHttpErrorCode;
  lastValid: T | null;
  rejected?: {
    payload: unknown;
    sourceUrl: string;
    reason: "schema_rejected";
  };
  retryAt: string;
}

export type CodexHttpResult<T> = CodexHttpSuccess<T> | CodexHttpFailure<T>;

interface CacheEntry {
  value: unknown;
  checkedAt: string;
  expiresAt: number;
  etag?: string;
}

export interface CodexHttpState {
  readonly upstream: typeof CODEX_FEED_URL;
  entries: Map<string, CacheEntry>;
  retryUntil: Map<string, number>;
  failureCounts: Map<string, number>;
  inFlight: Map<string, Promise<CodexHttpResult<unknown>>>;
  throttledUntil: number;
}

export interface CodexTransportOptions {
  timeoutMs?: number;
}

export function createCodexHttpState(): CodexHttpState {
  return { upstream: CODEX_FEED_URL, entries: new Map(), retryUntil: new Map(), failureCounts: new Map(), inFlight: new Map(), throttledUntil: 0 };
}

function retryAfterMs(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    const delay = seconds * 1000;
    return Number.isFinite(delay) && delay <= MAX_DATE_MS - nowMs ? Math.max(MIN_CACHE_MS, delay) : null;
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return null;
  return Math.max(MIN_CACHE_MS, dateMs - nowMs);
}

function fallbackBackoff(failures: number): number {
  return Math.min(MAX_BACKOFF_MS, MIN_CACHE_MS * 2 ** Math.min(failures, 6));
}

function responseTtl(response: Response, nowMs: number): number {
  const cacheControl = response.headers.get("cache-control") ?? "";
  const maxAgeMatch = /(?:^|,)\s*max-age\s*=\s*(?:"(\d+)"|(\d+))/i.exec(cacheControl);
  if (!maxAgeMatch) return 300_000; // Current upstream docs/observed default: five minutes.
  const maxAgeSeconds = Number(maxAgeMatch[1] ?? maxAgeMatch[2]);
  const ageSeconds = Number(response.headers.get("age") ?? "0");
  if (!Number.isFinite(maxAgeSeconds) || !Number.isFinite(ageSeconds)) return MIN_CACHE_MS;
  const ttl = Math.max(MIN_CACHE_MS, (maxAgeSeconds - Math.max(0, ageSeconds)) * 1000);
  return Number.isFinite(ttl) && ttl <= MAX_DATE_MS - nowMs ? ttl : MIN_CACHE_MS;
}

function asIso(ms: number): string {
  return new Date(ms).toISOString();
}

function cancelBody(response: Response): void {
  if (!response.body) return;
  try {
    void response.body.cancel().catch(() => undefined);
  } catch {
    // A response body may already be locked or canceled.
  }
}

type BodyReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "read_error" | "aborted" };

async function readBoundedBody(response: Response, signal: AbortSignal): Promise<BodyReadResult> {
  if (signal.aborted) {
    cancelBody(response);
    return { ok: false, reason: "aborted" };
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    cancelBody(response);
    return { ok: false, reason: "too_large" };
  }
  if (!response.body) return { ok: true, text: "" };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let removeAbortListener: () => void = () => {};
  const aborted = new Promise<"aborted">((resolve) => {
    const onAbort = () => {
      try {
        // Do not await this: an underlying source can leave cancel() pending forever.
        void reader.cancel().catch(() => undefined);
      } catch {
        // The reader can already be closed or canceled.
      }
      resolve("aborted");
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", onAbort);
    if (signal.aborted) onAbort();
  });
  try {
    while (true) {
      if (signal.aborted) return { ok: false, reason: "aborted" };
      const read = reader.read();
      const result = await Promise.race([read, aborted]);
      if (result === "aborted" || signal.aborted) return { ok: false, reason: "aborted" };
      const { done, value } = result;
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        try {
          void reader.cancel().catch(() => undefined);
        } catch {
          // Ignore cancellation failures after the size limit has been reached.
        }
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
    if (signal.aborted) return { ok: false, reason: "aborted" };
  } catch {
    if (signal.aborted) return { ok: false, reason: "aborted" };
    return { ok: false, reason: "read_error" };
  } finally {
    removeAbortListener();
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(combined) };
}

export function createCodexTransport(
  deps: RuntimeDependencies,
  state: CodexHttpState = createCodexHttpState(),
  options: CodexTransportOptions = {},
) {
  const timeoutMs = options.timeoutMs ?? 10_000;

  async function get(): Promise<CodexHttpResult<CodexFeed>> {
    const now = deps.clock.now().getTime();
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647 || state.upstream !== CODEX_FEED_URL) {
      return { ok: false, code: "invalid_request", lastValid: null, retryAt: asIso(now + MIN_CACHE_MS) };
    }

    const key = CODEX_FEED_URL;
    const sourceUrl = CODEX_FEED_URL;
    const cached = state.entries.get(key);
    const lastValid = (cached?.value as CodexFeed | undefined) ?? null;
    const retryAtMs = Math.max(state.throttledUntil, state.retryUntil.get(key) ?? 0);

    if (cached && now < cached.expiresAt) {
      return { ok: true, value: cached.value as CodexFeed, origin: "cache", checkedAt: cached.checkedAt };
    }
    const inFlight = state.inFlight.get(key);
    if (inFlight) return await inFlight as CodexHttpResult<CodexFeed>;
    if (now < retryAtMs) {
      return {
        ok: false,
        code: now < state.throttledUntil ? "rate_limited" : "service_unavailable",
        lastValid,
        retryAt: asIso(retryAtMs),
      };
    }

    const headers = new Headers({
      accept: "application/json",
      "user-agent": "ResetRadar/0.1 (public Codex reset monitoring; local adapter)",
    });
    if (cached?.etag) headers.set("if-none-match", cached.etag);
    const controller = new AbortController();
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const network = (async (): Promise<CodexHttpResult<CodexFeed>> => {
      let response: Response;
      try {
        response = await deps.fetch(sourceUrl, { method: "GET", headers, signal: controller.signal, redirect: "error" });
      } catch {
        return { ok: false, code: "network_error", lastValid, retryAt: asIso(now + fallbackBackoff(1)) };
      }
      if (timedOut) {
        cancelBody(response);
        return { ok: false, code: "timeout", lastValid, retryAt: asIso(deps.clock.now().getTime() + MIN_CACHE_MS) };
      }

      const checkedAt = asIso(deps.clock.now().getTime());
      if (response.status === 304) {
        if (!cached) {
          cancelBody(response);
          return {
            ok: false,
            code: "not_modified_without_snapshot",
            lastValid: null,
            retryAt: asIso(deps.clock.now().getTime() + MIN_CACHE_MS),
          };
        }
        const etag = response.headers.get("etag") ?? cached.etag;
        state.entries.set(key, {
          value: cached.value,
          checkedAt,
          expiresAt: deps.clock.now().getTime() + responseTtl(response, deps.clock.now().getTime()),
          ...(etag ? { etag } : {}),
        });
        state.retryUntil.delete(key);
        state.failureCounts.delete(key);
        cancelBody(response);
        return { ok: true, value: cached.value as CodexFeed, origin: "not_modified", checkedAt };
      }

      if (response.status !== 200) {
        cancelBody(response);
        const currentMs = deps.clock.now().getTime();
        const failures = (state.failureCounts.get(key) ?? 0) + 1;
        state.failureCounts.set(key, failures);
        const retryAt = currentMs + Math.max(retryAfterMs(response.headers.get("retry-after"), currentMs) ?? 0, fallbackBackoff(failures));
        state.retryUntil.set(key, retryAt);
        if (response.status === 429) {
          state.throttledUntil = Math.max(state.throttledUntil, retryAt);
          return { ok: false, code: "rate_limited", lastValid, retryAt: asIso(state.throttledUntil) };
        }
        const code: CodexHttpErrorCode = response.status === 503 ? "service_unavailable" : "http_error";
        return { ok: false, code, lastValid, retryAt: asIso(retryAt) };
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!/^\s*application\/json(?:\s*;|\s*$)/i.test(contentType)) {
        cancelBody(response);
        return { ok: false, code: "invalid_response", lastValid, retryAt: asIso(deps.clock.now().getTime() + MIN_CACHE_MS) };
      }
      const body = await readBoundedBody(response, controller.signal);
      if (timedOut || controller.signal.aborted || (body.ok === false && body.reason === "aborted")) {
        return { ok: false, code: "timeout", lastValid, retryAt: asIso(deps.clock.now().getTime() + MIN_CACHE_MS) };
      }
      if (!body.ok) {
        const code = body.reason === "too_large" ? "response_too_large" : "network_error";
        return { ok: false, code, lastValid, retryAt: asIso(deps.clock.now().getTime() + MIN_CACHE_MS) };
      }

      let payload: unknown;
      try {
        payload = JSON.parse(body.text) as unknown;
      } catch {
        return { ok: false, code: "invalid_response", lastValid, retryAt: asIso(deps.clock.now().getTime() + MIN_CACHE_MS) };
      }

      let value: CodexFeed;
      try {
        value = parseCodexFeed(payload);
      } catch {
        return {
          ok: false,
          code: "invalid_response",
          lastValid,
          rejected: { payload, sourceUrl, reason: "schema_rejected" },
          retryAt: asIso(deps.clock.now().getTime() + MIN_CACHE_MS),
        };
      }

      const afterParseMs = deps.clock.now().getTime();
      if (timedOut || controller.signal.aborted) {
        return { ok: false, code: "timeout", lastValid, retryAt: asIso(afterParseMs + MIN_CACHE_MS) };
      }
      const etag = response.headers.get("etag");
      state.entries.set(key, {
        value,
        checkedAt,
        expiresAt: afterParseMs + responseTtl(response, afterParseMs),
        ...(etag ? { etag } : {}),
      });
      state.retryUntil.delete(key);
      state.failureCounts.delete(key);
      return { ok: true, value, origin: "network", checkedAt };
    })();

    const timeout = new Promise<CodexHttpResult<CodexFeed>>((resolve) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
        resolve({ ok: false, code: "timeout", lastValid, retryAt: asIso(deps.clock.now().getTime() + MIN_CACHE_MS) });
      }, timeoutMs);
    });

    const pending = (async (): Promise<CodexHttpResult<CodexFeed>> => {
      try {
        let result = await Promise.race([network, timeout]);
        if (timedOut) {
          const currentMs = deps.clock.now().getTime();
          const failures = (state.failureCounts.get(key) ?? 0) + 1;
          state.failureCounts.set(key, failures);
          state.retryUntil.set(key, currentMs + fallbackBackoff(failures));
          result = { ok: false, code: "timeout", lastValid, retryAt: asIso(state.retryUntil.get(key) ?? currentMs + MIN_CACHE_MS) };
        } else if (!result.ok && result.code !== "rate_limited") {
          const failureUntil = Date.parse(result.retryAt);
          if (Number.isFinite(failureUntil) && (state.retryUntil.get(key) ?? 0) <= now) {
            const failures = (state.failureCounts.get(key) ?? 0) + 1;
            state.failureCounts.set(key, failures);
            state.retryUntil.set(key, Math.max(failureUntil, deps.clock.now().getTime() + fallbackBackoff(failures)));
          }
          if (Number.isFinite(state.retryUntil.get(key))) {
            result = { ...result, retryAt: asIso(state.retryUntil.get(key) ?? failureUntil) };
          }
        }
        return result;
      } finally {
        state.inFlight.delete(key);
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      }
    })();
    state.inFlight.set(key, pending as Promise<CodexHttpResult<unknown>>);
    return pending;
  }

  return { get };
}
