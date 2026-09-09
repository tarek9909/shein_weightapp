CREATE TABLE `customer_debts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `month_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `customer_name_snapshot` varchar(255) DEFAULT NULL,
  `order_id` int(11) DEFAULT NULL,
  `order_name_snapshot` varchar(255) DEFAULT NULL,
  `cart_id` int(11) DEFAULT NULL,
  `cart_order_number_snapshot` varchar(100) DEFAULT NULL,
  `original_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `outstanding_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` enum('open','partial','closed') NOT NULL DEFAULT 'open',
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `closed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_customer_debts_user_month_status` (`user_id`,`month_id`,`status`),
  KEY `idx_customer_debts_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `customer_debt_payments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `debt_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `payment_id` int(11) NOT NULL,
  `paid_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_customer_debt_payments_debt` (`debt_id`),
  KEY `idx_customer_debt_payments_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
