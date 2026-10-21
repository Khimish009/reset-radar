/** Strict codexreset.ai v1 feed contract. Errors deliberately contain no payload data. */
type Schema<T> = (input: unknown) => T;
type Value<S> = S extends Schema<infer T> ? T : never;

function reject(): never { throw new Error('codex_schema_rejected'); }
const string = (v: unknown, max = 4096): string =>
  typeof v === 'string' && v.length <= max ? v : reject();
const bool: Schema<boolean> = (v) => typeof v === 'boolean' ? v : reject();
const nullable = <T>(schema: Schema<T>): Schema<T | null> => (v) => v === null ? null : schema(v);
const oneOf = <const T extends readonly string[]>(...values: T): Schema<T[number]> =>
  (v) => typeof v === 'string' && values.includes(v) ? v : reject();

function object<S extends Record<string, Schema<unknown>>>(shape: S): Schema<{ [K in keyof S]: Value<S[K]> }> {
  return (v) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) reject();
    const raw = v as Record<string, unknown>;
    const keys = Object.keys(shape);
    if (Object.keys(raw).length !== keys.length || keys.some((key) => !Object.hasOwn(raw, key))) reject();
    const result: Record<string, unknown> = {};
    for (const key of keys) result[key] = shape[key]!(raw[key]);
    return result as { [K in keyof S]: Value<S[K]> };
  };
}

export const codexDate: Schema<string> = (v) => {
  const s = string(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s ? s : reject();
};

export const codexInstant: Schema<string> = (v) => {
  const s = string(v, 32);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s) || !Number.isFinite(Date.parse(s))) reject();
  codexDate(s.slice(0, 10));
  if (new Date(s).toISOString().slice(0, 19) !== s.slice(0, 19)) reject();
  return s;
};

const url: Schema<string> = (v) => {
  const s = string(v, 2048);
  try {
    const parsed = new URL(s);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) reject();
  } catch { reject(); }
  return s;
};
const nonempty = (max: number): Schema<string> => (v) => {
  const s = string(v, max);
  return s.trim().length > 0 ? s : reject();
};

const attributionShape = object({ seed_archive: url, note: nonempty(2048) });
const eventShape = object({
  id: nonempty(256), date: codexDate, ts: nullable(codexInstant),
  kind: oneOf('regular', 'banked'), scope: nonempty(256), summary: (v) => string(v, 4096),
  summary_unavailable: bool, url, seeded: bool, announced_at: nullable(codexInstant),
  delivered_at: nullable(codexInstant), delivered_source_url: nullable(url),
  delivery_reported_delay: bool, delivery_note_en: nullable((v) => string(v, 2048)),
});
const scheduledShape = object({
  certainty: oneOf('announced', 'hinted'), day: codexDate, scheduled_for: nullable(codexInstant),
  when_text: (v) => string(v, 1024), url, source: nonempty(512), announced_at: codexInstant,
});
const feedShape = object({
  schema_version: (v) => v === 1 ? 1 : reject(), generated_at: codexInstant,
  source: (v) => v === 'https://codexreset.ai' ? v : reject(), attribution: attributionShape,
  events: (v) => {
    if (!Array.isArray(v) || v.length > 5000) reject();
    const events = v.map(eventShape);
    const ids = new Set(events.map((event) => event.id));
    if (ids.size !== events.length) reject();
    return events;
  }, scheduled: nullable(scheduledShape),
});

export type CodexEvent = Value<typeof eventShape>;
export type CodexScheduled = Value<typeof scheduledShape>;
export type CodexFeed = Value<typeof feedShape>;

export function parseCodexFeed(payload: unknown): CodexFeed {
  return feedShape(payload);
}
