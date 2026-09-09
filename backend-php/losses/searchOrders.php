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
if ($monthId <= 0) losses_json_error(400, 'month_id is required');
losses_require_month($conn, $userId, $monthId);

$sql = "SELECT id AS order_id, order_name, order_details, amount_to_collect, month_id
  FROM orders WHERE user_id=? AND month_id=?";
$types = 'ii';
$params = [$userId, $monthId];
if ($query !== '') {
  $like = '%' . $query . '%';
  $sql .= " AND (order_name LIKE ? OR order_details LIKE ? OR CAST(id AS CHAR) LIKE ?)";
  $types .= 'sss';
  array_push($params, $like, $like, $like);
}
$sql .= ' ORDER BY id DESC LIMIT 100';
$stmt = $conn->prepare($sql);
$refs = [&$types];
foreach ($params as $index => $value) $refs[] = &$params[$index];
call_user_func_array([$stmt, 'bind_param'], $refs);
$stmt->execute();
$orders = [];
$result = $stmt->get_result();
while ($row = $result->fetch_assoc()) {
  $row['order_id'] = (int)$row['order_id'];
  $row['month_id'] = (int)$row['month_id'];
  $row['amount_to_collect'] = (float)$row['amount_to_collect'];
  $orders[] = $row;
}
echo json_encode(['ok' => true, 'orders' => $orders]);
