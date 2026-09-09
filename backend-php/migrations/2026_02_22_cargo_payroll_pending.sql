CREATE TABLE IF NOT EXISTS `cargo_payroll_pending` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `month_id` INT(11) NOT NULL,
  `user_id` INT(11) NOT NULL,
  `per_unit_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `sorted_count` INT(11) NOT NULL DEFAULT 0,
  `total_payroll` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('pending','accepted') NOT NULL DEFAULT 'pending',
  `customs_id` INT(11) DEFAULT NULL,
  `note` VARCHAR(255) DEFAULT NULL,
  `summary_json` LONGTEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `accepted_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cpp_month` (`month_id`),
  KEY `idx_cpp_user` (`user_id`),
  KEY `idx_cpp_status` (`status`),
  CONSTRAINT `fk_cpp_month` FOREIGN KEY (`month_id`) REFERENCES `month` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cpp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cargo_payroll_pending_packages` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `pending_id` INT(11) NOT NULL,
  `group_key` VARCHAR(255) NOT NULL,
  `display_label` VARCHAR(255) DEFAULT NULL,
  `group_type` VARCHAR(16) DEFAULT NULL,
  `tracking_numbers_json` LONGTEXT DEFAULT NULL,
  `weight_kg` DECIMAL(10,3) NOT NULL DEFAULT 0.000,
  `amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `order_refs_json` LONGTEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cppp_pending_group` (`pending_id`, `group_key`),
  KEY `idx_cppp_pending` (`pending_id`),
  CONSTRAINT `fk_cppp_pending` FOREIGN KEY (`pending_id`) REFERENCES `cargo_payroll_pending` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
