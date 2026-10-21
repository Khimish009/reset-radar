import { describe, expect, it } from "vitest";
import { mapClaudeEvent } from "../src/providers/claude/mapping";
import {
  type ClaudeEvent,
  parseClaudeEvent,
  parseClaudePage,
  parseClaudeSources,
  parseClaudeStatus,
} from "../src/providers/claude/schema";
import {
  syntheticEvent,
  syntheticPage,
  syntheticSources,
  syntheticStatus,
} from "./fixtures/claude";

const now = new Date("2026-10-21T12:00:00Z");
const evidenceUrl = "https://example.invalid/source/synthetic-original-001";

describe("Claude v1 synthetic contract fixtures and schema", () => {
  it("accepts known contract enums and full page, status, and source shapes", () => {
    expect(parseClaudeEvent(syntheticEvent())).toMatchObject({
      kind: "usage_reset", event_status: "confirmed", allocation: "subscription_usage",
      time_precision: "exact", audience: { scope: "broad", plans: ["pro", "max"] },
      windows: ["five_hour", "weekly"],
    });
    expect(parseClaudePage(syntheticPage()).data).toHaveLength(1);
    expect(parseClaudeStatus(syntheticStatus()).data.active_watch).toBeNull();
    expect(parseClaudeStatus(syntheticStatus()).data.latest_ambiguous).toBeNull();
    expect(parseClaudeSources(syntheticSources()).data).toHaveLength(1);
  });

  it("accepts source review dates as either date-only or UTC instant, rejecting malformed dates", () => {
    const sources = syntheticSources();
    expect(parseClaudeSources(sources).data[0]?.last_reviewed_at).toBe("2026-10-21");
    expect(parseClaudeSources({
      ...sources,
      data: sources.data.map((source) => ({ ...source, last_reviewed_at: "2026-10-21T11:00:00Z" })),
    }).data[0]?.last_reviewed_at).toBe("2026-10-21T11:00:00Z");
    expect(() => parseClaudeSources({
      ...sources,
      data: sources.data.map((source) => ({ ...source, last_reviewed_at: "2026-02-30" })),
    })).toThrowError("claude_schema_rejected");
  });

  it("preserves audience scopes, plan selectors, exclusions, and reset windows", () => {
    const cases: Array<{ scope: ClaudeEvent["audience"]["scope"]; plans: ClaudeEvent["audience"]["plans"] }> = [
      { scope: "broad", plans: "all" },
      { scope: "limited", plans: "subscribers" },
      { scope: "unspecified", plans: "unspecified" },
      { scope: "limited", plans: ["free", "pro", "max", "team", "enterprise"] },
    ];
    for (const audience of cases) {
      const raw = syntheticEvent({
        audience: { ...audience, statement: "SYNTHETIC audience statement", exclusions: "SYNTHETIC exclusion" },
        windows: ["other", "unspecified", "weekly"],
      });
      const mapped = mapClaudeEvent(raw, now);
      expect(mapped.audience).toEqual(raw.audience);
      expect(mapped.windows).toEqual(raw.windows);
      expect(mapped.record.audience).toBe(raw.audience.statement);
    }
  });

  it("keeps a confirmed-looking reset in review when no explicit evidence assessment exists", () => {
    const mapped = mapClaudeEvent(syntheticEvent(), now);
    expect(mapped.record.action).toBe("needs_review");
    expect(mapped.reviewReasons).toContain("insufficient_evidence");
  });

  it("maps an explicitly assessed applied reset while leaving effective and delivered unknown", () => {
    const raw = syntheticEvent();
    const mapped = mapClaudeEvent(raw, now, {
      eventId: raw.id,
      revision: raw.revision,
      assertion: "applied",
      evidenceUrls: [evidenceUrl],
    });
    expect(mapped.record).toMatchObject({
      action: "confirmed_applied",
      effective: { precision: "unknown" },
      delivered: { precision: "unknown" },
    });
    expect(mapped.reviewReasons).toEqual([]);
  });

  it("retains a revision 2 expired credit offer without claiming reset or current activity", () => {
    const raw = syntheticEvent({
      id: "synthetic-offer-001",
      kind: "credit",
      revision: 2,
      event_status: "confirmed",
      reset_offer: { expires_on: "2026-10-20" },
      effective_at: "2026-10-19T00:00:00Z",
    });
    const mapped = mapClaudeEvent(raw, now);
    expect(mapped.record).toMatchObject({
      action: "banked_offer",
      expiresOn: "2026-10-20",
      effective: { precision: "exact", at: "2026-10-19T00:00:00Z" },
      delivered: { precision: "unknown" },
    });
    expect(mapped.record.action).not.toBe("confirmed_applied");
  });

  it("requires an explicit future target and assessment for an announced reset", () => {
    const raw = syntheticEvent({ event_status: "announced" });
    const base = {
      eventId: raw.id,
      revision: raw.revision,
      assertion: "future_announcement" as const,
      evidenceUrls: [evidenceUrl],
    };
    expect(mapClaudeEvent(raw, now, base).record.action).toBe("needs_review");
    const future = mapClaudeEvent(raw, now, { ...base, futureTarget: { precision: "exact", at: "2026-10-22T00:00:00Z" } });
    expect(future.record.action).toBe("announced_future");
    expect(future.record.effective).toEqual({ precision: "unknown" });
    const expired = mapClaudeEvent(raw, now, { ...base, futureTarget: { precision: "exact", at: "2026-10-21T11:59:59Z" } });
    expect(expired.record.action).toBe("needs_review");
    expect(expired.reviewReasons).toContain("future_target_not_established");
  });

  it("does not promote an announced reset when the explicit target has a malformed date or instant", () => {
    const raw = syntheticEvent({ event_status: "announced" });
    const assessment = {
      eventId: raw.id,
      revision: raw.revision,
      assertion: "future_announcement" as const,
      evidenceUrls: [evidenceUrl],
    };
    const malformedInstant = mapClaudeEvent(raw, now, {
      ...assessment,
      futureTarget: { precision: "exact", at: "2026-02-30T10:00:00Z" },
    });
    const malformedDate = mapClaudeEvent(raw, now, {
      ...assessment,
      futureTarget: { precision: "date", on: "2026-02-30" },
    });
    expect(malformedInstant.record.action).toBe("needs_review");
    expect(malformedInstant.reviewReasons).toContain("future_target_not_established");
    expect(malformedDate.record.action).toBe("needs_review");
    expect(malformedDate.reviewReasons).toContain("future_target_not_established");
  });

  it("does not convert date-only targets or announcements to UTC midnight", () => {
    const raw = syntheticEvent({
      event_status: "announced",
      time_precision: "date",
      announced_at: null,
      announced_on: "2026-10-20",
    });
    const mapped = mapClaudeEvent(raw, now, {
      eventId: raw.id,
      revision: raw.revision,
      assertion: "future_announcement",
      evidenceUrls: [evidenceUrl],
      futureTarget: { precision: "date", on: "2026-10-23" },
    });
    expect(mapped.record.action).toBe("announced_future");
    expect(mapped.record.announced).toEqual({ precision: "date", on: "2026-10-20" });
  });

  it("requires explicit correction or withdrawal assessment tied to the prior observed revision", () => {
    const previous = { eventId: "synthetic-event-001", revision: 1 };
    const correction = syntheticEvent({
      revision: 2,
      correction: { kind: "correction", reason: "SYNTHETIC corrected detail", at: "2026-10-21T11:00:00Z" },
    });
    const withdrawal = syntheticEvent({
      revision: 2,
      event_status: "retracted",
      correction: { kind: "retraction", reason: "SYNTHETIC withdrawn claim", at: "2026-10-21T11:00:00Z" },
    });
    const assessment = (assertion: "correction" | "withdrawal", prior?: typeof previous) => ({
      eventId: correction.id,
      revision: 2,
      assertion,
      evidenceUrls: [evidenceUrl],
      ...(prior ? { previous: prior } : {}),
    });
    expect(mapClaudeEvent(correction, now).record.action).toBe("needs_review");
    expect(mapClaudeEvent(correction, now, assessment("correction")).record.action).toBe("needs_review");
    expect(mapClaudeEvent(correction, now, assessment("correction", previous)).record.action).toBe("correction");
    expect(mapClaudeEvent(withdrawal, now, assessment("withdrawal", previous)).record.action).toBe("withdrawal");
    expect(mapClaudeEvent(withdrawal, now, assessment("correction", previous)).record.action).toBe("needs_review");
    // Revision 2 by itself is not proof that revision 1 was actually observed.
    expect(mapClaudeEvent(correction, now, assessment("correction", { ...previous, revision: 0 })).record.action).toBe("needs_review");
  });

  it("puts unsupported event kinds and allocations into review", () => {
    const unsupported = [
      syntheticEvent({ kind: "limit_increase" }),
      syntheticEvent({ kind: "incident" }),
      syntheticEvent({ allocation: "api" }),
      syntheticEvent({ reset_offer: { expires_on: "2026-12-01" } }),
    ];
    for (const raw of unsupported) {
      expect(mapClaudeEvent(raw, now).record.action).toBe("needs_review");
      expect(mapClaudeEvent(raw, now).reviewReasons).toContain("unsupported_kind_or_allocation");
    }
  });
});

