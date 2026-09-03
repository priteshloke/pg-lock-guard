/**
 * src/diff-suggester.ts
 *
 * Generates unified diffs and suggested safe SQL replacements for detected violations.
 */
export function generateSuggestedDiff(result, originalSql) {
    if (result.violations.length === 0) {
        return '✅ No safe diff needed. Migration is 100% compliant with zero-downtime rules.\n';
    }
    const diffLines = [];
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
        const lineText = originalLines[i];
        const violation = result.violations.find(v => v.lineNumber === lineNum && v.ruleId !== 'PG004_MISSING_LOCK_TIMEOUT');
        if (violation && violation.safeDiffReplacement) {
            diffLines.push(`- ${lineText}`);
            const replacementLines = violation.safeDiffReplacement.split('\n');
            for (const r of replacementLines) {
                diffLines.push(`+ ${r}`);
            }
        }
        else {
            diffLines.push(`  ${lineText}`);
        }
    }
    return diffLines.join('\n') + '\n';
}
