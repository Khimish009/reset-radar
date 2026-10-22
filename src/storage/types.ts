import type { EventAction, Provider } from '../domain/event';

export interface StoredEventInput {
  readonly id: string;
  readonly provider: Provider;
  readonly upstream: string;
  readonly externalId: string;
  readonly materialHash: string;
  readonly observationKey: string;
  readonly assessmentKey: string | null;
  readonly upstreamRevision: string | null;
  readonly action: EventAction;
  readonly eventDate: string | null;
  readonly detectedAt: string;
  readonly payload: string;
  readonly candidate: boolean;
}

export interface LoadedEvent extends StoredEventInput {
  readonly firstDetectedAt: string;
  readonly lastObservedAt: string;
  readonly transitionId: string;
}

export interface SourceStateInput {
  readonly endpointKey: string;
  readonly snapshot: string | null;
  readonly etag: string | null;
  readonly checkedAt: string | null;
  readonly expiresAt: number;
  readonly retryUntil: number;
  readonly failureCount: number;
  readonly retainedUntil: number;
}

export interface SourceState extends SourceStateInput {
  readonly provider: Provider;
}

export interface ProviderActivation {
  readonly generation: number;
  readonly baselineCompletedAt: string | null;
  readonly publishApprovedAt: string | null;
  readonly lastAttemptAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastStatus: SyncStatus | null;
  readonly lastReason: string | null;
}

export type SyncStatus = 'success' | 'partial' | 'failed';

export interface CommitSnapshotInput {
  readonly provider: Provider;
  readonly expectedGeneration: number;
  readonly at: string;
  readonly complete: boolean;
  readonly events: readonly StoredEventInput[];
  readonly sources: readonly SourceStateInput[];
  readonly status: SyncStatus;
  readonly reason: string | null;
}

export interface CommitSnapshotResult {
  readonly committed: boolean;
  readonly baselineCompleted: boolean;
}

export type SyntheticOutcome =
  | 'sent'
  | 'retryable'
  | 'rejected'
  | 'uncertain_manual_review';

export interface DeliveryRecord {
  readonly eventId: string;
  readonly transitionId: string;
  readonly destination: string;
  readonly token: string;
  readonly state: 'claimed' | SyntheticOutcome;
  readonly attempts: number;
  readonly messageId: string | null;
  readonly updatedAt: string;
}

export interface D1Repository {
  loadProvider(provider: Provider): Promise<ProviderActivation>;
  loadEvents(provider: Provider, limit?: number): Promise<LoadedEvent[]>;
  loadVersion(eventId: string, transitionId: string): Promise<LoadedEvent | null>;
  loadSources(provider: Provider): Promise<SourceState[]>;
  commitSnapshot(input: CommitSnapshotInput): Promise<CommitSnapshotResult>;
  claimSynthetic(input: {
    readonly eventId: string;
    readonly transitionId: string;
    readonly destination: string;
    readonly token: string;
    readonly at: string;
  }): Promise<boolean>;
  completeSynthetic(input: {
    readonly eventId: string;
    readonly transitionId: string;
    readonly destination: string;
    readonly token: string;
    readonly at: string;
    readonly outcome: SyntheticOutcome;
    readonly messageId?: string;
  }): Promise<boolean>;
  getDelivery(input: {
    readonly eventId: string;
    readonly transitionId: string;
    readonly destination: string;
  }): Promise<DeliveryRecord | null>;
}
