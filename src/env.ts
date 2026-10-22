/** Runtime configuration contains no credentials; DB is the canonical local/staging state. */
export interface Env {
  readonly APP_ENV?: string;
  readonly PUBLISH_MODE?: string;
  readonly INGEST_MODE?: string;
  readonly DB?: D1Database;
}

export type Environment = 'local' | 'staging' | 'production';

export interface RuntimeConfig {
  readonly environment: Environment;
  readonly publishMode: 'dry_run';
  readonly ingestMode: 'off' | 'dry_run';
  readonly ingestionEnabled: boolean;
}

export function readConfig(env: Env): RuntimeConfig {
  const environment = env.APP_ENV ?? 'local';
  const publishMode = env.PUBLISH_MODE ?? 'dry_run';
  const ingestMode = env.INGEST_MODE ?? 'off';

  if (
    (environment !== 'local' && environment !== 'staging' && environment !== 'production') ||
    publishMode !== 'dry_run' ||
    (ingestMode !== 'off' && ingestMode !== 'dry_run') ||
    (ingestMode === 'dry_run' &&
      (env.APP_ENV !== 'local' && env.APP_ENV !== 'staging' || env.PUBLISH_MODE !== 'dry_run'))
  ) {
    // Configuration values can contain secrets; never interpolate them in errors.
    throw new Error('Unsupported runtime configuration');
  }

  return {
    environment,
    publishMode,
    ingestMode,
    ingestionEnabled: ingestMode === 'dry_run' && environment !== 'production',
  };
}
