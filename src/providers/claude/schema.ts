/** Claude v1 contract, checked against upstream OpenAPI on 2026-10-21.
 * Strict rejection retains the original input in the transport review result.
 * No external payload or validation path is included in an Error message.
 */
type Schema<T> = (input: unknown) => T;
type Value<S> = S extends Schema<infer T> ? T : never;

function reject(): never { throw new Error('claude_schema_rejected'); }
const string: Schema<string> = (v) => typeof v === 'string' ? v : reject();
const boolean: Schema<boolean> = (v) => typeof v === 'boolean' ? v : reject();
const number: Schema<number> = (v) => typeof v === 'number' && Number.isFinite(v) ? v : reject();
const integer: Schema<number> = (v) => {
  const n = number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : reject();
};
const nil: Schema<null> = (v) => v === null ? null : reject();
const nullable = <T>(s: Schema<T>): Schema<T | null> => (v) => v === null ? null : s(v);
const array = <T>(s: Schema<T>): Schema<T[]> => (v) => Array.isArray(v) ? v.map(s) : reject();
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

export const date: Schema<string> = (v) => {
  const s = string(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s ? s : reject();
};
export const instant: Schema<string> = (v) => {
  const s = string(v);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s) || !Number.isFinite(Date.parse(s))) reject();
  date(s.slice(0, 10));
  if (new Date(s).toISOString().slice(0, 19) !== s.slice(0, 19)) reject();
  return s;
};
const dateOrInstant: Schema<string> = (v) => typeof v === 'string' && v.length === 10 ? date(v) : instant(v);
const url: Schema<string> = (v) => {
  const s = string(v);
  try {
    const u = new URL(s);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) reject();
  } catch { reject(); }
  return s;
};
const id: Schema<string> = (v) => {
  const s = string(v);
  return s.trim().length > 0 && s.length <= 1024 ? s : reject();
};
const audience = object({
  scope: oneOf('broad', 'limited', 'unspecified'), statement: string,
  plans: ((v) => Array.isArray(v)
    ? array(oneOf('free', 'pro', 'max', 'team', 'enterprise'))(v)
    : oneOf('all', 'subscribers', 'unspecified')(v)) satisfies Schema<string | string[]>,
  exclusions: nullable(string),
});
const source = object({
  url, handle: string, display_name: string, role: oneOf('original', 'relay'),
  kind: oneOf('x_post', 'web_page', 'status_page'), posted_at: nullable(instant), excerpt: nullable(string),
});
const eventShape = object({
  id, kind: oneOf('usage_reset', 'limit_increase', 'credit', 'policy_change', 'incident'),
  event_status: oneOf('announced', 'confirmed', 'cancelled', 'retracted'), title: string, summary: string,
  time_precision: oneOf('exact', 'date'), announced_at: nullable(instant), announced_on: nullable(date),
  utc_day: nullable(date), effective_at: nullable(instant), effective_note: nullable(string),
  reset_offer: nullable(object({ expires_on: date })),
  allocation: oneOf('subscription_usage', 'api', 'unspecified'), audience,
  windows: array(oneOf('five_hour', 'weekly', 'other', 'unspecified')), sources: array(source), url,
  first_published_at: instant, revised_at: instant, revision: integer,
  correction: nullable(object({ kind: oneOf('correction', 'retraction'), reason: string, at: instant })),
  related_event_ids: array(id),
});
export type ClaudeEvent = Value<typeof eventShape>;
export const parseClaudeEvent: Schema<ClaudeEvent> = (v) => {
  const e = eventShape(v);
  if (e.revision < 1) reject();
  if (e.time_precision === 'exact' ? e.announced_at === null || e.announced_on !== null
    : e.announced_on === null || e.announced_at !== null) reject();
  return e;
};
const meta = object({
  api_version: oneOf('v1'), generated_at: instant, content_revision: id,
  editorial_reviewed_at: instant, coverage_start: date,
});
export const parseClaudePage = object({
  data: array(parseClaudeEvent), pagination: object({
    has_more: boolean, next_cursor: nullable(id), revision_changed: boolean,
  }), meta,
});
export type ClaudePage = Value<typeof parseClaudePage>;
const stats = object({
  total: integer, last_reset_at: nullable(instant), last_reset_on: nullable(date),
  days_since_last: nullable(number), avg_interval_days: nullable(number), longest_gap_days: nullable(number),
  eligible_gaps: integer, total_gaps: integer, exact_count: integer, partial_sample: boolean,
});
export const parseClaudeStatus = object({ data: object({
  latest_reset: nullable(parseClaudeEvent), latest_ambiguous: nullable(array(parseClaudeEvent)),
  announced_reset: nullable(parseClaudeEvent), active_watch: nil, reset_offers: array(parseClaudeEvent), stats,
  filters: object({ audience: oneOf('all', 'broad', 'max', 'pro', 'team'), window: oneOf('any', 'five_hour', 'weekly') }),
}), meta });
export type ClaudeStatus = Value<typeof parseClaudeStatus>;
export const parseClaudeSources = object({ data: array(object({
  id, handle: string, display_name: string, profile_url: url,
  classification: oneOf('official', 'team_member', 'relay'),
  priority: oneOf('primary', 'additional', 'context', 'optional'), relevance: string,
  affiliation_evidence_url: url, affiliation_evidence_note: string, reset_evidence_urls: array(url),
  verification_method: string, last_reviewed_at: dateOrInstant, active: boolean, limitations: nullable(string),
})), meta });
export type ClaudeSources = Value<typeof parseClaudeSources>;
