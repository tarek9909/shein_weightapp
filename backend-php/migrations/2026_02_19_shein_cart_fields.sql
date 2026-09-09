ALTER TABLE order_carts
  ADD COLUMN shein_email VARCHAR(255) NULL,
  ADD COLUMN shein_order_no VARCHAR(64) NULL,
  ADD COLUMN shein_carrier VARCHAR(64) NULL,
  ADD COLUMN shein_tracking_no VARCHAR(64) NULL,
  ADD COLUMN shein_status_text VARCHAR(255) NULL,
  ADD COLUMN shein_last_details TEXT NULL,
  ADD COLUMN shein_last_timestamp VARCHAR(64) NULL,
  ADD COLUMN shein_track_url TEXT NULL,
  ADD COLUMN shein_delivered TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN shein_total_weight_g INT NULL,
  ADD COLUMN shein_total_weight_kg DECIMAL(10,3) NULL,
  ADD COLUMN shein_total_weight_plus_2kg DECIMAL(10,3) NULL;
