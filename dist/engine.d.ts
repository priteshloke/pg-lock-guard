/**
 * src/engine.ts
 *
 * Pure deterministic audit engine for PostgreSQL migrations.
 */
import { LockRule, MigrationAuditResult } from './types.js';
export declare const ALL_LOCK_RULES: LockRule[];
export declare function auditSqlMigration(sqlContent: string, filePath?: string): MigrationAuditResult;
