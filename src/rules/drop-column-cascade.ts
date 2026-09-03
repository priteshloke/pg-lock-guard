import { LockRule } from '../types.js';

export const dropColumnCascadeRule: LockRule = {
  id: 'PG007_DROP_COLUMN_CASCADE',
  name: 'DROP COLUMN with Potential Cascade Lock',
  severity: 'MEDIUM',
  check: (stmt) => {
    if (stmt.type === 'ALTER_TABLE_DROP_COLUMN') {
      const table = stmt.tableName ?? 'table';
      return {
        ruleId: 'PG007_DROP_COLUMN_CASCADE',
        ruleName: 'DROP COLUMN with Potential Cascade Lock',
        severity: 'MEDIUM',
        acquiredLock: 'AccessExclusiveLock',
        lineNumber: stmt.lineNumber,
        tableName: table,
        offendingSql: stmt.rawSql,
        explanation: `Dropping a column acquires an AccessExclusiveLock on "${table}". If the column is used by active application queries or views, transactions will immediately fail.`,
        remediationAdvice: 'Ensure the column is completely removed from application models before executing DROP COLUMN in production.',
      };
    }
    return null;
  },
};
