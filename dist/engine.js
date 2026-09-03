/**
 * src/engine.ts
 *
 * Pure deterministic audit engine for PostgreSQL migrations.
 */
import { parseSqlMigration } from './parser.js';
import { createIndexConcurrentlyRule } from './rules/create-index-concurrently.js';
import { foreignKeyNotValidRule } from './rules/foreign-key-not-valid.js';
import { addColumnVolatileDefaultRule } from './rules/add-column-volatile-default.js';
import { lockTimeoutPresentRule } from './rules/lock-timeout-present.js';
import { alterColumnTypeRule } from './rules/alter-column-type.js';
import { vacuumFullDangerRule } from './rules/vacuum-full-danger.js';
import { dropColumnCascadeRule } from './rules/drop-column-cascade.js';
export const ALL_LOCK_RULES = [
    createIndexConcurrentlyRule,
    foreignKeyNotValidRule,
    addColumnVolatileDefaultRule,
    lockTimeoutPresentRule,
    alterColumnTypeRule,
    vacuumFullDangerRule,
    dropColumnCascadeRule,
];
export function auditSqlMigration(sqlContent, filePath = 'migration.sql') {
    const statements = parseSqlMigration(sqlContent);
    const violations = [];
    // Check global file-level rule (e.g. missing lock_timeout)
    const lockTimeoutViolation = lockTimeoutPresentRule.check(statements[0] ?? { rawSql: '', lineNumber: 1, type: 'OTHER' }, statements);
    if (lockTimeoutViolation) {
        violations.push(lockTimeoutViolation);
    }
    // Check statement-level rules
    for (const stmt of statements) {
        for (const rule of ALL_LOCK_RULES) {
            if (rule.id === 'PG004_MISSING_LOCK_TIMEOUT')
                continue; // Handled above
            const violation = rule.check(stmt, statements);
            if (violation) {
                violations.push(violation);
            }
        }
    }
    const criticalCount = violations.filter(v => v.severity === 'CRITICAL').length;
    const highCount = violations.filter(v => v.severity === 'HIGH').length;
    const mediumCount = violations.filter(v => v.severity === 'MEDIUM').length;
    const warningCount = violations.filter(v => v.severity === 'WARNING').length;
    const hasLockTimeoutSet = !violations.some(v => v.ruleId === 'PG004_MISSING_LOCK_TIMEOUT');
    return {
        filePath,
        statementCount: statements.length,
        hasLockTimeoutSet,
        violations,
        summary: {
            criticalCount,
            highCount,
            mediumCount,
            warningCount,
            isSafeToDeploy: criticalCount === 0 && highCount === 0,
        },
    };
}