describe("Claude schema rejects unsupported or malformed payloads safely", () => {
  it.each([
    ["unknown root field", (raw: Record<string, unknown>) => ({ ...raw, extra: "SYNTHETIC" })],
    ["unknown enum", (raw: Record<string, unknown>) => ({ ...raw, kind: "synthetic_new_kind" })],
    ["unknown nested field", (raw: Record<string, unknown>) => ({ ...raw, audience: { ...(raw.audience as object), extra: true } })],
    ["missing required field", (raw: Record<string, unknown>) => { const copy = { ...raw }; delete copy.title; return copy; }],
    ["wrong field type", (raw: Record<string, unknown>) => ({ ...raw, revision: "2" })],
    ["invalid calendar date", (raw: Record<string, unknown>) => ({ ...raw, announced_on: "2026-02-30" })],
    ["malformed timestamp", (raw: Record<string, unknown>) => ({ ...raw, announced_at: "2026-10-20T10:00:00+00:00" })],
    ["timestamp with invalid day", (raw: Record<string, unknown>) => ({ ...raw, announced_at: "2026-02-30T10:00:00Z" })],
  ])("rejects %s with a fixed safe error", (_label, mutate) => {
    let thrown: unknown;
    try {
      parseClaudeEvent(mutate(syntheticEvent() as unknown as Record<string, unknown>));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("claude_schema_rejected");
    expect((thrown as Error).message).not.toContain("SYNTHETIC");
  });

  it("rejects stage 0 projections as incomplete contract payloads", () => {
    // These are deliberately tiny stage-0 projections, not captured upstream fixtures.
    const projection = { id: "synthetic-stage0-projection", kind: "usage_reset", date: "2026-10-20" };
    expect(() => parseClaudeEvent(projection)).toThrowError("claude_schema_rejected");
    expect(() => parseClaudePage({ data: [projection] })).toThrowError("claude_schema_rejected");
  });
});
