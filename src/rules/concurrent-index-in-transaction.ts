import { LockRule } from '../types.js';

export const concurrentIndexInTransactionRule: LockRule = {
  id: 'PG011_CONCURRENT_INDEX_IN_TRANSACTION',
  name: 'CREATE INDEX CONCURRENTLY inside Transaction Block',
  severity: 'CRITICAL',
  check: (stmt) => {
    if ((stmt.type === 'CREATE_INDEX' && stmt.isConcurrent && stmt.inTransaction) || (stmt.type === 'VACUUM' && stmt.inTransaction)) {
      const table = stmt.tableName ?? 'table';
      return {
        ruleId: 'PG011_CONCURRENT_INDEX_IN_TRANSACTION',
        ruleName: 'CREATE INDEX CONCURRENTLY inside Transaction Block',
        severity: 'CRITICAL',
        acquiredLock: 'AccessExclusiveLock',
        lineNumber: stmt.lineNumber,
        endLineNumber: stmt.endLineNumber,
        tableName: table,
        offendingSql: stmt.rawSql,
        explanation: 'PostgreSQL strictly prohibits running "CREATE INDEX CONCURRENTLY" or "VACUUM" inside a transaction block (BEGIN ... COMMIT). Execution will immediately throw a fatal error.',
        remediationAdvice: 'Move the CREATE INDEX CONCURRENTLY statement outside of the BEGIN ... COMMIT transaction block so it executes standalone.',
        safeDiffReplacement: `-- Run standalone outside of BEGIN ... COMMIT:\nCOMMIT;\n${stmt.rawSql}\nBEGIN;`,
      };
    }
    return null;
  },
};
