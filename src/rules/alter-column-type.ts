import { LockRule } from '../types.js';

export const alterColumnTypeRule: LockRule = {
  id: 'PG005_ALTER_COLUMN_TYPE_REWRITE',
  name: 'ALTER COLUMN TYPE Full Table Rewrite',
  severity: 'HIGH',
  check: (stmt) => {
    if (stmt.type === 'ALTER_TABLE_ALTER_COLUMN_TYPE') {
      const table = stmt.tableName ?? 'table';
      const col = stmt.columnName ?? 'column_name';
      const targetType = stmt.columnType ?? 'new_type';

      return {
        ruleId: 'PG005_ALTER_COLUMN_TYPE_REWRITE',
        ruleName: 'ALTER COLUMN TYPE Full Table Rewrite',
        severity: 'HIGH',
        acquiredLock: 'AccessExclusiveLock',
        lineNumber: stmt.lineNumber,
        endLineNumber: stmt.endLineNumber,
        tableName: table,
        offendingSql: stmt.rawSql,
        explanation: `Changing column "${col}" data type acquires an AccessExclusiveLock and forces a full physical table rewrite on "${table}", blocking all read and write queries.`,
        remediationAdvice: 'Add a new column with the target type, dual-write via application logic or triggers, backfill in batches, then swap and drop the old column.',
        safeDiffReplacement: `-- Step 1: Add new column with target type\nALTER TABLE ${table} ADD COLUMN ${col}_new ${targetType};\n-- Step 2: Dual-write in application code to both columns\n-- Step 3: Backfill old rows: UPDATE ${table} SET ${col}_new = ${col} WHERE ${col}_new IS NULL;\n-- Step 4: Drop old column and rename: ALTER TABLE ${table} DROP COLUMN ${col}; ALTER TABLE ${table} RENAME COLUMN ${col}_new TO ${col};`,
      };
    }
    return null;
  },
};
