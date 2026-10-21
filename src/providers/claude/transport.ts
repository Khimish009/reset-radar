import type { RuntimeDependencies } from "../../runtime";

const BASE_URL = "https://clauderesets.com/api/v1/";
const MIN_CACHE_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_DATE_MS = 8_640_000_000_000_000;

export type ClaudeEndpoint = "status" | "resets" | "sources";

export type ClaudeHttpErrorCode =
  | "invalid_request"
  | "timeout"
  | "network_error"
  | "http_error"
  | "rate_limited"
  | "service_unavailable"
  | "invalid_response"
  | "response_too_large"
  | "not_modified_without_snapshot";

export interface ClaudeHttpSuccess<T> {
  ok: true;
  value: T;
  origin: "network" | "not_modified" | "cache";
  checkedAt: string;
}

export interface ClaudeHttpFailure<T> {
  ok: false;
  code: ClaudeHttpErrorCode;
  lastValid: T | null;
  rejected?: {
    payload: unknown;
    sourceUrl: string;
    reason: "schema_rejected";
  };
  retryAt: string;
}

export type ClaudeHttpResult<T> = ClaudeHttpSuccess<T> | ClaudeHttpFailure<T>;

interface CacheEntry {
  value: unknown;
  checkedAt: string;
  expiresAt: number;
  etag?: string;
}

export interface ClaudeHttpState {
  entries: Map<string, CacheEntry>;
  retryUntil: Map<string, number>;
  failureCounts: Map<string, number>;
  inFlight: Map<string, Promise<ClaudeHttpResult<unknown>>>;
  throttledUntil: number;
}

export interface ClaudeTransportOptions {
  timeoutMs?: number;
}

export function createClaudeHttpState(): ClaudeHttpState {
  return { entries: new Map(), retryUntil: new Map(), failureCounts: new Map(), inFlight: new Map(), throttledUntil: 0 };
}

function canonicalQuery(query: URLSearchParams): string {
  const sorted = new URLSearchParams(query);
  sorted.sort();
  return sorted.toString();
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

function responseTtl(response: Response, endpoint: ClaudeEndpoint, nowMs: number): number {
  const cacheControl = response.headers.get("cache-control") ?? "";
  const maxAgeMatch = /(?:^|,)\s*max-age\s*=\s*(?:"(\d+)"|(\d+))/i.exec(cacheControl);
  if (!maxAgeMatch) return endpoint === "sources" ? 300_000 : MIN_CACHE_MS;
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
  if (response.body) void response.body.cancel().catch(() => undefined);
}

async function readBoundedBody(response: Response): Promise<{ ok: true; text: string } | { ok: false; reason: "too_large" | "read_error" }> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    cancelBody(response);
    return { ok: false, reason: "too_large" };
  }
  if (!response.body) return { ok: true, text: "" };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "read_error" };
  } finally {
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

function isEndpoint(value: string): value is ClaudeEndpoint {
  return value === "status" || value === "resets" || value === "sources";
}

export function createClaudeTransport(
  deps: RuntimeDependencies,
  state: ClaudeHttpState = createClaudeHttpState(),
  options: ClaudeTransportOptions = {},
) {
  const timeoutMs = options.timeoutMs ?? 10_000;

  async function get<T>(
    path: ClaudeEndpoint,
    query: URLSearchParams,
    parse: (payload: unknown) => T,
  ): Promise<ClaudeHttpResult<T>> {
    const now = deps.clock.now().getTime();
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !isEndpoint(path)) {
      return { ok: false, code: "invalid_request", lastValid: null, retryAt: asIso(now + MIN_CACHE_MS) };
    }

    const queryString = canonicalQuery(query);
    const key = `${path}?${queryString}`;
    const sourceUrl = `${BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;
    const cached = state.entries.get(key);
    const lastValid = (cached?.value as T | undefined) ?? null;
    const retryAtMs = Math.max(state.throttledUntil, state.retryUntil.get(key) ?? 0);

    if (cached && now < cached.expiresAt) {
      return { ok: true, value: cached.value as T, origin: "cache", checkedAt: cached.checkedAt };
    }
    const inFlight = state.inFlight.get(key);
    if (inFlight) return await inFlight as ClaudeHttpResult<T>;
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
      "user-agent": "ResetRadar/0.1 (public Claude reset monitoring; local adapter)",
    });
    if (cached?.etag) headers.set("if-none-match", cached.etag);
    const controller = new AbortController();
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const network = (async (): Promise<ClaudeHttpResult<T>> => {
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
          expiresAt: deps.clock.now().getTime() + responseTtl(response, path, deps.clock.now().getTime()),
          ...(etag ? { etag } : {}),
        });
        state.retryUntil.delete(key);
        state.failureCounts.delete(key);
        cancelBody(response);
        return { ok: true, value: cached.value as T, origin: "not_modified", checkedAt };
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
        const code: ClaudeHttpErrorCode = response.status === 503 ? "service_unavailable" : "http_error";
        return { ok: false, code, lastValid, retryAt: asIso(retryAt) };
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!/^\s*application\/json(?:\s*;|\s*$)/i.test(contentType)) {
        cancelBody(response);
        return { ok: false, code: "invalid_response", lastValid, retryAt: asIso(deps.clock.now().getTime() + MIN_CACHE_MS) };
      }
      const body = await readBoundedBody(response);
      if (timedOut) {
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

      let value: T;
      try {
        value = parse(payload);
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
      const etag = response.headers.get("etag");
      state.entries.set(key, {
        value,
        checkedAt,
        expiresAt: afterParseMs + responseTtl(response, path, afterParseMs),
        ...(etag ? { etag } : {}),
      });
      state.retryUntil.delete(key);
      state.failureCounts.delete(key);
      return { ok: true, value, origin: "network", checkedAt };
    })();

    const timeout = new Promise<ClaudeHttpResult<T>>((resolve) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
        resolve({ ok: false, code: "timeout", lastValid, retryAt: asIso(deps.clock.now().getTime() + MIN_CACHE_MS) });
      }, timeoutMs);
    });

    const pending = (async (): Promise<ClaudeHttpResult<T>> => {
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
    state.inFlight.set(key, pending as Promise<ClaudeHttpResult<unknown>>);
    return pending;
  }

  return { get };
}
