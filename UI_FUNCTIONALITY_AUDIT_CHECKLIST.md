# UI Functionality Audit Checklist

Scope: reachable routes and visible workflows in `shein-frontend/src/App.js`, with their Node.js, Python, database, and external-integration paths. PHP is explicitly out of scope and is not restored or used.

## Actionable defects

- [x] **UI-AUTH-001 — High**
  - Evidence: `shein-frontend/src/pages/Dashboard.jsx:69` identifies dashboard users as read-only, but visible write controls remain enabled at `:826`, `:1178`, `:1524-1527`, `:1656`, `:1757`, and `:1984`; write handlers begin at `:150`, `:286`, `:309`, `:439`, `:520`, and `:563` without a read-only guard.
  - Visible workflow affected: Dashboard month, order, customs, budget, payment, and KG-price controls for a dashboard-role account.
  - Expected behavior: A dashboard-role user can inspect the dashboard but cannot be offered enabled controls that submit operational changes.
  - Actual behavior: The page displays a read-only notice while controls can still be edited and submitted, producing backend permission errors.
  - Required fix: Disable dashboard write inputs/buttons and guard the handlers so the UI and direct event paths enforce read-only behavior.
  - Verification criteria: Dashboard-role smoke request remains `403` for writes; every visible dashboard write control is disabled; admin/operations controls remain enabled and functional.
  - Verification performed: Patched Node live check returned `403` for dashboard month writes; source inspection confirms guards on all dashboard write handlers and disabled visible mutation controls; frontend tests and production build passed.

- [x] **UI-FIN-001 — High**
  - Evidence: `shein-frontend/src/pages/Dashboard.jsx:450-514`, `:547`, and `:608-633` update local payment/customs state after successful writes, while `:753-761` prefers `serverSummary.customs_total`, `payments_total`, and `loss_total`; the KPI card at `:905` also reads `serverSummary.payments_total` first.
  - Visible workflow affected: Add/update/delete payment or customs entry from Dashboard and immediately viewing profit, cash, and payment KPIs.
  - Expected behavior: Successful visible changes recalculate the dashboard immediately.
  - Actual behavior: Payment and customs totals can remain at the previous server-summary values until the month is reloaded.
  - Required fix: Use the refreshed local collections for values changed by the visible dashboard controls, while retaining server summary values for metrics not locally loaded.
  - Verification criteria: After a successful local payment/customs mutation, the relevant KPI, P&L, cash, and shipping values change without changing month or reloading the page.
  - Verification performed: Source-level mutation-path inspection confirms payment/customs totals are derived from the updated local collections; frontend tests and production build passed.

- [x] **UI-FIN-002 — High**
  - Evidence: `shein-frontend/src/pages/OrdersPage.jsx:136-142` assigns `kgPriceData?.price`, but `backend/routes/settings.js:8-10` and `shein-frontend/src/api/settingsApi.js:6` expose the field as `kg_price`.
  - Visible workflow affected: Orders page estimated shipping and estimated-profit cards, plus per-order estimated-profit badges.
  - Expected behavior: Orders uses the configured per-kilogram rate returned by Node.
  - Actual behavior: The field mismatch resolves to zero, so order-page shipping is zero and estimated profit is overstated.
  - Required fix: Read the Node response’s `kg_price` field.
  - Verification criteria: With a nonzero configured rate and a weighted cart, Orders displays nonzero estimated shipping and subtracts it from estimated profit.
  - Verification performed: Patched Node returned `kg_price=4.5`; live month 17 summary returned `estimated_shipping_total=77.04` and `estimated_profit=422.96`; frontend production build passed.

