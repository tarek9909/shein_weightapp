# Delivery, Cargo, Payments, Losses, and History Redesign

## 1. Purpose

This document defines the business rules and implementation plan for the new operational flow.

The main goals are:

- Remove the separate Delivery Addition, Delivery Tracking, Delivery Collection, Cargo Sorting, Awaiting Cargo, and Losses workflows.
- Use customers that already exist under the application's orders and carts.
- Mark customers as received from cargo only after the complete shipment is received.
- Support split shipments without marking customers received too early.
- Replace manual delivery-charge entry with configurable signed adjustments such as `+5`, `-5`, and `+10`.
- Create payment records automatically when a customer is collected.
- Make losses order-first and searchable by order.
- Produce a detailed, auditable history.
- Update dashboard calculations to use the new statuses and payment records.

No implementation should begin until the current working-tree changes are preserved and the existing frontend compilation issue is addressed or explicitly included in the implementation work.

## 2. Current application facts

The current system is a React frontend with PHP/MySQL business endpoints and a Python/SHEIN scraping service.

The main data relationship is:

```text
month
  └── orders
        └── order_carts
              └── cart_customers
```

The current cart records already contain the SHEIN information needed for the redesign:

- SHEIN order number
- Carrier
- Tracking number
- Delivered status
- Last tracking status
- Weight
- Split-shipment flag
- Split count
- Split tracking-number list
- Joint-shipment information

The current `payments` and `payment_customer_items` tables already support customer-linked payments. The new implementation should reuse that relationship, but move payment creation into the collection transaction.

Important current issues to account for:

1. `cart_customers.status` and `cart_customers.delivery_status` currently represent multiple unrelated concepts.
2. Delivery collection and payment creation are currently separate actions.
3. The existing delivery import flow matches external rows by customer name and is no longer the source of delivery customers.
4. The current cargo flow depends on invoice extraction, cargo sorting, and awaiting-cargo screens.
5. The current History page is an aggregate tree, not an event log.
6. `npm run build` currently fails because `History.jsx` contains a malformed duplicated `page` style property.
7. `backend/tables.php` appears older than the current migration set and must not be treated as the complete production schema.

## 3. Target business model

### 3.1 Customer source

Delivery customers must be derived only from existing records:

```text
orders → order_carts → cart_customers
```

The new delivery UI must not create customers from an uploaded delivery list. It may search and filter existing customers, but customer creation remains part of the Orders/Carts workflow.

### 3.2 Shipment receipt and customer receipt

Cargo receipt is shipment-based. A customer becomes eligible for delivery only when the shipment or shipment group containing that customer's cart is complete.

For a single shipment:

```text
Receive tracking number → shipment complete → related customers marked received
```

For a split shipment with two or three tracking numbers:

```text
Receive tracking 1 → incomplete
Receive tracking 2 → incomplete if another part remains
Receive final tracking → complete → related customers marked received
```

The receipt state must be derived from all expected tracking numbers associated with the logical shipment. One received split package must never mark the customer received prematurely.

The receipt source of truth should be a dedicated receipt record per tracking number. The customer `received_at` value can be maintained as a derived/materialized value for efficient delivery filtering, but it must be updated only after the shipment-completion check succeeds.

### 3.3 Delivery assignment

Only received customers can be assigned for delivery.

Each customer can have one delivery method:

- `courier`: normal delivery and a required delivery number
- `self`: self-delivery and no delivery number required

The delivery number must be unique according to the selected business scope. The recommended scope is unique per user and month, because the current application already works primarily by month.

Assignment must be available for one customer or a selected batch of customers.

### 3.4 Delivery-charge adjustment

The user should choose a configured signed adjustment rather than type a numeric delivery charge.

Examples:

- `+5`: add 5 to the customer's base amount
- `-5`: subtract 5 from the customer's base amount
- `+10`: add 10 to the customer's base amount
- `0`: no adjustment

Recommended calculation:

```text
final_amount_to_collect = base_customer_amount + delivery_adjustment
```

The final amount must not be negative. If an adjustment would produce a negative result, the backend must reject it or clamp it to zero according to the selected business rule. Rejection is safer because it exposes configuration mistakes.

The signed adjustment must be stored separately from the final amount. Do not overload the existing positive-only `delivery_charge_usd` field for signed values without a migration and a clear compatibility rule.

### 3.5 Collection and payment

“Collected” must be one atomic business action:

