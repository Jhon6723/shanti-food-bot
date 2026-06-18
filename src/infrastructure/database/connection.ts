// PostgreSQL connection pool

import bcrypt from 'bcrypt';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

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
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    username      VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'delivery')),
    active        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    estimated_ready_at TIMESTAMPTZ,
    delivery_proof_url TEXT,
    delivered_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
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
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
`;

// Migration step 1: ensure users table exists (needed before orders FK)
const MIGRATION_USERS_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    username      VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'delivery')),
    active        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
`;

// Migration step 2: add new columns to orders (depends on users existing)
const MIGRATION_ORDERS_SQL = `
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_proof_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_delivered_by ON orders(delivered_by);
`;

// Migration step 3: categories and products tables (v1.5)
const MIGRATION_CATEGORIES_SQL = `
CREATE TABLE IF NOT EXISTS categories (
    id            VARCHAR(50) PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const MIGRATION_PRODUCTS_SQL = `
CREATE TABLE IF NOT EXISTS products (
    id                    VARCHAR(50) PRIMARY KEY,
    name                  VARCHAR(100) NOT NULL,
    category_id         VARCHAR(50) NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    price                 INTEGER NOT NULL DEFAULT 0,
    description           TEXT,
    available             BOOLEAN NOT NULL DEFAULT true,
    preparation_minutes   INTEGER NOT NULL DEFAULT 25,
    customization_options TEXT[] DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_available ON products(available);
`;

async function seedAdminUser(): Promise<void> {
  const existing = await pool.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
  if (existing.rows.length > 0) return;

  const username = process.env.ADMIN_USER ?? 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.warn('[seed] ADMIN_PASSWORD not set — skipping admin seed. Set it to create the initial admin user.');
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    'INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, $4)',
    ['Administrador', username, hash, 'admin']
  );
  console.log(`[seed] Admin user '${username}' created.`);
}

async function seedCategoriesAndProducts(): Promise<void> {
  // Seed categories
  const catCount = await pool.query('SELECT COUNT(*) FROM categories');
  if (parseInt(catCount.rows[0].count, 10) > 0) return;

  await pool.query(`
    INSERT INTO categories (id, name, sort_order) VALUES
      ('arroz_chino', 'Arroces Chinos', 1),
      ('bandeja_paisa', 'Bandejas', 2),
      ('bebidas', 'Bebidas', 3)
    ON CONFLICT (id) DO NOTHING
  `);
  console.log('[seed] Categories created.');

  // Seed products from former hardcoded catalog
  const prodCount = await pool.query('SELECT COUNT(*) FROM products');
  if (parseInt(prodCount.rows[0].count, 10) > 0) return;

  await pool.query(`
    INSERT INTO products (id, name, category_id, price, description, available, preparation_minutes, customization_options)
    VALUES
      ('arroz-pollo', 'Arroz Chino de Pollo', 'arroz_chino', 18000, 'Arroz salteado con pollo, verduras y salsa de soya', true, 20, ARRAY['sin cebolla', 'sin ají', 'extra pollo']),
      ('arroz-cerdo', 'Arroz Chino de Cerdo', 'arroz_chino', 20000, 'Arroz salteado con cerdo, verduras y salsa de soya', true, 20, ARRAY['sin cebolla', 'sin ají']),
      ('arroz-camaron', 'Arroz Chino de Camarón', 'arroz_chino', 24000, 'Arroz salteado con camarón, verduras y salsa de soya', true, 25, ARRAY['sin cebolla', 'sin ají']),
      ('arroz-especial', 'Arroz Chino Especial', 'arroz_chino', 28000, 'Arroz salteado con pollo, cerdo, camarón y verduras', true, 25, ARRAY['sin cebolla', 'sin ají', 'extra pollo', 'extra camarón']),
      ('bandeja-paisa', 'Bandeja Paisa', 'bandeja_paisa', 22000, 'Arroz, frijoles, carne molida, chorizo, huevo, arepa y aguacate', true, 25, ARRAY['sin huevo', 'sin chorizo']),
      ('bandeja-pollo', 'Bandeja de Pollo', 'bandeja_paisa', 20000, 'Arroz, frijoles, pechuga de pollo, ensalada y arepa', true, 22, ARRAY['sin piel', 'pechuga desmechada']),
      ('coca-400', 'Coca-Cola 400ml', 'bebidas', 4000, 'Gaseosa Coca-Cola personal', true, 0, ARRAY[]::text[]),
      ('coca-1-5', 'Coca-Cola 1.5L', 'bebidas', 8000, 'Gaseosa Coca-Cola familiar', true, 0, ARRAY[]::text[]),
      ('jugo-natural', 'Jugo Natural', 'bebidas', 6000, 'Jugo de fruta natural del día', true, 5, ARRAY['sin azúcar', 'con leche'])
    ON CONFLICT (id) DO NOTHING
  `);
  console.log('[seed] Products created.');
}

export async function initDatabase(): Promise<void> {
  await pool.query(SCHEMA_SQL);
  await pool.query(MIGRATION_USERS_SQL);
  await pool.query(MIGRATION_ORDERS_SQL);
  await pool.query(MIGRATION_CATEGORIES_SQL);
  await pool.query(MIGRATION_PRODUCTS_SQL);
  await seedAdminUser();
  await seedCategoriesAndProducts();
}
