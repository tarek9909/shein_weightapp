<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);
require_once '../db.php';
require_once '../auth/auth.php';
$payload = require_auth();
$userId = (int)($payload['user_id'] ?? 0);
$monthId = (int)($_GET['month_id'] ?? 0);
if ($monthId <= 0) { http_response_code(400); echo json_encode(['ok' => false, 'error' => 'month_id is required']); exit; }
$monthStmt = $conn->prepare('SELECT id, name FROM month WHERE id=? AND user_id=? LIMIT 1');
$monthStmt->bind_param('ii', $monthId, $userId); $monthStmt->execute(); $month = $monthStmt->get_result()->fetch_assoc();
if (!$month) { http_response_code(403); echo json_encode(['ok' => false, 'error' => 'Invalid month for this user']); exit; }

$summary = ['payments_total' => 0.0, 'payment_count' => 0, 'customs_total' => 0.0, 'loss_total' => 0.0,
  'order_cost_total' => 0.0, 'order_collect_total' => 0.0, 'received_customer_total' => 0.0,
  'assigned_customer_total' => 0.0, 'collected_customer_total' => 0.0, 'uncollected_customer_total' => 0.0,
  'customer_count' => 0, 'received_customer_count' => 0, 'assigned_customer_count' => 0, 'collected_customer_count' => 0,
  'uncollected_customer_count' => 0];
$stmt = $conn->prepare('SELECT COUNT(*) AS count, COALESCE(SUM(payment_amount),0) AS total FROM payments WHERE user_id=? AND month_id=?');
$stmt->bind_param('ii', $userId, $monthId); $stmt->execute(); $row = $stmt->get_result()->fetch_assoc();
$summary['payment_count'] = (int)$row['count']; $summary['payments_total'] = (float)$row['total'];
$stmt = $conn->prepare('SELECT COALESCE(SUM(customs_fee),0) AS total FROM customs WHERE user_id=? AND month_id=?');
$stmt->bind_param('ii', $userId, $monthId); $stmt->execute(); $summary['customs_total'] = (float)$stmt->get_result()->fetch_assoc()['total'];
$stmt = $conn->prepare('SELECT COALESCE(SUM(amount),0) AS total FROM delivery_losses WHERE user_id=? AND month_id=? AND reversed_at IS NULL');
$stmt->bind_param('ii', $userId, $monthId); $stmt->execute(); $summary['loss_total'] = (float)$stmt->get_result()->fetch_assoc()['total'];
$stmt = $conn->prepare('SELECT COALESCE(SUM(CAST(order_details AS DECIMAL(10,2))),0) AS cost_total,
  COALESCE(SUM(amount_to_collect),0) AS collect_total FROM orders WHERE user_id=? AND month_id=?');
$stmt->bind_param('ii', $userId, $monthId); $stmt->execute(); $row = $stmt->get_result()->fetch_assoc();
$summary['order_cost_total'] = (float)$row['cost_total']; $summary['order_collect_total'] = (float)$row['collect_total'];
$stmt = $conn->prepare("SELECT COUNT(*) AS customer_count,
  SUM(received_at IS NOT NULL) AS received_count,
  SUM(delivery_assignment_status='assigned') AS assigned_count,
  SUM(collection_status='collected' OR payment_status='paid') AS collected_count,
  SUM(received_at IS NOT NULL AND collection_status='pending' AND payment_status='unpaid') AS uncollected_count,
  COALESCE(SUM(CASE WHEN received_at IS NOT NULL THEN COALESCE(final_amount_to_collect, base_amount_to_collect, usd_to_collect) ELSE 0 END),0) AS received_total,
  COALESCE(SUM(CASE WHEN delivery_assignment_status='assigned' THEN COALESCE(final_amount_to_collect, base_amount_to_collect, usd_to_collect) ELSE 0 END),0) AS assigned_total,
  COALESCE(SUM(CASE WHEN collection_status='collected' OR payment_status='paid' THEN COALESCE(final_amount_to_collect, base_amount_to_collect, usd_to_collect) ELSE 0 END),0) AS collected_total,
  COALESCE(SUM(CASE WHEN received_at IS NOT NULL AND collection_status='pending' AND payment_status='unpaid' THEN COALESCE(final_amount_to_collect, base_amount_to_collect, usd_to_collect) ELSE 0 END),0) AS uncollected_total
  FROM cart_customers cc JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id
  JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
  WHERE cc.user_id=? AND o.month_id=?");
$stmt->bind_param('ii', $userId, $monthId); $stmt->execute(); $row = $stmt->get_result()->fetch_assoc();
$summary['customer_count'] = (int)$row['customer_count']; $summary['received_customer_count'] = (int)$row['received_count'];
$summary['assigned_customer_count'] = (int)$row['assigned_count']; $summary['collected_customer_count'] = (int)$row['collected_count'];
$summary['uncollected_customer_count'] = (int)$row['uncollected_count'];
$summary['received_customer_total'] = (float)$row['received_total']; $summary['assigned_customer_total'] = (float)$row['assigned_total'];
$summary['collected_customer_total'] = (float)$row['collected_total']; $summary['uncollected_customer_total'] = (float)$row['uncollected_total'];
foreach ($summary as $key => $value) if (is_float($value)) $summary[$key] = round($value, 2);
$summary['reconciliation'] = [
  'payment_total' => $summary['payments_total'],
  'collection_total' => $summary['collected_customer_total'],
  'payment_collection_difference' => round($summary['payments_total'] - $summary['collected_customer_total'], 2),
  'loss_total' => $summary['loss_total'],
  'customs_total' => $summary['customs_total'],
];
echo json_encode(['ok' => true, 'month' => $month, 'summary' => $summary]);
