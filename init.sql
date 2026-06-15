-- Shanti Food Database Schema

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
