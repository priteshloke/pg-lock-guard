/**
 * src/diff-suggester.ts
 *
 * Generates unified diffs and suggested safe SQL replacements for detected violations.
 */
import { MigrationAuditResult } from './types.js';
export declare function generateSuggestedDiff(result: MigrationAuditResult, originalSql: string): string;
