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
