ALTER TABLE order_carts
  ADD COLUMN joint_combined_weight_kg DECIMAL(10,3) NULL AFTER joint_shipment_count,
  ADD COLUMN joint_combined_weight_plus_2kg DECIMAL(10,3) NULL AFTER joint_combined_weight_kg;
