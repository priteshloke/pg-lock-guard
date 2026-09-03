import { LockRule } from '../types.js';

export const createIndexConcurrentlyRule: LockRule = {
  id: 'PG001_CREATE_INDEX_CONCURRENTLY',
  name: 'CREATE INDEX without CONCURRENTLY',
  severity: 'CRITICAL',
  check: (stmt) => {
    if (stmt.type === 'CREATE_INDEX' && !stmt.isConcurrent) {
      const table = stmt.tableName ?? 'table';
      const index = stmt.indexName ?? 'idx_name';
      const safeDiff = stmt.rawSql.replace(/CREATE\s+(UNIQUE\s+)?INDEX/i, (_match, u) => `CREATE ${u ? 'UNIQUE ' : ''}INDEX CONCURRENTLY IF NOT EXISTS`);

      return {
        ruleId: 'PG001_CREATE_INDEX_CONCURRENTLY',
        ruleName: 'CREATE INDEX without CONCURRENTLY',
        severity: 'CRITICAL',
        acquiredLock: 'ShareLock',
        lineNumber: stmt.lineNumber,
        tableName: table,
        offendingSql: stmt.rawSql,
        explanation: `Creating index "${index}" without CONCURRENTLY acquires a ShareLock on "${table}", blocking all concurrent INSERT, UPDATE, and DELETE operations until indexing finishes.`,
        remediationAdvice: 'Add the CONCURRENTLY keyword to build the index in the background without blocking incoming writes.',
        safeDiffReplacement: safeDiff,
      };
    }
    return null;
  },
};
