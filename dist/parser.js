/**
 * src/parser.ts
 *
 * Lightweight deterministic SQL DDL parser & AST extractor for PostgreSQL migrations.
 */
const VOLATILE_FUNCTIONS = [
    'random()',
    'gen_random_uuid()',
    'uuid_generate_v4()',
    'clock_timestamp()',
    'now()',
    'current_timestamp',
    'statement_timestamp()',
    'timeofday()',
];
export function parseSqlMigration(sqlContent) {
    const statements = [];
    const lines = sqlContent.split('\n');
    let currentBuffer = '';
    let currentStartLine = 1;
    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();
        // Skip empty lines and full line comments if buffer is empty
        if (!currentBuffer && (trimmed.startsWith('--') || trimmed.startsWith('/*') || !trimmed)) {
            continue;
        }
        if (!currentBuffer) {
            currentStartLine = i + 1;
        }
        currentBuffer += (currentBuffer ? ' ' : '') + rawLine;
        // Check if statement is terminated by semicolon
        if (trimmed.endsWith(';')) {
            const fullSql = currentBuffer.trim();
            const parsed = analyzeStatement(fullSql, currentStartLine);
            statements.push(parsed);
            currentBuffer = '';
        }
    }
    // Handle any trailing statement without semicolon
    if (currentBuffer.trim()) {
        statements.push(analyzeStatement(currentBuffer.trim(), currentStartLine));
    }
    return statements;
}
function analyzeStatement(sql, lineNumber) {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();
    const upper = cleanSql.toUpperCase();
    // 1. SET lock_timeout
    if (upper.startsWith('SET LOCK_TIMEOUT') || upper.startsWith('SET LOCAL LOCK_TIMEOUT')) {
        const match = upper.match(/LOCK_TIMEOUT\s*=\s*['"]?(\d+)(S|MS|MIN)?['"]?/i);
        let ms = 0;
        if (match) {
            const num = parseInt(match[1] ?? '0', 10);
            const unit = (match[2] ?? 'MS').toUpperCase();
            if (unit === 'S')
                ms = num * 1000;
            else if (unit === 'MIN')
                ms = num * 60000;
            else
                ms = num;
        }
        return {
            rawSql: sql,
            lineNumber,
            type: 'SET_LOCK_TIMEOUT',
            lockTimeoutMs: ms,
        };
    }
    // 2. CREATE INDEX
    if (upper.startsWith('CREATE INDEX') || upper.startsWith('CREATE UNIQUE INDEX')) {
        const isConcurrent = upper.includes('CONCURRENTLY');
        const tableMatch = cleanSql.match(/ON\s+([a-zA-Z0-9_."]+)/i);
        return {
            rawSql: sql,
            lineNumber,
            type: 'CREATE_INDEX',
            tableName: tableMatch ? tableMatch[1] : undefined,
            isConcurrent,
        };
    }
    // 3. VACUUM FULL
    if (upper.startsWith('VACUUM FULL') || upper.startsWith('VACUUM (FULL')) {
        const tableMatch = cleanSql.match(/VACUUM\s+(?:FULL|\(FULL.*?\))\s+([a-zA-Z0-9_."]+)/i);
        return {
            rawSql: sql,
            lineNumber,
            type: 'VACUUM',
            tableName: tableMatch ? tableMatch[1] : undefined,
        };
    }
    // 4. ALTER TABLE ... ADD COLUMN
    if (upper.startsWith('ALTER TABLE') && upper.includes('ADD COLUMN')) {
        const tableMatch = cleanSql.match(/ALTER\s+TABLE\s+(?:ONLY\s+)?([a-zA-Z0-9_."]+)/i);
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
            tableName: tableMatch ? tableMatch[1] : undefined,
            hasVolatileDefault,
            defaultExpression,
        };
    }
    // 5. ALTER TABLE ... ADD CONSTRAINT FOREIGN KEY
    if (upper.startsWith('ALTER TABLE') && (upper.includes('ADD CONSTRAINT') || upper.includes('ADD FOREIGN KEY'))) {
        const tableMatch = cleanSql.match(/ALTER\s+TABLE\s+(?:ONLY\s+)?([a-zA-Z0-9_."]+)/i);
        const hasNotValid = upper.includes('NOT VALID');
        return {
            rawSql: sql,
            lineNumber,
            type: 'ALTER_TABLE_ADD_CONSTRAINT',
            tableName: tableMatch ? tableMatch[1] : undefined,
            hasNotValid,
        };
    }
    // 6. ALTER TABLE ... ALTER COLUMN TYPE
    if (upper.startsWith('ALTER TABLE') && upper.includes('ALTER COLUMN') && upper.includes('TYPE')) {
        const tableMatch = cleanSql.match(/ALTER\s+TABLE\s+(?:ONLY\s+)?([a-zA-Z0-9_."]+)/i);
        return {
            rawSql: sql,
            lineNumber,
            type: 'ALTER_TABLE_ALTER_COLUMN',
            tableName: tableMatch ? tableMatch[1] : undefined,
        };
    }
    // 7. ALTER TABLE ... DROP COLUMN
    if (upper.startsWith('ALTER TABLE') && upper.includes('DROP COLUMN')) {
        const tableMatch = cleanSql.match(/ALTER\s+TABLE\s+(?:ONLY\s+)?([a-zA-Z0-9_."]+)/i);
        return {
            rawSql: sql,
            lineNumber,
            type: 'ALTER_TABLE_DROP_COLUMN',
            tableName: tableMatch ? tableMatch[1] : undefined,
        };
    }
    // 8. CREATE TABLE
    if (upper.startsWith('CREATE TABLE')) {
        const tableMatch = cleanSql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_."]+)/i);
        return {
            rawSql: sql,
            lineNumber,
            type: 'CREATE_TABLE',
            tableName: tableMatch ? tableMatch[1] : undefined,
        };
    }
    return {
        rawSql: sql,
        lineNumber,
        type: 'OTHER',
    };
}
