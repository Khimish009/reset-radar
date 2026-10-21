import { describe, expect, it, vi } from "vitest";
import {
  createRuntimeDependencies,
  type Clock,
  type Fetch,
  type RuntimeDependencies,
} from "../src/runtime";
import { createLogger } from "../src/utils/logging";

describe("runtime dependencies", () => {
  it("allows deterministic clock, fetch and logger replacements", () => {
    const fixedDate = new Date("2026-10-21T12:00:00.000Z");
    const clock: Clock = { now: () => fixedDate };
    const fetchMock = vi.fn(async () => new Response("ok")) as unknown as Fetch;
    const logger = createLogger(vi.fn());
    const dependencies: RuntimeDependencies = { clock, fetch: fetchMock, logger };

    expect(dependencies.clock.now()).toBe(fixedDate);
    expect(dependencies.fetch).toBe(fetchMock);
    expect(dependencies.logger).toBe(logger);
  });

  it("creates production dependencies without calling fetch", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn(originalFetch);
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const dependencies = createRuntimeDependencies();

      expect(dependencies.fetch).toBe(fetchSpy);
      expect(dependencies.clock.now().toISOString()).toBe('2026-10-21T12:00:00.000Z');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(dependencies.logger).toEqual(expect.objectContaining({
        info: expect.any(Function),
        error: expect.any(Function),
      }));
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
