import { LockRule } from '../types.js';

export const uniqueConstraintDangerRule: LockRule = {
  id: 'PG008_UNIQUE_CONSTRAINT_EXCLUSIVE_LOCK',
  name: 'ADD UNIQUE / PRIMARY KEY without Pre-built Index',
  severity: 'CRITICAL',
  check: (stmt) => {
    if (stmt.type === 'ALTER_TABLE_ADD_UNIQUE' || stmt.type === 'ALTER_TABLE_ADD_PRIMARY_KEY') {
      const table = stmt.tableName ?? 'table';
      const constraint = stmt.constraintName ?? 'uk_constraint';
      const isPk = stmt.type === 'ALTER_TABLE_ADD_PRIMARY_KEY';

      return {
        ruleId: 'PG008_UNIQUE_CONSTRAINT_EXCLUSIVE_LOCK',
        ruleName: `ADD ${isPk ? 'PRIMARY KEY' : 'UNIQUE'} without Pre-built Index`,
        severity: 'CRITICAL',
        acquiredLock: 'AccessExclusiveLock',
        lineNumber: stmt.lineNumber,
        endLineNumber: stmt.endLineNumber,
        tableName: table,
        offendingSql: stmt.rawSql,
        explanation: `Adding a ${isPk ? 'PRIMARY KEY' : 'UNIQUE'} constraint directly acquires an AccessExclusiveLock and performs an unindexed full table verification scan, blocking all reads and writes.`,
        remediationAdvice: 'Create a UNIQUE INDEX CONCURRENTLY first, then attach the constraint using the USING INDEX clause (instant metadata operation).',
        safeDiffReplacement: `-- Step 1: Create unique index concurrently without blocking writes\nCREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${constraint}_idx ON ${table} (<columns>);\n-- Step 2: Attach constraint instantly using existing index\nALTER TABLE ${table} ADD CONSTRAINT ${constraint} ${isPk ? 'PRIMARY KEY' : 'UNIQUE'} USING INDEX ${constraint}_idx;`,
      };
    }
    return null;
  },
};
