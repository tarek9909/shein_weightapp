# Node.js Backend Gaps and Remediation Plan

This document records the Node.js backend issues found during the project audit and describes how to address them. It focuses on the active Node service in `backend/`, its MySQL database contract, its scraper integration, and the frontend wiring that calls the Node API. The evidence sections preserve the original audit findings; the implementation status below reflects the current code after remediation.

PHP-only findings are intentionally excluded. The Python scraper is included only where its contract or exposure affects the Node backend.

## Current baseline

The active service is started with:

```text
node backend/server.js       # Node API, normally port 8081
uvicorn app:app              # scraper API, normally port 8000
npm start                    # React frontend, normally port 3000
```

The current account implementation is present:

- `users.role` supports `admin`, `dashboard`, and `operations`.
- Managed accounts are assigned an `owner_user_id`.
- Operational tables use `user_id` and are currently scoped correctly in the live data.
- Four demo accounts log in successfully and currently have empty workspaces.

The live database integrity checks found no current cross-user parent/child mismatches. That is good, but several protections depend on application code rather than database constraints and automated tests.

## Implementation status

The remediation goal is implemented in the current workspace:

- Authentication now requires a strong configured JWT secret, reloads role/status/version from MySQL, rejects disabled or stale sessions, rate-limits login attempts, and records security audit events.
- `admin` manages isolated `dashboard` and `operations` accounts; managed accounts can be role-updated, disabled/enabled, reset, or soft-deleted. Four local demo accounts are seeded only outside production.
- All operational mutations require `admin` or `operations`; dashboard accounts are read-only. Tenant-owned reads, writes, delivery-number checks, and customs references are scoped by authenticated user and validated parent month/order/cart relationships.
- Third-party credentials are encrypted with AES-256-GCM at rest, migrated before listening, redacted from API responses and distributable SQL dumps, and decrypted only for an authenticated local scraper call.
- The scraper bridge requires `X-Internal-Token`, uses loopback-only startup, has bounded ping/scrape timeouts, and never logs scraper payloads.
- Startup runs the Node migration ledger and schema preflight, checks tenant integrity, verifies database readiness, and starts only services that pass readiness checks. The frontend uses one direct API-origin strategy with CORS allowlisting.
- Automated verification is available through `backend` `check`, unit tests, and `npm run smoke`; the smoke suite exercises role denial, two-user isolation, numeric validation, credential redaction, forged-token rejection, managed-account lifecycle, Python bridge protection, and readiness. The managed-account UI also wires soft-delete/disable, re-enable, role change, and password reset actions.
- The production dependency audit is clean with `npm audit --omit=dev`; the full frontend audit currently reports 31 findings (9 low, 8 moderate, 14 high), concentrated in the legacy Create React App development toolchain. No forced audit upgrade was applied because it can break the build; the toolchain migration remains a separate maintenance task.

Local seeded accounts:

| Role | Username | Password |
| --- | --- | --- | --- |
| Dashboard | `dashboard_demo_1` | `DashboardDemo1!` |
| Dashboard | `dashboard_demo_2` | `DashboardDemo2!` |
| Operations | `operations_demo_1` | `OperationsDemo1!` |
| Operations | `operations_demo_2` | `OperationsDemo2!` |

Production follow-up: any real SHEIN/Gmail credentials that appeared in historical files or backups must still be rotated with their providers. Code changes cannot revoke an external credential or rewrite prior Git history.

## Priority summary

