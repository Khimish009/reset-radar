import type { Clock, Fetch } from "../runtime";

export const SYNTHETIC_TELEGRAM_TOKEN = "000000:STAGE5_SYNTHETIC_ONLY";

const MAX_RESPONSE_BYTES = 32 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RETRY_AFTER_SECONDS = 3_600;

export type TelegramOutcome =
  | { kind: "simulated_sent"; messageId: number; chatId: number }
  | { kind: "retryable"; retryAt: string }
  | { kind: "rejected"; code: "invalid_request" | "telegram_rejected" | "migration_required" }
  | { kind: "uncertain_manual_review"; code: string };

export interface TelegramClient {
  readonly simulationOnly: true;
  sendMessage(input: { chatId: number; text: string; signal?: AbortSignal }): Promise<TelegramOutcome>;
}

export function createLocalTelegramClient(options: {
  baseUrl: string;
  fetch: Fetch;
  clock: Clock;
  timeoutMs?: number;
}): TelegramClient {
  const endpoint = makeEndpoint(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Invalid Telegram timeout");
  }

  return {
    simulationOnly: true,
    async sendMessage(input): Promise<TelegramOutcome> {
      if (!isValidInput(input) || input.signal?.aborted) {
        return { kind: "rejected", code: "invalid_request" };
      }

      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let abortKind: "timeout" | "cancelled" | undefined;
      let onCallerAbort: (() => void) | undefined;
      const interrupted = new Promise<TelegramOutcome>((resolve) => {
        timeoutId = setTimeout(() => {
          abortKind = "timeout";
          controller.abort();
          resolve({ kind: "uncertain_manual_review", code: "timeout" });
        }, timeoutMs);
        if (input.signal) {
          onCallerAbort = () => {
            abortKind = "cancelled";
            controller.abort();
            resolve({ kind: "uncertain_manual_review", code: "cancelled" });
          };
          input.signal.addEventListener("abort", onCallerAbort, { once: true });
        }
      });

      const operation = (async (): Promise<TelegramOutcome> => {
        let response: Response;
        try {
          response = await options.fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
              chat_id: input.chatId,
              text: input.text,
              link_preview_options: { is_disabled: true },
            }),
            redirect: "error",
            signal: controller.signal,
          });
        } catch {
          return { kind: "uncertain_manual_review", code: abortKind ?? "network_error" };
        }

        if (controller.signal.aborted) return { kind: "uncertain_manual_review", code: abortKind ?? "cancelled" };
        if (response.status >= 500 || response.status < 200 || response.status >= 600) {
          cancelBody(response);
          return { kind: "uncertain_manual_review", code: "http_ambiguous" };
        }

        const body = await readBoundedJson(response, controller.signal);
        if (controller.signal.aborted) return { kind: "uncertain_manual_review", code: abortKind ?? "cancelled" };
        if (!body.ok) return { kind: "uncertain_manual_review", code: "invalid_response" };

        const payload = parseJson(body.text);
        if (payload === undefined) return { kind: "uncertain_manual_review", code: "invalid_response" };
        if (isSuccessfulResponse(payload, input.chatId, input.text)) {
          if (response.status !== 200) return { kind: "uncertain_manual_review", code: "http_ambiguous" };
          return { kind: "simulated_sent", messageId: payload.result.message_id, chatId: input.chatId };
        }

        const error = readErrorResponse(payload);
        if (!error) return { kind: "uncertain_manual_review", code: "invalid_response" };
        if (error.migrateToChatId !== undefined) {
          return { kind: "rejected", code: "migration_required" };
        }
        if (response.status === 429 || error.errorCode === 429) {
          if (
            response.status !== 429 || error.errorCode !== 429 || error.retryAfter === undefined ||
            error.retryAfter < 1 || error.retryAfter > MAX_RETRY_AFTER_SECONDS
          ) return { kind: "uncertain_manual_review", code: "invalid_rate_limit" };
          const retryAtMs = options.clock.now().getTime() + error.retryAfter * 1_000;
          if (!Number.isFinite(retryAtMs)) return { kind: "uncertain_manual_review", code: "invalid_clock" };
          return { kind: "retryable", retryAt: new Date(retryAtMs).toISOString() };
        }
        if (response.status >= 400 && response.status < 500) {
          return { kind: "rejected", code: "telegram_rejected" };
        }
        return { kind: "uncertain_manual_review", code: "http_ambiguous" };
      })();

      try {
        return await Promise.race([operation, interrupted]);
      } catch {
        return { kind: "uncertain_manual_review", code: "invalid_response" };
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        if (input.signal && onCallerAbort) input.signal.removeEventListener("abort", onCallerAbort);
        controller.abort();
      }
    },
  };
}

