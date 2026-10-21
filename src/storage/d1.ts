import type { EventAction, Provider } from '../domain/event';
import type {
  CommitSnapshotInput,
  CommitSnapshotResult,
  DeliveryRecord,
  D1Repository,
  ProviderActivation,
  SourceState,
  SyntheticOutcome,
} from './types';
import type { StoredEventInput } from './types';

interface ActivationRow {
  generation: number;
  baseline_completed_at: string | null;
  publish_approved_at: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_status: ProviderActivation['lastStatus'];
  last_reason: string | null;
}

interface EventRow extends StoredEventInput {
  first_detected_at: string;
  last_observed_at: string;
  transition_id: string;
}

interface VersionRow extends StoredEventInput {
  firstDetectedAt: string;
  lastObservedAt: string;
  transitionId: string;
}

interface ExistingEventRow {
  id: string;
  provider: Provider;
  upstream: string;
  external_id: string;
  material_hash: string;
  first_detected_at: string;
  sequence: number;
}

interface SourceRow {
  provider: Provider;
  endpoint_key: string;
  snapshot: string | null;
  etag: string | null;
  checked_at: string | null;
  expires_at: number;
  retry_until: number;
  failure_count: number;
  retained_until: number;
}

interface DeliveryRow {
  event_id: string;
  transition_id: string;
  destination: string;
  token: string;
  state: DeliveryRecord['state'];
  attempts: number;
  message_id: string | null;
  updated_at: string;
}

const ACTIONS = new Set<EventAction>([
  'announced_future',
  'confirmed_applied',
  'banked_offer',
  'correction',
  'withdrawal',
  'needs_review',
]);

function activation(row: ActivationRow | null): ProviderActivation {
  if (!row) throw new Error('Provider activation row is missing');
  return {
    generation: row.generation,
    baselineCompletedAt: row.baseline_completed_at,
    publishApprovedAt: row.publish_approved_at,
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    lastStatus: row.last_status,
    lastReason: row.last_reason,
  };
}

function assertStoredEvent(event: StoredEventInput, provider: Provider): void {
  if (event.provider !== provider) throw new Error('Snapshot event provider mismatch');
  if (!ACTIONS.has(event.action)) throw new Error('Unsupported event action');
  if (!event.id || !event.upstream || !event.externalId || !event.materialHash || !event.observationKey) {
    throw new Error('Stored event identity and material hash are required');
  }
  JSON.parse(event.payload);
}

function sourceFrom(row: SourceRow): SourceState {
  return {
    provider: row.provider,
    endpointKey: row.endpoint_key,
    snapshot: row.snapshot,
    etag: row.etag,
    checkedAt: row.checked_at,
    expiresAt: row.expires_at,
    retryUntil: row.retry_until,
    failureCount: row.failure_count,
    retainedUntil: row.retained_until,
  };
}

function deliveryFrom(row: DeliveryRow | null): DeliveryRecord | null {
  if (!row) return null;
  return {
    eventId: row.event_id,
    transitionId: row.transition_id,
    destination: row.destination,
    token: row.token,
    state: row.state,
    attempts: row.attempts,
    messageId: row.message_id,
    updatedAt: row.updated_at,
  };
}

function assertSyntheticDestination(destination: string): void {
  const hasControlCharacter = Array.from(destination).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!destination.startsWith('synthetic:') || destination.length > 200 || destination.length === 10 || hasControlCharacter) {
    throw new Error('Synthetic delivery destination must start with synthetic:');
  }
}

function assertToken(token: string): void {
  if (!token.trim() || token.length > 200) throw new Error('Delivery claim token must be non-empty and at most 200 characters');
}

