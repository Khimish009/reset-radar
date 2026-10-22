import { unstable_splitSqlQuery } from 'wrangler';

/** Transparent counters around an actual Miniflare D1 binding. */
export interface D1WorkloadMetrics {
  readonly bindingCalls: {
    prepare: number;
    bind: number;
    batch: number;
    run: number;
    all: number;
    first: number;
    raw: number;
    exec: number;
  };
  readonly sqlStatements: {
    total: number;
    byMethod: Record<string, number>;
    batchStatements: number;
    batchSqlBytes: number;
    batchEstimatedInputBytes: number;
    batchBindBytes: number;
    maxStatementBindCount: number;
    maxStatementSqlBytes: number;
    maxStatementEstimatedInputBytes: number;
  };
  readonly localElapsedMs: number;
  readonly metadata: {
    availableResults: number;
    unavailableFirstResults: number;
    unavailableRawResults: number;
    rowsRead: number;
    rowsReadMax: number;
    rowsWritten: number;
    durationMs: number;
    sizeAfterBytesMax: number | null;
  };
  readonly executionOutcomes: { succeeded: Record<string, number>; failed: Record<string, number> };
}

type ResultMeta = {
  readonly meta?: {
    readonly rows_read?: number;
    readonly rows_written?: number;
    readonly duration?: number;
    readonly size_after?: number;
  };
};
type StatementOperation = 'run' | 'all' | 'first' | 'raw';
interface PreparedReference {
  readonly statement: D1PreparedStatement;
  readonly sql: string;
  readonly values: readonly unknown[];
}
interface MutableMetrics {
  bindingCalls: D1WorkloadMetrics['bindingCalls'];
  sqlStatements: D1WorkloadMetrics['sqlStatements'];
  localElapsedMs: number;
  metadata: D1WorkloadMetrics['metadata'];
  executionOutcomes: D1WorkloadMetrics['executionOutcomes'];
}

function elapsed<T>(metrics: MutableMetrics, method: StatementOperation, invoke: () => Promise<T>): Promise<T> {
  metrics.bindingCalls[method] += 1;
  metrics.sqlStatements.total += 1;
  metrics.sqlStatements.byMethod[method] = (metrics.sqlStatements.byMethod[method] ?? 0) + 1;
  const started = performance.now();
  return invoke().then((result) => {
    metrics.localElapsedMs += performance.now() - started;
    metrics.executionOutcomes.succeeded[method] = (metrics.executionOutcomes.succeeded[method] ?? 0) + 1;
    if (method === 'first') metrics.metadata.unavailableFirstResults += 1;
    else if (method === 'raw') metrics.metadata.unavailableRawResults += 1;
    else collectMeta(metrics, result as ResultMeta);
    return result;
  }, (error: unknown) => {
    metrics.localElapsedMs += performance.now() - started;
    metrics.executionOutcomes.failed[method] = (metrics.executionOutcomes.failed[method] ?? 0) + 1;
    throw error;
  });
}

