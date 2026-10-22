import type { Env } from '../env';
import type { Provider } from '../domain/event';
import type { RuntimeDependencies } from '../runtime';
import { createIngestionService } from './ingest';
import type { IngestResult } from './ingest';
import { createD1Repository } from '../storage/d1';

const MAX_CLAUDE_FETCHES = 5;
const MAX_CODEX_FETCHES = 1;
const CLAUDE_ORIGIN = 'https://clauderesets.com';
const CODEX_ORIGIN = 'https://codexreset.ai';

export interface ScheduledProviderResult {
  readonly provider: Provider;
  readonly outcome: 'success' | 'incomplete' | 'failure' | 'concurrent_sync';
  readonly complete: boolean;
  readonly committed: boolean;
  readonly baselineCompleted: boolean;
  readonly reason: string | null;
}

export interface ScheduledSummary {
  readonly providers: readonly ScheduledProviderResult[];
  readonly publication: {
    readonly available: false;
    readonly state: 'blocked';
    readonly reason: 'no_real_publisher';
  };
}

function providerForUrl(input: RequestInfo | URL): { provider: Provider; url: URL } {
  const rawUrl = input instanceof Request ? input.url : input.toString();
  const url = new URL(rawUrl);
  const safeUrl = url.username === '' && url.password === '' && url.hash === '';
  const claudeStatus = url.pathname === '/api/v1/status' && url.search === '';
  const claudeHistory = url.pathname === '/api/v1/resets' &&
    url.searchParams.get('limit') === '25' &&
    url.searchParams.getAll('limit').length === 1 &&
    [...url.searchParams.keys()].every((key) => key === 'limit' || key === 'cursor') &&
    url.searchParams.getAll('cursor').length <= 1 &&
    (url.searchParams.get('cursor') === null || /^[A-Za-z0-9_-]{1,1024}$/.test(url.searchParams.get('cursor') ?? ''));
  if (safeUrl && url.origin === CLAUDE_ORIGIN && (claudeHistory || claudeStatus)) {
    return { provider: 'claude', url };
  }
  if (safeUrl && url.origin === CODEX_ORIGIN && url.pathname === '/api/v1/resets.json' && url.search === '') {
    return { provider: 'codex', url };
  }
  throw new Error('upstream_request_rejected');
}

/** Enforce this invocation's provider call ceilings around the existing transports. */
function boundedFetch(fetch: RuntimeDependencies['fetch']): RuntimeDependencies['fetch'] {
  const calls: Record<Provider, number> = { claude: 0, codex: 0 };
  return async (input, init) => {
    const { provider } = providerForUrl(input);
    const limit = provider === 'claude' ? MAX_CLAUDE_FETCHES : MAX_CODEX_FETCHES;
    if (calls[provider] >= limit || init?.method !== 'GET' || init.redirect !== 'error') {
      throw new Error('invocation_budget_exceeded');
    }
    calls[provider] += 1;
    return fetch(input, init);
  };
}

function resultOutcome(result: IngestResult): ScheduledProviderResult['outcome'] {
  if (result.reason === 'concurrent_sync') {
    return 'concurrent_sync';
  }
  if (!result.committed) return 'failure';
  return result.complete ? 'success' : 'incomplete';
}

/** Run independent provider ingestion against the explicitly bound local/staging D1. */
export async function runScheduledIngestion(
  env: Env & { readonly DB: D1Database },
  dependencies: RuntimeDependencies,
): Promise<ScheduledSummary> {
  const scopedDependencies = { ...dependencies, fetch: boundedFetch(dependencies.fetch) };
  const ingestion = createIngestionService(createD1Repository(env.DB), scopedDependencies);
  const settled = await ingestion.ingestAll({
    claudeHistory: { limit: 25, maxPages: 4 },
    maxRecords: 100,
  });

  const providers = settled.map((item, index): ScheduledProviderResult => {
    const provider: Provider = index === 0 ? 'claude' : 'codex';
    if (item.status === 'rejected') {
      return { provider, outcome: 'failure', complete: false, committed: false,
        baselineCompleted: false, reason: 'persistence_or_ingestion_failure' };
    }
    const result = item.value;
    return { ...result, outcome: resultOutcome(result) };
  });
  return {
    providers,
    publication: { available: false, state: 'blocked', reason: 'no_real_publisher' },
  };
}
