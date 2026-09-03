# 🛡️ pg-lock-guard

[![CI](https://github.com/priteshloke/pg-lock-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/priteshloke/pg-lock-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](package.json)

> **Zero-Downtime PostgreSQL Migration Linter & Table Lock Detector.**  
> Catches `AccessExclusiveLock` hazards in CI before SQL DDL deploys to production and blocks web traffic.

---

## 🛑 The Problem

In PostgreSQL, executing standard DDL commands like `CREATE INDEX` or `ALTER TABLE ADD CONSTRAINT` acquires heavy table locks (`ShareLock` or `ShareRowExclusiveLock`). 

When executed on high-traffic production databases:
1. The DDL query waits for existing slow read/write queries to finish.
2. All subsequent incoming web requests queue behind the waiting DDL.
3. PostgreSQL connection pool fills up within seconds, triggering **HTTP 504 Gateway Timeouts** across your application.

`pg-lock-guard` statically parses your SQL migration files in CI, identifies dangerous lock acquisitions, and emits human-reviewable **zero-downtime safe diffs (`--suggest-diff`)**.

---

## 🔍 Rules & Hazards Detected

| Rule ID | Rule Name | Acquired Lock | Hazard & Downtime Risk |
|---|---|---|---|
| `PG001` | **CREATE INDEX without CONCURRENTLY** | `ShareLock` | Blocks all concurrent `INSERT`, `UPDATE`, `DELETE` operations until indexing finishes. |
| `PG002` | **ADD FOREIGN KEY without NOT VALID** | `ShareRowExclusiveLock` | Performs a full sequential table scan while blocking writes. |
| `PG003` | **ADD COLUMN with Volatile Default** | `AccessExclusiveLock` | Forces full physical table rewrite while blocking all reads and writes. |
| `PG004` | **Missing SET lock_timeout** | `AccessExclusiveLock` | Allows DDL to wait indefinitely, blocking the entire connection pool. |
| `PG005` | **ALTER COLUMN TYPE** | `AccessExclusiveLock` | Forces full table rewrite and blocks all concurrent transactions. |
| `PG006` | **VACUUM FULL** | `AccessExclusiveLock` | Completely locks table and rewrites all data files and indexes. |
| `PG007` | **DROP COLUMN CASCADE** | `AccessExclusiveLock` | Drops dependent views and triggers with heavy exclusive locks. |

---

## 🚀 Installation & Usage

```bash
# Run directly with npx
npx pg-lock-guard migrations/20260903_add_orders_index.sql

# Or install globally
npm install -g pg-lock-guard
```

### CLI Command Options:

```bash
# Basic audit
pg-lock-guard migration.sql

# Output safe suggested unified diff patch
pg-lock-guard migration.sql --suggest-diff

# Machine-readable JSON output for CI pipelines
pg-lock-guard migration.sql --json
```

---

## 📝 Example Output & Suggested Diff

```text
================================================================
🛡️  PG-LOCK-GUARD: PostgreSQL Zero-Downtime Migration Linter
================================================================
📄 Target File:      migrations/add_customer_index.sql
📊 Statements Analyzed: 2
⏱️ Lock Timeout Set:  🚨 NO (Missing SET lock_timeout)

🚨 LOCK HAZARDS DETECTED (2 Violations):
----------------------------------------------------------------
1. ⚠️ [HIGH] Migration Missing SET lock_timeout (Line 1)
   • Lock Acquired:   AccessExclusiveLock
   • Recommended Fix: Add `SET lock_timeout = '3s';` at the top of your migration.

2. 🚨 [CRITICAL] CREATE INDEX without CONCURRENTLY (Line 2)
   • Table Target:    orders
   • Lock Acquired:   ShareLock
   • Recommended Fix: Add CONCURRENTLY to build the index without blocking writes.

================================================================
SUMMARY: 1 Critical | 1 High | 0 Medium
CI GATE: ❌ FAILED (Deploy Blocked to Prevent Production Outage)
================================================================
```

When run with `--suggest-diff`:

```diff
--- a/migrations/add_customer_index.sql (Unsafe Migration)
+++ b/migrations/add_customer_index.sql (Suggested Zero-Downtime Safe Migration)
@@ -1 +1 @@
+ SET lock_timeout = '3s'; -- Guard: abort DDL if blocked by long queries
- CREATE INDEX idx_orders_customer_id ON orders (customer_id);
+ CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_id ON orders (customer_id);
```

---

## 🛡️ Zero-Liability Guarantee

`pg-lock-guard` is strictly an advisory linter. It **never mutates or executes destructive transforms** on production databases. All safe recommendations are emitted as standard unified diffs for human engineer review and approval.

---

## 🧪 Testing

```bash
npm test
```

## 📄 License

MIT © [Pritesh Loke](https://github.com/priteshloke)
