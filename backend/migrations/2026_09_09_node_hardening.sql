-- Node backend runtime hardening. The Node startup preflight applies the
-- column changes idempotently because the supported local MySQL version does
-- not implement ALTER TABLE ... ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS security_audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  actor_user_id INT NULL,
  target_user_id INT NULL,
  event_type VARCHAR(64) NOT NULL,
  ip_address VARCHAR(64) NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_security_audit_actor (actor_user_id, created_at),
  KEY idx_security_audit_target (target_user_id, created_at),
  KEY idx_security_audit_event (event_type, created_at)
) ENGINE=InnoDB;

-- Existing plaintext secrets must be encrypted by the Node preflight with
-- CREDENTIAL_ENCRYPTION_KEY before the legacy columns are removed.
-- After verifying the migration, remove shein_password, gmail_app_password,
-- and cookies_json in a separate controlled deployment.
