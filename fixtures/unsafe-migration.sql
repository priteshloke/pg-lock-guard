-- Unsafe PostgreSQL migration with multiple blocking lock hazards

-- 1. Unsafe Index without CONCURRENTLY (ShareLock)
CREATE INDEX idx_orders_customer_id ON orders (customer_id);

-- 2. Foreign Key without NOT VALID (ShareRowExclusiveLock)
ALTER TABLE orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id);

-- 3. Add column with volatile default (AccessExclusiveLock table rewrite)
ALTER TABLE users ADD COLUMN api_token uuid DEFAULT gen_random_uuid();

-- 4. VACUUM FULL table lock
VACUUM FULL analytics_events;

-- 5. Alter column type rewrite
ALTER TABLE payments ALTER COLUMN amount TYPE numeric(12, 4);

-- 6. Drop column
ALTER TABLE accounts DROP COLUMN legacy_pin;
