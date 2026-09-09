<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require_once '../db.php';
require_once '../auth/auth.php';
require_once '_shipment.php';
require_once '../lib/activity.php';

$payload = require_auth();
$userId = (int)($payload['user_id'] ?? 0);
$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'Invalid JSON body']);
  exit;
}
$cartId = (int)($data['cart_id'] ?? 0);
$trackingNo = shipment_normalize_tracking((string)($data['tracking_no'] ?? ''));
$source = trim((string)($data['source'] ?? 'manual'));
if ($source === '') $source = 'manual';
if (strlen($source) > 32) $source = substr($source, 0, 32);
if ($cartId <= 0 || $trackingNo === '') {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'cart_id and tracking_no are required']);
  exit;
}

$conn->begin_transaction();
try {
  $cartStmt = $conn->prepare("SELECT oc.id AS cart_id, oc.order_id, oc.cart_order_number,
      oc.shein_order_no, oc.shein_tracking_no, oc.shein_split_tracking_numbers_json,
      o.order_name, o.month_id
      FROM order_carts oc JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
      JOIN month m ON m.id=o.month_id AND m.user_id=oc.user_id
      WHERE oc.id=? AND oc.user_id=? LIMIT 1 FOR UPDATE");
  if (!$cartStmt) throw new Exception($conn->error ?: 'Failed to prepare cart lookup');
  $cartStmt->bind_param('ii', $cartId, $userId);
  if (!$cartStmt->execute()) throw new Exception($cartStmt->error ?: 'Failed to load cart');
  $cart = $cartStmt->get_result()->fetch_assoc();
  if (!$cart) throw new RuntimeException('Cart not found or not allowed', 404);

  $expectedForCart = shipment_expected_tracking_numbers($cart);
  if (!in_array($trackingNo, $expectedForCart, true)) {
    throw new RuntimeException('Tracking number does not belong to the selected cart', 422);
  }
  $groupKey = shipment_group_key($expectedForCart);

  // The same logical group can span joint carts. Rebuild the group from persisted tracking fields.
  $groupStmt = $conn->prepare("SELECT oc.id AS cart_id, oc.order_id, oc.cart_order_number,
      oc.shein_tracking_no, oc.shein_split_tracking_numbers_json, o.order_name, o.month_id
      FROM order_carts oc JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
      WHERE oc.user_id=? AND o.month_id=?");
  $monthId = (int)$cart['month_id'];
  $groupStmt->bind_param('ii', $userId, $monthId);
  if (!$groupStmt->execute()) throw new Exception($groupStmt->error ?: 'Failed to load shipment group');
  $groupCarts = [];
  $expected = [];
  $groupResult = $groupStmt->get_result();
  while ($row = $groupResult->fetch_assoc()) {
    $rowExpected = shipment_expected_tracking_numbers($row);
    if (!$rowExpected || shipment_group_key($rowExpected) !== $groupKey) continue;
    $groupCarts[] = $row;
    $expected = array_merge($expected, $rowExpected);
  }
  $expected = array_values(array_unique($expected));
  sort($expected, SORT_STRING);

  $existing = shipment_receipts_for_tracking($conn, $userId, [$trackingNo], true);
  $inserted = false;
  if (!isset($existing[$trackingNo])) {
    $ins = $conn->prepare("INSERT INTO shipment_receipts
      (user_id, month_id, order_id, cart_id, shipment_group_key, tracking_no, receipt_status, received_by, source)
      VALUES (?, ?, ?, ?, ?, ?, 'received', ?, ?)");
    if (!$ins) throw new Exception($conn->error ?: 'Failed to prepare receipt insert');
    $orderId = (int)$cart['order_id'];
    $groupKeyForInsert = $groupKey;
    $ins->bind_param('iiiissis', $userId, $monthId, $orderId, $cartId, $groupKeyForInsert, $trackingNo, $userId, $source);
    if (!$ins->execute()) throw new Exception($ins->error ?: 'Failed to receive tracking number');
    $inserted = true;
  }

  $receipts = shipment_receipts_for_tracking($conn, $userId, $expected, true);
  $state = shipment_state($expected, $receipts);
  $newlyReceivedCustomers = [];
  if ($state['complete']) {
    $cartIds = array_values(array_unique(array_map(fn($row) => (int)$row['cart_id'], $groupCarts)));
    if ($cartIds) {
      $customerSql = "SELECT cc.id, cc.customer_name, cc.received_at, cc.delivery_assignment_status,
          cc.collection_status, cc.payment_status, c.cart_order_number, c.order_id, o.order_name
          FROM cart_customers cc JOIN order_carts c ON c.id=cc.cart_id AND c.user_id=cc.user_id
          JOIN orders o ON o.id=c.order_id AND o.user_id=c.user_id
          WHERE cc.user_id=? AND cc.cart_id IN (" . implode(',', array_fill(0, count($cartIds), '?')) . ")
          FOR UPDATE";
      $customerStmt = $conn->prepare($customerSql);
      $params = array_merge([$userId], $cartIds);
      $types = 'i' . str_repeat('i', count($cartIds));
      $refs = [&$types];
      foreach ($params as $index => $value) $refs[] = &$params[$index];
      call_user_func_array([$customerStmt, 'bind_param'], $refs);
      if (!$customerStmt->execute()) throw new Exception($customerStmt->error ?: 'Failed to load shipment customers');
      $customerResult = $customerStmt->get_result();
      while ($customer = $customerResult->fetch_assoc()) {
        if ($customer['received_at'] !== null) continue;
        $newlyReceivedCustomers[] = $customer;
      }
      $updateSql = "UPDATE cart_customers SET received_at=COALESCE(received_at, NOW())
        WHERE user_id=? AND cart_id IN (" . implode(',', array_fill(0, count($cartIds), '?')) . ")";
      $updateStmt = $conn->prepare($updateSql);
      $refs = [&$types];
      $updateParams = array_merge([$userId], $cartIds);
      foreach ($updateParams as $index => $value) $refs[] = &$updateParams[$index];
      call_user_func_array([$updateStmt, 'bind_param'], $refs);
      if (!$updateStmt->execute()) throw new Exception($updateStmt->error ?: 'Failed to mark customers received');
    }
  }

  if ($inserted) {
    activity_append($conn, $userId, $monthId, 'shipment', $cartId, 'shipment_tracking_received', null, [
      'tracking_no' => $trackingNo,
      'shipment_group_key' => $groupKey,
      'received_count' => $state['received_count'],
      'expected_count' => $state['expected_count'],
      'receipt_status' => $state['status'],
    ], ['source' => $source]);
  }
  if ($state['complete'] && $inserted) {
    activity_append($conn, $userId, $monthId, 'shipment', $cartId, 'shipment_completed', null, [
      'shipment_group_key' => $groupKey,
      'received_count' => $state['received_count'],
      'expected_count' => $state['expected_count'],
      'tracking_numbers' => $expected,
    ]);
  }
  foreach ($newlyReceivedCustomers as $customer) {
    activity_append($conn, $userId, $monthId, 'customer', (int)$customer['id'], 'customer_received', null, [
      'customer_id' => (int)$customer['id'],
      'customer_name' => $customer['customer_name'],
      'order_id' => (int)$customer['order_id'],
      'order_name' => $customer['order_name'],
      'cart_order_number' => $customer['cart_order_number'],
      'shipment_group_key' => $groupKey,
    ]);
  }

  $conn->commit();
  echo json_encode([
    'ok' => true,
    'idempotent' => !$inserted,
    'tracking_no' => $trackingNo,
    'shipment_group_key' => $groupKey,
    'received_count' => $state['received_count'],
    'expected_count' => $state['expected_count'],
    'receipt_status' => $state['status'],
    'shipment_complete' => $state['complete'],
    'customers_marked_received' => count($newlyReceivedCustomers),
  ]);
} catch (Throwable $e) {
  $conn->rollback();
  $status = $e instanceof RuntimeException && $e->getCode() >= 400 ? $e->getCode() : 500;
  http_response_code($status);
  error_log('[shein-php] receive shipment failure: ' . (string)$e);
  echo json_encode(['ok' => false, 'error' => backend_public_exception_message($e, 'Failed to receive shipment')]);
}
