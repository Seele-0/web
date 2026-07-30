PRAGMA foreign_keys = ON;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0 AND price_cents <= 10000000),
  sort_order INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE daily_orders (
  order_date TEXT PRIMARY KEY,
  share_count INTEGER NOT NULL DEFAULT 1 CHECK (share_count >= 1 AND share_count <= 100),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE order_contributions (
  order_date TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 30),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_date, menu_item_id, device_id),
  FOREIGN KEY (order_date) REFERENCES daily_orders(order_date) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

CREATE TABLE operations (
  operation_id TEXT PRIMARY KEY,
  order_date TEXT NOT NULL,
  device_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_date) REFERENCES daily_orders(order_date) ON DELETE CASCADE
);

CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_date TEXT NOT NULL,
  device_id TEXT,
  display_name TEXT,
  action TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_contributions_date_item
  ON order_contributions(order_date, menu_item_id);
CREATE INDEX idx_activity_date_created
  ON activity_log(order_date, created_at DESC);
CREATE INDEX idx_operations_date_device
  ON operations(order_date, device_id);
