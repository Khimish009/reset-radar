import { routeRequest } from './api/router';
import { readConfig } from './env';
import type { Env } from './env';
import { createRuntimeDependencies } from './runtime';
import type { RuntimeDependencies } from './runtime';

export function createWorker(dependencies: RuntimeDependencies) {
  return {
    fetch(request: Request): Response {
      return routeRequest(request);
    },

    scheduled(_controller: ScheduledController, env: Env): void {
      try {
        const config = readConfig(env);
        dependencies.logger.info('scheduled_noop', {
          environment: config.environment,
          publishMode: config.publishMode,
        });
      } catch {
        dependencies.logger.error('configuration_rejected');
        throw new Error('Unsupported Stage 1 configuration');
      }
    },
  } satisfies ExportedHandler<Env>;
}

export default createWorker(createRuntimeDependencies());
