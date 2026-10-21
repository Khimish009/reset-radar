import type { Provider } from '../domain/event';

/** Untrusted source data, to be runtime-validated by later source adapters. */
export interface ProviderSnapshot {
  readonly provider: Provider;
  readonly upstream: string;
  readonly sourceUrl: string;
  readonly fetchedAt: string;
  readonly payload: unknown;
}

export interface ProviderIdentity {
  readonly provider: Provider;
  readonly upstream: string;
}
