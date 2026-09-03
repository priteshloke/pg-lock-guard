import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditSqlMigration } from '../engine.js';
import { splitSqlStatements } from '../parser.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('🛡️ PG-LOCK-GUARD: PostgreSQL Migration Lock Linter & AST Rules', () => {
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

  it('correctly parses multiple statements sharing a single line and audits both', () => {
    const sql = "SET lock_timeout = '3s'; CREATE INDEX idx_a ON orders (customer_id);";
    const result = auditSqlMigration(sql);

    assert.equal(result.statementCount, 2, 'Should identify 2 distinct statements on same line');
    assert.equal(result.hasLockTimeoutSet, true, 'Should detect lock_timeout in statement 1');

    const indexViolation = result.violations.find(v => v.ruleId === 'PG001_CREATE_INDEX_CONCURRENTLY');
    assert.ok(indexViolation, 'Should flag non-concurrent index even when sharing a line');
    assert.equal(indexViolation.tableName, 'orders');
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

  it('approves safe stable defaults like DEFAULT now() or literal constants in PostgreSQL 11+', () => {
    const sql = `
      SET lock_timeout = '3s';
      ALTER TABLE orders ADD COLUMN created_at timestamptz DEFAULT now();
      ALTER TABLE users ADD COLUMN is_active boolean DEFAULT true;
    `;
    const result = auditSqlMigration(sql);
    const volatileViolation = result.violations.find(v => v.ruleId === 'PG003_VOLATILE_DEFAULT_COLUMN');

    assert.equal(volatileViolation, undefined, 'now() and literals are STABLE/IMMUTABLE and should not be flagged as volatile');
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

  it('approves routine VACUUM and VACUUM ANALYZE without FULL as non-blocking maintenance', () => {
    const sql = `
      SET lock_timeout = '3s';
      VACUUM orders;
      VACUUM ANALYZE users;
    `;
    const result = auditSqlMigration(sql);
    const vacuumViolation = result.violations.find(v => v.ruleId === 'PG006_VACUUM_FULL_EXCLUSIVE_LOCK');

    assert.equal(vacuumViolation, undefined, 'Routine VACUUM / VACUUM ANALYZE should not trigger table lockout violation');
    assert.equal(result.summary.isSafeToDeploy, true);
  });

  it('detects PG008_UNIQUE_CONSTRAINT_EXCLUSIVE_LOCK on ADD CONSTRAINT UNIQUE', () => {
    const sql = `
      SET lock_timeout = '3s';
      ALTER TABLE users ADD CONSTRAINT u_email UNIQUE (email);
    `;
    const result = auditSqlMigration(sql);
    const violation = result.violations.find(v => v.ruleId === 'PG008_UNIQUE_CONSTRAINT_EXCLUSIVE_LOCK');

    assert.ok(violation, 'Should flag ADD CONSTRAINT UNIQUE as AccessExclusiveLock');
    assert.equal(violation.severity, 'CRITICAL');
    assert.equal(violation.acquiredLock, 'AccessExclusiveLock');
  });

  it('detects PG009_CHECK_CONSTRAINT_NOT_VALID on ADD CONSTRAINT CHECK without NOT VALID', () => {
    const sql = `
      SET lock_timeout = '3s';
      ALTER TABLE accounts ADD CONSTRAINT chk_balance CHECK (balance >= 0);
    `;
    const result = auditSqlMigration(sql);
    const violation = result.violations.find(v => v.ruleId === 'PG009_CHECK_CONSTRAINT_NOT_VALID');

    assert.ok(violation, 'Should flag CHECK constraint without NOT VALID');
    assert.equal(violation.severity, 'HIGH');
    assert.equal(violation.acquiredLock, 'AccessExclusiveLock');
  });

  it('detects PG010_ALTER_COLUMN_SET_NOT_NULL when altering column to NOT NULL directly', () => {
    const sql = `
      SET lock_timeout = '3s';
      ALTER TABLE orders ALTER COLUMN user_id SET NOT NULL;
    `;
    const result = auditSqlMigration(sql);
    const violation = result.violations.find(v => v.ruleId === 'PG010_ALTER_COLUMN_SET_NOT_NULL');

    assert.ok(violation, 'Should flag ALTER COLUMN SET NOT NULL');
    assert.equal(violation.severity, 'HIGH');
    assert.equal(violation.acquiredLock, 'AccessExclusiveLock');
  });

  it('detects PG011_CONCURRENT_INDEX_IN_TRANSACTION when CREATE INDEX CONCURRENTLY is in a transaction block', () => {
    const sql = `
      BEGIN;
      SET lock_timeout = '3s';
      CREATE INDEX CONCURRENTLY idx_users_email ON users (email);
      COMMIT;
    `;
    const result = auditSqlMigration(sql);
    const violation = result.violations.find(v => v.ruleId === 'PG011_CONCURRENT_INDEX_IN_TRANSACTION');

    assert.ok(violation, 'Should flag concurrent index inside transaction block');
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