1. Verify that the customer is received and assigned.
2. Verify that the customer has not already been collected or paid.
3. Calculate the final amount using the stored base amount and signed adjustment.
4. Create a payment row.
5. Create the linked `payment_customer_items` row.
6. Update the customer collection/payment state.
7. Add a history event.

If any step fails, the entire transaction must roll back.

Retrying the same collection request must not create a second payment. The backend must enforce idempotency using a customer collection identifier, a unique collection payment link, or both.

For batch collection, the backend may create one payment per month containing multiple `payment_customer_items`, matching the current payment grouping behavior. Each customer must remain individually traceable.

### 3.6 Losses

Loss creation should be order-first:

1. Search for an order by order number/name.
2. Show only customers attached to that order.
3. Select the affected customer.
4. Enter loss type, amount, and description.
5. Save the loss linked to the order, cart, customer, and month.

The backend must validate that the selected customer belongs to the selected order and belongs to the authenticated user.

The existing loss table may be retained for compatibility, but new loss records must always have an order and customer relationship whenever the business event is customer-specific.

### 3.7 Cargo records

The new Cargo screen should use a searchable cart/shipment selector. The selector must be populated from existing `order_carts` and the tracking fields populated by the SHEIN API.

Each search result should display:

- SHEIN order number
- Internal order name/number
- Cart number
- Primary tracking number
- Split/single status
- Received parts count, for example `1/3`
- Delivered status

After selection, the backend should return the complete shipment context. The user should not manually paste or extract invoice text.

The cargo receipt operation should be idempotent. Receiving an already received tracking number should return its existing state instead of creating a duplicate receipt.

## 4. Recommended database changes

The migration should be additive first. Existing columns and records should remain available until the new flow has been verified in production.

### 4.1 Customer delivery and collection fields

Add explicit fields to `cart_customers`, or introduce a dedicated customer-delivery table if the current schema must remain untouched.

Recommended fields:

```text
received_at DATETIME NULL
delivery_method ENUM('courier','self') NULL
delivery_assignment_status ENUM('unassigned','assigned','collected') NOT NULL DEFAULT 'unassigned'
collection_status ENUM('pending','collected') NOT NULL DEFAULT 'pending'
payment_status ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid'
base_amount_to_collect DECIMAL(10,2) NULL
delivery_adjustment DECIMAL(10,2) NOT NULL DEFAULT 0
final_amount_to_collect DECIMAL(10,2) NULL
delivery_preset_id INT NULL
collection_payment_id INT NULL
collected_at DATETIME NULL
```

The old `status` and `delivery_status` columns should be mapped during migration and then treated as compatibility fields only. New code should use the explicit fields.

### 4.2 Shipment receipt table

Create a table similar to:

```text
shipment_receipts
-----------------
id
user_id
month_id
order_id
cart_id
shipment_group_key
tracking_no
receipt_status       -- received
received_at
received_by
source               -- manual/search/API
created_at
updated_at
```

Recommended constraints and indexes:

- Unique `(user_id, tracking_no)` where one tracking number can only be received once.
- Index `(user_id, order_id)`.
- Index `(user_id, cart_id)`.
- Index `(user_id, shipment_group_key)`.

The shipment group key must represent the logical split shipment. For a single tracking number it can be `single:<tracking>`. For a split shipment it can be a stable normalized combination of all tracking numbers.

### 4.3 Delivery charge preset table

Create a user-scoped configuration table:

```text
delivery_charge_presets
-----------------------
id
user_id
label                 -- e.g. '+5'
adjustment_amount     -- signed decimal
active
sort_order
created_at
updated_at
```

Recommended defaults are `0`, `+5`, `-5`, and `+10`, but the user must be able to add, disable, reorder, or edit presets.

### 4.4 Payment linkage

Extend `payment_customer_items` or add a collection-specific link so that each collection payment retains:

- Customer ID
- Customer name snapshot
- Order ID and order name snapshot
- Cart ID and cart number snapshot
- Delivery method
- Delivery number
- Base amount
- Signed adjustment
- Final amount
- Collection timestamp

If `collection_payment_id` is stored on the customer, it must be protected from duplicate assignment.

### 4.5 Activity log

Create an append-only activity table:

```text
activity_log
------------
id
user_id
month_id
entity_type       -- order/cart/customer/shipment/payment/loss
entity_id
action            -- received/assigned/collected/paid/loss_created/etc.
before_json
after_json
metadata_json
created_by
created_at
```

This is necessary for accurate detailed History. Reconstructing history from current status fields will not show previous values or reversals reliably.

## 5. Recommended backend endpoints

Names may follow the existing PHP folder conventions, but the API responsibilities should be separated clearly.

