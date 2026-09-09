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
if (!is_array($data)) delivery_json_error(400, 'Invalid JSON body');
$monthId = (int)($data['month_id'] ?? 0);
$ids = delivery_ids_from_payload($data);
if ($monthId <= 0 || !$ids) delivery_json_error(400, 'month_id and customer_ids are required');

$conn->begin_transaction();
try {
  foreach ($ids as $customerId) {
    $stmt = $conn->prepare("SELECT cc.id, cc.delivery_method, cc.delivery_number, cc.delivery_assignment_status,
      cc.delivery_preset_id, cc.delivery_adjustment, cc.final_amount_to_collect
      FROM cart_customers cc JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id
      JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
      WHERE cc.id=? AND cc.user_id=? AND o.month_id=? LIMIT 1 FOR UPDATE");
    $stmt->bind_param('iii', $customerId, $userId, $monthId);
    if (!$stmt->execute()) throw new Exception($stmt->error ?: 'Failed to load assignment');
    $before = $stmt->get_result()->fetch_assoc();
    if (!$before) throw new RuntimeException('Customer not found in the selected month', 404);
    if ($before['delivery_assignment_status'] === 'collected') throw new RuntimeException('Collected customers cannot be reverted', 409);

    $update = $conn->prepare("UPDATE cart_customers SET delivery_method=NULL, delivery_number=NULL,
      delivery_assignment_status='unassigned', collection_status='pending', payment_status='unpaid',
      delivery_preset_id=NULL, delivery_adjustment=0, final_amount_to_collect=base_amount_to_collect,
      delivery_assigned_at=NULL, delivery_month_id=NULL, status='pending', delivery_status='not added'
      WHERE id=? AND user_id=?");
    $update->bind_param('ii', $customerId, $userId);
    if (!$update->execute()) throw new Exception($update->error ?: 'Failed to revert assignment');
    activity_append($conn, $userId, $monthId, 'customer', $customerId, 'delivery_assignment_reverted', $before, [
      'delivery_method' => null,
      'delivery_number' => null,
      'delivery_assignment_status' => 'unassigned',
      'delivery_preset_id' => null,
      'delivery_adjustment' => 0,
    ]);
  }
  $conn->commit();
  echo json_encode(['ok' => true, 'reverted' => count($ids)]);
} catch (Throwable $e) {
  $conn->rollback();
  $statusCode = $e instanceof RuntimeException && $e->getCode() >= 400 ? $e->getCode() : 500;
  http_response_code($statusCode);
  error_log('[shein-php] revert assignment failure: ' . (string)$e);
  echo json_encode(['ok' => false, 'error' => backend_public_exception_message($e, 'Failed to revert assignment')]);
}
