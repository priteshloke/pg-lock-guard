/**
 * src/reporter.ts
 *
 * Terminal ASCII formatter and report generator for pg-lock-guard.
 */
import { MigrationAuditResult } from './types.js';
export declare function formatTerminalReport(result: MigrationAuditResult): string;