function boundedReason(reason: string | null): string | null {
  if (reason === null) return null;
  return Array.from(reason, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('').slice(0, 500);
}

export function createD1Repository(db: D1Database): D1Repository {
  return {
    async loadProvider(provider) {
      const row = await db.prepare(
        `SELECT generation, baseline_completed_at, publish_approved_at,
                last_attempt_at, last_success_at, last_status, last_reason
           FROM provider_activation WHERE provider = ?1`,
      ).bind(provider).first<ActivationRow>();
      return activation(row);
    },

    async loadEvents(provider) {
      const result = await db.prepare(
        `SELECT e.id, e.provider, e.upstream, e.external_id AS externalId,
                e.material_hash AS materialHash, e.observation_key AS observationKey,
                e.assessment_key AS assessmentKey, e.upstream_revision AS upstreamRevision,
                e.action, e.event_date AS eventDate, e.detected_at AS detectedAt,
                e.payload, COALESCE(v.candidate, 0) AS candidate,
                e.first_detected_at, e.last_observed_at, e.transition_id
           FROM events e
           LEFT JOIN event_versions v ON v.transition_id = e.transition_id
          WHERE e.provider = ?1
          ORDER BY e.event_date DESC, e.id DESC`,
      ).bind(provider).all<EventRow>();
      return result.results.map((row) => ({
        id: row.id,
        provider: row.provider,
        upstream: row.upstream,
        externalId: row.externalId,
        materialHash: row.materialHash,
        observationKey: row.observationKey,
        assessmentKey: row.assessmentKey,
        upstreamRevision: row.upstreamRevision,
        action: row.action,
        eventDate: row.eventDate,
        detectedAt: row.detectedAt,
        payload: row.payload,
        candidate: Boolean(row.candidate),
        firstDetectedAt: row.first_detected_at,
        lastObservedAt: row.last_observed_at,
        transitionId: row.transition_id,
      }));
    },

    async loadVersion(eventId, transitionId) {
      const row = await db.prepare(
        `SELECT e.id, e.provider, e.upstream, e.external_id AS externalId,
                v.material_hash AS materialHash, v.observation_key AS observationKey,
                v.assessment_key AS assessmentKey, v.upstream_revision AS upstreamRevision,
                v.action, v.event_date AS eventDate, v.detected_at AS detectedAt,
                v.payload, v.candidate, e.first_detected_at AS firstDetectedAt,
                v.detected_at AS lastObservedAt, v.transition_id AS transitionId
           FROM event_versions v
           JOIN events e ON e.id = v.event_id
          WHERE v.event_id = ?1 AND v.transition_id = ?2`,
      ).bind(eventId, transitionId).first<VersionRow>();
      if (!row) return null;
      return {
        id: row.id,
        provider: row.provider,
        upstream: row.upstream,
        externalId: row.externalId,
        materialHash: row.materialHash,
        observationKey: row.observationKey,
        assessmentKey: row.assessmentKey,
        upstreamRevision: row.upstreamRevision,
        action: row.action,
        eventDate: row.eventDate,
        detectedAt: row.detectedAt,
        payload: row.payload,
        candidate: Boolean(row.candidate),
        firstDetectedAt: row.firstDetectedAt,
        lastObservedAt: row.lastObservedAt,
        transitionId: row.transitionId,
      };
    },

    async loadSources(provider) {
      const result = await db.prepare(
        `SELECT provider, endpoint_key, snapshot, etag, checked_at, expires_at,
                retry_until, failure_count, retained_until
           FROM source_state WHERE provider = ?1 ORDER BY endpoint_key`,
      ).bind(provider).all<SourceRow>();
      return result.results.map(sourceFrom);
    },

    async commitSnapshot(input: CommitSnapshotInput): Promise<CommitSnapshotResult> {
      const before = await this.loadProvider(input.provider);
      if (before.generation !== input.expectedGeneration) {
        return { committed: false, baselineCompleted: false };
      }
      const completingBaseline = input.complete && before.baselineCompletedAt === null;
      const shouldStoreEvents = input.complete;
      const events = shouldStoreEvents ? input.events : [];
      const ids = new Set<string>();
      const observations = new Set<string>();
      for (const event of events) {
        assertStoredEvent(event, input.provider);
        if (ids.has(event.id)) throw new Error('Snapshot contains duplicate event ids');
        const observationId = `${event.id}\0${event.observationKey}`;
        if (observations.has(observationId)) throw new Error('Snapshot contains duplicate observation keys');
        ids.add(event.id);
        observations.add(observationId);
      }
      const currentRows = shouldStoreEvents
        ? await db.prepare(
          `SELECT e.id, e.provider, e.upstream, e.external_id, e.material_hash, e.first_detected_at,
                  COALESCE((SELECT MAX(v.sequence) FROM event_versions v WHERE v.event_id = e.id), 0) AS sequence
             FROM events e WHERE e.provider = ?1`,
        ).bind(input.provider).all<ExistingEventRow>()
        : { results: [] as ExistingEventRow[] };
      const currentById = new Map(currentRows.results.map((row) => [row.id, row]));

      const statements: D1PreparedStatement[] = [];
      const guardId = crypto.randomUUID();
      statements.push(db.prepare(
        `INSERT INTO commit_guards (guard_id, allowed)
         VALUES (?1, COALESCE((SELECT 1 FROM provider_activation
                                WHERE provider = ?2 AND generation = ?3), 0))`,
      ).bind(guardId, input.provider, input.expectedGeneration));

      statements.push(db.prepare(
        `UPDATE provider_activation
            SET generation = generation + 1,
                baseline_completed_at = CASE
                  WHEN ?1 = 1 AND baseline_completed_at IS NULL THEN ?2
                  ELSE baseline_completed_at END,
                last_attempt_at = ?2,
                last_success_at = CASE WHEN ?5 = 'success' THEN ?2 ELSE last_success_at END,
                last_status = ?5,
                last_reason = ?6
          WHERE provider = ?3 AND generation = ?4`,
      ).bind(input.complete ? 1 : 0, input.at, input.provider, input.expectedGeneration, input.status, boundedReason(input.reason)));

      for (const event of events) {
        const previous = currentById.get(event.id);
        if (previous && (previous.provider !== event.provider || previous.upstream !== event.upstream || previous.external_id !== event.externalId)) {
          throw new Error('Stored event namespace identity is immutable');
        }
        const isTransition = !previous || previous.material_hash !== event.materialHash;
        const sequence = isTransition ? (previous?.sequence ?? 0) + 1 : previous?.sequence ?? 1;
        const transitionId = `${event.id}#${sequence}`;
        const firstDetectedAt = previous?.first_detected_at ?? event.detectedAt;

        statements.push(db.prepare(
          `INSERT INTO events (
             id, provider, upstream, external_id, material_hash, transition_id,
             observation_key, assessment_key, upstream_revision, action, event_date,
             detected_at, first_detected_at, last_observed_at, payload
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?15, ?14)
           ON CONFLICT(id) DO UPDATE SET
             material_hash = excluded.material_hash,
             transition_id = excluded.transition_id,
             observation_key = excluded.observation_key,
             assessment_key = excluded.assessment_key,
             upstream_revision = excluded.upstream_revision,
             action = excluded.action,
             event_date = excluded.event_date,
             detected_at = excluded.detected_at,
             last_observed_at = excluded.last_observed_at,
             payload = excluded.payload`,
        ).bind(
          event.id, event.provider, event.upstream, event.externalId, event.materialHash,
          transitionId, event.observationKey, event.assessmentKey, event.upstreamRevision,
          event.action, event.eventDate, event.detectedAt, firstDetectedAt, event.payload, input.at,
        ));

        statements.push(db.prepare(
          `INSERT OR IGNORE INTO observations
             (event_id, observation_key, detected_at, assessment_key, upstream_revision, payload)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        ).bind(event.id, event.observationKey, event.detectedAt, event.assessmentKey, event.upstreamRevision, event.payload));

        if (isTransition) {
          const candidate = !completingBaseline && before.baselineCompletedAt !== null && event.candidate;
          statements.push(db.prepare(
            `INSERT INTO event_versions (
               event_id, sequence, transition_id, material_hash, observation_key,
               assessment_key, upstream_revision, action, event_date, detected_at, payload, candidate
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
          ).bind(
            event.id, sequence, transitionId, event.materialHash, event.observationKey,
            event.assessmentKey, event.upstreamRevision, event.action, event.eventDate,
            event.detectedAt, event.payload, candidate ? 1 : 0,
          ));
          if (candidate) {
            statements.push(db.prepare(
              `INSERT INTO publication_candidates (transition_id, event_id, provider, created_at)
               VALUES (?1, ?2, ?3, ?4)`,
            ).bind(transitionId, event.id, event.provider, input.at));
          }
        }
      }
      for (const source of input.sources) {
        statements.push(db.prepare(
          `INSERT INTO source_state (
             provider, endpoint_key, snapshot, etag, checked_at, expires_at,
             retry_until, failure_count, retained_until
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
           ON CONFLICT(provider, endpoint_key) DO UPDATE SET
             snapshot = excluded.snapshot,
             etag = excluded.etag,
             checked_at = excluded.checked_at,
             expires_at = excluded.expires_at,
             retry_until = excluded.retry_until,
             failure_count = excluded.failure_count,
             retained_until = excluded.retained_until`,
        ).bind(
          input.provider, source.endpointKey, source.snapshot, source.etag, source.checkedAt,
          source.expiresAt, source.retryUntil, source.failureCount, source.retainedUntil,
        ));
      }
      statements.push(db.prepare(
        `DELETE FROM source_state
          WHERE provider = ?1 AND endpoint_key <> '$transport'
            AND snapshot IS NULL AND retry_until < ?2`,
      ).bind(input.provider, Date.parse(input.at)));

      statements.push(db.prepare(
        `INSERT INTO sync_runs (provider, generation, started_at, status, complete_snapshot, event_count, source_count, reason)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      ).bind(input.provider, input.expectedGeneration + 1, input.at, input.status, input.complete ? 1 : 0, events.length, input.sources.length, boundedReason(input.reason)));
      statements.push(db.prepare(
        `DELETE FROM sync_runs
          WHERE provider = ?1 AND run_id NOT IN (
            SELECT run_id FROM sync_runs WHERE provider = ?1 ORDER BY run_id DESC LIMIT 100
          )`,
      ).bind(input.provider));
      statements.push(db.prepare('DELETE FROM commit_guards WHERE guard_id = ?1').bind(guardId));

      try {
        await db.batch(statements);
      } catch (error) {
        const after = await this.loadProvider(input.provider);
        if (after.generation !== input.expectedGeneration) {
          return { committed: false, baselineCompleted: false };
        }
        throw error;
      }
      return { committed: true, baselineCompleted: completingBaseline };
    },

    async claimSynthetic({ eventId, transitionId, destination, token, at }) {
      assertSyntheticDestination(destination);
      assertToken(token);
      const result = await db.prepare(
        `INSERT INTO synthetic_deliveries
           (event_id, transition_id, destination, token, state, attempts, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'claimed', 1, ?5)
         ON CONFLICT(event_id, transition_id, destination) DO UPDATE SET
           token = excluded.token, state = 'claimed', attempts = synthetic_deliveries.attempts + 1,
           message_id = NULL, updated_at = excluded.updated_at
         WHERE synthetic_deliveries.state = 'retryable'`,
      ).bind(eventId, transitionId, destination, token, at).run();
      return result.meta.changes > 0;
    },

    async completeSynthetic({ eventId, transitionId, destination, token, at, outcome, messageId }) {
      assertSyntheticDestination(destination);
      assertToken(token);
      if (outcome === 'sent' && !messageId?.trim()) throw new Error('Sent delivery outcome requires a message id');
      const result = await db.prepare(
        `UPDATE synthetic_deliveries
            SET state = ?1, message_id = ?2, updated_at = ?3
          WHERE event_id = ?4 AND transition_id = ?5 AND destination = ?6
            AND token = ?7 AND state = 'claimed'`,
      ).bind(outcome satisfies SyntheticOutcome, messageId ?? null, at, eventId, transitionId, destination, token).run();
      return result.meta.changes > 0;
    },

    async getDelivery({ eventId, transitionId, destination }) {
      assertSyntheticDestination(destination);
      const row = await db.prepare(
        `SELECT event_id, transition_id, destination, token, state, attempts, message_id, updated_at
           FROM synthetic_deliveries
          WHERE event_id = ?1 AND transition_id = ?2 AND destination = ?3`,
      ).bind(eventId, transitionId, destination).first<DeliveryRow>();
      return deliveryFrom(row);
    },
  };
}
