import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditSqlMigration } from '../engine.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
describe('🛡️ PG-LOCK-GUARD: PostgreSQL Migration Lock Linter', () => {
    it('detects PG001_CREATE_INDEX_CONCURRENTLY when index lacks CONCURRENTLY', () => {
        const sql = `
      SET lock_timeout = '3s';
      CREATE INDEX idx_users_email ON users (email);
    `;
        const result = auditSqlMigration(sql);
        const violation = result.violations.find(v => v.ruleId === 'PG001_CREATE_INDEX_CONCURRENTLY');
        assert.ok(violation, 'Should flag non-concurrent index creation');
        assert.equal(violation.severity, 'CRITICAL');
        assert.equal(violation.acquiredLock, 'ShareLock');
        assert.equal(violation.tableName, 'users');
    });
    it('detects PG002_FOREIGN_KEY_NOT_VALID when adding FK without NOT VALID', () => {
        const sql = `
      SET lock_timeout = '3s';
      ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id);
    `;
        const result = auditSqlMigration(sql);
        const violation = result.violations.find(v => v.ruleId === 'PG002_FOREIGN_KEY_NOT_VALID');
        assert.ok(violation, 'Should flag foreign key without NOT VALID');
        assert.equal(violation.severity, 'CRITICAL');
        assert.equal(violation.acquiredLock, 'ShareRowExclusiveLock');
        assert.equal(violation.tableName, 'orders');
    });
    it('detects PG003_VOLATILE_DEFAULT_COLUMN when adding column with gen_random_uuid()', () => {
        const sql = `
      SET lock_timeout = '3s';
      ALTER TABLE accounts ADD COLUMN auth_key uuid DEFAULT gen_random_uuid();
    `;
        const result = auditSqlMigration(sql);
        const violation = result.violations.find(v => v.ruleId === 'PG003_VOLATILE_DEFAULT_COLUMN');
        assert.ok(violation, 'Should flag volatile default column addition');
        assert.equal(violation.severity, 'CRITICAL');
        assert.equal(violation.acquiredLock, 'AccessExclusiveLock');
        assert.equal(violation.tableName, 'accounts');
    });
    it('detects PG004_MISSING_LOCK_TIMEOUT when migration omits SET lock_timeout', () => {
        const sql = `
      CREATE INDEX CONCURRENTLY idx_users_email ON users (email);
    `;
        const result = auditSqlMigration(sql);
        const violation = result.violations.find(v => v.ruleId === 'PG004_MISSING_LOCK_TIMEOUT');
        assert.ok(violation, 'Should flag missing lock_timeout');
        assert.equal(violation.severity, 'HIGH');
        assert.equal(result.hasLockTimeoutSet, false);
    });
    it('detects PG006_VACUUM_FULL_EXCLUSIVE_LOCK when VACUUM FULL is executed', () => {
        const sql = `
      SET lock_timeout = '3s';
      VACUUM FULL events_archive;
    `;
        const result = auditSqlMigration(sql);
        const violation = result.violations.find(v => v.ruleId === 'PG006_VACUUM_FULL_EXCLUSIVE_LOCK');
        assert.ok(violation, 'Should flag VACUUM FULL table lock');
        assert.equal(violation.severity, 'CRITICAL');
    });
    it('approves a 100% compliant zero-downtime migration with zero violations', () => {
        const fixturePath = resolve(__dirname, '../../fixtures/safe-migration.sql');
        const safeSql = readFileSync(fixturePath, 'utf-8');
        const result = auditSqlMigration(safeSql, 'safe-migration.sql');
        assert.equal(result.violations.length, 0, 'Safe migration should trigger zero violations');
        assert.equal(result.summary.isSafeToDeploy, true, 'isSafeToDeploy should be true');
    });
});
