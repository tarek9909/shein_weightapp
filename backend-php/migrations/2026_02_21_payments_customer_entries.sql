ALTER TABLE payments
  ADD COLUMN payment_type VARCHAR(20) NOT NULL DEFAULT 'manual' AFTER month_id,
  ADD COLUMN original_amount DECIMAL(10,2) NULL AFTER payment_amount,
  ADD COLUMN delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER original_amount,
  ADD COLUMN customer_count INT NOT NULL DEFAULT 0 AFTER delivery_charge,
  ADD COLUMN customer_ids_json LONGTEXT NULL AFTER customer_count,
  ADD COLUMN note VARCHAR(255) NULL AFTER customer_ids_json;

CREATE TABLE IF NOT EXISTS payment_customer_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  customer_id INT NULL,
  customer_name_snapshot VARCHAR(255) NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pci_payment_id (payment_id),
  INDEX idx_pci_customer_id (customer_id),
  INDEX idx_pci_user_id (user_id),
  CONSTRAINT fk_pci_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);