- [x] **UI-FIN-003 — High**
  - Evidence: “Confirmed losses” totals in `backend/routes/dashboard.js:61-64`, `backend/routes/reports.js:20-22`, and order/customer loss sums in `backend/routes/orders.js:48-50`, `:66-68`, and `:76` filter only `reversed_at IS NULL`, not `status='confirmed'`.
  - Visible workflow affected: Dashboard “Confirmed Losses”, P&L/profit, Reports, Orders collection/profit modal, and customer loss badges.
  - Expected behavior: Pending losses do not reduce confirmed-loss totals or profit until an authorized user confirms them; reversed losses remain excluded.
  - Actual behavior: Any non-reversed pending loss is counted as confirmed and reduces visible financial results.
  - Required fix: Add `status='confirmed'` alongside the non-reversed condition to all financial/order loss aggregates.
  - Verification criteria: A pending loss is absent from Dashboard, Reports, Orders, and customer aggregates; after confirmation it appears; after reversal it is excluded.
  - Verification performed: `npm run check` passed; source inspection confirms the confirmed/non-reversed predicate in Dashboard, Reports, order, and customer aggregates; live Dashboard and Reports summaries agree on confirmed active loss totals.

- [x] **UI-VALID-001 — Medium**
  - Evidence: `shein-frontend/src/pages/ResetPasswordPage.jsx:35-41` accepts a new password of six characters, while `backend/routes/auth.js:9` and `:21-24` require at least twelve.
  - Visible workflow affected: Authenticated Reset Password form.
  - Expected behavior: The form’s validation and helper text match the backend’s twelve-character requirement.
  - Actual behavior: The submit button can enable for 6–11 characters, then the Node API rejects the request.
  - Required fix: Enforce and display the twelve-character minimum in the client.
  - Verification criteria: A 6–11 character password cannot submit; a matching 12-character password can submit and successful reset still logs the user out.
  - Verification performed: Client validation and helper text now use 12 characters; frontend tests and production build passed; Node smoke authentication/reset checks passed.

- [x] **UI-DATA-001 — Medium**
  - Evidence: `shein-frontend/src/components/CartsEditor.jsx:227-247` intentionally sends `shein_total_weight_kg: null` when the visible weight field is blank, but `backend/routes/ordersDetails.js:75-78` parses present nullable weight fields with `number()` whose `backend/lib/helpers.js:14-18` default converts null/empty to `0`.
  - Visible workflow affected: Add/edit cart form and subsequent Get Weight/Refresh SHEIN display.
  - Expected behavior: Clearing the optional weight stores no weight, and the UI continues to show the field as blank until a weight is received.
  - Actual behavior: A blank submitted weight is persisted as zero, indistinguishable from an explicitly entered 0 and able to overwrite an existing value during edits.
  - Required fix: Parse explicitly present nullable weight fields as `NULL` when null/empty, while still validating numeric nonnegative values.
  - Verification criteria: Blank weight round-trips as null; numeric weight persists; invalid negative/non-numeric values remain rejected; refresh-populated weight is not lost by unrelated cart edits.
  - Verification performed: An isolated live Node month/order/cart test confirmed blank weights round-trip as `NULL`, numeric weights persist, and negative weights return `400`; the fixture was removed through the normal Node routes.

- [x] **UI-CUSTOMER-001 — Medium**
  - Evidence: `shein-frontend/src/components/CartsEditor.jsx:277-303` automatically attaches the optional initial customer after creating a cart, but catches `addCustomer` failures and continues without showing the user an error.
  - Visible workflow affected: Add Cart with an initial customer selected or entered.
  - Expected behavior: The user is told whether the customer was attached, and a failed attachment is not reported as a fully successful customer setup.
  - Actual behavior: The cart can be reported as saved while the requested customer silently fails to attach.
  - Required fix: Preserve the cart-save result but surface an explicit customer-attachment warning/error after the cart is reloaded.
  - Verification criteria: A successful cart and customer attach closes normally; a simulated customer-attach failure leaves a visible warning naming the failed step.
  - Verification performed: Source inspection confirms the attachment error is captured and shown after cart reload; frontend tests and production build passed.

