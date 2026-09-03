import { LockRule } from '../types.js';

export const foreignKeyNotValidRule: LockRule = {
  id: 'PG002_FOREIGN_KEY_NOT_VALID',
  name: 'ADD FOREIGN KEY without NOT VALID',
  severity: 'CRITICAL',
  check: (stmt) => {
    if (stmt.type === 'ALTER_TABLE_ADD_FOREIGN_KEY' && !stmt.hasNotValid) {
      const table = stmt.tableName ?? 'table';
      const constraint = stmt.constraintName ?? 'fk_constraint';
      const cleanSql = stmt.rawSql.replace(/;?\s*$/, '');
      const safeAdd = `${cleanSql} NOT VALID;`;
      const safeValidate = `\n-- In a separate subsequent transaction or deployment step:\nALTER TABLE ${table} VALIDATE CONSTRAINT ${constraint};`;

      return {
        ruleId: 'PG002_FOREIGN_KEY_NOT_VALID',
        ruleName: 'ADD FOREIGN KEY without NOT VALID',
        severity: 'CRITICAL',
        acquiredLock: 'ShareRowExclusiveLock',
        lineNumber: stmt.lineNumber,
        endLineNumber: stmt.endLineNumber,
        tableName: table,
        offendingSql: stmt.rawSql,
        explanation: `Adding FOREIGN KEY constraint "${constraint}" without NOT VALID acquires a ShareRowExclusiveLock on "${table}" and executes an exhaustive table scan, blocking all writes.`,
        remediationAdvice: 'Add the constraint with NOT VALID (instant metadata-only lock), then run VALIDATE CONSTRAINT in a separate transaction.',
        safeDiffReplacement: safeAdd + safeValidate,
      };
    }
    return null;
  },
};
