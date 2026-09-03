/**
 * src/reporter.ts
 *
 * Terminal ASCII formatter and report generator for pg-lock-guard.
 */

import { MigrationAuditResult } from './types.js';

export function formatTerminalReport(result: MigrationAuditResult): string {
  const lines: string[] = [];

  lines.push('\n================================================================');
  lines.push('🛡️  PG-LOCK-GUARD: PostgreSQL Zero-Downtime Migration Linter');
  lines.push('================================================================');
  lines.push(`📄 Target File:      ${result.filePath}`);
  lines.push(`📊 Statements Analyzed: ${result.statementCount}`);
  lines.push(`⏱️ Lock Timeout Set:  ${result.hasLockTimeoutSet ? '✅ YES' : '🚨 NO (Missing SET lock_timeout)'}`);
  lines.push('');

  if (result.violations.length === 0) {
    lines.push('✅ STATUS: SAFE TO DEPLOY');
    lines.push('   Zero blocking lock hazards or unvalidated constraints detected.');
    lines.push('================================================================\n');
    return lines.join('\n');
  }

  lines.push(`🚨 LOCK HAZARDS DETECTED (${result.violations.length} Violations):`);
  lines.push('----------------------------------------------------------------');

  result.violations.forEach((v, idx) => {
    const badge = v.severity === 'CRITICAL' ? '🚨 [CRITICAL]' : v.severity === 'HIGH' ? '⚠️ [HIGH]' : 'ℹ️ [MEDIUM]';
    lines.push(`${idx + 1}. ${badge} ${v.ruleName} (Line ${v.lineNumber})`);
    lines.push(`   • Table Target:    ${v.tableName}`);
    lines.push(`   • Lock Acquired:   ${v.acquiredLock}`);
    lines.push(`   • Offending SQL:   ${v.offendingSql}`);
    lines.push(`   • Hazard Reason:   ${v.explanation}`);
    lines.push(`   • Recommended Fix: ${v.remediationAdvice}`);
    lines.push('');
  });

  lines.push('================================================================');
  lines.push(`SUMMARY: ${result.summary.criticalCount} Critical | ${result.summary.highCount} High | ${result.summary.mediumCount} Medium`);
  lines.push(`CI GATE: ${result.summary.isSafeToDeploy ? '✅ PASS' : '❌ FAILED (Deploy Blocked to Prevent Production Outage)'}`);
  lines.push('================================================================\n');

  return lines.join('\n');
}
