# PostgreSQL Zero-Downtime Migration Linter & Lock Guard 🛡️⚡

[![CI](https://github.com/priteshloke/pg-lock-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/priteshloke/pg-lock-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node: >=18](https://img.shields.io/badge/Node-%3E%3D18-blue.svg)](https://nodejs.org)

> **Deterministic PostgreSQL migration linter & AST analyzer that detects `AccessExclusiveLock` hazards, table rewrites, and missing timeouts in CI/CD before DDL touches production.**

---

## 📌 The Problem: How DDL Migrations Crash Production

In PostgreSQL, executing standard DDL commands like `CREATE INDEX` or `ALTER TABLE ADD CONSTRAINT` acquires heavy table locks (`ShareLock` or `ShareRowExclusiveLock`). 

When executed on tables with millions of rows:
1. The DDL query waits for existing slow read/write queries to finish.
2. All subsequent incoming web requests queue behind the waiting DDL.
3. The database connection pool fills up within seconds, taking down the entire web application with **HTTP 504 Gateway Timeouts**.

`pg-lock-guard` audits migration files statically in CI/CD, blocks unsafe table locks, and emits safe, zero-downtime replacements.

---

## 🛡️ Rule Catalog

| Rule ID | Hazard Name | Lock Acquired | Risk & Zero-Downtime Remediation |
|---|---|---|---|
| `PG001` | **CREATE INDEX without CONCURRENTLY** | `ShareLock` | Blocks all concurrent `INSERT`, `UPDATE`, `DELETE` operations. **Fix:** Add `CONCURRENTLY`. |
| `PG002` | **ADD FOREIGN KEY without NOT VALID** | `ShareRowExclusiveLock` | Performs full sequential scan while holding write lock. **Fix:** Add `NOT VALID`, validate later. |
| `PG003` | **ADD COLUMN with Volatile Default** | `AccessExclusiveLock` | Volatile defaults (`gen_random_uuid()`) force full table rewrite. **Fix:** Add NULLable, backfill. |
| `PG004` | **Missing SET lock_timeout** | `AccessExclusiveLock` | Allows DDL to wait indefinitely, blocking the entire connection pool. **Fix:** Set `lock_timeout = '3s'`. |
| `PG005` | **ALTER COLUMN TYPE** | `AccessExclusiveLock` | Forces full physical table rewrite. **Fix:** Add new column, dual-write, backfill, swap. |
| `PG006` | **VACUUM FULL** | `AccessExclusiveLock` | Completely locks out all reads and writes. **Fix:** Use standard `VACUUM` or `pg_repack`. |
| `PG007` | **DROP COLUMN** | `AccessExclusiveLock` | Breaks active application queries referencing the column. **Fix:** Decouple app code first. |
| `PG008` | **ADD UNIQUE / PRIMARY KEY without Index** | `AccessExclusiveLock` | Direct constraint addition takes exclusive lock. **Fix:** `CREATE UNIQUE INDEX CONCURRENTLY` + `USING INDEX`. |
| `PG009` | **ADD CHECK without NOT VALID** | `AccessExclusiveLock` | Scans table under exclusive lock. **Fix:** Add `NOT VALID`, then `VALIDATE CONSTRAINT`. |
| `PG010` | **ALTER COLUMN SET NOT NULL** | `AccessExclusiveLock` | Scans table to verify no NULLs exist. **Fix:** Add CHECK constraint `NOT VALID`, validate, then set. |
| `PG011` | **CONCURRENT Index in Transaction** | Fatal Error | PostgreSQL prohibits `CONCURRENTLY` in `BEGIN ... COMMIT`. **Fix:** Execute standalone. |

---

## 🚀 Quick Start

### 1. Run from Source / Local Clone

```bash
git clone https://github.com/priteshloke/pg-lock-guard.git
cd pg-lock-guard
npm install
node bin/cli.js fixtures/unsafe-migration.sql --suggest-diff
```

### 2. Run via NPX or Local Dev Dependency

```bash
# Direct run via npx (or when linked with npm link)
npx pg-lock-guard migrations/V10__add_orders_index.sql --suggest-diff

# Or install locally in your repository
npm install --save-dev pg-lock-guard
```

### 3. Example Output

```bash
node bin/cli.js fixtures/unsafe-migration.sql --suggest-diff
```

```diff
================================================================
🛡️  PG-LOCK-GUARD: PostgreSQL Zero-Downtime Migration Linter
================================================================
📄 Target File:      fixtures/unsafe-migration.sql
📊 Statements Analyzed: 6
⏱️ Lock Timeout Set:  🚨 NO (Missing SET lock_timeout)

🚨 LOCK HAZARDS DETECTED (7 Violations):
1. ⚠️ [HIGH] Migration Missing SET lock_timeout (Line 1)
2. 🚨 [CRITICAL] CREATE INDEX without CONCURRENTLY (Line 4)
3. 🚨 [CRITICAL] ADD FOREIGN KEY without NOT VALID (Line 7)
4. 🚨 [CRITICAL] ADD COLUMN with Volatile Default Expression (Line 10)
5. 🚨 [CRITICAL] VACUUM FULL Table Lockout (Line 13)
6. ⚠️ [HIGH] ALTER COLUMN TYPE Full Table Rewrite (Line 16)
7. ℹ️ [MEDIUM] DROP COLUMN with Potential Cascade Lock (Line 19)

SUMMARY: 4 Critical | 2 High | 1 Medium
CI GATE: ❌ FAILED (Deploy Blocked to Prevent Production Outage)
================================================================

📝 Suggested Zero-Downtime Patch:
----------------------------------------------------------------
--- a/fixtures/unsafe-migration.sql (Unsafe Migration)
+++ b/fixtures/unsafe-migration.sql (Suggested Zero-Downtime Safe Migration)
@@ -1 +1 @@
+ SET lock_timeout = '3s'; -- Guard: abort DDL if blocked by long queries
- CREATE INDEX idx_orders_customer_id ON orders (customer_id);
+ CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_id ON orders (customer_id);
- ALTER TABLE orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id);
+ ALTER TABLE orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;
```

---

## 🔧 GitHub Actions CI/CD Integration

Add `pg-lock-guard` to your Pull Request workflow:

```yaml
name: Database Migration Linter
on: [pull_request]

jobs:
  lint-migrations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx pg-lock-guard migrations/*.sql --suggest-diff
```

---

## 📄 License

[MIT](LICENSE) © 2026 Pritesh Loke
