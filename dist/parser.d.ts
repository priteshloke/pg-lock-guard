/**
 * src/parser.ts
 *
 * Lightweight deterministic SQL DDL parser & AST extractor for PostgreSQL migrations.
 */
import { SqlStatementAst } from './types.js';
export declare function parseSqlMigration(sqlContent: string): SqlStatementAst[];
