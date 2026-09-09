-- Application user roles and account ownership.
-- Existing users are preserved as administrators; newly created users are
-- owned by the administrator who created them and start with an empty data
-- workspace because every operational table is already keyed by user_id.

SET @user_role_column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'role'
);
SET @add_user_role_sql = IF(
  @user_role_column_exists = 0,
  'ALTER TABLE users ADD COLUMN role ENUM(''admin'', ''dashboard'', ''operations'') NOT NULL DEFAULT ''admin'' AFTER password_hash',
  'SELECT 1'
);
PREPARE add_user_role_statement FROM @add_user_role_sql;
EXECUTE add_user_role_statement;
DEALLOCATE PREPARE add_user_role_statement;

UPDATE users
SET role = 'admin'
WHERE role IS NULL OR role NOT IN ('admin', 'dashboard', 'operations');

-- Demo credentials for local/testing environments:
-- dashboard_demo_1 / DashboardDemo1!
-- dashboard_demo_2 / DashboardDemo2!
-- operations_demo_1 / OperationsDemo1!
-- operations_demo_2 / OperationsDemo2!
-- INSERT IGNORE makes this migration safe to re-run without resetting a
-- password that an administrator may already have changed.
INSERT IGNORE INTO users (username, password_hash, role, owner_user_id)
SELECT 'dashboard_demo_1', '$2a$10$CTirYvWumwd9zJT3BVTxuuKllgl.v.bwzlHgs6Z1342hB7iHic8oe', 'dashboard', id
FROM users
WHERE username = 'admin'
LIMIT 1;

INSERT IGNORE INTO users (username, password_hash, role, owner_user_id)
SELECT 'dashboard_demo_2', '$2a$10$dZy6ntjV8f/KhmDvvHA9iul4RsOCNBjz/hZ0comNQ5Ym5lEJ3hqIy', 'dashboard', id
FROM users
WHERE username = 'admin'
LIMIT 1;

INSERT IGNORE INTO users (username, password_hash, role, owner_user_id)
SELECT 'operations_demo_1', '$2a$10$HSWQhjPtUdzkZGtGrNm8Z.WfmlaUwBYXPcp3WVINYQxw04VORHnJK', 'operations', id
FROM users
WHERE username = 'admin'
LIMIT 1;

INSERT IGNORE INTO users (username, password_hash, role, owner_user_id)
SELECT 'operations_demo_2', '$2a$10$3pCG7t5nX/S3.f8JzooRMOQYnQOj.Zc5lb3o4anOMblGgrNrQDmhG', 'operations', id
FROM users
WHERE username = 'admin'
LIMIT 1;
