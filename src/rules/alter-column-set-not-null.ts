import { LockRule } from '../types.js';

export const alterColumnSetNotNullRule: LockRule = {
  id: 'PG010_ALTER_COLUMN_SET_NOT_NULL',
  name: 'ALTER COLUMN SET NOT NULL Table Lockout',
  severity: 'HIGH',
  check: (stmt) => {
    if (stmt.type === 'ALTER_TABLE_ALTER_COLUMN_SET_NOT_NULL') {
      const table = stmt.tableName ?? 'table';
      const col = stmt.columnName ?? 'column_name';

      return {
        ruleId: 'PG010_ALTER_COLUMN_SET_NOT_NULL',
        ruleName: 'ALTER COLUMN SET NOT NULL Table Lockout',
        severity: 'HIGH',
        acquiredLock: 'AccessExclusiveLock',
        lineNumber: stmt.lineNumber,
        tableName: table,
        offendingSql: stmt.rawSql,
        explanation: `Executing "ALTER COLUMN ${col} SET NOT NULL" scans the entire table while holding an AccessExclusiveLock to verify no NULL values exist, blocking all concurrent read and write operations.`,
        remediationAdvice: 'Add a CHECK constraint with NOT VALID, validate it in a separate transaction, and then run SET NOT NULL (which PostgreSQL 12+ optimizes as an instant metadata operation).',
        safeDiffReplacement: `-- Step 1: Add NOT NULL check constraint without blocking writes\nALTER TABLE ${table} ADD CONSTRAINT chk_${col}_not_null CHECK (${col} IS NOT NULL) NOT VALID;\n-- Step 2: Validate constraint in background transaction\nALTER TABLE ${table} VALIDATE CONSTRAINT chk_${col}_not_null;\n-- Step 3: Set NOT NULL (instant $O(1)$ metadata lock in PostgreSQL 12+)\nALTER TABLE ${table} ALTER COLUMN ${col} SET NOT NULL;`,
      };
    }
    return null;
  },
};
