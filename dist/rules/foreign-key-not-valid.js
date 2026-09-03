export const foreignKeyNotValidRule = {
    id: 'PG002_FOREIGN_KEY_NOT_VALID',
    name: 'ADD FOREIGN KEY without NOT VALID',
    severity: 'CRITICAL',
    check: (stmt) => {
        if (stmt.type === 'ALTER_TABLE_ADD_CONSTRAINT' && !stmt.hasNotValid) {
            const table = stmt.tableName ?? 'table';
            const safeAdd = stmt.rawSql.replace(/;?\s*$/, ' NOT VALID;');
            const safeValidate = `\n-- In a subsequent step or transaction:\nALTER TABLE ${table} VALIDATE CONSTRAINT <constraint_name>;`;
            return {
                ruleId: 'PG002_FOREIGN_KEY_NOT_VALID',
                ruleName: 'ADD FOREIGN KEY without NOT VALID',
                severity: 'CRITICAL',
                acquiredLock: 'ShareRowExclusiveLock',
                lineNumber: stmt.lineNumber,
                tableName: table,
                offendingSql: stmt.rawSql,
                explanation: `Adding a FOREIGN KEY constraint without NOT VALID acquires a ShareRowExclusiveLock on "${table}" and performs a full sequential validation scan, blocking all writes.`,
                remediationAdvice: 'Add the constraint with NOT VALID (fast metadata lock), then run VALIDATE CONSTRAINT in a separate transaction.',
                safeDiffReplacement: safeAdd + safeValidate,
            };
        }
        return null;
    },
};
