ALTER TABLE order_carts
  ADD COLUMN is_joint_shipment TINYINT(1) NOT NULL DEFAULT 0 AFTER shein_delivered,
  ADD COLUMN joint_shipment_count INT(11) NOT NULL DEFAULT 0 AFTER is_joint_shipment;

ALTER TABLE order_carts
  ADD KEY idx_shein_tracking_user (user_id, shein_tracking_no);
