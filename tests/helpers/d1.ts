import { readdir, readFile } from 'node:fs/promises';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';

/** Actual local workerd D1 binding, never an SQL-call mock or remote resource. */
export async function createTestD1(options: { persist?: string; migrate?: boolean } = {}) {
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default { fetch() { return new Response("test-only"); } };',
    compatibilityDate: '2026-10-21',
    d1Databases: { DB: 'stage4-test-only' },
    ...(options.persist ? { resourcePersistencePath: options.persist } : {}),
    telemetry: { enabled: false },
  }));
  try {
    const db = await runtime.getD1Database('DB') as unknown as D1Database;
    if (options.migrate !== false) {
      const directory = new URL('../../migrations/', import.meta.url);
      for (const file of (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
        const sql = await readFile(new URL(file, directory), 'utf8');
        await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
      }
    }
    return { db, dispose: () => runtime.dispose() };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}