| Priority | Area | Original problem | Current status |
| --- | --- | --- | --- |
| P0 | Authentication | The live Node service accepts tokens signed with the default `CHANGE_THIS_SECRET_123` secret. | Fixed; strong secret and version checks are required. |
| P0 | Authorization | Most Node routes authenticate users but do not enforce their role. | Fixed; route middleware and smoke coverage are in place. |
| P0 | Credential security | SHEIN and Gmail credentials are stored and returned in plaintext by the active Node path. | Fixed in current runtime and dumps; external credentials still require rotation. |
| P0 | Scraper bridge | The Node-to-scraper contract has no internal authentication, while the scraper listens on all interfaces. | Fixed; token-authenticated, loopback-only, bounded bridge. |
| P1 | Runtime wiring | The launched Python API points to a database/schema that does not match its models and returns HTTP 500 for its DB routes. | Fixed; root environment, model FK, and internal-token checks align. |
| P1 | Tenant correctness | Delivery-number checks are global in two legacy Node endpoints instead of scoped to the current user/month. | Fixed; user/month joins and concurrency-safe transaction paths are used. |
| P1 | Data validation | Several mutating endpoints silently convert invalid numbers to zero. | Fixed across active Node mutation and import paths. |
| P1 | Account lifecycle | Admins can create/list managed accounts but cannot disable, delete, edit, or reset them. | Fixed; role, status, reset, and soft-delete flows are available. |
| P1 | Deployment | The account migration is not automatically applied and `/health` does not verify database readiness. | Fixed; migration ledger, schema preflight, readiness, and launcher checks are active. |
| P2 | Client behavior | The frontend treats `403 Forbidden` as session expiration and logs users out. | Fixed; only `401` expires the session and dashboard is visibly read-only. |
| P2 | Testing | The backend has syntax checks but no route, authorization, tenant-isolation, or transaction tests. | Addressed with unit tests and a live two-user/lifecycle smoke suite. |
| P2 | Maintainability | The active Node stack is surrounded by stale duplicate APIs, proxy settings, and dead frontend modules. | Active frontend wiring is consolidated to direct API origin; stale proxy setup removed and compatibility exports retained where mounted code needs them. |

## Historical findings and remediation detail

The following sections preserve the original evidence, proposed fix, and validation criteria so the audit remains traceable. “Evidence” describes the pre-remediation state; the implementation status above is authoritative for the current workspace.

## P0 — fix before exposing the service

### 1. Remove the forgeable JWT fallback

Evidence:

