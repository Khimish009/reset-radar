import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/utils/logging";

describe("createLogger", () => {
  it("preserves valid event codes and safe allowlisted telemetry", () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));

    logger.info("scheduled_noop", {
      environment: "staging",
      publishMode: "dry_run",
      provider: "claude",
      status: 204,
      durationMs: 12.5,
    });

    expect(JSON.parse(lines[0] ?? '')).toEqual({
      level: "info",
      event: "scheduled_noop",
      fields: {
        environment: "staging",
        publishMode: "dry_run",
        provider: "claude",
        status: 204,
        durationMs: 12.5,
      },
    });
  });

  it("drops URLs, credentials, nested errors/configuration, unknown fields and invalid values", () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    const secretUrl = "https://api.telegram.org/bot123456:secret/sendMessage";

    logger.error("configuration_rejected", {
      environment: `production ${secretUrl}`,
      publishMode: "dry_run",
      provider: "codex",
      status: 600,
      durationMs: -1,
      authorization: "Bearer abc",
      cookie: "session=secret",
      message: secretUrl,
      error: new Error("Bearer nested-secret"),
      env: { TELEGRAM_BOT_TOKEN: "nested-secret" },
    } as never);

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("telegram.org");
    expect(lines[0]).not.toContain("secret");
    expect(lines[0]).not.toContain("Bearer");
    expect(JSON.parse(lines[0] ?? '')).toEqual({
      level: "error",
      event: "configuration_rejected",
      fields: { publishMode: "dry_run", provider: "codex" },
    });
  });

  it("rejects unknown event codes without emitting their value or payload", () => {
    const sink = vi.fn();
    const logger = createLogger(sink);

    logger.info("https://api.telegram.org/bot-secret" as never, {
      provider: "claude",
    });

    expect(sink).not.toHaveBeenCalled();
  });

  it("emits only fixed scheduled/provider codes and allowlisted provider scalars", () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    logger.info("provider_sync_incomplete", { provider: "claude" });
    logger.error("provider_sync_failure", { provider: "codex", reason: "https://private.invalid/raw" } as never);
    logger.info("publish_unavailable");

    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { level: "info", event: "provider_sync_incomplete", fields: { provider: "claude" } },
      { level: "error", event: "provider_sync_failure", fields: { provider: "codex" } },
      { level: "info", event: "publish_unavailable" },
    ]);
    expect(lines.join("\n")).not.toContain("private.invalid");
    expect(lines.join("\n")).not.toContain("raw");
  });

  it("does not evaluate getters on fields objects", () => {
    const sink = vi.fn();
    const logger = createLogger(sink);
    const fields = Object.defineProperty({}, "provider", {
      enumerable: true,
      get() {
        throw new Error("secret getter ran");
      },
    });

    expect(() => logger.info("scheduled_noop", fields as never)).not.toThrow();
    expect(JSON.parse(sink.mock.calls[0]?.[0] as string)).toEqual({
      level: "info",
      event: "scheduled_noop",
    });
  });
});
