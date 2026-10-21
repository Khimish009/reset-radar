/** Only non-secret configuration exists in Stage 1; no resource bindings. */
export interface Env {
  readonly APP_ENV?: string;
  readonly PUBLISH_MODE?: string;
}

export type Environment = 'local' | 'staging' | 'production';

export interface RuntimeConfig {
  readonly environment: Environment;
  readonly publishMode: 'dry_run';
}

export function readConfig(env: Env): RuntimeConfig {
  const environment = env.APP_ENV ?? 'local';
  const publishMode = env.PUBLISH_MODE ?? 'dry_run';

  if (
    (environment !== 'local' && environment !== 'staging' && environment !== 'production') ||
    publishMode !== 'dry_run'
  ) {
    // Configuration values can contain secrets; never interpolate them in errors.
    throw new Error('Unsupported Stage 1 configuration');
  }

  return { environment, publishMode };
}