### 5.1 Shipment/cargo

```text
GET  /cargo/getReceivableCarts.php?month_id=&q=
GET  /cargo/getShipmentDetail.php?cart_id=
POST /cargo/receiveShipment.php
GET  /cargo/getReceiptStatus.php?order_id=
```

`getReceivableCarts.php` should return only carts with valid SHEIN tracking data and should support search by order number, cart number, and tracking number.

`receiveShipment.php` should:

1. Validate ownership.
2. Validate that the tracking number belongs to the selected cart/order.
3. Insert the receipt idempotently.
4. Recalculate the split shipment completion state.
5. If complete, mark all related customers received in the same transaction.
6. Write activity-log entries.

### 5.2 Delivery

```text
GET  /delivery/getCustomers.php?month_id=&q=&status=
POST /delivery/assign.php
POST /delivery/collect.php
POST /delivery/revertAssignment.php
```

`getCustomers.php` must query existing order/cart/customer records and return receipt, assignment, collection, payment, delivery method, delivery number, and amount information.

`assign.php` must support both single and batch assignment. It must validate:

- Customer belongs to the authenticated user.
- Customer is received.
- Courier assignments have a delivery number.
- Self-delivery assignments do not require a delivery number.
- Delivery number uniqueness.
- Preset exists, is active, and belongs to the authenticated user.
- Final amount is valid and non-negative.

`collect.php` must be transactional and idempotent as described above.

### 5.3 Delivery-charge presets

```text
GET    /settings/getDeliveryChargePresets.php
POST   /settings/addDeliveryChargePreset.php
POST   /settings/updateDeliveryChargePreset.php
POST   /settings/deleteDeliveryChargePreset.php
```

All preset endpoints must be user-scoped.

### 5.4 Losses

```text
GET  /losses/searchOrders.php?month_id=&q=
GET  /losses/getOrderCustomers.php?order_id=
POST /losses/add.php
GET  /losses/list.php?month_id=&q=&status=
```

The add endpoint must reject a customer/order combination that does not match.

### 5.5 History and dashboard

```text
GET /history/getActivity.php?month_id=&q=&entity_type=&action=&from=&to=
GET /dashboard/getSummary.php?month_id=
```

The dashboard summary should be calculated server-side so that every screen uses the same business rules and rounding.

## 6. Backend transaction and security rules

Every new endpoint must:

- Require authentication.
- Scope every query by `user_id`.
- Validate month/order/cart/customer relationships.
- Use prepared statements.
- Use transactions for receipt completion and payment creation.
- Return consistent JSON error responses.
- Avoid relying on frontend status checks for authorization.

For receipt completion:

```text
begin transaction
  insert tracking receipt if absent
  lock/read all expected tracking numbers
  calculate received_count and expected_count
  if received_count == expected_count:
      mark related customers received
      add customer receipt events
commit
```

For collection:

```text
begin transaction
  lock customer row
  reject if already collected/paid
  calculate final amount
  insert payment
  insert payment_customer_items
  mark customer collected and paid
  add collection/payment events
commit
```

The payment insert and customer update must never be allowed to succeed independently.

## 7. Migration and rollout strategy

### Phase 0: Baseline

- Preserve all existing working-tree changes.
- Fix the current `History.jsx` syntax error or record it as a pre-existing baseline blocker.
- Run `npm run build` and record a clean baseline.
- Verify the PHP database connection and migration state.
- Back up the database before schema changes.

### Phase 1: Additive schema

- Add shipment receipt table.
- Add delivery preset table and seed defaults.
- Add explicit customer receipt/delivery/collection/payment fields.
- Add activity-log table.
- Add payment snapshot/link fields.

Do not delete legacy columns or tables at this stage.

### Phase 2: Backend APIs

- Implement receipt search and receive transaction.
- Implement customer delivery queue.
- Implement preset management.
- Implement assignment and collection transactions.
- Implement order-first losses.
- Implement activity history and dashboard summary.

### Phase 3: Frontend workflow

- Replace the three delivery screens with one Delivery workspace.
- Replace Cargo Sorting and Awaiting Cargo with one searchable Cargo workspace.
- Move delivery-charge presets into configuration.
- Replace the Losses screen with order-first loss entry and history.
- Update dashboard cards and calculations.
- Remove old menu links only after the new routes are verified.

### Phase 4: Backfill and cleanup

- Map legacy customer statuses into the new explicit statuses.
- Backfill known shipment receipts from existing customs/tracking data where safe.
- Preserve existing payment history.
- Compare old and new totals for selected months.
- Remove deprecated endpoints and tables only after the migration has been accepted and backups are confirmed.

