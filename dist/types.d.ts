/**
 * src/types.ts
 *
 * Core types, AST nodes, lock levels, and rule outcome definitions for pg-lock-guard.
 */
export type LockLevel = 'AccessShareLock' | 'RowShareLock' | 'RowExclusiveLock' | 'ShareUpdateExclusiveLock' | 'ShareLock' | 'ShareRowExclusiveLock' | 'ExclusiveLock' | 'AccessExclusiveLock';
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'WARNING' | 'INFO';
export interface SqlStatementAst {
    rawSql: string;
    lineNumber: number;
    type: 'CREATE_INDEX' | 'ALTER_TABLE_ADD_COLUMN' | 'ALTER_TABLE_ADD_CONSTRAINT' | 'ALTER_TABLE_ALTER_COLUMN' | 'ALTER_TABLE_DROP_COLUMN' | 'VACUUM' | 'SET_LOCK_TIMEOUT' | 'CREATE_TABLE' | 'DROP_TABLE' | 'OTHER';
    tableName?: string;
    isConcurrent?: boolean;
    hasNotValid?: boolean;
    hasVolatileDefault?: boolean;
    defaultExpression?: string;
    columnType?: string;
    lockTimeoutMs?: number;
}
export interface LockViolation {
    ruleId: string;
    ruleName: string;
    severity: Severity;
    acquiredLock: LockLevel;
    lineNumber: number;
    tableName: string;
    offendingSql: string;
    explanation: string;
    remediationAdvice: string;
    safeDiffReplacement?: string;
}
export interface MigrationAuditResult {
    filePath: string;
    statementCount: number;
    hasLockTimeoutSet: boolean;
    violations: LockViolation[];
    summary: {
        criticalCount: number;
        highCount: number;
        mediumCount: number;
        warningCount: number;
        isSafeToDeploy: boolean;
    };
}
export interface LockRule {
    id: string;
    name: string;
    severity: Severity;
    check: (stmt: SqlStatementAst, allStatements: SqlStatementAst[]) => LockViolation | null;
}