function collectMeta(metrics: MutableMetrics, result: ResultMeta): void {
  if (!result.meta) return;
  metrics.metadata.availableResults += 1;
  metrics.metadata.rowsRead += result.meta.rows_read ?? 0;
  metrics.metadata.rowsReadMax = Math.max(metrics.metadata.rowsReadMax, result.meta.rows_read ?? 0);
  metrics.metadata.rowsWritten += result.meta.rows_written ?? 0;
  metrics.metadata.durationMs += result.meta.duration ?? 0;
  if (typeof result.meta.size_after === 'number') {
    metrics.metadata.sizeAfterBytesMax = Math.max(metrics.metadata.sizeAfterBytesMax ?? 0, result.meta.size_after);
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function estimateValueBytes(value: unknown): number {
  if (typeof value === 'string') return byteLength(value);
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value === null || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return byteLength(String(value));
  }
  return byteLength(JSON.stringify(value) ?? '');
}

function wrapStatement(
  statement: D1PreparedStatement,
  sql: string,
  values: readonly unknown[],
  metrics: MutableMetrics,
  references: WeakMap<D1PreparedStatement, PreparedReference>,
): D1PreparedStatement {
  const wrapped = {
    bind(...nextValues: unknown[]) {
      metrics.bindingCalls.bind += 1;
      return wrapStatement(statement.bind(...nextValues), sql, nextValues, metrics, references);
    },
    run<T = unknown>() { return elapsed(metrics, 'run', () => statement.run<T>()); },
    all<T = unknown>() { return elapsed(metrics, 'all', () => statement.all<T>()); },
    first<T = unknown>(columnName?: string) {
      return elapsed(metrics, 'first', () => columnName === undefined ? statement.first<T>() : statement.first<T>(columnName));
    },
    raw<T = unknown[]>(options?: { columnNames?: boolean }) {
      return elapsed(metrics, 'raw', () => (options?.columnNames === true
        ? statement.raw<T>({ columnNames: true })
        : statement.raw<T>(options as { columnNames?: false } | undefined)) as Promise<T[]>);
    },
  } as D1PreparedStatement;
  references.set(wrapped, { statement, sql, values });
  return wrapped;
}

/**
 * Wraps only binding operations made after this function is called. Create the
 * Miniflare DB and apply migrations first so setup work stays outside counts.
 */
export function measureD1(db: D1Database): { db: D1Database; snapshot: () => D1WorkloadMetrics } {
  const metrics: MutableMetrics = {
    bindingCalls: { prepare: 0, bind: 0, batch: 0, run: 0, all: 0, first: 0, raw: 0, exec: 0 },
    sqlStatements: { total: 0, byMethod: {}, batchStatements: 0, batchSqlBytes: 0, batchEstimatedInputBytes: 0,
      batchBindBytes: 0, maxStatementBindCount: 0, maxStatementSqlBytes: 0, maxStatementEstimatedInputBytes: 0 },
    localElapsedMs: 0,
    metadata: { availableResults: 0, unavailableFirstResults: 0, unavailableRawResults: 0,
      rowsRead: 0, rowsReadMax: 0, rowsWritten: 0, durationMs: 0, sizeAfterBytesMax: null },
    executionOutcomes: { succeeded: {}, failed: {} },
  };
  const references = new WeakMap<D1PreparedStatement, PreparedReference>();
  const measured = {
    prepare(query: string) {
      metrics.bindingCalls.prepare += 1;
      return wrapStatement(db.prepare(query), query, [], metrics, references);
    },
    async batch<T = D1Result<unknown>[]>(statements: D1PreparedStatement[]) {
      metrics.bindingCalls.batch += 1;
      metrics.sqlStatements.total += statements.length;
      metrics.sqlStatements.batchStatements += statements.length;
      metrics.sqlStatements.byMethod.batch = (metrics.sqlStatements.byMethod.batch ?? 0) + statements.length;
      const prepared = statements.map((statement) => references.get(statement));
      for (const item of prepared) {
        const sqlBytes = byteLength(item?.sql ?? '');
        const bindBytes = item?.values.reduce<number>((bytes, value) => bytes + estimateValueBytes(value), 0) ?? 0;
        metrics.sqlStatements.batchBindBytes += bindBytes;
        metrics.sqlStatements.maxStatementBindCount = Math.max(metrics.sqlStatements.maxStatementBindCount, item?.values.length ?? 0);
        metrics.sqlStatements.maxStatementSqlBytes = Math.max(metrics.sqlStatements.maxStatementSqlBytes, sqlBytes);
        metrics.sqlStatements.maxStatementEstimatedInputBytes = Math.max(metrics.sqlStatements.maxStatementEstimatedInputBytes, sqlBytes + bindBytes);
      }
      metrics.sqlStatements.batchSqlBytes += prepared.reduce((total, item) => total + byteLength(item?.sql ?? ''), 0);
      metrics.sqlStatements.batchEstimatedInputBytes += prepared.reduce((total, item) => total +
        byteLength(item?.sql ?? '') + (item?.values.reduce<number>((bytes, value) => bytes + estimateValueBytes(value), 0) ?? 0), 0);
      const started = performance.now();
      try {
        const results = await db.batch(prepared.map((item, index) => item?.statement ?? statements[index]!));
        metrics.localElapsedMs += performance.now() - started;
        metrics.executionOutcomes.succeeded.batch = (metrics.executionOutcomes.succeeded.batch ?? 0) + 1;
        for (const result of results) collectMeta(metrics, result);
        return results as T;
      } catch (error) {
        metrics.localElapsedMs += performance.now() - started;
        metrics.executionOutcomes.failed.batch = (metrics.executionOutcomes.failed.batch ?? 0) + 1;
        throw error;
      }
    },
    async exec(query: string) {
      metrics.bindingCalls.exec += 1;
      const statementCount = unstable_splitSqlQuery(query).length;
      metrics.sqlStatements.total += statementCount;
      metrics.sqlStatements.byMethod.exec = (metrics.sqlStatements.byMethod.exec ?? 0) + statementCount;
      const started = performance.now();
      try {
        const result = await db.exec(query);
        metrics.localElapsedMs += performance.now() - started;
        metrics.executionOutcomes.succeeded.exec = (metrics.executionOutcomes.succeeded.exec ?? 0) + 1;
        metrics.metadata.durationMs += result.duration;
        return result;
      } catch (error) {
        metrics.localElapsedMs += performance.now() - started;
        metrics.executionOutcomes.failed.exec = (metrics.executionOutcomes.failed.exec ?? 0) + 1;
        throw error;
      }
    },
  } as unknown as D1Database;
  return { db: measured, snapshot: () => structuredClone({ ...metrics,
    executionOutcomes: structuredClone(metrics.executionOutcomes) }) };
}

/** Known, read-only calibration; setup and result inspection stay unmeasured. */
export async function verifyD1Metrics(db: D1Database): Promise<D1WorkloadMetrics> {
  const measured = measureD1(db);
  const results = await measured.db.batch([
    measured.db.prepare('SELECT 1 AS value'),
    measured.db.prepare('SELECT 2 AS value'),
  ]);
  const row = await measured.db.prepare('SELECT 1 AS value').first<{ value: number }>();
  const snapshot = measured.snapshot();
  if (results.length !== 2 || row?.value !== 1 || snapshot.bindingCalls.batch !== 1 ||
    snapshot.bindingCalls.first !== 1 || snapshot.sqlStatements.total !== 3 || snapshot.sqlStatements.batchStatements !== 2) {
    throw new Error('D1 metrics calibration did not count a two-statement batch and first() independently');
  }
  return snapshot;
}
