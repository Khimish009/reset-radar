/** The complete set of event identifiers that may appear in logs. */
export type LogEvent = "scheduled_noop" | "configuration_rejected";

export type LogLevel = "info" | "error";
export type LogEnvironment = "local" | "staging" | "production";
export type LogProvider = "claude" | "codex";
export type LogPublishMode = "dry_run";

/**
 * Intentionally small telemetry contract. Only these scalar values can reach
 * the output; raw messages, URLs, errors, configuration and secrets have no
 * place in the logger API.
 */
export interface LogFields {
  environment?: LogEnvironment;
  publishMode?: LogPublishMode;
  provider?: LogProvider;
  status?: number;
  durationMs?: number;
}

export interface Logger {
  info(event: LogEvent, fields?: LogFields): void;
  error(event: LogEvent, fields?: LogFields): void;
}

export type LogSink = (line: string) => void;

const EVENTS: ReadonlySet<string> = new Set([
  "scheduled_noop",
  "configuration_rejected",
]);

const ENVIRONMENTS: ReadonlySet<string> = new Set([
  "local",
  "staging",
  "production",
]);
const PROVIDERS: ReadonlySet<string> = new Set(["claude", "codex"]);
const PUBLISH_MODES: ReadonlySet<string> = new Set(["dry_run"]);
const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "environment",
  "publishMode",
  "provider",
  "status",
  "durationMs",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Copy only explicitly approved, correctly typed scalar telemetry. */
function sanitizeFields(input: unknown): LogFields | undefined {
  if (!isRecord(input)) return undefined;

  const output: LogFields = {};
  for (const key of ALLOWED_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    // Read data properties only, avoiding getters and arbitrary object code.
    if (!descriptor || !("value" in descriptor)) continue;
    const value: unknown = descriptor.value;

    switch (key) {
      case "environment":
        if (typeof value === "string" && ENVIRONMENTS.has(value)) {
          output.environment = value as LogEnvironment;
        }
        break;
      case "publishMode":
        if (typeof value === "string" && PUBLISH_MODES.has(value)) {
          output.publishMode = value as LogPublishMode;
        }
        break;
      case "provider":
        if (typeof value === "string" && PROVIDERS.has(value)) {
          output.provider = value as LogProvider;
        }
        break;
      case "status":
        if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599) {
          output.status = value;
        }
        break;
      case "durationMs":
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
          output.durationMs = value;
        }
        break;
    }
  }
  return output;
}

/** Create a logger that emits only fixed event codes and sanitized fields. */
export function createLogger(sink: LogSink = (line) => console.log(line)): Logger {
  const write = (level: LogLevel, event: LogEvent, fields?: LogFields): void => {
    if (typeof event !== "string" || !EVENTS.has(event)) return;

    const safeFields = sanitizeFields(fields);
    const record: { level: LogLevel; event: LogEvent; fields?: LogFields } = {
      level,
      event,
    };
    if (safeFields && Object.keys(safeFields).length > 0) record.fields = safeFields;
    sink(JSON.stringify(record));
  };

  return {
    info: (event, fields) => write("info", event, fields),
    error: (event, fields) => write("error", event, fields),
  };
}
