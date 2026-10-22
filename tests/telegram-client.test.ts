import { describe, expect, it, vi } from "vitest";
import { createLocalTelegramClient, SYNTHETIC_TELEGRAM_TOKEN } from "../src/telegram/client";
import type { Clock, Fetch } from "../src/runtime";

const CHAT_ID = -1_000_000_000_005;
const NOW = new Date("2026-10-22T12:00:00.000Z");

function harness(reply: Response | (() => Promise<Response>), timeoutMs = 1_000) {
  const fetch = vi.fn<Fetch>(async () => typeof reply === "function" ? reply() : reply);
  const clock: Clock = { now: () => new Date(NOW) };
  const client = createLocalTelegramClient({
    baseUrl: "http://127.0.0.1:4917/api/telegram",
    fetch,
    clock,
    timeoutMs,
  });
  return { client, fetch };
}

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function success(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    result: {
      message_id: 73,
      date: 1_792_680_000,
      chat: { id: CHAT_ID, type: "channel" },
      text: "Synthetic announcement",
      ...extra,
    },
  };
}

describe("local Telegram client", () => {
  it("sends the minimal plain-text request to loopback using only the synthetic token", async () => {
    const { client, fetch } = harness(response(success()));
    const result = await client.sendMessage({ chatId: CHAT_ID, text: "Synthetic announcement" });

    expect(client.simulationOnly).toBe(true);
    expect(result).toEqual({ kind: "simulated_sent", messageId: 73, chatId: CHAT_ID });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(`http://127.0.0.1:4917/api/telegram/bot${SYNTHETIC_TELEGRAM_TOKEN}/sendMessage`);
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: CHAT_ID,
      text: "Synthetic announcement",
      link_preview_options: { is_disabled: true },
    });
    expect(init?.headers).toEqual({ "content-type": "application/json", accept: "application/json" });
  });

  it("rejects malformed inputs before any network request", async () => {
    const { client, fetch } = harness(response(success()));
    const badInputs = [
      { chatId: 0, text: "x" },
      { chatId: Number.MAX_SAFE_INTEGER + 1, text: "x" },
      { chatId: CHAT_ID, text: "" },
      { chatId: CHAT_ID, text: "x".repeat(4_097) },
      { chatId: CHAT_ID, text: "\ud800" },
      { chatId: CHAT_ID, text: "\udc00" },
    ];
    for (const input of badInputs) {
      expect(await client.sendMessage(input)).toEqual({ kind: "rejected", code: "invalid_request" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts a supplementary Unicode character within the UTF-16 limit", async () => {
    const text = `${"a".repeat(4_094)}😀`;
    const { client, fetch } = harness(response(success({ text })));
    expect(await client.sendMessage({ chatId: CHAT_ID, text })).toEqual({
      kind: "simulated_sent", messageId: 73, chatId: CHAT_ID,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects any endpoint other than explicit plain HTTP loopback ending in /telegram", () => {
    const fetch = vi.fn<Fetch>();
    const clock: Clock = { now: () => new Date(NOW) };
    for (const baseUrl of [
      "https://127.0.0.1:4917/telegram",
      "http://localhost:4917/telegram",
      "http://127.0.0.1/telegram",
      "http://127.0.0.1:4917/telegram?x=1",
      "http://user@127.0.0.1:4917/telegram",
      "http://127.0.0.1:4917/not-telegram",
      "https://api.telegram.org/telegram",
    ]) {
      expect(() => createLocalTelegramClient({ baseUrl, fetch, clock })).toThrow(TypeError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps a valid bounded rate limit to an absolute retry time without leaking the description", async () => {
    const { client } = harness(response({
      ok: false,
      error_code: 429,
      description: "SYNTHETIC diagnostic text",
      parameters: { retry_after: 17 },
    }, 429));
    expect(await client.sendMessage({ chatId: CHAT_ID, text: "x" })).toEqual({
      kind: "retryable", retryAt: "2026-10-22T12:00:17.000Z",
    });
  });

  it("rejects validated 4xx errors and flags migration without following it", async () => {
    const regular = harness(response({ ok: false, error_code: 400, description: "SYNTHETIC rejection" }, 400));
    expect(await regular.client.sendMessage({ chatId: CHAT_ID, text: "x" })).toEqual({
      kind: "rejected", code: "telegram_rejected",
    });
    const migration = harness(response({
      ok: false,
      error_code: 400,
      description: "SYNTHETIC migration",
      parameters: { migrate_to_chat_id: -1000000000009 },
    }, 400));
    expect(await migration.client.sendMessage({ chatId: CHAT_ID, text: "x" })).toEqual({
      kind: "rejected", code: "migration_required",
    });
    expect(migration.fetch).toHaveBeenCalledOnce();
  });

  it("treats invalid rate limits, malformed successes, and server errors as ambiguous", async () => {
    const cases: Array<{ body: unknown; status: number }> = [
      { body: { ok: false, error_code: 429, description: "x", parameters: { retry_after: 0 } }, status: 429 },
      { body: { ok: false, error_code: 429, description: "x", parameters: { retry_after: 3_601 } }, status: 429 },
      { body: success({ chat: { id: 42, type: "channel" } }), status: 200 },
      { body: success({ date: -1 }), status: 200 },
      { body: { ok: true, result: {} }, status: 200 },
      { body: { ok: "true", result: {} }, status: 200 },
      { body: { ok: false, error_code: "429", description: "x" }, status: 429 },
      { body: { ok: false, error_code: 500, description: "x" }, status: 500 },
    ];
    for (const item of cases) {
      const { client } = harness(response(item.body, item.status));
      expect(await client.sendMessage({ chatId: CHAT_ID, text: "Synthetic announcement" })).toMatchObject({
        kind: "uncertain_manual_review",
      });
    }
  });

  it("treats malformed JSON, wrong content type, oversized body, timeout, and abort as ambiguous", async () => {
    const malformed = harness(new Response("not json", { status: 200, headers: { "content-type": "application/json" } }));
    expect(await malformed.client.sendMessage({ chatId: CHAT_ID, text: "x" })).toMatchObject({ kind: "uncertain_manual_review" });

    const wrongType = harness(new Response("{}", { status: 200, headers: { "content-type": "text/plain" } }));
    expect(await wrongType.client.sendMessage({ chatId: CHAT_ID, text: "x" })).toMatchObject({ kind: "uncertain_manual_review" });

    const oversized = harness(new Response(" ".repeat(32 * 1024 + 1), { status: 200, headers: { "content-type": "application/json" } }));
    expect(await oversized.client.sendMessage({ chatId: CHAT_ID, text: "x" })).toMatchObject({ kind: "uncertain_manual_review" });

    const stalled = harness(() => new Promise<Response>(() => undefined), 5);
    expect(await stalled.client.sendMessage({ chatId: CHAT_ID, text: "x" })).toEqual({
      kind: "uncertain_manual_review", code: "timeout",
    });
    expect(stalled.fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);

    const controller = new AbortController();
    const waiting = harness(() => new Promise<Response>(() => undefined), 1_000);
    const sending = waiting.client.sendMessage({ chatId: CHAT_ID, text: "x", signal: controller.signal });
    await vi.waitFor(() => expect(waiting.fetch).toHaveBeenCalledOnce());
    controller.abort();
    expect(await sending).toEqual({ kind: "uncertain_manual_review", code: "cancelled" });
  });

  it("swallows asynchronous AbortError rejections from response-body cancellation", async () => {
    const rejectingCancelBody = () => new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => undefined),
      cancel: () => Promise.reject(new DOMException("SYNTHETIC abort", "AbortError")),
    }, { highWaterMark: 0 });

    const timeoutResponse = new Response(rejectingCancelBody(), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const timed = harness(timeoutResponse, 5);
    expect(await timed.client.sendMessage({ chatId: CHAT_ID, text: "x" })).toEqual({
      kind: "uncertain_manual_review", code: "timeout",
    });

    const serverError = new Response(rejectingCancelBody(), { status: 503 });
    const unavailable = harness(serverError);
    expect(await unavailable.client.sendMessage({ chatId: CHAT_ID, text: "x" })).toEqual({
      kind: "uncertain_manual_review", code: "http_ambiguous",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("releases an oversized body reader without waiting for a hanging cancellation", async () => {
    let rejectCancel: ((reason?: unknown) => void) | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(32 * 1024 + 1));
      },
      cancel() {
        return new Promise<void>((_resolve, reject) => { rejectCancel = reject; });
      },
    });
    const responseWithHangingCancel = new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const { client } = harness(responseWithHangingCancel, 20);
    const sending = client.sendMessage({ chatId: CHAT_ID, text: "x" });
    let lateOutcomeCount = 0;
    void sending.then(() => { lateOutcomeCount++; });

    const result = await sending;
    expect(result).toEqual({ kind: "uncertain_manual_review", code: "invalid_response" });
    expect(responseWithHangingCancel.body?.locked).toBe(false);

    rejectCancel?.(new Error("SYNTHETIC late cancellation failure"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lateOutcomeCount).toBe(1);
  });

  it("releases an aborted pending body read while cancellation remains unresolved", async () => {
    let rejectCancel: ((reason?: unknown) => void) | undefined;
    let startedPull: (() => void) | undefined;
    const pullStarted = new Promise<void>((resolve) => { startedPull = resolve; });
    const body = new ReadableStream<Uint8Array>({
      pull() {
        startedPull?.();
        return new Promise<void>(() => undefined);
      },
      cancel() {
        return new Promise<void>((_resolve, reject) => { rejectCancel = reject; });
      },
    }, { highWaterMark: 0 });
    const responseWithHangingCancel = new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const { client } = harness(responseWithHangingCancel, 1_000);
    const controller = new AbortController();
    const sending = client.sendMessage({ chatId: CHAT_ID, text: "x", signal: controller.signal });
    await pullStarted;
    controller.abort();

    expect(await sending).toEqual({ kind: "uncertain_manual_review", code: "cancelled" });
    expect(responseWithHangingCancel.body?.locked).toBe(false);
    rejectCancel?.(new Error("SYNTHETIC late cancellation failure"));
  });

  it("returns the timeout outcome for a pending body read with hanging cancellation", async () => {
    let rejectCancel: ((reason?: unknown) => void) | undefined;
    let startedPull: (() => void) | undefined;
    const pullStarted = new Promise<void>((resolve) => { startedPull = resolve; });
    const body = new ReadableStream<Uint8Array>({
      pull() {
        startedPull?.();
        return new Promise<void>(() => undefined);
      },
      cancel() {
        return new Promise<void>((_resolve, reject) => { rejectCancel = reject; });
      },
    }, { highWaterMark: 0 });
    const responseWithHangingCancel = new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const { client } = harness(responseWithHangingCancel, 20);
    const sending = client.sendMessage({ chatId: CHAT_ID, text: "x" });
    let lateOutcomeCount = 0;
    void sending.then(() => { lateOutcomeCount++; });
    await pullStarted;

    expect(await sending).toEqual({ kind: "uncertain_manual_review", code: "timeout" });
    expect(responseWithHangingCancel.body?.locked).toBe(false);
    rejectCancel?.(new Error("SYNTHETIC late cancellation failure"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lateOutcomeCount).toBe(1);
  });
});
