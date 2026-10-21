import { createLogger, type Logger } from "./utils/logging";

export interface Clock {
  now(): Date;
}

export type Fetch = typeof globalThis.fetch;

export interface RuntimeDependencies {
  clock: Clock;
  fetch: Fetch;
  logger: Logger;
}

/** Build production runtime dependencies without performing network work. */
export function createRuntimeDependencies(): RuntimeDependencies {
  return {
    clock: { now: () => new Date() },
    fetch: globalThis.fetch,
    logger: createLogger(),
  };
}
