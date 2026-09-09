ALTER TABLE payment_customer_items
  ADD COLUMN delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER amount;

