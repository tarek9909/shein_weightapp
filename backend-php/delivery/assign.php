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
if ($monthId <= 0) delivery_json_error(400, 'month_id is required');

$assignments = [];
if (isset($data['assignments']) && is_array($data['assignments'])) {
  foreach ($data['assignments'] as $assignment) if (is_array($assignment)) $assignments[] = $assignment;
} else {
  foreach (delivery_ids_from_payload($data) as $customerId) {
    $assignments[] = [
      'customer_id' => $customerId,
      'delivery_method' => $data['delivery_method'] ?? $data['method'] ?? null,
      'delivery_number' => $data['delivery_number'] ?? null,
      'preset_id' => $data['preset_id'] ?? $data['delivery_preset_id'] ?? null,
    ];
  }
}
if (!$assignments) delivery_json_error(400, 'At least one customer assignment is required');

$monthCheck = $conn->prepare('SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1');
$monthCheck->bind_param('ii', $monthId, $userId);
$monthCheck->execute();
if (!$monthCheck->get_result()->fetch_assoc()) delivery_json_error(403, 'Invalid month for this user');

$conn->begin_transaction();
try {
  $seenIds = [];
  $seenNumbers = [];
  $updated = [];
  foreach ($assignments as $assignment) {
    $customerId = (int)($assignment['customer_id'] ?? 0);
    if ($customerId <= 0 || isset($seenIds[$customerId])) throw new RuntimeException('Invalid or duplicate customer assignment', 400);
    $seenIds[$customerId] = true;

    $method = strtolower(trim((string)($assignment['delivery_method'] ?? $assignment['method'] ?? '')));
    if ($method !== 'courier' && $method !== 'self') throw new RuntimeException('delivery_method must be courier or self', 422);
    $presetId = (int)($assignment['preset_id'] ?? $assignment['delivery_preset_id'] ?? 0);
    if ($presetId <= 0) throw new RuntimeException('An active delivery preset is required', 422);

    $deliveryNumberRaw = trim((string)($assignment['delivery_number'] ?? ''));
    $deliveryNumber = null;
    if ($method === 'courier') {
      if ($deliveryNumberRaw === '' || !preg_match('/^[0-9]+$/', $deliveryNumberRaw) || (int)$deliveryNumberRaw <= 0) {
        throw new RuntimeException('Courier assignments require a positive numeric delivery number', 422);
      }
      $deliveryNumber = (int)$deliveryNumberRaw;
      if (isset($seenNumbers[$deliveryNumber])) throw new RuntimeException('Duplicate delivery number in assignment batch', 409);
      $seenNumbers[$deliveryNumber] = true;
    }

    $presetStmt = $conn->prepare('SELECT id, label, adjustment_amount FROM delivery_charge_presets WHERE id=? AND user_id=? AND active=1 LIMIT 1');
    $presetStmt->bind_param('ii', $presetId, $userId);
    $presetStmt->execute();
    $preset = $presetStmt->get_result()->fetch_assoc();
    if (!$preset) throw new RuntimeException('Selected delivery preset is inactive or not allowed', 422);

    $customerStmt = $conn->prepare("SELECT cc.id AS customer_id, cc.customer_name, cc.usd_to_collect,
      cc.received_at, cc.delivery_method, cc.delivery_number, cc.delivery_assignment_status,
      cc.collection_status, cc.payment_status, cc.base_amount_to_collect, cc.delivery_adjustment,
      cc.final_amount_to_collect, cc.delivery_preset_id, oc.cart_order_number, oc.id AS cart_id,
      o.id AS order_id, o.order_name, o.month_id
      FROM cart_customers cc JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id
      JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
      WHERE cc.id=? AND cc.user_id=? AND o.month_id=? LIMIT 1 FOR UPDATE");
    $customerStmt->bind_param('iii', $customerId, $userId, $monthId);
    if (!$customerStmt->execute()) throw new Exception($customerStmt->error ?: 'Failed to lock customer');
    $customer = $customerStmt->get_result()->fetch_assoc();
    if (!$customer) throw new RuntimeException('Customer not found in the selected month', 404);
    if ($customer['received_at'] === null) throw new RuntimeException('Customer cannot be assigned before the complete shipment is received', 422);
    if ($customer['collection_status'] === 'collected' || $customer['payment_status'] === 'paid' || $customer['delivery_assignment_status'] === 'collected') {
      throw new RuntimeException('Collected customers cannot be reassigned', 409);
    }

    $base = delivery_decimal($customer['base_amount_to_collect'], (float)$customer['usd_to_collect']) ?? 0.0;
    $adjustment = (float)$preset['adjustment_amount'];
    $final = round($base + $adjustment, 2);
    if ($final < 0) throw new RuntimeException('Delivery adjustment would produce a negative amount', 422);

    if ($method === 'courier') {
      $duplicateStmt = $conn->prepare("SELECT cc.id FROM cart_customers cc
        JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id
        JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
        WHERE cc.user_id=? AND o.month_id=?
          AND cc.delivery_number=? AND cc.id<>? LIMIT 1 FOR UPDATE");
      $duplicateStmt->bind_param('iiii', $userId, $monthId, $deliveryNumber, $customerId);
      $duplicateStmt->execute();
      if ($duplicateStmt->get_result()->fetch_assoc()) throw new RuntimeException('Delivery number is already used in this month', 409);
    }

    $before = [
      'delivery_method' => $customer['delivery_method'],
      'delivery_number' => $customer['delivery_number'],
      'delivery_assignment_status' => $customer['delivery_assignment_status'],
      'delivery_preset_id' => $customer['delivery_preset_id'],
      'delivery_adjustment' => (float)($customer['delivery_adjustment'] ?? 0),
      'final_amount' => delivery_final_amount($customer),
    ];
    $updateStmt = $conn->prepare("UPDATE cart_customers SET delivery_method=?, delivery_number=?,
      delivery_assignment_status='assigned', collection_status='pending', payment_status='unpaid',
      base_amount_to_collect=?, delivery_adjustment=?, final_amount_to_collect=?, delivery_preset_id=?,
      delivery_assigned_at=NOW(), delivery_month_id=?, status='withdelivery', delivery_status='added'
      WHERE id=? AND user_id=?");
    $updateStmt->bind_param('sidddiiii', $method, $deliveryNumber, $base, $adjustment, $final, $presetId, $monthId, $customerId, $userId);
    if (!$updateStmt->execute()) throw new Exception($updateStmt->error ?: 'Failed to save delivery assignment');

    $after = [
      'delivery_method' => $method,
      'delivery_number' => $deliveryNumber,
      'delivery_assignment_status' => 'assigned',
      'delivery_preset_id' => $presetId,
      'delivery_preset_label' => $preset['label'],
      'delivery_adjustment' => $adjustment,
      'base_amount' => $base,
      'final_amount' => $final,
    ];
    $action = $customer['delivery_assignment_status'] === 'assigned' ? 'delivery_assignment_changed' : 'delivery_assigned';
    activity_append($conn, $userId, $monthId, 'customer', $customerId, $action, $before, $after);
    $updated[] = ['customer_id' => $customerId, 'delivery_method' => $method, 'delivery_number' => $deliveryNumber, 'final_amount' => $final];
  }
  $conn->commit();
  echo json_encode(['ok' => true, 'updated' => $updated]);
} catch (Throwable $e) {
  $conn->rollback();
  $statusCode = $e instanceof RuntimeException && $e->getCode() >= 400 ? $e->getCode() : 500;
  http_response_code($statusCode);
  error_log('[shein-php] assign delivery failure: ' . (string)$e);
  echo json_encode(['ok' => false, 'error' => backend_public_exception_message($e, 'Failed to assign delivery')]);
}
