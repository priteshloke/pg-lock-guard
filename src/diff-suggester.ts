/**
 * src/diff-suggester.ts
 *
 * Generates unified diffs and suggested safe zero-downtime SQL replacements,
 * properly handling multi-line SQL statements without dangling continuation lines.
 */

import { MigrationAuditResult } from './types.js';

export function generateSuggestedDiff(result: MigrationAuditResult, originalSql: string): string {
  if (result.violations.length === 0) {
    return '✅ No safe diff needed. Migration is 100% compliant with zero-downtime rules.\n';
  }

  const diffLines: string[] = [];
  diffLines.push(`--- a/${result.filePath} (Unsafe Migration)`);
  diffLines.push(`+++ b/${result.filePath} (Suggested Zero-Downtime Safe Migration)`);
  diffLines.push('@@ -1 +1 @@');

  // Prepend SET lock_timeout if missing
  if (!result.hasLockTimeoutSet) {
    diffLines.push("+ SET lock_timeout = '3s'; -- Guard: abort DDL if blocked by long queries");
  }

  const originalLines = originalSql.split('\n');
  const totalLines = originalLines.length;

  // Collect all statement-level replacements with their start and end line bounds
  const replacements: Array<{
    startLine: number;
    endLine: number;
    safeDiff: string;
  }> = [];

  for (const v of result.violations) {
    if (v.ruleId === 'PG004_MISSING_LOCK_TIMEOUT') continue;
    if (v.safeDiffReplacement) {
      const start = v.lineNumber;
      const end = v.endLineNumber ?? v.lineNumber;
      replacements.push({
        startLine: start,
        endLine: end,
        safeDiff: v.safeDiffReplacement,
      });
    }
  }

  let i = 0;
  while (i < totalLines) {
    const currentLineNum = i + 1;
    const rep = replacements.find(r => r.startLine === currentLineNum);

    if (rep) {
      const endIdx = Math.min(rep.endLine, totalLines);
      // Emit all removed original lines spanning startLine to endLine
      for (let k = i; k < endIdx; k++) {
        diffLines.push(`- ${originalLines[k]}`);
      }
      // Emit safe replacement lines
      const repLines = rep.safeDiff.split('\n');
      for (const r of repLines) {
        diffLines.push(`+ ${r}`);
      }
      // Advance index past the entire multi-line statement
      i = endIdx;
    } else {
      diffLines.push(`  ${originalLines[i]}`);
      i++;
    }
  }

  return diffLines.join('\n') + '\n';
}
