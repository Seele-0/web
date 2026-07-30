PRAGMA foreign_keys = ON;

CREATE TABLE order_items (
  order_date TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0 AND price_cents <= 10000000),
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_date, menu_item_id),
  FOREIGN KEY (order_date) REFERENCES daily_orders(order_date) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

INSERT INTO order_items
  (order_date, menu_item_id, name, price_cents, sort_order, created_at, updated_at)
SELECT c.order_date, c.menu_item_id, m.name, m.price_cents, m.sort_order,
       MIN(c.updated_at), MAX(c.updated_at)
FROM order_contributions c
JOIN menu_items m ON m.id = c.menu_item_id
GROUP BY c.order_date, c.menu_item_id, m.name, m.price_cents, m.sort_order;

CREATE TABLE automatic_order_locks (
  order_date TEXT PRIMARY KEY,
  locked_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('cron', 'request_fallback')),
  execution_token TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_order_items_date_sort
  ON order_items(order_date, sort_order, menu_item_id);
