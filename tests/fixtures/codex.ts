import type { CodexEvent, CodexFeed, CodexScheduled } from '../../src/providers/codex/schema';

/** Full synthetic contract fixtures. Values are reserved example.invalid data. */
export function codexEvent(overrides: Partial<CodexEvent> = {}): CodexEvent {
  return {
    id: 'synthetic-codex-event-001', date: '2026-10-20', ts: '2026-10-19T12:00:00Z',
    kind: 'regular', scope: 'synthetic paid tier and enterprise cohort',
    summary: 'SYNTHETIC: contract-shaped example only.', summary_unavailable: false,
    url: 'https://example.invalid/events/synthetic-codex-event-001', seeded: false,
    announced_at: '2026-10-19T12:00:00Z', delivered_at: null, delivered_source_url: null,
    delivery_reported_delay: false, delivery_note_en: null,
    ...overrides,
  };
}

export function codexScheduled(overrides: Partial<CodexScheduled> = {}): CodexScheduled {
  return {
    certainty: 'announced', day: '2026-10-23', scheduled_for: null,
    when_text: 'SYNTHETIC local time text', url: 'https://example.invalid/posts/synthetic-schedule',
    source: 'synthetic_account', announced_at: '2026-10-20T12:00:00Z',
    ...overrides,
  };
}

export function codexFeed(overrides: Partial<CodexFeed> = {}): CodexFeed {
  return {
    schema_version: 1, generated_at: '2026-10-21T12:00:00Z', source: 'https://codexreset.ai',
    attribution: {
      seed_archive: 'https://example.invalid/archive/codex-history',
      note: 'SYNTHETIC archive provenance for local tests.',
    },
    events: [codexEvent()], scheduled: null,
    ...overrides,
  };
}
