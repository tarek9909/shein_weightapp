CREATE TABLE IF NOT EXISTS `cargo_package_sort_status` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `month_id` INT(11) NOT NULL,
  `user_id` INT(11) NOT NULL,
  `group_key` VARCHAR(255) NOT NULL,
  `group_type` VARCHAR(16) NOT NULL DEFAULT 'single',
  `display_label` VARCHAR(255) DEFAULT NULL,
  `tracking_numbers_json` LONGTEXT DEFAULT NULL,
  `status` ENUM('sorted','not_sorted') NOT NULL,
  `confirmed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cargo_sort_user_month_group` (`user_id`, `month_id`, `group_key`),
  KEY `idx_cargo_sort_month` (`month_id`),
  KEY `idx_cargo_sort_user` (`user_id`),
  CONSTRAINT `fk_cargo_sort_month` FOREIGN KEY (`month_id`) REFERENCES `month` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cargo_sort_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cargo_payroll_confirmations` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `month_id` INT(11) NOT NULL,
  `user_id` INT(11) NOT NULL,
  `note` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cargo_payroll_month` (`month_id`),
  KEY `idx_cargo_payroll_user` (`user_id`),
  CONSTRAINT `fk_cargo_payroll_month` FOREIGN KEY (`month_id`) REFERENCES `month` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cargo_payroll_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
