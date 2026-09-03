export const vacuumFullDangerRule = {
    id: 'PG006_VACUUM_FULL_EXCLUSIVE_LOCK',
    name: 'VACUUM FULL Table Lockout',
    severity: 'CRITICAL',
    check: (stmt) => {
        if (stmt.type === 'VACUUM') {
            const table = stmt.tableName ?? 'table';
            return {
                ruleId: 'PG006_VACUUM_FULL_EXCLUSIVE_LOCK',
                ruleName: 'VACUUM FULL Table Lockout',
                severity: 'CRITICAL',
                acquiredLock: 'AccessExclusiveLock',
                lineNumber: stmt.lineNumber,
                tableName: table,
                offendingSql: stmt.rawSql,
                explanation: `VACUUM FULL acquires an AccessExclusiveLock on "${table}", completely blocking all read and write queries until the entire table and all its indexes are rewritten.`,
                remediationAdvice: 'Use standard VACUUM (which runs concurrently) or pg_repack for online table compaction with zero downtime.',
            };
        }
        return null;
    },
};
