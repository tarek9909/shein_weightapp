<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require_once '../db.php';
require_once '../auth/auth.php';
require_once '_common.php';
require_once '../lib/activity.php';

$payload = require_auth();
$userId = (int)($payload['user_id'] ?? 0);
$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) delivery_json_error(400, 'Invalid JSON body');
$monthId = (int)($data['month_id'] ?? 0);
$ids = delivery_ids_from_payload($data);
if ($monthId <= 0 || !$ids) delivery_json_error(400, 'month_id and customer_ids are required');

$conn->begin_transaction();
try {
  $customers = [];
  $alreadyCollected = [];
  foreach ($ids as $customerId) {
    $stmt = $conn->prepare("SELECT cc.id AS customer_id, cc.customer_name, cc.usd_to_collect, cc.received_at,
      cc.delivery_method, cc.delivery_number, cc.delivery_assignment_status, cc.collection_status,
      cc.payment_status, cc.collection_payment_id, cc.base_amount_to_collect, cc.delivery_adjustment,
      cc.final_amount_to_collect, cc.delivery_preset_id, oc.id AS cart_id, oc.cart_order_number,
      o.id AS order_id, o.order_name, o.month_id
      FROM cart_customers cc JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id
      JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
      WHERE cc.id=? AND cc.user_id=? AND o.month_id=? LIMIT 1 FOR UPDATE");
    $stmt->bind_param('iii', $customerId, $userId, $monthId);
    if (!$stmt->execute()) throw new Exception($stmt->error ?: 'Failed to lock collection customer');
    $customer = $stmt->get_result()->fetch_assoc();
    if (!$customer) throw new RuntimeException('Customer not found in the selected month', 404);
    if ($customer['collection_status'] === 'collected' || $customer['payment_status'] === 'paid' || (int)($customer['collection_payment_id'] ?? 0) > 0) {
      $alreadyCollected[] = $customer;
      continue;
    }
    if ($customer['received_at'] === null) throw new RuntimeException('Customer cannot be collected before the complete shipment is received', 422);
    if ($customer['delivery_assignment_status'] !== 'assigned' || !$customer['delivery_method']) throw new RuntimeException('Customer must be assigned before collection', 422);
    $base = delivery_decimal($customer['base_amount_to_collect'], (float)$customer['usd_to_collect']) ?? 0.0;
    $adjustment = delivery_decimal($customer['delivery_adjustment'], 0.0) ?? 0.0;
    $final = round($base + $adjustment, 2);
    if ($final < 0) throw new RuntimeException('Customer final amount cannot be negative', 422);
    $customer['base_amount_to_collect'] = $base;
    $customer['delivery_adjustment'] = $adjustment;
    $customer['final_amount_to_collect'] = $final;
    $customers[] = $customer;
  }

  if ($alreadyCollected && $customers) throw new RuntimeException('Some selected customers were already collected; retry them separately', 409);
  if ($alreadyCollected && !$customers) {
    $paymentIds = array_values(array_unique(array_filter(array_map(fn($row) => (int)($row['collection_payment_id'] ?? 0), $alreadyCollected))));
    $conn->commit();
    echo json_encode(['ok' => true, 'idempotent' => true, 'payment_ids' => $paymentIds, 'customer_ids' => $ids]);
    exit;
  }

  $total = 0.0;
  $baseTotal = 0.0;
  $adjustmentTotal = 0.0;
  foreach ($customers as $customer) {
    $total += (float)$customer['final_amount_to_collect'];
    $baseTotal += (float)$customer['base_amount_to_collect'];
    $adjustmentTotal += (float)$customer['delivery_adjustment'];
  }
  $total = round($total, 2);
  $baseTotal = round($baseTotal, 2);
  $adjustmentTotal = round($adjustmentTotal, 2);
  $customerIdsJson = json_encode($ids);
  $note = trim((string)($data['note'] ?? ''));
  if ($note === '') $note = 'Automatic delivery collection';

  $paymentStmt = $conn->prepare("INSERT INTO payments
    (user_id, month_id, payment_amount, payment_type, original_amount, delivery_charge, customer_count, customer_ids_json, note)
    VALUES (?, ?, ?, 'customers', ?, ?, ?, ?, ?)");
  if (!$paymentStmt) throw new Exception($conn->error ?: 'Failed to prepare collection payment');
  $count = count($customers);
  $paymentStmt->bind_param('iidddiss', $userId, $monthId, $total, $baseTotal, $adjustmentTotal, $count, $customerIdsJson, $note);
  if (!$paymentStmt->execute()) throw new Exception($paymentStmt->error ?: 'Failed to create collection payment');
  $paymentId = (int)$paymentStmt->insert_id;

  $itemStmt = $conn->prepare("INSERT INTO payment_customer_items
    (payment_id, customer_id, customer_name_snapshot, amount, delivery_charge, user_id,
     order_id, order_name_snapshot, cart_id, cart_order_number_snapshot, delivery_method,
     delivery_number, base_amount, delivery_adjustment, final_amount, collected_at, collection_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)");
  if (!$itemStmt) throw new Exception($conn->error ?: 'Failed to prepare collection payment item');
  foreach ($customers as $customer) {
    $cid = (int)$customer['customer_id'];
    $name = (string)$customer['customer_name'];
    $base = (float)$customer['base_amount_to_collect'];
    $adjustment = (float)$customer['delivery_adjustment'];
    $orderId = (int)$customer['order_id'];
    $orderName = (string)$customer['order_name'];
    $cartId = (int)$customer['cart_id'];
    $cartNumber = (string)$customer['cart_order_number'];
    $method = (string)$customer['delivery_method'];
    $deliveryNumber = $customer['delivery_number'] === null ? null : (string)$customer['delivery_number'];
    $final = (float)$customer['final_amount_to_collect'];
    $collectionKey = 'customer:' . $cid;
    $itemStmt->bind_param('iisddiisisssddds', $paymentId, $cid, $name, $base, $adjustment, $userId, $orderId, $orderName, $cartId, $cartNumber, $method, $deliveryNumber, $base, $adjustment, $final, $collectionKey);
    if (!$itemStmt->execute()) throw new Exception($itemStmt->error ?: 'Failed to link collection payment item');
  }

  $updateStmt = $conn->prepare("UPDATE cart_customers SET collection_status='collected', payment_status='paid',
    delivery_assignment_status='collected', collection_payment_id=?, collected_at=NOW(),
    status='paid', delivery_status='paid'
    WHERE id=? AND user_id=? AND collection_status='pending' AND payment_status='unpaid'");
  foreach ($customers as $customer) {
    $cid = (int)$customer['customer_id'];
    $updateStmt->bind_param('iii', $paymentId, $cid, $userId);
    if (!$updateStmt->execute() || $updateStmt->affected_rows !== 1) throw new Exception('Customer collection state could not be saved');
    activity_append($conn, $userId, $monthId, 'customer', $cid, 'customer_collected', [
      'collection_status' => 'pending', 'payment_status' => 'unpaid', 'final_amount' => (float)$customer['final_amount_to_collect'],
    ], [
      'collection_status' => 'collected', 'payment_status' => 'paid', 'payment_id' => $paymentId,
      'final_amount' => (float)$customer['final_amount_to_collect'], 'collected_at' => date('Y-m-d H:i:s'),
    ]);
  }
  activity_append($conn, $userId, $monthId, 'payment', $paymentId, 'payment_created', null, [
    'payment_type' => 'customers', 'payment_amount' => $total, 'base_amount' => $baseTotal,
    'delivery_adjustment' => $adjustmentTotal, 'customer_ids' => $ids,
  ]);

  $conn->commit();
  echo json_encode(['ok' => true, 'idempotent' => false, 'payment_id' => $paymentId, 'payment_amount' => $total, 'customer_ids' => $ids]);
} catch (Throwable $e) {
  $conn->rollback();
  $statusCode = $e instanceof RuntimeException && $e->getCode() >= 400 ? $e->getCode() : 500;
  http_response_code($statusCode);
  error_log('[shein-php] collect customers failure: ' . (string)$e);
  echo json_encode(['ok' => false, 'error' => backend_public_exception_message($e, 'Failed to collect customers')]);
}
