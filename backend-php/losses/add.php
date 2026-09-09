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
if (!is_array($data)) losses_json_error(400, 'Invalid JSON body');
$monthId = (int)($data['month_id'] ?? 0);
$orderId = (int)($data['order_id'] ?? 0);
$customerId = (int)($data['customer_id'] ?? 0);
$lossType = trim((string)($data['loss_type'] ?? $data['type'] ?? ''));
$amount = isset($data['amount']) ? (float)$data['amount'] : 0.0;
$description = trim((string)($data['description'] ?? $data['note'] ?? ''));
if ($monthId <= 0 || $orderId <= 0 || $customerId <= 0 || $lossType === '' || !is_finite($amount) || $amount <= 0) {
  losses_json_error(400, 'month_id, order_id, customer_id, loss_type, and a positive amount are required');
}
losses_require_month($conn, $userId, $monthId);

$stmt = $conn->prepare("SELECT cc.id AS customer_id, cc.customer_name, cc.cart_id, oc.cart_order_number,
  o.id AS order_id, o.order_name, o.month_id
  FROM cart_customers cc JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id
  JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
  WHERE cc.id=? AND cc.user_id=? AND o.id=? AND o.month_id=? LIMIT 1");
$stmt->bind_param('iiii', $customerId, $userId, $orderId, $monthId);
$stmt->execute();
$customer = $stmt->get_result()->fetch_assoc();
if (!$customer) losses_json_error(422, 'Selected customer does not belong to the selected order and month');

$ref = trim((string)$customer['customer_name']) . ' | order ' . trim((string)$customer['order_name']) . ' / cart ' . trim((string)$customer['cart_order_number']);
$sourceKey = 'order-first|' . $orderId . '|' . $customerId . '|' . bin2hex(random_bytes(8));
$conn->begin_transaction();
try {
  $insert = $conn->prepare("INSERT INTO delivery_losses
    (month_id, user_id, status, loss_type, amount, signed_diff, description,
     customer_id, customer_name_snapshot, order_id, order_name_snapshot, cart_id,
     cart_order_number_snapshot, ref_label, source_key, confirmed_at)
    VALUES (?, ?, 'confirmed', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
  $cartId = (int)$customer['cart_id'];
  $customerName = (string)$customer['customer_name'];
  $orderName = (string)$customer['order_name'];
  $cartNumber = (string)$customer['cart_order_number'];
  $insert->bind_param('iisdsisisisss', $monthId, $userId, $lossType, $amount, $description, $customerId, $customerName, $orderId, $orderName, $cartId, $cartNumber, $ref, $sourceKey);
  if (!$insert->execute()) throw new Exception($insert->error ?: 'Failed to create loss');
  $lossId = (int)$insert->insert_id;
  activity_append($conn, $userId, $monthId, 'loss', $lossId, 'loss_created', null, [
    'loss_type' => $lossType, 'amount' => round($amount, 2), 'description' => $description,
    'customer_id' => $customerId, 'order_id' => $orderId, 'cart_id' => $cartId,
  ]);
  $conn->commit();
  echo json_encode(['ok' => true, 'id' => $lossId]);
} catch (Throwable $e) {
  $conn->rollback();
  http_response_code(500);
  error_log('[shein-php] create loss failure: ' . (string)$e);
  echo json_encode(['ok' => false, 'error' => backend_public_exception_message($e, 'Failed to create loss')]);
}
