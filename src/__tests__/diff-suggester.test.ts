import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditSqlMigration } from '../engine.js';
import { generateSuggestedDiff } from '../diff-suggester.js';

describe('📝 PG-LOCK-GUARD: Safe Diff Suggester', () => {
  it('generates safe CONCURRENTLY and SET lock_timeout diff for unsafe index migration', () => {
    const sql = `CREATE INDEX idx_logs_timestamp ON logs (timestamp);`;
    const result = auditSqlMigration(sql, 'unsafe.sql');
    const diff = generateSuggestedDiff(result, sql);

    assert.ok(diff.includes("+ SET lock_timeout = '3s';"), 'Diff should inject SET lock_timeout');
    assert.ok(diff.includes('+ CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_timestamp ON logs (timestamp);'), 'Diff should replace with CONCURRENTLY');
  });

  it('correctly replaces multi-line formatted statements without dangling lines', () => {
    const sql = [
      "SET lock_timeout = '3s';",
      "ALTER TABLE orders",
      "  ADD CONSTRAINT fk_orders_customer",
      "  FOREIGN KEY (customer_id)",
      "  REFERENCES customers(id);",
    ].join('\n');

    const result = auditSqlMigration(sql, 'multiline.sql');
    const diff = generateSuggestedDiff(result, sql);

    // Assert all multi-line lines were removed (-)
    assert.ok(diff.includes('- ALTER TABLE orders'), 'Should mark first line as removed');
    assert.ok(diff.includes('-   ADD CONSTRAINT fk_orders_customer'), 'Should mark second line as removed');
    assert.ok(diff.includes('-   FOREIGN KEY (customer_id)'), 'Should mark third line as removed');
    assert.ok(diff.includes('-   REFERENCES customers(id);'), 'Should mark fourth line as removed');

    // Assert safe replacement with NOT VALID was emitted
    assert.ok(diff.includes('NOT VALID;'), 'Should include NOT VALID in replacement');
    assert.ok(diff.includes('VALIDATE CONSTRAINT fk_orders_customer;'), 'Should include VALIDATE step');
  });

  it('returns clean confirmation message when migration is already safe', () => {
    const sql = `
      SET lock_timeout = '3s';
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_safe ON safe_tbl (id);
    `;
    const result = auditSqlMigration(sql, 'safe.sql');
    const diff = generateSuggestedDiff(result, sql);

    assert.ok(diff.includes('100% compliant'), 'Should confirm zero diff needed');
  });
});
