/**
 * src/parser.ts
 *
 * Semicolon-aware SQL DDL tokenizer and AST parser for PostgreSQL migrations.
 */

import { SqlStatementAst, StatementType } from './types.js';

// Volatile functions that force physical table rewrite on ADD COLUMN in PostgreSQL 11+
const VOLATILE_FUNCTIONS = [
  'random()',
  'gen_random_uuid()',
  'uuid_generate_v4()',
  'clock_timestamp()',
  'timeofday()',
];

interface RawSegment {
  sql: string;
  lineNumber: number;
}

/**
 * Splits raw SQL into individual statements by semicolon, properly ignoring
 * semicolons inside single quotes, double quotes, dollar quotes, and comments.
 */
export function splitSqlStatements(sqlContent: string): RawSegment[] {
  const segments: RawSegment[] = [];
  let currentBuffer = '';
  let statementStartLine = 1;
  let currentLine = 1;
  let hasFoundFirstStatementChar = false;

  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inDollarQuote = false;
  let dollarTag = '';
  let inLineComment = false;
  let inBlockComment = false;

  const len = sqlContent.length;

  for (let i = 0; i < len; i++) {
    const char = sqlContent[i]!;
    const nextChar = i + 1 < len ? sqlContent[i + 1] : '';

    if (char === '\n') {
      currentLine++;
      if (inLineComment) {
        inLineComment = false;
        continue;
      }
    }

    // Handle line comment --
    if (!inSingleQuote && !inDoubleQuote && !inDollarQuote && !inBlockComment && !inLineComment) {
      if (char === '-' && nextChar === '-') {
        inLineComment = true;
        continue;
      }
    }

    if (inLineComment) {
      continue;
    }

    // Handle block comment /* */
    if (!inSingleQuote && !inDoubleQuote && !inDollarQuote && !inLineComment) {
      if (!inBlockComment && char === '/' && nextChar === '*') {
        inBlockComment = true;
        i++; // skip *
        continue;
      } else if (inBlockComment && char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++; // skip /
        continue;
      }
    }

    if (inBlockComment) {
      continue;
    }

    // Track first non-whitespace, non-comment statement character line
    if (!hasFoundFirstStatementChar && char.trim()) {
      statementStartLine = currentLine;
      hasFoundFirstStatementChar = true;
    }

    // Handle single quote '
    if (!inDoubleQuote && !inDollarQuote) {
      if (char === "'") {
        if (inSingleQuote && nextChar === "'") {
          currentBuffer += "''";
          i++;
          continue;
        }
        inSingleQuote = !inSingleQuote;
      }
    }

    // Handle double quote "
    if (!inSingleQuote && !inDollarQuote) {
      if (char === '"') {
        inDoubleQuote = !inDoubleQuote;
      }
    }

    // Handle dollar quote $$ or $tag$
    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '$') {
        const remaining = sqlContent.slice(i);
        const match = remaining.match(/^(\$[a-zA-Z0-9_]*\$)/);
        if (match && match[1]) {
          const tag = match[1];
          if (!inDollarQuote) {
            inDollarQuote = true;
            dollarTag = tag;
          } else if (dollarTag === tag) {
            inDollarQuote = false;
            dollarTag = '';
          }
        }
      }
    }

    // Check for statement terminating semicolon
    if (char === ';' && !inSingleQuote && !inDoubleQuote && !inDollarQuote) {
      const trimmed = currentBuffer.trim();
      if (trimmed) {
        segments.push({
          sql: trimmed + ';',
          lineNumber: statementStartLine,
        });
      }
      currentBuffer = '';
      hasFoundFirstStatementChar = false;
      statementStartLine = currentLine;
      continue;
    }

    currentBuffer += char;
  }

  // Trailing statement without semicolon
  const finalTrimmed = currentBuffer.trim();
  if (finalTrimmed) {
    segments.push({
      sql: finalTrimmed,
      lineNumber: statementStartLine,
    });
  }

  return segments;
}

export function parseSqlMigration(sqlContent: string): SqlStatementAst[] {
  const rawSegments = splitSqlStatements(sqlContent);
  const statements: SqlStatementAst[] = [];
  let inTransaction = false;

  for (const seg of rawSegments) {
    const parsed = analyzeStatement(seg.sql, seg.lineNumber, inTransaction);
    if (parsed.type === 'BEGIN_TRANSACTION') {
      inTransaction = true;
    } else if (parsed.type === 'COMMIT_TRANSACTION') {
      inTransaction = false;
    }
    statements.push(parsed);
  }

  return statements;
}