## 8. Verification plan

### 8.1 Build and static verification

- `npm run build` succeeds.
- No removed page is imported by `App.js`.
- No removed menu link remains.
- No frontend request still calls the old delivery-import, cargo-sorting, or awaiting-cargo workflow.
- PHP files pass syntax checks.
- Migrations apply cleanly to an empty database and an existing database.

### 8.2 Shipment receipt tests

| Scenario | Expected result |
|---|---|
| Single tracking number received | Related customers become received once |
| First part of a two-part split received | Receipt shows `1/2`; customers remain not received |
| Second part of a two-part split received | Receipt shows `2/2`; customers become received |
| First two parts of a three-part split received | Receipt shows `2/3`; customers remain not received |
| Final part of a three-part split received | Customers become received |
| Same tracking received twice | No duplicate receipt and no duplicate history event |
| Tracking from another user submitted | Request rejected |
| Tracking not belonging to selected cart/order | Request rejected |
| Refresh after partial receipt | Partial state remains correct |

### 8.3 Delivery assignment tests

| Scenario | Expected result |
|---|---|
| Unreceived customer selected | Assignment rejected |
| Received customer assigned to courier | Delivery method and unique number saved |
| Received customer assigned to self-delivery | Self method saved with nullable delivery number |
| Courier assignment without number | Validation error |
| Duplicate delivery number in same scope | Validation error |
| Inactive preset selected | Validation error |
| `+5` selected | Final amount equals base amount plus 5 |
| `-5` selected | Final amount equals base amount minus 5 |
| Adjustment produces negative amount | Request rejected or the explicitly chosen clamp rule is applied |
| Batch assignment | All valid customers update atomically |

### 8.4 Collection and payment tests

| Scenario | Expected result |
|---|---|
| Collect one courier customer | One payment and one payment item are created |
| Collect one self-delivery customer | Same payment behavior without delivery number |
| Collect a batch | Payment grouping is correct and every customer has an item row |
| Double-click collect | Only one payment is created |
| Retry after timeout | Idempotent result; no duplicate payment |
| Payment insert fails | Customer remains uncollected |
| Customer update fails | Payment transaction rolls back |
| Payment amount check | Dashboard payment total equals payment records |

### 8.5 Loss tests

- Search returns orders by order number/name.
- Selecting an order returns only its customers.
- A customer from another order cannot be linked manually.
- Loss stores order, cart, customer, amount, type, note, month, and timestamp.
- Loss edits and reversals create history events.

### 8.6 History tests

Verify events for:

- Shipment received
- Split shipment completed
- Customer marked received
- Courier assignment
- Self-delivery assignment
- Delivery-number change
- Customer collected
- Payment created
- Loss created/edited
- Cargo correction

Each event must show timestamp, actor, entity, action, and enough before/after data to explain the change.

### 8.7 Dashboard reconciliation

For a test month, verify these independently:

```text
payment total = SUM(payments.payment_amount)
collected total = SUM(final customer collection amounts)
uncollected total = received/assigned customer amounts not yet collected
loss total = SUM(loss amounts according to the selected loss policy)
customs total = SUM(customs.customs_fee)
```

The dashboard must not count a customer payment twice through both a manual payment and an automatic collection payment.

## 9. Definition of done

The redesign is complete only when:

- Delivery customers come exclusively from existing orders and carts.
- Customers remain unavailable for delivery until their complete shipment is received.
- Split shipments require every tracking number to be received.
- Delivery adjustments are selected from configurable signed presets.
- Courier and self-delivery are both supported.
- Collection creates an idempotent linked payment automatically.
- Losses are entered through order-first search.
- Cargo uses searchable existing cart/shipment data without invoice extraction.
- History records detailed immutable events.
- Dashboard totals reconcile with backend payment, cargo, customer, and loss data.
- Old screens and endpoints are no longer reachable through the active UI.
- Build, migration, API, transaction, split-shipment, payment, and reconciliation tests pass.

## 10. Decisions to confirm before implementation

The recommended defaults are:

1. A signed adjustment changes the customer amount directly: `base + adjustment`.
2. Negative final collection amounts are rejected.
3. Delivery numbers are unique per user and month.
4. Self-delivery does not require a delivery number.
5. A split shipment is complete only when all API-provided tracking numbers are received.
6. Automatic collection payments are the authoritative customer-collection payments; manual customer payments should be restricted to exceptional adjustments.

