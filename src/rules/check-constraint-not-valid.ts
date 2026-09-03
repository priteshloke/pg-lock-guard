import { LockRule } from '../types.js';

export const checkConstraintNotValidRule: LockRule = {
  id: 'PG009_CHECK_CONSTRAINT_NOT_VALID',
  name: 'ADD CHECK CONSTRAINT without NOT VALID',
  severity: 'HIGH',
  check: (stmt) => {
    if (stmt.type === 'ALTER_TABLE_ADD_CHECK' && !stmt.hasNotValid) {
      const table = stmt.tableName ?? 'table';
      const constraint = stmt.constraintName ?? 'chk_constraint';
      const cleanSql = stmt.rawSql.replace(/;?\s*$/, '');
      const safeAdd = `${cleanSql} NOT VALID;`;
      const safeValidate = `\n-- In a separate subsequent transaction or deployment step:\nALTER TABLE ${table} VALIDATE CONSTRAINT ${constraint};`;

      return {
        ruleId: 'PG009_CHECK_CONSTRAINT_NOT_VALID',
        ruleName: 'ADD CHECK CONSTRAINT without NOT VALID',
        severity: 'HIGH',
        acquiredLock: 'AccessExclusiveLock',
        lineNumber: stmt.lineNumber,
        endLineNumber: stmt.endLineNumber,
        tableName: table,
        offendingSql: stmt.rawSql,
        explanation: `Adding a CHECK constraint without NOT VALID performs a full table sequential scan while holding an AccessExclusiveLock, blocking all reads and writes on "${table}".`,
        remediationAdvice: 'Add the CHECK constraint with NOT VALID (instant metadata lock), then execute VALIDATE CONSTRAINT in a separate transaction.',
        safeDiffReplacement: safeAdd + safeValidate,
      };
    }
    return null;
  },
};
