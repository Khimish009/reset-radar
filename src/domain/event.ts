export type Provider = 'claude' | 'codex';

export type EventAction =
  | 'announced_future'
  | 'confirmed_applied'
  | 'banked_offer'
  | 'correction'
  | 'withdrawal'
  | 'needs_review';

/** Exact instants use ISO UTC; date-only values have no inferred timezone. */
export type EventTime =
  | { readonly precision: 'exact'; readonly at: string }
  | { readonly precision: 'date'; readonly on: string }
  | { readonly precision: 'unknown' };

export interface Provenance {
  readonly upstream: string;
  readonly upstreamUrl: string;
  readonly sourceUrl: string | null;
  readonly evidenceUrls: readonly string[];
  readonly externalId: string;
  readonly rawKind: string | null;
  readonly rawStatus: string | null;
  readonly revision: string | null;
  readonly historicalSeed: boolean;
  readonly seedArchiveUrl: string | null;
}

/** Internal vocabulary only: no normalization policy, DB or public API schema. */
export interface EventRecord {
  readonly provider: Provider;
  readonly action: EventAction;
  readonly provenance: Provenance;
  readonly announced: EventTime;
  readonly effective: EventTime;
  readonly delivered: EventTime;
  readonly expiresOn: string | null;
  readonly audience: string | null;
}