function makeEndpoint(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new TypeError("Telegram simulation endpoint must be a loopback URL");
  }
  if (
    url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port ||
    url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/telegram")
  ) {
    throw new TypeError("Telegram simulation endpoint must be a loopback URL ending in /telegram");
  }
  return `${url.origin}${url.pathname}/bot${SYNTHETIC_TELEGRAM_TOKEN}/sendMessage`;
}

function isValidInput(input: { chatId: number; text: string; signal?: AbortSignal }): boolean {
  return Number.isSafeInteger(input.chatId) && input.chatId !== 0 &&
    typeof input.text === "string" && input.text.length >= 1 && input.text.length <= 4_096 &&
    isWellFormedUnicode(input.text);
}

function isWellFormedUnicode(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

type BoundedBody = { ok: true; text: string } | { ok: false };

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<BoundedBody> {
  if (!/^(?:application\/json)(?:\s*;|\s*$)/i.test(response.headers.get("content-type") ?? "")) {
    cancelBody(response);
    return { ok: false };
  }
  if (!response.body) return { ok: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let cancellationStarted = false;
  const cancelReader = (): void => {
    if (cancellationStarted) return;
    cancellationStarted = true;
    try {
      // A stream's underlying cancel hook may never settle. Start cancellation
      // without making response classification depend on that promise.
      void reader.cancel().catch(() => undefined);
    } catch { /* Cancellation is best effort. */ }
  };
  const cancelOnAbort = (): void => {
    cancelReader();
  };
  signal.addEventListener("abort", cancelOnAbort, { once: true });
  try {
    while (true) {
      if (signal.aborted) {
        cancelReader();
        return { ok: false };
      }
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        cancelReader();
        return { ok: false };
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes) };
  } catch {
    cancelReader();
    return { ok: false };
  } finally {
    signal.removeEventListener("abort", cancelOnAbort);
    try { reader.releaseLock(); } catch { /* A pending read may prevent release. */ }
  }
}

function parseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSuccessfulResponse(
  value: unknown,
  expectedChatId: number,
  expectedText: string,
): value is { ok: true; result: { message_id: number } } & Record<string, unknown> {
  if (!isObject(value) || value.ok !== true || !isObject(value.result)) return false;
  const message = value.result;
  if (
    !Number.isSafeInteger(message.message_id) || (message.message_id as number) <= 0 ||
    !Number.isSafeInteger(message.date) || (message.date as number) < 0 || !isObject(message.chat) ||
    message.chat.id !== expectedChatId || message.chat.type !== "channel"
  ) return false;
  return message.text === undefined || message.text === expectedText;
}

function readErrorResponse(value: unknown): {
  errorCode: number;
  migrateToChatId?: number;
  retryAfter?: number;
} | undefined {
  if (!isObject(value) || value.ok !== false || !Number.isSafeInteger(value.error_code) ||
    typeof value.description !== "string") return undefined;
  const result: { errorCode: number; migrateToChatId?: number; retryAfter?: number } = {
    errorCode: value.error_code as number,
  };
  if (value.parameters !== undefined) {
    if (!isObject(value.parameters)) return undefined;
    if (value.parameters.retry_after !== undefined) {
      if (!Number.isSafeInteger(value.parameters.retry_after) || (value.parameters.retry_after as number) < 0) return undefined;
      result.retryAfter = value.parameters.retry_after as number;
    }
    if (value.parameters.migrate_to_chat_id !== undefined) {
      if (!Number.isSafeInteger(value.parameters.migrate_to_chat_id) || value.parameters.migrate_to_chat_id === 0) return undefined;
      result.migrateToChatId = value.parameters.migrate_to_chat_id as number;
    }
  }
  return result;
}

function cancelBody(response: Response): void {
  try {
    const cancelled = response.body?.cancel();
    if (cancelled) void cancelled.catch(() => undefined);
  } catch { /* Best effort only; never expose response data. */ }
}
