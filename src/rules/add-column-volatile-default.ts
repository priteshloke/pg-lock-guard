import { LockRule } from '../types.js';

export const addColumnVolatileDefaultRule: LockRule = {
  id: 'PG003_VOLATILE_DEFAULT_COLUMN',
  name: 'ADD COLUMN with Volatile Default Expression',
  severity: 'CRITICAL',
  check: (stmt) => {
    if (stmt.type === 'ALTER_TABLE_ADD_COLUMN' && stmt.hasVolatileDefault) {
      const table = stmt.tableName ?? 'table';
      const column = stmt.columnName ?? 'column_name';
      const colType = stmt.columnType ?? 'text';
      const defaultExpr = stmt.defaultExpression ?? 'volatile_func()';

      return {
        ruleId: 'PG003_VOLATILE_DEFAULT_COLUMN',
        ruleName: 'ADD COLUMN with Volatile Default Expression',
        severity: 'CRITICAL',
        acquiredLock: 'AccessExclusiveLock',
        lineNumber: stmt.lineNumber,
        endLineNumber: stmt.endLineNumber,
        tableName: table,
        offendingSql: stmt.rawSql,
        explanation: `Adding column "${column}" with a volatile default expression (${defaultExpr}) forces PostgreSQL to execute a full physical table rewrite while holding an AccessExclusiveLock, blocking all reads and writes.`,
        remediationAdvice: 'Add the column as NULLable first without the default, backfill existing rows in decoupled batches, then set the default expression.',
        safeDiffReplacement: `-- Step 1: Add column nullable without volatile default (instant metadata lock)\nALTER TABLE ${table} ADD COLUMN ${column} ${colType};\n-- Step 2: Backfill existing rows in non-blocking batches\n-- UPDATE ${table} SET ${column} = ${defaultExpr} WHERE ${column} IS NULL;\n-- Step 3: Set default for future inserts\nALTER TABLE ${table} ALTER COLUMN ${column} SET DEFAULT ${defaultExpr};`,
      };
    }
    return null;
  },
};
