-- Delivery/Cargo redesign: additive rollout.
-- Legacy status, delivery charge, payment, and cargo tables remain intact.

DELIMITER $$
DROP PROCEDURE IF EXISTS add_redesign_column_if_missing$$
CREATE PROCEDURE add_redesign_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table AND COLUMN_NAME=p_column
  ) THEN
    SET @redesign_sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE redesign_stmt FROM @redesign_sql;
    EXECUTE redesign_stmt;
    DEALLOCATE PREPARE redesign_stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS add_redesign_index_if_missing$$
CREATE PROCEDURE add_redesign_index_if_missing(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table AND INDEX_NAME=p_index
  ) THEN
    SET @redesign_sql = CONCAT('ALTER TABLE `', p_table, '` ADD ', p_definition);
    PREPARE redesign_stmt FROM @redesign_sql;
    EXECUTE redesign_stmt;
    DEALLOCATE PREPARE redesign_stmt;
  END IF;
END$$
DELIMITER ;

CALL add_redesign_column_if_missing('cart_customers', 'received_at', 'DATETIME NULL AFTER `delivery_status`');
CALL add_redesign_column_if_missing('cart_customers', 'delivery_method', "ENUM('courier','self') NULL AFTER `received_at`");
CALL add_redesign_column_if_missing('cart_customers', 'delivery_assignment_status', "ENUM('unassigned','assigned','collected') NOT NULL DEFAULT 'unassigned' AFTER `delivery_method`");
CALL add_redesign_column_if_missing('cart_customers', 'collection_status', "ENUM('pending','collected') NOT NULL DEFAULT 'pending' AFTER `delivery_assignment_status`");
CALL add_redesign_column_if_missing('cart_customers', 'payment_status', "ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid' AFTER `collection_status`");
CALL add_redesign_column_if_missing('cart_customers', 'base_amount_to_collect', 'DECIMAL(10,2) NULL AFTER `payment_status`');
CALL add_redesign_column_if_missing('cart_customers', 'delivery_adjustment', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `base_amount_to_collect`');
CALL add_redesign_column_if_missing('cart_customers', 'final_amount_to_collect', 'DECIMAL(10,2) NULL AFTER `delivery_adjustment`');
CALL add_redesign_column_if_missing('cart_customers', 'delivery_preset_id', 'INT NULL AFTER `final_amount_to_collect`');
CALL add_redesign_column_if_missing('cart_customers', 'collection_payment_id', 'INT NULL AFTER `delivery_preset_id`');
CALL add_redesign_column_if_missing('cart_customers', 'collected_at', 'DATETIME NULL AFTER `collection_payment_id`');
CALL add_redesign_column_if_missing('cart_customers', 'delivery_assigned_at', 'DATETIME NULL AFTER `collected_at`');
CALL add_redesign_column_if_missing('cart_customers', 'delivery_month_id', 'INT NULL AFTER `delivery_assigned_at`');

UPDATE cart_customers
SET base_amount_to_collect = COALESCE(base_amount_to_collect, usd_to_collect),
    final_amount_to_collect = COALESCE(final_amount_to_collect, usd_to_collect),
    collection_status = CASE
      WHEN LOWER(COALESCE(status, '')) IN ('collected', 'paid')
        OR LOWER(COALESCE(delivery_status, '')) = 'paid'
      THEN 'collected' ELSE collection_status END,
    payment_status = CASE
      WHEN LOWER(COALESCE(status, '')) IN ('collected', 'paid')
        OR LOWER(COALESCE(delivery_status, '')) = 'paid'
      THEN 'paid' ELSE payment_status END,
    delivery_assignment_status = CASE
      WHEN LOWER(COALESCE(status, '')) IN ('collected', 'paid')
        OR LOWER(COALESCE(delivery_status, '')) = 'paid'
      THEN 'collected'
      WHEN delivery_number IS NOT NULL
        OR LOWER(COALESCE(status, '')) IN ('withdelivery', 'confirmed')
        OR LOWER(COALESCE(delivery_status, '')) = 'added'
      THEN 'assigned'
      ELSE delivery_assignment_status END;

CREATE TABLE IF NOT EXISTS shipment_receipts (
  id INT(11) NOT NULL AUTO_INCREMENT,
  user_id INT(11) NOT NULL,
  month_id INT(11) NOT NULL,
  order_id INT(11) NOT NULL,
  cart_id INT(11) NOT NULL,
  shipment_group_key VARCHAR(512) NOT NULL,
  tracking_no VARCHAR(128) NOT NULL,
  receipt_status ENUM('received') NOT NULL DEFAULT 'received',
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_by INT(11) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shipment_receipts_user_tracking (user_id, tracking_no),
  KEY idx_shipment_receipts_order (user_id, order_id),
  KEY idx_shipment_receipts_cart (user_id, cart_id),
  KEY idx_shipment_receipts_group (user_id, shipment_group_key),
  CONSTRAINT fk_shipment_receipts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_shipment_receipts_month FOREIGN KEY (month_id) REFERENCES month(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS delivery_charge_presets (
  id INT(11) NOT NULL AUTO_INCREMENT,
  user_id INT(11) NOT NULL,
  label VARCHAR(32) NOT NULL,
  adjustment_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT(11) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_delivery_presets_user_label (user_id, label),
  KEY idx_delivery_presets_user_active (user_id, active, sort_order),
  CONSTRAINT fk_delivery_presets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO delivery_charge_presets (user_id, label, adjustment_amount, active, sort_order)
SELECT u.id, presets.label, presets.adjustment_amount, 1, presets.sort_order
FROM users u
JOIN (
  SELECT '0' AS label, 0.00 AS adjustment_amount, 10 AS sort_order
  UNION ALL SELECT '+5', 5.00, 20
  UNION ALL SELECT '-5', -5.00, 30
  UNION ALL SELECT '+10', 10.00, 40
) presets;

CALL add_redesign_column_if_missing('payment_customer_items', 'order_id', 'INT NULL AFTER `customer_name_snapshot`');
CALL add_redesign_column_if_missing('payment_customer_items', 'order_name_snapshot', 'VARCHAR(255) NULL AFTER `order_id`');
CALL add_redesign_column_if_missing('payment_customer_items', 'cart_id', 'INT NULL AFTER `order_name_snapshot`');
CALL add_redesign_column_if_missing('payment_customer_items', 'cart_order_number_snapshot', 'VARCHAR(100) NULL AFTER `cart_id`');
CALL add_redesign_column_if_missing('payment_customer_items', 'delivery_method', "ENUM('courier','self') NULL AFTER `cart_order_number_snapshot`");
CALL add_redesign_column_if_missing('payment_customer_items', 'delivery_number', 'VARCHAR(100) NULL AFTER `delivery_method`');
CALL add_redesign_column_if_missing('payment_customer_items', 'base_amount', 'DECIMAL(10,2) NULL AFTER `delivery_number`');
CALL add_redesign_column_if_missing('payment_customer_items', 'delivery_adjustment', 'DECIMAL(10,2) NULL AFTER `base_amount`');
CALL add_redesign_column_if_missing('payment_customer_items', 'final_amount', 'DECIMAL(10,2) NULL AFTER `delivery_adjustment`');
CALL add_redesign_column_if_missing('payment_customer_items', 'collected_at', 'DATETIME NULL AFTER `final_amount`');
CALL add_redesign_column_if_missing('payment_customer_items', 'collection_key', 'VARCHAR(128) NULL AFTER `collected_at`');

CALL add_redesign_index_if_missing('cart_customers', 'idx_cart_customers_receipt_delivery', 'KEY `idx_cart_customers_receipt_delivery` (`user_id`, `received_at`, `delivery_assignment_status`)');
CALL add_redesign_index_if_missing('cart_customers', 'idx_cart_customers_collection_payment', 'KEY `idx_cart_customers_collection_payment` (`user_id`, `collection_payment_id`)');
CALL add_redesign_index_if_missing('cart_customers', 'uq_cart_customers_delivery_number_month', 'UNIQUE KEY `uq_cart_customers_delivery_number_month` (`user_id`, `delivery_month_id`, `delivery_number`)');
CALL add_redesign_index_if_missing('payment_customer_items', 'uq_payment_items_collection_key', 'UNIQUE KEY `uq_payment_items_collection_key` (`user_id`, `collection_key`)');
CALL add_redesign_column_if_missing('delivery_losses', 'reversed_at', 'DATETIME NULL AFTER `confirmed_at`');
CALL add_redesign_column_if_missing('delivery_losses', 'reversal_reason', 'VARCHAR(255) NULL AFTER `reversed_at`');
CALL add_redesign_column_if_missing('delivery_losses', 'reversed_by', 'INT NULL AFTER `reversal_reason`');
CALL add_redesign_index_if_missing('delivery_losses', 'idx_delivery_losses_active', 'KEY `idx_delivery_losses_active` (`user_id`, `month_id`, `reversed_at`)');

CREATE TABLE IF NOT EXISTS activity_log (
  id BIGINT(20) NOT NULL AUTO_INCREMENT,
  user_id INT(11) NOT NULL,
  month_id INT(11) NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id INT(11) NULL,
  action VARCHAR(64) NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  metadata_json JSON NULL,
  created_by INT(11) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_log_user_month_time (user_id, month_id, created_at),
  KEY idx_activity_log_entity (user_id, entity_type, entity_id),
  KEY idx_activity_log_action (user_id, action),
  CONSTRAINT fk_activity_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP PROCEDURE IF EXISTS add_redesign_column_if_missing;
DROP PROCEDURE IF EXISTS add_redesign_index_if_missing;
