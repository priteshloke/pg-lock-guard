#!/usr/bin/env node
/**
 * src/cli.ts
 *
 * Commander CLI entrypoint for pg-lock-guard.
 */

import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { auditSqlMigration } from './engine.js';
import { formatTerminalReport } from './reporter.js';
import { generateSuggestedDiff } from './diff-suggester.js';

const program = new Command();

program
  .name('pg-lock-guard')
  .description('PostgreSQL Zero-Downtime Migration Linter & Table Lock Detector')
  .version('1.0.0')
  .argument('<file>', 'Path to SQL migration file to audit')
  .option('--suggest-diff', 'Emit human-reviewable unified diff patch with zero-downtime SQL replacements')
  .option('--json', 'Output result in machine-readable JSON for CI pipelines')
  .action((file: string, options: { suggestDiff?: boolean; json?: boolean }) => {
    const fullPath = resolve(process.cwd(), file);

    if (!existsSync(fullPath)) {
      console.error(`❌ Error: SQL file not found at ${fullPath}`);
      process.exit(1);
    }

    const sqlContent = readFileSync(fullPath, 'utf-8');
    const result = auditSqlMigration(sqlContent, file);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatTerminalReport(result));

      if (options.suggestDiff) {
        console.log('📝 Suggested Zero-Downtime Patch:');
        console.log('----------------------------------------------------------------');
        console.log(generateSuggestedDiff(result, sqlContent));
      }
    }

    if (!result.summary.isSafeToDeploy) {
      process.exit(1);
    }
  });

program.parse(process.argv);
