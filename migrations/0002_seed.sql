INSERT INTO settings (key, value, updated_at)
VALUES ('restaurant_name', '今日点餐', CURRENT_TIMESTAMP);

INSERT INTO menu_items (id, name, price_cents, sort_order, active, created_at, updated_at) VALUES
  ('dish-suan-cai-yu', '酸菜鱼', 6800, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dish-xiao-chao-huang-niu-rou', '小炒黄牛肉', 4800, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dish-gan-guo-hua-cai', '干锅花菜', 3200, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dish-ma-po-dou-fu', '麻婆豆腐', 2800, 4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dish-mi-fan', '米饭', 200, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
