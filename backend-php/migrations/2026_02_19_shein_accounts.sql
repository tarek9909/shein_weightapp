CREATE TABLE IF NOT EXISTS shein_accounts (
  id INT(11) NOT NULL AUTO_INCREMENT,
  user_id INT(11) NOT NULL,
  api_email VARCHAR(255) NOT NULL,
  shein_email VARCHAR(255) NOT NULL,
  shein_password VARCHAR(255) NOT NULL,
  gmail_email VARCHAR(255) NOT NULL,
  gmail_app_password VARCHAR(255) NOT NULL,
  cookies_json LONGTEXT NULL,
  profile_key VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shein_accounts_user_email (user_id, api_email),
  KEY ix_shein_accounts_user_id (user_id),
  CONSTRAINT fk_shein_accounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
