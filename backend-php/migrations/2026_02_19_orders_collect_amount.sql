ALTER TABLE orders
  ADD COLUMN amount_to_collect DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER order_details;
