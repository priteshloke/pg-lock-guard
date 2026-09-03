/**
 * src/diff-suggester.ts
 *
 * Generates unified diffs and suggested safe zero-downtime SQL replacements.
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

  for (let i = 0; i < originalLines.length; i++) {
    const lineNum = i + 1;
    const lineText = originalLines[i]!;
    const lineViolations = result.violations.filter(v => v.lineNumber === lineNum && v.ruleId !== 'PG004_MISSING_LOCK_TIMEOUT');

    if (lineViolations.length > 0 && lineViolations.some(v => v.safeDiffReplacement)) {
      diffLines.push(`- ${lineText}`);
      for (const v of lineViolations) {
        if (v.safeDiffReplacement) {
          const replacementLines = v.safeDiffReplacement.split('\n');
          for (const r of replacementLines) {
            diffLines.push(`+ ${r}`);
          }
        }
      }
    } else {
      diffLines.push(`  ${lineText}`);
    }
  }

  return diffLines.join('\n') + '\n';
}
