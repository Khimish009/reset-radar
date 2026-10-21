# 18 — Analytics methodology: observed history, not promises

## Critical disclaimer

Community trackers curate public events. **They may miss announcements, have uneven start dates, delay verification or import older records from other archives.** Reset Radar metrics describe **events recorded and accepted by our pipeline**, *not the total universe of Anthropic/OpenAI resets*. Never label a guessed future time “confirmed”.

## Accepted types and population

- A **confirmed reset** has evidence of applied/delivered action in original statements or trustworthy cited records, not merely `kind=regular` or an `announced_at` timestamp.
- A **future announcement** is an unfulfilled announcement, counted separately. A hint or prediction is NOT eligible for confirmation or scheduled notification.
- A **banked/redeemable offer** is an additional credit; count separately from confirmed consumed/applied resets, even if later activates.
- **Correction/withdrawal** is a revision of a public claim, not an additional reset event.
- `needs_review` is excluded from public confirmed-reset metrics. Historic `seeded` events must preserve archive provenance; chart can show separately or explicitly state inclusion.

## Initial metrics

1. `observedConfirmedResets`: count of distinct accepted canonical events, unique by internal event ID and provider, within explicit time window. Multiple revisions for same event counted once.
2. `monthlyConfirmedResets`: group confirmed events by **event effective/delivered date if valid**, otherwise exclude from confirmed chart; UTC month boundaries by default. UI may localize label but should not silently shift monthly grouping.
3. `lastObservedConfirmedAt`: most recent evidence-backed delivered/applied instant **only if exact time exists**; otherwise show date-only with its precision, never infer midnight.
4. `bankedOfferCount` and `announcedFutureCount`: distinct categories, separate from applied resets and historically rescinded items.
5. `averageGapDays` / `medianGapDays`: **optional**, based on strictly ordered, verified instants in a declared observation range. Need >=2 eligible events, show number of intervals, describe affected providers and source coverage. Do not use it to predict next reset.

## Coverage and data quality

- Track `coverageStart` per upstream and `firstSeenAt` per event. Imported historical records may carry source event dates predating our observation start; label `historicalSeed` explicitly.
- Do not compare provider cadence on different periods without warning; default stats display **both coverage ranges** and indicate unequal sampling.
- If source's historical backfill or revisions are incomplete, preserve uncertainty and avoid causal/comparative ranking (“Claude resets less often”) unless defensible in selected window.
- Never mix 5-hour recurring personal window resets with global bonus reset events.
- For small sample `n<2`, don't calculate interval. For bigger n still explain sample bias and non-guarantee.

## Testing examples

- Two versions of one event produce one reset count; retraction removes it from active confirmed counts but remains in audit.
- One `announced_future` becomes `confirmed_applied` as verified: count applies after confirmation only; previous announcement category changes according to clearly documented snapshot vs historical-announcements definition.
- Date-only announcements are not converted to `T00:00:00Z` for intervals.
- Historic seeded+native records have no duplicates if manually linked by real source ID/URL, not timestamp similarity.
- Partial upstream outage keeps historical counts as *last-known*, with per-source stale warning.

## Copy policy

Preferred: “**Зафиксировано 12 подтверждённых сбросов за выбранный период** (по данным доступных источников).”

Not allowed: “Claude точно сбрасывает лимит каждые 12 дней” or “Ваш лимит восстановится завтра”.
