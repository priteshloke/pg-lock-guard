/**
 * src/types.ts
 *
 * Core types, AST nodes, lock levels, and rule outcome definitions for pg-lock-guard.
 */

export type LockLevel =
  | 'AccessShareLock'
  | 'RowShareLock'
  | 'RowExclusiveLock'
  | 'ShareUpdateExclusiveLock'
  | 'ShareLock'
  | 'ShareRowExclusiveLock'
  | 'ExclusiveLock'
  | 'AccessExclusiveLock';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'WARNING' | 'INFO';

export type StatementType =
  | 'SET_LOCK_TIMEOUT'
  | 'CREATE_INDEX'
  | 'ALTER_TABLE_ADD_COLUMN'
  | 'ALTER_TABLE_ADD_FOREIGN_KEY'
  | 'ALTER_TABLE_ADD_UNIQUE'
  | 'ALTER_TABLE_ADD_PRIMARY_KEY'
  | 'ALTER_TABLE_ADD_CHECK'
  | 'ALTER_TABLE_ALTER_COLUMN_TYPE'
  | 'ALTER_TABLE_ALTER_COLUMN_SET_NOT_NULL'
  | 'ALTER_TABLE_DROP_COLUMN'
  | 'VACUUM'
  | 'BEGIN_TRANSACTION'
  | 'COMMIT_TRANSACTION'
  | 'CREATE_TABLE'
  | 'DROP_TABLE'
  | 'OTHER';

export interface SqlStatementAst {
  rawSql: string;
  lineNumber: number;
  endLineNumber: number;
  type: StatementType;
  tableName?: string;
  columnName?: string;
  columnType?: string;
  constraintName?: string;
  indexName?: string;
  isConcurrent?: boolean;
  isFull?: boolean;
  hasNotValid?: boolean;
  hasVolatileDefault?: boolean;
  defaultExpression?: string;
  lockTimeoutMs?: number;
  inTransaction?: boolean;
}

export interface LockViolation {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  acquiredLock: LockLevel;
  lineNumber: number;
  endLineNumber?: number;
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
