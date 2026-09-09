<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require_once '../db.php';
require_once '../auth/auth.php';
require_once '_common.php';

$payload = require_auth();
$userId = (int)($payload['user_id'] ?? 0);
$monthId = (int)($_GET['month_id'] ?? 0);
$query = trim((string)($_GET['q'] ?? ''));
$status = strtolower(trim((string)($_GET['status'] ?? 'all')));
if ($monthId <= 0) delivery_json_error(400, 'month_id is required');

$monthCheck = $conn->prepare('SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1');
$monthCheck->bind_param('ii', $monthId, $userId);
$monthCheck->execute();
if (!$monthCheck->get_result()->fetch_assoc()) delivery_json_error(403, 'Invalid month for this user');

$sql = "SELECT cc.id AS customer_id, cc.cart_id, cc.customer_name, cc.usd_to_collect,
    cc.delivery_charge_usd, cc.delivery_number, cc.status AS legacy_status,
    cc.delivery_status AS legacy_delivery_status, cc.received_at, cc.delivery_method,
    cc.delivery_assignment_status, cc.collection_status, cc.payment_status,
    cc.base_amount_to_collect, cc.delivery_adjustment, cc.final_amount_to_collect,
    cc.delivery_preset_id, cc.collection_payment_id, cc.collected_at, cc.delivery_assigned_at,
    oc.cart_order_number, oc.shein_order_no, oc.shein_carrier, oc.shein_tracking_no,
    oc.shein_split_tracking_numbers_json, o.id AS order_id, o.order_name, o.month_id
    FROM cart_customers cc
    JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id
    JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
    WHERE cc.user_id=? AND o.month_id=?";
$types = 'ii';
$params = [$userId, $monthId];
if ($query !== '') {
  $like = '%' . $query . '%';
  $sql .= " AND (cc.customer_name LIKE ? OR CAST(cc.id AS CHAR) LIKE ?
    OR CAST(COALESCE(cc.delivery_number, '') AS CHAR) LIKE ?
    OR oc.cart_order_number LIKE ? OR COALESCE(o.order_name, '') LIKE ?
    OR COALESCE(oc.shein_order_no, '') LIKE ? OR COALESCE(oc.shein_tracking_no, '') LIKE ?
    OR COALESCE(oc.shein_split_tracking_numbers_json, '') LIKE ?)";
  $types .= 'ssssssss';
  array_push($params, $like, $like, $like, $like, $like, $like, $like, $like);
}
if ($status === 'ready') $sql .= " AND cc.received_at IS NOT NULL AND cc.delivery_assignment_status='unassigned' AND cc.collection_status='pending'";
elseif ($status === 'assigned') $sql .= " AND cc.delivery_assignment_status='assigned' AND cc.collection_status='pending'";
elseif ($status === 'collected') $sql .= " AND (cc.collection_status='collected' OR cc.payment_status='paid')";
elseif ($status === 'awaiting_receipt') $sql .= " AND cc.received_at IS NULL AND cc.delivery_assignment_status='unassigned'";
$sql .= ' ORDER BY cc.id DESC LIMIT 1000';

$stmt = $conn->prepare($sql);
if (!$stmt) delivery_json_error(500, 'Internal server error');
$refs = [&$types];
foreach ($params as $index => $value) $refs[] = &$params[$index];
call_user_func_array([$stmt, 'bind_param'], $refs);
if (!$stmt->execute()) delivery_json_error(500, 'Internal server error');

$rows = [];
$result = $stmt->get_result();
while ($row = $result->fetch_assoc()) {
  $base = delivery_decimal($row['base_amount_to_collect'], (float)$row['usd_to_collect']) ?? 0.0;
  $adjustment = delivery_decimal($row['delivery_adjustment'], 0.0) ?? 0.0;
  $final = delivery_decimal($row['final_amount_to_collect'], $base + $adjustment) ?? ($base + $adjustment);
  $row['customer_id'] = (int)$row['customer_id'];
  $row['cart_id'] = (int)$row['cart_id'];
  $row['order_id'] = (int)$row['order_id'];
  $row['month_id'] = (int)$row['month_id'];
  $row['is_received'] = $row['received_at'] !== null;
  $row['is_assigned'] = $row['delivery_assignment_status'] === 'assigned';
  $row['is_collected'] = $row['collection_status'] === 'collected' || $row['payment_status'] === 'paid';
  $row['base_amount'] = round($base, 2);
  $row['delivery_adjustment'] = round($adjustment, 2);
  $row['final_amount'] = round((float)$final, 2);
  $rows[] = $row;
}

echo json_encode(['ok' => true, 'customers' => $rows]);
