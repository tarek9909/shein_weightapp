ALTER TABLE order_carts
  ADD COLUMN shein_is_split_shipment TINYINT(1) NOT NULL DEFAULT 0 AFTER joint_shipment_count,
  ADD COLUMN shein_split_count INT(11) NOT NULL DEFAULT 0 AFTER shein_is_split_shipment,
  ADD COLUMN shein_split_tracking_numbers_json LONGTEXT DEFAULT NULL AFTER shein_split_count,
  ADD COLUMN shein_split_package_refs_json LONGTEXT DEFAULT NULL AFTER shein_split_tracking_numbers_json;

