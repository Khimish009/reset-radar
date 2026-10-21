import type { ClaudeEvent, ClaudePage, ClaudeSources, ClaudeStatus } from "../../src/providers/claude/schema";

/** Contract-shaped synthetic fixtures. These are not captured upstream data. */
export function syntheticEvent(overrides: Partial<ClaudeEvent> = {}): ClaudeEvent {
  return {
    id: "synthetic-event-001",
    kind: "usage_reset",
    event_status: "confirmed",
    title: "SYNTHETIC: Claude usage reset",
    summary: "SYNTHETIC fixture for local adapter tests.",
    time_precision: "exact",
    announced_at: "2026-10-20T10:00:00Z",
    announced_on: null,
    utc_day: "2026-10-20",
    effective_at: null,
    effective_note: null,
    reset_offer: null,
    allocation: "subscription_usage",
    audience: { scope: "broad", statement: "SYNTHETIC: paid subscribers", plans: ["pro", "max"], exclusions: "SYNTHETIC: excludes team" },
    windows: ["five_hour", "weekly"],
    sources: [{
      url: "https://example.invalid/source/synthetic-original-001",
      handle: "synthetic_author",
      display_name: "SYNTHETIC Source",
      role: "original",
      kind: "x_post",
      posted_at: "2026-10-20T10:00:00Z",
      excerpt: "SYNTHETIC source excerpt.",
    }],
    url: "https://example.invalid/events/synthetic-event-001",
    first_published_at: "2026-10-20T10:00:00Z",
    revised_at: "2026-10-20T10:00:00Z",
    revision: 1,
    correction: null,
    related_event_ids: [],
    ...overrides,
  };
}

export function syntheticMeta(): ClaudePage["meta"] {
  return {
    api_version: "v1",
    generated_at: "2026-10-21T12:00:00Z",
    content_revision: "SYNTHETIC-content-revision-1",
    editorial_reviewed_at: "2026-10-21T11:00:00Z",
    coverage_start: "2026-01-01",
  };
}

export function syntheticPage(
  events: ClaudeEvent[] = [syntheticEvent()],
  overrides: Partial<ClaudePage> = {},
): ClaudePage {
  return {
    data: events,
    pagination: { has_more: false, next_cursor: null, revision_changed: false },
    meta: syntheticMeta(),
    ...overrides,
  };
}

export function syntheticStatus(): ClaudeStatus {
  const event = syntheticEvent();
  return {
    data: {
      latest_reset: event,
      latest_ambiguous: null,
      announced_reset: null,
      active_watch: null,
      reset_offers: [],
      stats: {
        total: 1,
        last_reset_at: "2026-10-20T10:00:00Z",
        last_reset_on: null,
        days_since_last: 1,
        avg_interval_days: 7,
        longest_gap_days: 14,
        eligible_gaps: 1,
        total_gaps: 1,
        exact_count: 1,
        partial_sample: false,
      },
      filters: { audience: "all", window: "any" },
    },
    meta: syntheticMeta(),
  };
}

export function syntheticSources(): ClaudeSources {
  return {
    data: [{
      id: "synthetic-source-001",
      handle: "synthetic_author",
      display_name: "SYNTHETIC Source",
      profile_url: "https://example.invalid/@synthetic_author",
      classification: "official",
      priority: "primary",
      relevance: "SYNTHETIC fixture only.",
      affiliation_evidence_url: "https://example.invalid/evidence/synthetic-affiliation",
      affiliation_evidence_note: "SYNTHETIC fixture only.",
      reset_evidence_urls: ["https://example.invalid/evidence/synthetic-reset"],
      verification_method: "SYNTHETIC fixture only.",
      last_reviewed_at: "2026-10-21",
      active: true,
      limitations: null,
    }],
    meta: syntheticMeta(),
  };
}
