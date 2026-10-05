CREATE TABLE orders_new (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0 AND typeof(amount_cents) = 'integer'),
  currency TEXT NOT NULL CHECK (currency = 'CNY'),
  customer_access_token_hash TEXT NOT NULL CHECK (length(customer_access_token_hash) = 64),
  wechat_transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (status IN (
    'PENDING_PAYMENT', 'PAYMENT_REFERENCE_SUBMITTED', 'PAYMENT_VERIFIED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'EXPIRED'
  )),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payment_reference_submitted_at TEXT,
  payment_verified_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  refunded_at TEXT,
  admin_note TEXT NOT NULL DEFAULT '' CHECK (length(admin_note) <= 2000)
);

INSERT INTO orders_new SELECT * FROM orders;
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;
ALTER TABLE orders ADD COLUMN archived_at TEXT;
ALTER TABLE orders ADD COLUMN expired_at TEXT;
CREATE INDEX orders_created_at_id ON orders (created_at DESC, id DESC);
CREATE UNIQUE INDEX orders_wechat_transaction_id ON orders (wechat_transaction_id)
  WHERE wechat_transaction_id IS NOT NULL;

CREATE INDEX orders_pending_created ON orders(status, created_at);
CREATE TABLE supporters (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 60),
  message TEXT NOT NULL CHECK(length(message) <= 1000),
  published INTEGER NOT NULL DEFAULT 1 CHECK(published IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE site_content (
  id TEXT PRIMARY KEY CHECK(id = 'words'),
  body TEXT NOT NULL CHECK(length(body) <= 2000),
  updated_at TEXT NOT NULL
);
