import { LockRule } from '../types.js';

export const alterColumnTypeRule: LockRule = {
  id: 'PG005_ALTER_COLUMN_TYPE_REWRITE',
  name: 'ALTER COLUMN TYPE Full Table Rewrite',
  severity: 'HIGH',
  check: (stmt) => {
    if (stmt.type === 'ALTER_TABLE_ALTER_COLUMN') {
      const table = stmt.tableName ?? 'table';
      return {
        ruleId: 'PG005_ALTER_COLUMN_TYPE_REWRITE',
        ruleName: 'ALTER COLUMN TYPE Full Table Rewrite',
        severity: 'HIGH',
        acquiredLock: 'AccessExclusiveLock',
        lineNumber: stmt.lineNumber,
        tableName: table,
        offendingSql: stmt.rawSql,
        explanation: `Changing a column data type acquires an AccessExclusiveLock and forces a full table rewrite on "${table}", blocking all SELECT and write queries.`,
        remediationAdvice: 'Add a new column with the target type, dual-write via triggers or application code, backfill data, then drop the old column.',
      };
    }
    return null;
  },
};
