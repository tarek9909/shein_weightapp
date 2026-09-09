<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require_once '../db.php';
require_once '../auth/auth.php';
require_once '_shipment.php';

$payload = require_auth();
$userId = (int)($payload['user_id'] ?? 0);
$cartId = (int)($_GET['cart_id'] ?? 0);
if ($cartId <= 0) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'cart_id is required']);
  exit;
}

$stmt = $conn->prepare("SELECT oc.id AS cart_id, oc.order_id, oc.cart_order_number,
    oc.shein_order_no, oc.shein_carrier, oc.shein_tracking_no, oc.shein_status_text,
    oc.shein_delivered, oc.shein_is_split_shipment, oc.shein_split_count,
    oc.shein_split_tracking_numbers_json, o.order_name, o.month_id
    FROM order_carts oc JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
    JOIN month m ON m.id=o.month_id AND m.user_id=oc.user_id
    WHERE oc.id=? AND oc.user_id=? LIMIT 1");
$stmt->bind_param('ii', $cartId, $userId);
$stmt->execute();
$selected = $stmt->get_result()->fetch_assoc();
if (!$selected) {
  http_response_code(404);
  echo json_encode(['ok' => false, 'error' => 'Cart not found']);
  exit;
}

$expected = shipment_expected_tracking_numbers($selected);
if (!$expected) {
  http_response_code(422);
  echo json_encode(['ok' => false, 'error' => 'Cart has no persisted tracking data']);
  exit;
}
$groupKey = shipment_group_key($expected);

$cartsStmt = $conn->prepare("SELECT oc.id AS cart_id, oc.order_id, oc.cart_order_number,
    oc.shein_order_no, oc.shein_carrier, oc.shein_tracking_no, oc.shein_status_text,
    oc.shein_delivered, oc.shein_is_split_shipment, oc.shein_split_count,
    oc.shein_split_tracking_numbers_json, o.order_name, o.month_id
    FROM order_carts oc JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
    WHERE oc.user_id=? AND o.month_id=?");
$monthId = (int)$selected['month_id'];
$cartsStmt->bind_param('ii', $userId, $monthId);
$cartsStmt->execute();
$relatedCarts = [];
$allTracking = [];
$cartsResult = $cartsStmt->get_result();
while ($row = $cartsResult->fetch_assoc()) {
  $rowExpected = shipment_expected_tracking_numbers($row);
  if (!$rowExpected || shipment_group_key($rowExpected) !== $groupKey) continue;
  $allTracking = array_merge($allTracking, $rowExpected);
  $relatedCarts[] = [
    'cart_id' => (int)$row['cart_id'],
    'order_id' => (int)$row['order_id'],
    'order_name' => $row['order_name'],
    'cart_order_number' => $row['cart_order_number'],
    'shein_order_no' => $row['shein_order_no'],
  ];
}
$allTracking = array_values(array_unique($allTracking));
$receipts = shipment_receipts_for_tracking($conn, $userId, $allTracking);
$state = shipment_state($allTracking, $receipts);

$customerStmt = $conn->prepare("SELECT cc.id, cc.customer_name, cc.received_at,
    cc.delivery_assignment_status, cc.collection_status, cc.payment_status,
    c.cart_order_number, o.id AS order_id, o.order_name
    FROM cart_customers cc JOIN order_carts c ON c.id=cc.cart_id AND c.user_id=cc.user_id
    JOIN orders o ON o.id=c.order_id AND o.user_id=c.user_id
    WHERE cc.user_id=? AND c.id IN (" . implode(',', array_fill(0, count($relatedCarts), '?')) . ")
    ORDER BY cc.id DESC");
$customerParams = array_merge([$userId], array_map(fn($row) => (int)$row['cart_id'], $relatedCarts));
$customerTypes = 'i' . str_repeat('i', count($relatedCarts));
$refs = [&$customerTypes];
foreach ($customerParams as $index => $value) $refs[] = &$customerParams[$index];
call_user_func_array([$customerStmt, 'bind_param'], $refs);
$customerStmt->execute();
$customers = [];
$customerResult = $customerStmt->get_result();
while ($row = $customerResult->fetch_assoc()) $customers[] = $row;

$parts = [];
foreach ($allTracking as $tracking) {
  $parts[] = [
    'tracking_no' => $tracking,
    'received' => isset($receipts[$tracking]),
    'received_at' => $receipts[$tracking]['received_at'] ?? null,
  ];
}

echo json_encode([
  'ok' => true,
  'shipment' => [
    'cart_id' => $cartId,
    'month_id' => $monthId,
    'shipment_group_key' => $groupKey,
    'tracking_numbers' => $allTracking,
    'parts' => $parts,
    'received_count' => $state['received_count'],
    'expected_count' => $state['expected_count'],
    'receipt_status' => $state['status'],
    'shipment_complete' => $state['complete'],
    'related_carts' => $relatedCarts,
    'customers' => $customers,
  ],
]);
