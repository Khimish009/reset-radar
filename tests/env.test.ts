import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/env';

describe('Stage 1 configuration', () => {
  it('defaults to local dry_run and keeps each explicit environment', () => {
    expect(readConfig({})).toEqual({ environment: 'local', publishMode: 'dry_run' });
    for (const environment of ['local', 'staging', 'production']) {
      expect(readConfig({ APP_ENV: environment })).toEqual({
        environment,
        publishMode: 'dry_run',
      });
    }
  });

  it.each([
    { APP_ENV: 'unknown-secret' },
    { APP_ENV: '' },
    { APP_ENV: 'staging', PUBLISH_MODE: 'publish' },
    { APP_ENV: 'production', PUBLISH_MODE: '' },
  ])('rejects unsupported settings without exposing input: %j', (env) => {
    expect(() => readConfig(env)).toThrowError(/^Unsupported Stage 1 configuration$/);
  });

  it('defines independent dry-run targets without configured resources or secrets', () => {
    const config = JSON.parse(readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8')) as {
      name: string;
      vars: Record<string, string>;
      env: Record<'staging' | 'production', unknown>;
    };
    expect(config.name).toBe('reset-radar-local');
    expect(config.vars).toEqual({ APP_ENV: 'local', PUBLISH_MODE: 'dry_run' });
    expect(config.env).toEqual({
      staging: {
        name: 'reset-radar-staging',
        workers_dev: false,
        preview_urls: false,
        triggers: { crons: [] },
        vars: { APP_ENV: 'staging', PUBLISH_MODE: 'dry_run' },
      },
      production: {
        name: 'reset-radar',
        workers_dev: false,
        preview_urls: false,
        triggers: { crons: [] },
        vars: { APP_ENV: 'production', PUBLISH_MODE: 'dry_run' },
      },
    });
    for (const key of ['d1_databases', 'services', 'kv_namespaces', 'secrets', 'routes']) {
      expect(config).not.toHaveProperty(key);
    }
  });
});