- [x] **UI-CUSTOMER-002 — Medium**
  - Evidence: `shein-frontend/src/components/CustomersEditor.jsx:71-74` loads cart customers without a catch/error state, while the empty-state UI at `:319-322` presents any failed load as “No customers”.
  - Visible workflow affected: Open Customers from a cart when the Node customer-list request fails.
  - Expected behavior: A request failure is distinguishable from a genuinely empty cart and is shown to the user.
  - Actual behavior: A rejected request can leave the editor showing an empty customer list without an actionable error.
  - Required fix: Catch the load failure and show the existing modal error surface.
  - Verification criteria: A failed `/ordersDetails/getCustomers` request opens an error message; a successful empty response still shows the intentional empty state.
  - Verification performed: Source inspection confirms failed customer loads clear stale data and call the existing Load Error modal; frontend tests and production build passed.

- [x] **UI-BULK-001 — High**
  - Evidence: `shein-frontend/src/components/RecordCustomerLossModal.jsx:65-91` submits bulk loss rows one at a time with `await addLoss(payload)` inside a loop; the Node API currently exposes only the single-row `backend/routes/losses.js:5` add flow.
  - Visible workflow affected: Delivery workspace “Record Loss” for multiple selected customers.
  - Expected behavior: Bulk recording is atomic: all valid selected rows are created together, or none are persisted and the error identifies the failure.
  - Actual behavior: If a later row fails, earlier rows remain persisted while the dialog reports an error.
  - Required fix: Add an authenticated, ownership-checked transactional bulk-loss endpoint and submit the batch once after validating every row.
  - Verification criteria: A batch with an invalid later row leaves no loss rows; a valid batch creates exactly one confirmed loss per selected customer and refreshes the list once.
  - Verification performed: Patched Node live check confirmed an invalid later row rolled back with no active-loss count change; a valid batch created exactly one confirmed loss and the audit fixture was then reversed. Frontend tests and production build passed.

- [x] **UI-SHEIN-001 - High**
  - Evidence: The visible Orders action calls `shein-frontend/src/pages/OrdersPage.jsx:683-697`, but `backend/routes/ordersDetails.js:355` previously selected only carts with `shein_delivered=0`.
  - Visible workflow affected: Orders -> Refresh Track for a cart that already has a delivered status or previously persisted tracking data.
  - Expected behavior: Refresh Track re-queries every selected order cart that has a SHEIN order number, so tracking status and split tracking data can be corrected after delivery.
  - Actual behavior: Delivered carts were excluded and the button could report zero updates without calling the Python scraper.
  - Required fix: Include all owned carts in the order track-refresh query; retain per-cart validation and error reporting for missing order numbers or profiles.
  - Verification criteria: A delivered cart is passed to the profile-only Python track endpoint; the response reports scraper errors/results instead of silently returning zero skipped work.
  - Verification performed: Fresh isolated Node API returned the expected Chrome-profile environment error for delivered order/cart 56/149, proving the route reached Python; Node syntax/tests/smoke and the frontend build passed.

- [x] **UI-FIN-004 - High**
  - Evidence: `shein-frontend/src/components/OrderCollectionModal.jsx:106-124` previously summed each paid customer's gross `usd_to_collect`, while `backend/routes/orders.js:196-209` records the actual payment as amount minus delivery charge.
  - Visible workflow affected: Orders -> Collect & Profit / Put Aside Profit modal.
  - Expected behavior: Realized collection and pure-profit figures match the payment actually recorded in Node, after delivery charges.
  - Actual behavior: The modal could show gross customer targets as collected and overstate realized profit when a delivery charge existed.
  - Required fix: Calculate paid customer totals from gross amount minus the recorded delivery charge, clamped at zero.
  - Verification criteria: A paid customer with a delivery charge contributes the same net amount shown in the payment record and the pure-profit formula uses that net amount.
  - Verification performed: Source-level calculation review confirms the modal now subtracts `delivery_charge_usd`; frontend tests and production build passed.

