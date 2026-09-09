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
$monthId = (int)($_GET['month_id'] ?? 0);
$query = trim((string)($_GET['q'] ?? ''));

if ($monthId <= 0) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'month_id is required']);
  exit;
}

$monthCheck = $conn->prepare('SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1');
$monthCheck->bind_param('ii', $monthId, $userId);
$monthCheck->execute();
if (!$monthCheck->get_result()->fetch_assoc()) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'Invalid month for this user']);
  exit;
}

$sql = "
  SELECT oc.id AS cart_id, oc.order_id, oc.cart_order_number,
         oc.shein_order_no, oc.shein_carrier, oc.shein_tracking_no,
         oc.shein_status_text, oc.shein_delivered,
         oc.shein_is_split_shipment, oc.shein_split_count,
         oc.shein_split_tracking_numbers_json,
         o.order_name, o.month_id
  FROM order_carts oc
  JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
  WHERE oc.user_id=? AND o.month_id=?
    AND (
      COALESCE(TRIM(oc.shein_tracking_no), '') <> ''
      OR COALESCE(TRIM(oc.shein_split_tracking_numbers_json), '') <> ''
    )";
$types = 'ii';
$params = [$userId, $monthId];
if ($query !== '') {
  $like = '%' . $query . '%';
  $sql .= " AND (
    COALESCE(oc.shein_order_no, '') LIKE ?
    OR COALESCE(oc.shein_tracking_no, '') LIKE ?
    OR COALESCE(oc.shein_split_tracking_numbers_json, '') LIKE ?
    OR COALESCE(oc.cart_order_number, '') LIKE ?
    OR COALESCE(o.order_name, '') LIKE ?
  )";
  $types .= 'sssss';
  array_push($params, $like, $like, $like, $like, $like);
}
$sql .= ' ORDER BY oc.id DESC LIMIT 500';

$stmt = $conn->prepare($sql);
if (!$stmt) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'Internal server error']);
  exit;
}
$refs = [&$types];
foreach ($params as $index => $value) $refs[] = &$params[$index];
call_user_func_array([$stmt, 'bind_param'], $refs);
if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'Internal server error']);
  exit;
}

$rows = [];
$result = $stmt->get_result();
while ($row = $result->fetch_assoc()) {
  $expected = shipment_expected_tracking_numbers($row);
  if (!$expected) continue;
  $row['_expected'] = $expected;
  $rows[] = $row;
}

$allTracking = [];
foreach ($rows as $row) $allTracking = array_merge($allTracking, $row['_expected']);
$receipts = shipment_receipts_for_tracking($conn, $userId, $allTracking);

$out = [];
foreach ($rows as $row) {
  $expected = $row['_expected'];
  $state = shipment_state($expected, $receipts);
  $parts = [];
  foreach ($expected as $tracking) {
    $parts[] = [
      'tracking_no' => $tracking,
      'received' => isset($receipts[$tracking]),
      'received_at' => $receipts[$tracking]['received_at'] ?? null,
    ];
  }
  unset($row['_expected']);
  $out[] = [
    'cart_id' => (int)$row['cart_id'],
    'order_id' => (int)$row['order_id'],
    'month_id' => (int)$row['month_id'],
    'order_name' => $row['order_name'],
    'cart_order_number' => $row['cart_order_number'],
    'shein_order_no' => $row['shein_order_no'],
    'carrier' => $row['shein_carrier'],
    'primary_tracking_no' => shipment_normalize_tracking((string)$row['shein_tracking_no']),
    'tracking_numbers' => $expected,
    'parts' => $parts,
    'shipment_group_key' => shipment_group_key($expected),
    'is_split_shipment' => count($expected) > 1 || !empty($row['shein_is_split_shipment']),
    'split_count' => max((int)($row['shein_split_count'] ?? 0), count($expected)),
    'delivered' => (bool)$row['shein_delivered'],
    'status_text' => $row['shein_status_text'],
    'received_count' => $state['received_count'],
    'expected_count' => $state['expected_count'],
    'receipt_status' => $state['status'],
    'shipment_complete' => $state['complete'],
  ];
}

echo json_encode(['ok' => true, 'carts' => $out]);