- [`backend/middleware/auth.js:4`](backend/middleware/auth.js#L4) falls back to `CHANGE_THIS_SECRET_123`.
- [`backend/.env:7`](backend/.env#L7) currently uses that value.
- [`backend/.env.example:7`](backend/.env.example#L7) documents the same unsafe value.

During the audit, a token signed with this default secret and an admin user ID was accepted by the live Node API.

Fix:

1. Remove all hardcoded JWT fallback values.
2. Require `JWT_SECRET` at startup.
3. Require a minimum length and reject known placeholder values.
4. Generate a new random production secret and rotate the current one.
5. Restart all Node processes after rotation; all existing tokens should become invalid.

Example startup guard:

```js
const jwtSecret = String(process.env.JWT_SECRET || "").trim();

if (jwtSecret.length < 32 || /CHANGE_THIS|default|secret/i.test(jwtSecret)) {
  throw new Error("JWT_SECRET must be a strong, non-default secret");
}
```

Do not commit real secrets. Keep only a placeholder such as `<set-in-environment>` in example files.

Validation:

- Starting without `JWT_SECRET` fails immediately.
- Starting with the old default fails immediately.
- A token signed with the old default receives `401`.
- A token signed with the new secret works.

### 2. Enforce roles in the Node backend, not only in React

Evidence:

- Most route modules only call `router.use(requireAuth)`, for example [`backend/routes/orders.js:7`](backend/routes/orders.js#L7) and [`backend/routes/delivery.js:7`](backend/routes/delivery.js#L7).
- `requireRole()` is defined in [`backend/middleware/auth.js:49`](backend/middleware/auth.js#L49), but it is mainly used by the account-management routes.
- React hides routes in [`shein-frontend/src/App.js:60`](shein-frontend/src/App.js#L60) and [`shein-frontend/src/components/HamburgerMenu.js:101`](shein-frontend/src/components/HamburgerMenu.js#L101), but this is not a security boundary.
- A dashboard-role token successfully reached operational endpoints during the audit.

Fix:

Define the permission contract first. A safe initial policy is:

```text
admin      dashboard + operations + user account management
operations dashboard + orders + SHEIN accounts + delivery + cargo + losses + history
dashboard  dashboard read-only
```

Then apply middleware at the route boundary:

```js
router.use(requireAuth);
router.use(requireRole("admin", "operations"));
```

For routes that are allowed to dashboard users, use a narrower rule:

```js
router.get(paths("getSummary", true), requireRole("admin", "dashboard", "operations"), handler);
```

Do not rely on a role sent by the browser. `requireAuth` should continue reloading the role from MySQL, as it currently does.

Validation:

- Every route has an explicit permission test.
- A dashboard token receives `403` from operations routes.
- An operations token cannot access `/auth/users.php`.
- An admin token can access both operational and managed-account routes.
- Direct POST requests are tested, not only browser navigation.

### 3. Protect and encrypt third-party credentials

Evidence:

- [`backend/routes/sheinAccounts.js:3`](backend/routes/sheinAccounts.js#L3) returns `shein_password` and `gmail_app_password` from the database.
- [`backend/routes/sheinAccounts.js:4`](backend/routes/sheinAccounts.js#L4) stores them in plaintext columns.
- [`backend/routes/ordersDetails.js:213`](backend/routes/ordersDetails.js#L213) reads plaintext credentials to build scraper payloads.
- The frontend loads credentials into edit state in [`SheinAccountsPage.jsx:88`](shein-frontend/src/pages/SheinAccountsPage.jsx#L88).
- Tracked SQL dumps contain real-looking plaintext third-party credentials.

Fix:

1. Add a key-managed encryption key, separate from `JWT_SECRET`.
2. Encrypt SHEIN passwords, Gmail app passwords, cookies, and storage state at rest.
3. Add encrypted columns, migrate existing rows, then remove or null the plaintext columns.
4. Change account detail responses to return metadata only:

```json
{
  "id": 12,
  "email": "account@example.com",
  "has_shein_password": true,
  "has_gmail_app_password": true,
  "profile_key": "Default"
}
```

5. On edit, accept a new password only when the user explicitly replaces it.
6. Decrypt only inside the Node-to-scraper call and never log the payload.
7. Remove secrets from SQL dumps, debug HTML, logs, Git history where possible, and backups; rotate every exposed credential.

Validation:

- API responses never contain password or app-password fields.
- Database inspection shows only ciphertext.
- Scraper refresh still works for an account with encrypted credentials.
- Error logs and request logs contain no credentials.

### 4. Authenticate the Node-to-scraper bridge

Evidence:

- [`backend/lib/shein.js:16`](backend/lib/shein.js#L16) calls `/api/direct/*` without an internal authorization header.
- [`start_services.py:31`](start_services.py#L31) starts the scraper on `0.0.0.0:8000`.
- The direct scraper endpoints accept credentials without application authentication in `api/app.py`.

Fix:

1. Bind the scraper to `127.0.0.1` unless remote access is explicitly required.
2. Add a separate internal bridge secret, for example `SCRAPER_BRIDGE_SECRET`.
3. Send it from Node:

```js
headers: {
  "Content-Type": "application/json",
  Accept: "application/json",
  "X-Scraper-Bridge-Secret": process.env.SCRAPER_BRIDGE_SECRET,
}
```

4. Reject all scraper requests without the internal secret.
5. Add a request timeout to the health/ping call as well as the scrape call.
6. Keep credentials out of URLs, logs, exception messages, and error responses.

Validation:

- A direct request to port 8000 without the bridge secret receives `401`.
- A Node refresh succeeds with the secret.
- Requests from another machine cannot reach the scraper when it is local-only.
- A hung scraper returns a bounded Node error instead of hanging indefinitely.

## P1 — fix before production use

### 5. Resolve the launched scraper/database mismatch

Evidence:

- Root [`.env:1`](.env#L1) points the Python service to `shein_tracker`.
- [`api/models.py:5`](api/models.py#L5) expects `shein_api_users`.
- [`api/models.py:25`](api/models.py#L25) expects `shein_api_orders`.
- The live `shein_tracker` database does not contain those tables.
- `GET /api/users` currently returns HTTP 500.

Fix options:

Choose one architecture and remove the others from the startup path:

1. Make the Node backend the only application data API and keep the Python service stateless for scraping only. This is the preferred option.
2. If Python persistence is still required, give it a dedicated database and migration set, correct the model foreign key, and add startup schema checks.

Do not silently launch a service whose database routes are broken.

Validation:

- `start_services.py` starts only required services.
- Every launched service has a smoke check.
- The scraper ping and all intentionally supported scraper actions return expected status codes.
- Unsupported legacy Python persistence endpoints are removed or explicitly disabled.

### 6. Fix tenant-scoped delivery-number checks

Evidence:

- [`backend/routes/ordersDetails.js:116`](backend/routes/ordersDetails.js#L116) checks every customer globally:

```sql
SELECT id
FROM cart_customers
WHERE delivery_number=? AND id<>?
```

- The same problem exists in the Excel-import path at line 209.
- The database uniqueness key is scoped by user/month, so the API and schema disagree.

Fix:

Use the current user and the selected month, and exclude the current customer:

```sql
SELECT cc.id
FROM cart_customers cc
JOIN order_carts oc
  ON oc.id = cc.cart_id
 AND oc.user_id = cc.user_id
JOIN orders o
  ON o.id = oc.order_id
 AND o.user_id = oc.user_id
WHERE cc.user_id = ?
  AND o.month_id = ?
  AND cc.delivery_number = ?
  AND cc.id <> ?
LIMIT 1
```

Prefer relying on the database unique key as the final protection and translate duplicate-key errors into a clear `409` response.

Validation:

- Same delivery number in different users is allowed.
- Same delivery number in different months is allowed if that is the product rule.
- Same delivery number in the same user/month receives `409`.
- Concurrent requests cannot create duplicates.

### 7. Stop silently converting invalid numbers to zero

Evidence:

- [`backend/lib/helpers.js:14`](backend/lib/helpers.js#L14) converts invalid input to a fallback value.
- [`backend/routes/budget.js:21`](backend/routes/budget.js#L21) and line 26 use that fallback without validating input.
- [`backend/routes/payments.js:32`](backend/routes/payments.js#L32) can update an invalid payment amount to zero.
- [`backend/routes/orders.js:25`](backend/routes/orders.js#L25) can accept a non-numeric order amount as zero.

Fix:

Separate parsing from validation. Keep a helper that returns `null` for invalid input:

```js
const decimalInput = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
```

Every mutating route should then validate the domain rule explicitly:

```js
const amount = decimalInput(req.body?.payment_amount);
if (amount === null || amount < 0) {
  return res.status(400).json({ ok: false, error: "payment_amount must be a valid non-negative number" });
}
```

Apply this to orders, customers, budgets, payments, customs, delivery presets, and Excel imports. Also validate maximum lengths and decimal precision before writing.

Validation:

- `NaN`, `Infinity`, empty strings, and non-numeric text receive `400`.
- Negative values are rejected where the business rule requires non-negative values.
- Valid zero remains accepted where zero is meaningful.
- The database contains no newly created invalid numeric rows.

### 8. Complete managed-account lifecycle

Evidence:

- [`backend/routes/auth.js:49`](backend/routes/auth.js#L49) lists managed accounts.
- [`backend/routes/auth.js:57`](backend/routes/auth.js#L57) creates managed accounts.
- There are no admin endpoints for status, deletion, role change, or resetting a managed user’s password.
- The UI only creates and lists accounts in [`UserAccountsPage.jsx:30`](shein-frontend/src/pages/UserAccountsPage.jsx#L30).

Fix:

Add admin-only endpoints with strict ownership checks:

```text
GET    /auth/users
POST   /auth/users
PATCH  /auth/users/:id           # role, display metadata, status
POST   /auth/users/:id/reset
DELETE /auth/users/:id           # soft-delete or disable first
```

Recommended schema additions:

```sql
ALTER TABLE users
  ADD COLUMN status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  ADD COLUMN password_changed_at DATETIME NULL,
  ADD COLUMN token_version INT NOT NULL DEFAULT 0;
```

Use soft-disable by default. Do not delete a user until the cascade behavior for every dependent table is explicitly defined.

Validation:

- An admin can manage only accounts where `owner_user_id` is the admin’s ID.
- A managed user cannot manage accounts or elevate its own role.
- Disabled users cannot log in and existing tokens are rejected.
- Resetting a managed password invalidates existing tokens.

### 9. Add token revocation and password-change invalidation

Evidence:

- Tokens are stateless and valid for seven days in [`backend/middleware/auth.js:40`](backend/middleware/auth.js#L40).
- Password reset updates only `password_hash` in [`backend/routes/auth.js:100`](backend/routes/auth.js#L100).
- There is no session store, token version, or revocation check.

Fix:

Use a `token_version` on each user. Include it in the JWT and compare it during `requireAuth`:

```js
// token
{ user_id, role, token_version }

// auth query
SELECT id, username, role, owner_user_id, token_version, status
FROM users
WHERE id=?

// reject when token.token_version !== row.token_version
```

Increment the version after password changes, role changes, disable operations, and security resets.

### 10. Add explicit database constraints for tenant relationships

The live database has individual `user_id` foreign keys, but several parent/child relationships are not enforced as same-owner relationships. Examples include:

- `orders.month_id` versus `orders.user_id`.
- `order_carts.order_id` versus `order_carts.user_id`.
- `cart_customers.cart_id` versus `cart_customers.user_id`.
- `order_carts.shein_account_id` versus `order_carts.user_id`.
- `users.owner_user_id` has no self-referencing foreign key.

Application queries currently protect most of these relationships, but a future route or manual SQL operation can create invalid combinations.

Fix:

1. Keep the current application ownership checks.
2. Add a data-cleanup migration that verifies all parent/child owners match.
3. Add composite unique keys such as `(id, user_id)` to parent tables.
4. Add composite foreign keys where practical, for example `(month_id, user_id)` to `(month.id, month.user_id)`.
5. Add a self-referencing foreign key for `users.owner_user_id` with a deliberate delete rule.

If composite keys are too disruptive for the existing schema, enforce the invariant through transaction-scoped service functions and automated integrity checks.

### 11. Introduce a real migration runner

Evidence:

- The account migration is maintained at [`backend/migrations/2026_09_09_user_accounts.sql`](backend/migrations/2026_09_09_user_accounts.sql), and Node runs the migration set during startup.
- [`start_services.py:24`](start_services.py#L24) launches Node directly.
- A clean database can therefore start the Node process without the required `role` column.

Fix:

Use a migrations table and run migrations before the server accepts traffic:

```text
schema_migrations(version PRIMARY KEY, applied_at)
```

Recommended startup sequence:

```text
validate environment
connect to MySQL
run pending migrations in order
verify required tables/columns/indexes
start HTTP listener
```

Do not depend on SQL dump editing as the migration mechanism. Move the Node-owned migration into a Node-owned migrations directory and make deployment fail if it cannot apply cleanly.

### 12. Make health checks verify database readiness

Evidence:

- [`backend/server.js:41`](backend/server.js#L41) returns `{ ok: true }` without checking MySQL.

Fix:

Split liveness and readiness:

```js
app.get("/health/live", (_req, res) => {
  res.json({ ok: true });
});

app.get("/health/ready", asyncHandler(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true, service: "shein-backend-node" });
}));
```

Return `503` when MySQL is unavailable. Use readiness in `start_services.py` and deployment monitoring.

### 13. Tighten CORS and network exposure

Evidence:

- [`backend/server.js:23`](backend/server.js#L23) allows the request origin dynamically.
- The Node server listens on `0.0.0.0` at [`backend/server.js:74`](backend/server.js#L74).

Fix:

1. Configure an allowlist such as `FRONTEND_ORIGINS=http://127.0.0.1:3000,https://ops.example.com`.
2. Reject unknown origins.
3. Expose port 8081 only through the intended reverse proxy/firewall in production.
4. Use HTTPS in production.
5. Add security headers and request logging that excludes authorization and credential data.

### 14. Add login abuse protection

The login endpoint in [`backend/routes/auth.js:9`](backend/routes/auth.js#L9) has no rate limiting, lockout, audit event, or suspicious-attempt handling.

Fix:

- Rate-limit by IP and username.
- Use a short fixed response for invalid credentials.
- Record failed and successful login events without passwords.
- Add optional account lockout/temporary backoff.
- Keep password hashing cost configurable and benchmarked.

## P2 — fix after the security boundary is correct

### 15. Correct frontend handling of authorization failures

Evidence:

- [`shein-frontend/src/api/http.js:50`](shein-frontend/src/api/http.js#L50) calls `triggerSessionExpired()` for both `401` and `403`.

Fix:

- Treat only `401` as an expired/invalid session.
- Treat `403` as a permission error and keep the user logged in.
- Add a reusable forbidden state or redirect to an access-denied page.

This must be fixed together with backend role enforcement; otherwise valid dashboard users will be logged out when the backend correctly rejects an operations request.

### 16. Define the dashboard-role contract

The UI says dashboard users only see `/` in [`HamburgerMenu.js:101`](shein-frontend/src/components/HamburgerMenu.js#L101), but the dashboard page currently contains controls to add/edit months, orders, payments, customs, budgets, and settings.

Choose one explicit product rule:

1. Dashboard users are read-only: hide/disable all mutations and enforce read-only permissions in Node.
2. Dashboard users may manage their own dashboard data: document that behavior and allow the corresponding backend routes.

Do not leave the role name, menu, page controls, and backend policy contradictory.

### 17. Add backend route and transaction tests

The current Node check script only checks a few JavaScript files in [`backend/package.json:7`](backend/package.json#L7). It does not exercise SQL, authorization, ownership, or transactions.

Add tests for:

- login success/failure and expired tokens;
- default-secret rejection;
- role matrix for every route;
- cross-user read/update/delete attempts;
- managed-account ownership;
- disabled users and token-version invalidation;
- delivery-number uniqueness by user/month;
- invalid numeric input;
- duplicate collection/payment idempotency;
- transaction rollback when one item in a batch fails;
- encrypted credential storage and response redaction.

Use a disposable test database and seed only synthetic credentials.

### 18. Fix stale Node/frontend wiring

Evidence:

- The active frontend uses absolute `REACT_APP_BASE_URL` requests to port 8081.
- [`shein-frontend/package.json:5`](shein-frontend/package.json#L5) and [`shein-frontend/src/setupProxy.js:7`](shein-frontend/src/setupProxy.js#L7) still point the proxy to port 80.
- Live `/api/health` through port 3000 returns 404.
- Several unmounted legacy pages import API functions that no longer exist.

Fix:

Choose one frontend-to-Node strategy:

1. Use a reverse proxy and relative `/api` URLs everywhere; or
2. Use one configured absolute API origin everywhere and remove the unused proxy configuration.

Then either remove dead pages/API modules or restore their exports and add routes/tests. Do not keep two apparently active wiring strategies.

### 19. Improve service startup behavior

The launcher in [`start_services.py:114`](start_services.py#L114) starts processes but does not verify that Node, the scraper, and the frontend remain alive or that their ports are available. Re-running it can create port conflicts.

Fix:

- Check ports before starting.
- Run migrations before Node.
- Wait for `/health/ready` and scraper bridge readiness.
- Stop and report a child process that exits immediately.
- Store and validate process IDs.
- Make `--hidden` logs rotate and redact sensitive values.
- Avoid starting unnecessary services.

### 20. Normalize API error and response contracts

The Node service mixes `{ ok: false }`, `{ success: false }`, arrays, and different status/error shapes across legacy-compatible routes.

Fix:

Define a single contract:

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action"
  }
}
```

Keep legacy aliases only during a planned migration. Update `apiFetch` and all active frontend API modules to consume the same format.

### 21. Add operational observability

Add:

- request IDs;
- structured logs;
- route duration and error metrics;
- database pool saturation metrics;
- scraper duration/failure metrics;
- audit events for login, account changes, role changes, password changes, and sensitive-account access.

Never log JWTs, authorization headers, passwords, cookies, or scraper payloads.

## Recommended implementation order

### Phase 1 — security containment

1. Rotate and require a strong JWT secret.
2. Protect the scraper bridge and bind it locally.
3. Stop returning/storing plaintext third-party credentials and rotate exposed credentials.
4. Define and enforce the backend role matrix.
5. Restrict CORS and network exposure.

### Phase 2 — correctness and deployment safety

1. Fix delivery-number tenant scoping.
2. Replace silent numeric fallbacks with strict validation.
3. Add migrations and startup schema validation.
4. Fix or remove the broken Python persistence wiring.
5. Add database readiness checks.
6. Add managed-account disable/reset/delete flows.

### Phase 3 — tests and maintainability

1. Add route/tenant/role integration tests.
2. Add transaction and idempotency tests.
3. Fix frontend `401`/`403` handling.
4. Consolidate proxy/API-origin wiring.
5. Remove stale routes, duplicate APIs, and dead UI modules.
6. Add observability and deployment smoke tests.

## Verification record

The final local verification should be run from the repository root after environment values are configured:

```text
cd backend && npm run check && npm test && npm run smoke
cd .. && python -m compileall -q api && python -m py_compile start_services.py
cd shein-frontend && npm test -- --watchAll=false && npm run build
npm audit --omit=dev --audit-level=high
```

The smoke suite requires the local MySQL database and the three services to be running. It is intentionally synthetic: it creates temporary users/months, verifies isolation and revocation, then removes its temporary records.

Latest local result: Node syntax checks, three Node unit tests, live smoke tests, Python compilation, frontend tests, and the production dependency audit passed. The production frontend build also completed successfully. `/ready` returned database `ready`, the Python API rejected an unauthenticated `/api/*` request with `401`, and the three listeners were bound to `127.0.0.1` on ports `8081`, `8000`, and `3000`. The migration ledger contains `2026_09_09_node_hardening.sql`, and the live Node SHEIN account rows contain zero non-null legacy plaintext secret values.

## Definition of done

The Node backend is ready for production only when all of the following are true:

- No default or hardcoded authentication secrets remain.
- A forged token cannot access any endpoint.
- Every route has an explicit role policy.
- Every tenant-owned query and mutation is tested with two users.
- Third-party credentials are encrypted at rest and redacted from responses/logs/dumps.
- The scraper bridge is private and authenticated.
- Migrations run automatically and schema validation passes before listening.
- Readiness fails when MySQL is unavailable.
- Managed accounts support disable/reset/lifecycle operations.
- Invalid numeric input is rejected rather than converted to zero.
- Delivery-number uniqueness is scoped correctly and safe under concurrency.
- Backend integration tests pass.
- Frontend permission errors do not log users out.
- Startup checks all required services and fails clearly when one is unhealthy.
