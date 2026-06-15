// PostgreSQL connection pool

import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://shanti:shanti123@localhost:5432/shanti_food';

// Disable SSL for local/internal hosts; enable only for real production platforms
const isLocalOrDocker =
  !process.env.DATABASE_URL ||
  /localhost|127\.0\.0\.1|db|postgres/.test(process.env.DATABASE_URL ?? '');

export const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' && !isLocalOrDocker
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected PostgreSQL error', err);
  process.exit(-1);
});

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const { rows } = await pool.query(text, params);
  return rows as T[];
}

export async function queryOne<T = unknown>(text: string, params?: unknown[]): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS orders (
    id            VARCHAR(50) PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    type          VARCHAR(10) NOT NULL CHECK (type IN ('delivery', 'pickup')),
    address       TEXT,
    payment_method VARCHAR(10) NOT NULL CHECK (payment_method IN ('cash', 'nequi')),
    status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')),
    notes         TEXT,
    subtotal      INTEGER NOT NULL DEFAULT 0,
    delivery_fee  INTEGER NOT NULL DEFAULT 0,
    total         INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    estimated_ready_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
    id            SERIAL PRIMARY KEY,
    order_id      VARCHAR(50) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id    VARCHAR(50) NOT NULL,
    quantity      INTEGER NOT NULL CHECK (quantity > 0),
    customizations TEXT[],
    notes         TEXT,
    unit_price    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(type);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
`;

export async function initDatabase(): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
