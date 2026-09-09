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
$orderId = (int)($_GET['order_id'] ?? 0);
if ($orderId <= 0) losses_json_error(400, 'order_id is required');
$orderStmt = $conn->prepare('SELECT id, month_id, order_name FROM orders WHERE id=? AND user_id=? LIMIT 1');
$orderStmt->bind_param('ii', $orderId, $userId);
$orderStmt->execute();
$order = $orderStmt->get_result()->fetch_assoc();
if (!$order) losses_json_error(404, 'Order not found');

$stmt = $conn->prepare("SELECT cc.id AS customer_id, cc.customer_name, cc.usd_to_collect,
  cc.cart_id, oc.cart_order_number, o.id AS order_id, o.order_name, o.month_id,
  cc.received_at, cc.delivery_assignment_status, cc.collection_status, cc.payment_status
  FROM cart_customers cc JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id
  JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
  WHERE cc.user_id=? AND o.id=? ORDER BY cc.id DESC");
$stmt->bind_param('ii', $userId, $orderId);
$stmt->execute();
$customers = [];
$result = $stmt->get_result();
while ($row = $result->fetch_assoc()) {
  $row['customer_id'] = (int)$row['customer_id'];
  $row['cart_id'] = (int)$row['cart_id'];
  $row['order_id'] = (int)$row['order_id'];
  $customers[] = $row;
}
echo json_encode(['ok' => true, 'order' => $order, 'customers' => $customers]);
