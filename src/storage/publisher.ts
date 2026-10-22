import type { Provider } from '../domain/event';

export const SIMULATION_ENVIRONMENT = 'stage5_local_simulation' as const;
export const SYNTHETIC_CHAT_ID = -1000000000005;
export interface CandidateCursor { readonly createdAt: string; readonly transitionId: string }
export interface PublicationCandidate extends CandidateCursor {
  readonly generation: number;
  readonly eventId: string;
  readonly provider: Provider;
  readonly sequence: number;
  readonly payload: string;
  readonly currentPayload: string;
  readonly currentTransitionId: string;
  readonly currentObservationKey: string;
}
export interface SimulationKey {
  readonly eventId: string;
  readonly transitionId: string;
  readonly destination: string;
}
export type SimulationState = 'claimed' | 'simulated_sent' | 'retryable' | 'rejected' | 'uncertain_manual_review';
export interface SimulationDelivery {
  readonly state: SimulationState;
  readonly attempts: number;
  readonly token: string;
  readonly retryAt: string | null;
  readonly messageId: number | null;
}
export interface PublisherRepository {
  listCandidates(input: {provider: Provider; limit: number; after?: CandidateCursor}): Promise<PublicationCandidate[]>;
  loadPrevious(eventId: string, transitionId: string, beforeSequence: number): Promise<string | null>;
  getDelivery(key: SimulationKey): Promise<SimulationDelivery | null>;
  claim(input: SimulationKey & {candidate: PublicationCandidate; generation: number; token: string; at: string}): Promise<boolean>;
  complete(input: SimulationKey & {token: string; at: string; state: Exclude<SimulationState, 'claimed'>; retryAt?: string; messageId?: number}): Promise<boolean>;
}

export function validSyntheticDestination(value: string): boolean {
  return /^synthetic:[a-zA-Z0-9_-]{1,190}$/.test(value);
}
function validateKey(key: SimulationKey) {
  if (!validSyntheticDestination(key.destination)) throw new Error('invalid_simulation_destination');
}
function validateAttempt(token: string, at: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(token) || !Number.isFinite(Date.parse(at))) throw new Error('invalid_simulation_attempt');
}

/** Separate from the Stage 4 synthetic journal; never records a real send. */
export function createPublisherRepository(db: D1Database): PublisherRepository {
  return {
    async listCandidates({provider, limit, after}) {
      if (!['claude', 'codex'].includes(provider) || !Number.isInteger(limit) || limit < 1 || limit > 50 ||
          (after && (!Number.isFinite(Date.parse(after.createdAt)) || !after.transitionId || after.transitionId.length > 8000))) {
        throw new Error('invalid_candidate_page');
      }
      const statement = db.prepare(`
        SELECT c.event_id AS eventId, c.transition_id AS transitionId, c.provider,
               c.created_at AS createdAt, p.generation, v.sequence, v.payload,
               e.payload AS currentPayload, e.transition_id AS currentTransitionId,
               e.observation_key AS currentObservationKey
          FROM publication_candidates c
          JOIN event_versions v ON v.event_id = c.event_id AND v.transition_id = c.transition_id
          JOIN events e ON e.id = c.event_id
          JOIN provider_activation p ON p.provider = c.provider
         WHERE c.provider = ?1 AND c.state = 'pending'
           ${after ? 'AND (c.created_at, c.transition_id) > (?3, ?4)' : ''}
         ORDER BY c.created_at, c.transition_id LIMIT ?2
      `);
      const result = await (after
        ? statement.bind(provider, limit, after.createdAt, after.transitionId)
        : statement.bind(provider, limit)).all<PublicationCandidate>();
      return result.results;
    },
    async loadPrevious(eventId, transitionId, beforeSequence) {
      return db.prepare(`SELECT payload FROM event_versions
        WHERE event_id = ?1 AND transition_id = ?2 AND sequence < ?3`)
        .bind(eventId, transitionId, beforeSequence).first<string>('payload');
    },
    async getDelivery(key) {
      validateKey(key);
      return db.prepare(`SELECT state, attempts, token, retry_at AS retryAt, message_id AS messageId
        FROM telegram_simulation_deliveries WHERE environment = ?1 AND event_id = ?2
        AND transition_id = ?3 AND destination = ?4`)
        .bind(SIMULATION_ENVIRONMENT, key.eventId, key.transitionId, key.destination).first<SimulationDelivery>();
    },
    async claim(input) {
      validateKey(input);
      validateAttempt(input.token, input.at);
      if (input.generation !== input.candidate.generation) return false;
      if (input.eventId !== input.candidate.eventId || input.transitionId !== input.candidate.transitionId) {
        throw new Error('candidate_identity_mismatch');
      }
      // Snapshot generation + observation CAS closes a concurrent ingestion race.
      // A claimed row has no lease recovery: after a crash it remains blocked.
      const result = await db.prepare(`
        INSERT INTO telegram_simulation_deliveries
          (environment,event_id,transition_id,destination,token,state,attempts,updated_at)
        SELECT ?1, c.event_id, c.transition_id, ?4, ?5, 'claimed', 1, ?6
          FROM publication_candidates c JOIN events e ON e.id = c.event_id
          JOIN provider_activation p ON p.provider = c.provider
         WHERE c.event_id = ?2 AND c.transition_id = ?3 AND c.state = 'pending'
           AND e.transition_id = c.transition_id AND e.observation_key = ?7
           AND p.generation = ?8 AND p.baseline_completed_at IS NOT NULL AND p.last_status = 'success'
        ON CONFLICT(environment,event_id,transition_id,destination) DO UPDATE SET
          token = excluded.token, state = 'claimed', attempts = attempts + 1,
          retry_at = NULL, message_id = NULL, updated_at = excluded.updated_at
        WHERE state = 'retryable' AND retry_at <= excluded.updated_at AND attempts < 3
          AND token <> excluded.token
      `).bind(SIMULATION_ENVIRONMENT, input.eventId, input.transitionId, input.destination,
        input.token, input.at, input.candidate.currentObservationKey, input.generation).run();
      return result.meta.changes === 1;
    },
    async complete(input) {
      validateKey(input);
      validateAttempt(input.token, input.at);
      if (!['simulated_sent', 'retryable', 'rejected', 'uncertain_manual_review'].includes(input.state) ||
          (input.state === 'retryable' && (!input.retryAt || !Number.isFinite(Date.parse(input.retryAt)) ||
            Date.parse(input.retryAt) <= Date.parse(input.at) || Date.parse(input.retryAt) > Date.parse(input.at) + 3_600_000)) ||
          (input.state === 'simulated_sent' && (!Number.isSafeInteger(input.messageId) || input.messageId! <= 0))) {
        throw new Error('invalid_simulation_outcome');
      }
      const result = await db.prepare(`UPDATE telegram_simulation_deliveries
        SET state = ?1, retry_at = ?2, message_id = ?3, updated_at = ?4
        WHERE environment = ?5 AND event_id = ?6 AND transition_id = ?7 AND destination = ?8
          AND token = ?9 AND state = 'claimed'`)
        .bind(input.state, input.state === 'retryable' ? input.retryAt! : null,
          input.state === 'simulated_sent' ? input.messageId! : null, input.at, SIMULATION_ENVIRONMENT,
          input.eventId, input.transitionId, input.destination, input.token).run();
      return result.meta.changes === 1;
    },
  };
}