- [x] **UI-STATE-001 - Medium**
  - Evidence: `shein-frontend/src/pages/ActivityHistoryPage.jsx:16-62` and `shein-frontend/src/pages/LossesWorkspace.jsx:58-112,187-237` previously rendered their empty messages while requests were pending and retained old rows after a failed or superseded filter request.
  - Visible workflow affected: History filters, Losses order search, customer loading, and loss-history filters.
  - Expected behavior: Pending requests show loading state, failed requests show an error with stale results cleared, and only the latest filter response is displayed.
  - Actual behavior: Users could see empty messages during a request or view data from the previous filter; loss save/edit/reverse controls also had no pending guard.
  - Required fix: Add request-aware loading/error state, clear stale collections on filter changes/failure, show customer loading/empty states, and guard loss mutations with disabled busy controls.
  - Verification criteria: History and Losses distinguish loading from empty; a failed request cannot leave stale rows; duplicate loss submissions are blocked while a mutation is pending.
  - Verification performed: Source inspection confirms active-request guards, loading/empty branches, customer reset behavior, and disabled Saving controls; frontend tests and production build passed.

- [x] **UI-STATE-002 - Medium**
  - Evidence: Reachable list screens had asynchronous data state gaps in `shein-frontend/src/pages/CargoPage.jsx:14-58,239-243`, `DeliveryWorkspace.jsx:48-120,823-825`, `CustomersPage.jsx:58-105`, and `SheinAccountsPage.jsx:29-73,243-247`.
  - Visible workflow affected: Cargo Refresh, Delivery queue/filter changes, Customer Directory search/refresh, and direct Chrome-profile/account list loading.
  - Expected behavior: Initial and refresh requests show loading, failures clear stale lists and remain visible as errors, and older search responses cannot overwrite newer results.
  - Actual behavior: Several screens showed empty states while loading, left stale rows after errors, or allowed overlapping list requests; Cargo Refresh and Details also lacked clear busy feedback.
  - Required fix: Add loading flags, request sequencing, failure clearing, independent setup loading, and disabled/busy labels for visible refresh/detail actions.
  - Verification criteria: Each screen has distinct loading, populated, empty, and error behavior; a newer search/filter result always wins; visible refresh/detail buttons cannot be double-triggered while pending.
  - Verification performed: Source inspection confirms request sequencing/loading branches and busy labels in each active screen; frontend tests and production build passed.

- [x] **UI-STATE-003 - Medium**
  - Evidence: `shein-frontend/src/pages/Dashboard.jsx:221-290,823` loaded month data asynchronously without clearing the prior month or identifying a pending month load; `OrdersPage.jsx:286-317,874-876` had no duplicate-save guard for its visible order form.
  - Visible workflow affected: Switching Dashboard month cycles and submitting Create/Edit Order.
  - Expected behavior: The selected month is represented by its own loading state and an older response cannot repopulate the new month; an order form submits once until the response completes.
  - Actual behavior: Fast month changes could display old-month metrics under the new selection, and repeated order clicks could create duplicate orders.
  - Required fix: Sequence month requests, clear month collections while loading, show a loading notice, and disable the order submit action while saving.
  - Verification criteria: Out-of-order responses are ignored, failed loads clear stale month data, and the order button displays Saving and rejects a second submit.
  - Verification performed: Source inspection confirms request sequencing/clear-on-load and `savingOrder` guard/disabled label; frontend tests and production build passed.

- [x] **UI-CORS-001 - High**
  - Evidence: `shein-frontend/src/api/customersApi.js:42-48` updates reusable customers with HTTP PATCH, while `backend/server.js:38-43` did not advertise PATCH in CORS allowed methods.
  - Visible workflow affected: Customers -> Edit Customer -> Save Customer Changes from the browser on port 3000.
  - Expected behavior: The browser preflight permits the visible PATCH request to Node.
  - Actual behavior: A cross-origin browser could reject the update before the request reached the Node route, even though the endpoint and form were correct.
  - Required fix: Add PATCH to the Node CORS method allow-list.
  - Verification criteria: An OPTIONS preflight from `http://127.0.0.1:3000` for PATCH returns the allowed-method header containing PATCH.
  - Verification performed: Fresh isolated Node OPTIONS check returned `GET,POST,PUT,PATCH,DELETE,OPTIONS`; frontend tests/build and Node checks passed.

