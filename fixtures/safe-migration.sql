-- Zero-Downtime Safe PostgreSQL migration

-- Step 1: Set safe lock timeout to prevent queue starvation
SET lock_timeout = '3s';

-- Step 2: Create index concurrently without blocking writes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_id ON orders (customer_id);

-- Step 3: Add foreign key with NOT VALID (instant metadata lock)
ALTER TABLE orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;

-- Step 4: Add column nullable without default (no table rewrite)
ALTER TABLE users ADD COLUMN api_token uuid;
