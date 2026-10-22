import { routeRequest } from './api/router';
import { readConfig } from './env';
import type { RuntimeConfig } from './env';
import type { Env } from './env';
import { createRuntimeDependencies } from './runtime';
import type { RuntimeDependencies } from './runtime';
import { runScheduledIngestion } from './services/scheduled';

export function createWorker(dependencies: RuntimeDependencies) {
  return {
    fetch(request: Request): Response {
      return routeRequest(request);
    },

    async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
      let config: RuntimeConfig;
      try {
        config = readConfig(env);
      } catch {
        dependencies.logger.error('configuration_rejected');
        throw new Error('Unsupported runtime configuration');
      }
      if (!config.ingestionEnabled) {
        dependencies.logger.info('scheduled_noop', {
          environment: config.environment,
          publishMode: config.publishMode,
        });
        return;
      }
      if (!env.DB) {
        dependencies.logger.error('scheduled_missing_database');
        return;
      }

      try {
        const startedAt = dependencies.clock.now().getTime();
        const summary = await runScheduledIngestion(env as Env & { readonly DB: D1Database }, dependencies);
        for (const result of summary.providers) {
          const event = result.outcome === 'success' ? 'provider_sync_success'
            : result.outcome === 'incomplete' ? 'provider_sync_incomplete'
              : result.outcome === 'concurrent_sync' ? 'provider_sync_concurrent'
                : 'provider_sync_failure';
          const fields = { provider: result.provider };
          if (result.outcome === 'failure') dependencies.logger.error(event, fields);
          else dependencies.logger.info(event, fields);
        }
        dependencies.logger.info('publish_unavailable');
        dependencies.logger.info('scheduled_run_complete', {
          environment: config.environment,
          publishMode: config.publishMode,
          durationMs: Math.max(0, dependencies.clock.now().getTime() - startedAt),
        });
      } catch {
        dependencies.logger.error('scheduled_run_failure');
      }
    },
  } satisfies ExportedHandler<Env>;
}

export default createWorker(createRuntimeDependencies());
