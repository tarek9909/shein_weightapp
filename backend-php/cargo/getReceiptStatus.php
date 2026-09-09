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
$orderId = (int)($_GET['order_id'] ?? 0);
if ($orderId <= 0) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'order_id is required']);
  exit;
}

$stmt = $conn->prepare("SELECT oc.id AS cart_id, oc.order_id, oc.cart_order_number,
    oc.shein_order_no, oc.shein_tracking_no, oc.shein_split_tracking_numbers_json,
    o.order_name, o.month_id
    FROM order_carts oc JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
    JOIN month m ON m.id=o.month_id AND m.user_id=oc.user_id
    WHERE o.id=? AND o.user_id=?");
$stmt->bind_param('ii', $orderId, $userId);
$stmt->execute();
$result = $stmt->get_result();
$groups = [];
$monthId = 0;
$orderName = null;
while ($row = $result->fetch_assoc()) {
  $expected = shipment_expected_tracking_numbers($row);
  if (!$expected) continue;
  $key = shipment_group_key($expected);
  $monthId = (int)$row['month_id'];
  $orderName = $row['order_name'];
  if (!isset($groups[$key])) $groups[$key] = ['tracking_numbers' => $expected, 'carts' => []];
  $groups[$key]['carts'][] = [
    'cart_id' => (int)$row['cart_id'],
    'cart_order_number' => $row['cart_order_number'],
    'shein_order_no' => $row['shein_order_no'],
  ];
}
if (!$monthId) {
  http_response_code(404);
  echo json_encode(['ok' => false, 'error' => 'Order not found or has no tracking data']);
  exit;
}

$allTracking = [];
foreach ($groups as $group) $allTracking = array_merge($allTracking, $group['tracking_numbers']);
$receipts = shipment_receipts_for_tracking($conn, $userId, $allTracking);
$out = [];
foreach ($groups as $key => $group) {
  $state = shipment_state($group['tracking_numbers'], $receipts);
  $parts = [];
  foreach ($group['tracking_numbers'] as $tracking) {
    $parts[] = [
      'tracking_no' => $tracking,
      'received' => isset($receipts[$tracking]),
      'received_at' => $receipts[$tracking]['received_at'] ?? null,
    ];
  }
  $out[] = [
    'shipment_group_key' => $key,
    'tracking_numbers' => $group['tracking_numbers'],
    'parts' => $parts,
    'received_count' => $state['received_count'],
    'expected_count' => $state['expected_count'],
    'receipt_status' => $state['status'],
    'shipment_complete' => $state['complete'],
    'related_carts' => $group['carts'],
  ];
}

echo json_encode(['ok' => true, 'order_id' => $orderId, 'order_name' => $orderName, 'month_id' => $monthId, 'shipments' => $out]);