- [x] **UI-CARGO-001 - Medium**
  - Evidence: `backend/routes/cargo.js` previously ignored non-finite/negative `customs_fee` and `weight_kg` values in the receipt path, while `CargoPage.jsx:91-112` sends those visible modal fields.
  - Visible workflow affected: Cargo -> Receive Shipment & Customs / Save Customs Fee.
  - Expected behavior: Invalid visible numeric input is rejected before a receipt is persisted, with a clear validation message.
  - Actual behavior: Invalid values could still create the shipment receipt while silently omitting customs data.
  - Required fix: Validate optional cargo weight and customs fee in Node middleware and validate the modal values before submission.
  - Verification criteria: Invalid customs fee or weight returns HTTP 400 and does not persist a receipt; valid zero/non-negative values remain accepted.
  - Verification performed: Fresh isolated Node request with `customs_fee="not-a-number"` returned HTTP 400; frontend tests/build and Node checks passed.

- [x] **UI-LOSS-002 - Medium**
  - Evidence: `shein-frontend/src/pages/LossesWorkspace.jsx:129-171,227-237` previously allowed the Save, Edit, and Reverse actions to issue overlapping requests without disabled busy state.
  - Visible workflow affected: Losses -> Save loss, Edit, and Reverse.
  - Expected behavior: A user action remains disabled until its request and list refresh complete, preventing duplicate financial records or conflicting mutations.
  - Actual behavior: Rapid clicks could submit the same loss more than once or race edit/reverse requests.
  - Required fix: Add save and row-mutation guards, and show Saving labels on the affected buttons.
  - Verification criteria: A second submit/click while the same mutation is pending is ignored and the controls visibly disable.
  - Verification performed: Source inspection confirms `saving`/`mutatingId` guards and disabled labels; frontend tests and production build passed.

- [x] **UI-CART-002 - Medium**
  - Evidence: `shein-frontend/src/components/CartsEditor.jsx:21-68,444-458` and `CustomersEditor.jsx:21-78,294-315` previously showed the empty cart/customer state before the initial Node request completed; `CartsEditor.jsx:342-363` also kept a newly selected Chrome profile in local state when its save failed.
  - Visible workflow affected: Orders -> Edit Carts & Customers, initial cart/customer loading, and changing a cart's Chrome profile.
  - Expected behavior: Pending lists show loading, failed loads are distinguishable from empty data, and a failed profile save leaves the UI at the persisted profile.
  - Actual behavior: Users could see misleading empty states and could be shown a profile that Node had rejected.
  - Required fix: Add cart/customer loading branches, clear failed stale data, guard the customer form against duplicate submits, surface customer delete failures, and roll back a failed profile selection.
  - Verification criteria: Initial requests show Loading, empty appears only after a successful empty response, failed deletes show an error, and failed profile updates restore the previous selection.
  - Verification performed: Source inspection confirms loading/error branches, form-submit guard, delete error handling, and profile rollback/busy state; frontend tests and production build passed.

## Environment verification limitations

- [ ] **ENV-VERIFY-002 — Existing Node process requires restart**
  - Evidence: The currently listening `127.0.0.1:8081` Node process is PID `12568`, started before the final source edits; an authenticated live `/losses/addBulk` request returned `404`, and its CORS preflight omitted `PATCH`. The patched source was verified on an isolated Node instance at `127.0.0.1:8082`, where the endpoint and all tested behavior passed.
  - Impact: The currently open UI on port 3000 will not see the new backend route until the existing Node process is restarted.
  - Required follow-up: Restart the Node backend process using the repository start command, then repeat the port-8081 bulk-loss smoke request.

## Verification limitation

- [ ] **ENV-VERIFY-001 — Browser connector unavailable**
  - Evidence: The required in-app browser session failed three times across two goal turns before initialization with `Mcp error: -32602: js: codex/sandbox-state-meta: missing field sandboxPolicy`.
  - Impact: Direct visual browser clicks and screenshots could not be completed in this environment. Reachable routes, source wiring, live Node/Python HTTP contracts, database ownership, and service smoke checks remain auditable through code and API checks.
  - Required follow-up: Re-run the visible browser workflow checks when the browser connector supplies valid sandbox metadata. This is an environment verification limitation, not an application defect.
