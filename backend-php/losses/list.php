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
$status = strtolower(trim((string)($_GET['status'] ?? 'active')));
if ($monthId <= 0) losses_json_error(400, 'month_id is required');
losses_require_month($conn, $userId, $monthId);
$sql = "SELECT id, month_id, status, loss_type, amount, description, customer_id,
  customer_name_snapshot, order_id, order_name_snapshot, cart_id, cart_order_number_snapshot,
  ref_label, created_at, confirmed_at, reversed_at, reversal_reason
  FROM delivery_losses WHERE user_id=? AND month_id=?";
$types = 'ii';
$params = [$userId, $monthId];
if ($status === 'active') $sql .= ' AND reversed_at IS NULL';
elseif ($status === 'reversed') $sql .= ' AND reversed_at IS NOT NULL';
if ($query !== '') {
  $like = '%' . $query . '%';
  $sql .= " AND (loss_type LIKE ? OR description LIKE ? OR ref_label LIKE ? OR customer_name_snapshot LIKE ? OR order_name_snapshot LIKE ? OR cart_order_number_snapshot LIKE ?)";
  $types .= 'ssssss';
  array_push($params, $like, $like, $like, $like, $like, $like);
}
$sql .= ' ORDER BY id DESC LIMIT 500';
$stmt = $conn->prepare($sql);
$refs = [&$types];
foreach ($params as $index => $value) $refs[] = &$params[$index];
call_user_func_array([$stmt, 'bind_param'], $refs);
$stmt->execute();
$rows = [];
$result = $stmt->get_result();
while ($row = $result->fetch_assoc()) { $row['id'] = (int)$row['id']; $row['amount'] = (float)$row['amount']; $rows[] = $row; }
echo json_encode(['ok' => true, 'losses' => $rows]);
