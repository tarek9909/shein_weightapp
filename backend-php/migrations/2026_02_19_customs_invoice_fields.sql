ALTER TABLE customs
  ADD COLUMN tracking_no VARCHAR(64) DEFAULT NULL AFTER customs_fee,
  ADD COLUMN invoice_no VARCHAR(64) DEFAULT NULL AFTER tracking_no,
  ADD COLUMN weight_kg DECIMAL(10,3) DEFAULT NULL AFTER invoice_no,
  ADD COLUMN unit_price DECIMAL(10,2) DEFAULT NULL AFTER weight_kg,
  ADD COLUMN delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER unit_price,
  ADD COLUMN order_id INT(11) DEFAULT NULL AFTER delivery_fee,
  ADD COLUMN cart_id INT(11) DEFAULT NULL AFTER order_id,
  ADD COLUMN order_ref VARCHAR(255) DEFAULT NULL AFTER cart_id,
  ADD COLUMN cart_ref VARCHAR(100) DEFAULT NULL AFTER order_ref,
  ADD COLUMN note TEXT DEFAULT NULL AFTER cart_ref,
  ADD COLUMN source_message MEDIUMTEXT DEFAULT NULL AFTER note;

ALTER TABLE customs
  ADD KEY idx_customs_tracking_no (tracking_no),
  ADD KEY idx_customs_order_id (order_id),
  ADD KEY idx_customs_cart_id (cart_id);
