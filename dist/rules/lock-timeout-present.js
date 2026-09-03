export const lockTimeoutPresentRule = {
    id: 'PG004_MISSING_LOCK_TIMEOUT',
    name: 'Migration Missing SET lock_timeout',
    severity: 'HIGH',
    check: (_stmt, allStatements) => {
        const hasLockTimeout = allStatements.some(s => s.type === 'SET_LOCK_TIMEOUT' && (s.lockTimeoutMs ?? 0) > 0);
        if (!hasLockTimeout) {
            return {
                ruleId: 'PG004_MISSING_LOCK_TIMEOUT',
                ruleName: 'Migration Missing SET lock_timeout',
                severity: 'HIGH',
                acquiredLock: 'AccessExclusiveLock',
                lineNumber: 1,
                tableName: 'database',
                offendingSql: '-- Entire Migration File',
                explanation: 'DDL statements without a pre-configured lock_timeout will queue behind long-running queries, causing all subsequent incoming web queries to queue behind the DDL and triggering total database connection pool starvation.',
                remediationAdvice: "Add `SET lock_timeout = '3s';` at the very beginning of your migration.",
                safeDiffReplacement: "SET lock_timeout = '3s';\n",
            };
        }
        return null;
    },
};
