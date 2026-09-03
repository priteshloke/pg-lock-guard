import { LockRule } from '../types.js';

export const addColumnVolatileDefaultRule: LockRule = {
  id: 'PG003_VOLATILE_DEFAULT_COLUMN',
  name: 'ADD COLUMN with Volatile Default Expression',
  severity: 'CRITICAL',
  check: (stmt) => {
    if (stmt.type === 'ALTER_TABLE_ADD_COLUMN' && stmt.hasVolatileDefault) {
      const table = stmt.tableName ?? 'table';
      return {
        ruleId: 'PG003_VOLATILE_DEFAULT_COLUMN',
        ruleName: 'ADD COLUMN with Volatile Default Expression',
        severity: 'CRITICAL',
        acquiredLock: 'AccessExclusiveLock',
        lineNumber: stmt.lineNumber,
        tableName: table,
        offendingSql: stmt.rawSql,
        explanation: `Adding a column with a volatile default expression (${stmt.defaultExpression}) forces PostgreSQL to perform a full physical table rewrite while holding an AccessExclusiveLock, blocking all reads and writes.`,
        remediationAdvice: 'Add the column as NULLable first, backfill in batches, then set the default and NOT NULL constraints in decoupled steps.',
        safeDiffReplacement: `-- Step 1: Add column nullable without default\nALTER TABLE ${table} ADD COLUMN <column_name> <type>;\n-- Step 2: Backfill existing rows in batches\n-- Step 3: Set default for future inserts\nALTER TABLE ${table} ALTER COLUMN <column_name> SET DEFAULT ${stmt.defaultExpression};`,
      };
    }
    return null;
  },
};