function analyzeStatement(sql: string, lineNumber: number, inTransaction: boolean): SqlStatementAst {
  const cleanSql = sql.replace(/\s+/g, ' ').trim();
  const upper = cleanSql.toUpperCase();

  // 1. Transaction markers
  if (upper === 'BEGIN' || upper === 'BEGIN;' || upper.startsWith('BEGIN TRANSACTION') || upper.startsWith('START TRANSACTION')) {
    return { rawSql: sql, lineNumber, type: 'BEGIN_TRANSACTION', inTransaction: true };
  }
  if (upper === 'COMMIT' || upper === 'COMMIT;' || upper === 'END' || upper === 'END;' || upper.startsWith('COMMIT TRANSACTION')) {
    return { rawSql: sql, lineNumber, type: 'COMMIT_TRANSACTION', inTransaction: false };
  }

  // 2. SET lock_timeout
  if (upper.startsWith('SET LOCK_TIMEOUT') || upper.startsWith('SET LOCAL LOCK_TIMEOUT')) {
    const match = upper.match(/LOCK_TIMEOUT\s*=\s*['"]?(\d+)(S|MS|MIN)?['"]?/i);
    let ms = 0;
    if (match) {
      const num = parseInt(match[1] ?? '0', 10);
      const unit = (match[2] ?? 'MS').toUpperCase();
      if (unit === 'S') ms = num * 1000;
      else if (unit === 'MIN') ms = num * 60000;
      else ms = num;
    }
    return {
      rawSql: sql,
      lineNumber,
      type: 'SET_LOCK_TIMEOUT',
      lockTimeoutMs: ms,
      inTransaction,
    };
  }

  // 3. CREATE INDEX / CREATE UNIQUE INDEX
  if (upper.startsWith('CREATE INDEX') || upper.startsWith('CREATE UNIQUE INDEX')) {
    const isConcurrent = upper.includes('CONCURRENTLY');
    const tableMatch = cleanSql.match(/ON\s+([a-zA-Z0-9_."]+)/i);
    const indexMatch = cleanSql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_."]+)/i);
    return {
      rawSql: sql,
      lineNumber,
      type: 'CREATE_INDEX',
      tableName: tableMatch ? tableMatch[1] : undefined,
      indexName: indexMatch ? indexMatch[1] : undefined,
      isConcurrent,
      inTransaction,
    };
  }

  // 4. VACUUM FULL
  if (upper.startsWith('VACUUM FULL') || upper.startsWith('VACUUM (FULL') || upper.startsWith('VACUUM')) {
    const isFull = upper.includes('FULL');
    const tableMatch = cleanSql.match(/VACUUM\s+(?:FULL|\(FULL.*?\))\s+([a-zA-Z0-9_."]+)/i);
    return {
      rawSql: sql,
      lineNumber,
      type: 'VACUUM',
      tableName: tableMatch ? tableMatch[1] : undefined,
      isConcurrent: !isFull,
      inTransaction,
    };
  }

  // 5. ALTER TABLE ...
  if (upper.startsWith('ALTER TABLE')) {
    const tableMatch = cleanSql.match(/ALTER\s+TABLE\s+(?:ONLY\s+)?([a-zA-Z0-9_."]+)/i);
    const tableName = tableMatch ? tableMatch[1] : undefined;

    // 5a. ALTER TABLE ... ADD COLUMN
    if (upper.includes('ADD COLUMN') || cleanSql.match(/ALTER\s+TABLE\s+\S+\s+ADD\s+(?!CONSTRAINT|CHECK|FOREIGN|UNIQUE|PRIMARY)\w+/i)) {
      const colMatch = cleanSql.match(/ADD\s+(?:COLUMN\s+)?([a-zA-Z0-9_."]+)\s+([a-zA-Z0-9_."()]+)/i);
      const columnName = colMatch ? colMatch[1] : undefined;
      const columnType = colMatch ? colMatch[2] : undefined;

      const hasDefault = upper.includes('DEFAULT');
      let hasVolatileDefault = false;
      let defaultExpression = '';

      if (hasDefault) {
        const defaultMatch = cleanSql.match(/DEFAULT\s+([^;,]+)/i);
        if (defaultMatch) {
          defaultExpression = defaultMatch[1]?.trim() ?? '';
          const lowerDef = defaultExpression.toLowerCase();
          hasVolatileDefault = VOLATILE_FUNCTIONS.some(f => lowerDef.includes(f));
        }
      }

      return {
        rawSql: sql,
        lineNumber,
        type: 'ALTER_TABLE_ADD_COLUMN',
        tableName,
        columnName,
        columnType,
        hasVolatileDefault,
        defaultExpression,
        inTransaction,
      };
    }

    // 5b. ALTER TABLE ... ADD CONSTRAINT FOREIGN KEY
    if (upper.includes('FOREIGN KEY')) {
      const hasNotValid = upper.includes('NOT VALID');
      const constraintMatch = cleanSql.match(/ADD\s+CONSTRAINT\s+([a-zA-Z0-9_."]+)\s+FOREIGN\s+KEY/i);
      return {
        rawSql: sql,
        lineNumber,
        type: 'ALTER_TABLE_ADD_FOREIGN_KEY',
        tableName,
        constraintName: constraintMatch ? constraintMatch[1] : undefined,
        hasNotValid,
        inTransaction,
      };
    }

    // 5c. ALTER TABLE ... ADD CONSTRAINT UNIQUE / PRIMARY KEY
    if (upper.includes('UNIQUE') || upper.includes('PRIMARY KEY')) {
      const isPk = upper.includes('PRIMARY KEY');
      const constraintMatch = cleanSql.match(/ADD\s+CONSTRAINT\s+([a-zA-Z0-9_."]+)\s+(?:UNIQUE|PRIMARY\s+KEY)/i);
      return {
        rawSql: sql,
        lineNumber,
        type: isPk ? 'ALTER_TABLE_ADD_PRIMARY_KEY' : 'ALTER_TABLE_ADD_UNIQUE',
        tableName,
        constraintName: constraintMatch ? constraintMatch[1] : undefined,
        inTransaction,
      };
    }

    // 5d. ALTER TABLE ... ADD CONSTRAINT CHECK
    if (upper.includes('CHECK')) {
      const hasNotValid = upper.includes('NOT VALID');
      const constraintMatch = cleanSql.match(/ADD\s+CONSTRAINT\s+([a-zA-Z0-9_."]+)\s+CHECK/i);
      return {
        rawSql: sql,
        lineNumber,
        type: 'ALTER_TABLE_ADD_CHECK',
        tableName,
        constraintName: constraintMatch ? constraintMatch[1] : undefined,
        hasNotValid,
        inTransaction,
      };
    }

    // 5e. ALTER TABLE ... ALTER COLUMN ... SET NOT NULL
    if (upper.includes('SET NOT NULL')) {
      const colMatch = cleanSql.match(/ALTER\s+(?:COLUMN\s+)?([a-zA-Z0-9_."]+)\s+SET\s+NOT\s+NULL/i);
      return {
        rawSql: sql,
        lineNumber,
        type: 'ALTER_TABLE_ALTER_COLUMN_SET_NOT_NULL',
        tableName,
        columnName: colMatch ? colMatch[1] : undefined,
        inTransaction,
      };
    }

    // 5f. ALTER TABLE ... ALTER COLUMN ... TYPE
    if (upper.includes('ALTER COLUMN') && upper.includes('TYPE')) {
      const colMatch = cleanSql.match(/ALTER\s+(?:COLUMN\s+)?([a-zA-Z0-9_."]+)\s+(?:SET\s+DATA\s+)?TYPE\s+([a-zA-Z0-9_."(),\s]+?)(?:;|$)/i);
      return {
        rawSql: sql,
        lineNumber,
        type: 'ALTER_TABLE_ALTER_COLUMN_TYPE',
        tableName,
        columnName: colMatch ? colMatch[1] : undefined,
        columnType: colMatch ? colMatch[2]?.trim() : undefined,
        inTransaction,
      };
    }

    // 5g. ALTER TABLE ... DROP COLUMN
    if (upper.includes('DROP COLUMN') || cleanSql.match(/ALTER\s+TABLE\s+\S+\s+DROP\s+[a-zA-Z0-9_."]+/i)) {
      const colMatch = cleanSql.match(/DROP\s+(?:COLUMN\s+)?([a-zA-Z0-9_."]+)/i);
      return {
        rawSql: sql,
        lineNumber,
        type: 'ALTER_TABLE_DROP_COLUMN',
        tableName,
        columnName: colMatch ? colMatch[1] : undefined,
        inTransaction,
      };
    }
  }

  // 6. CREATE TABLE
  if (upper.startsWith('CREATE TABLE')) {
    const tableMatch = cleanSql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_."]+)/i);
    return {
      rawSql: sql,
      lineNumber,
      type: 'CREATE_TABLE',
      tableName: tableMatch ? tableMatch[1] : undefined,
      inTransaction,
    };
  }

  return {
    rawSql: sql,
    lineNumber,
    type: 'OTHER',
    inTransaction,
  };
}
