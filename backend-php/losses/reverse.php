<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);
require_once '../db.php';
require_once '../auth/auth.php';
require_once '../lib/activity.php';
$payload = require_auth();
$userId = (int)($payload['user_id'] ?? 0);
$data = json_decode(file_get_contents('php://input'), true);
$id = (int)($data['id'] ?? 0);
$reason = trim((string)($data['reason'] ?? ''));
if ($id <= 0) { http_response_code(400); echo json_encode(['ok' => false, 'error' => 'id is required']); exit; }
$stmt = $conn->prepare('SELECT * FROM delivery_losses WHERE id=? AND user_id=? AND reversed_at IS NULL LIMIT 1');
$stmt->bind_param('ii', $id, $userId); $stmt->execute(); $before = $stmt->get_result()->fetch_assoc();
if (!$before) { http_response_code(404); echo json_encode(['ok' => false, 'error' => 'Active loss not found']); exit; }
$conn->begin_transaction();
try {
  $update = $conn->prepare('UPDATE delivery_losses SET reversed_at=NOW(), reversal_reason=?, reversed_by=? WHERE id=? AND user_id=? AND reversed_at IS NULL');
  if (!$update) throw new Exception($conn->error ?: 'Failed to prepare loss reversal');
  $update->bind_param('siii', $reason, $userId, $id, $userId);
  if (!$update->execute() || $update->affected_rows !== 1) throw new Exception($update->error ?: 'Loss was not reversed');
  activity_append($conn, $userId, (int)$before['month_id'], 'loss', $id, 'loss_reversed', $before, ['reversed_at' => date('Y-m-d H:i:s'), 'reason' => $reason]);
  $conn->commit();
  echo json_encode(['ok' => true]);
} catch (Throwable $e) {
  $conn->rollback();
  http_response_code(500);
  error_log('[shein-php] reverse loss failure: ' . (string)$e);
  echo json_encode(['ok' => false, 'error' => backend_public_exception_message($e, 'Failed to reverse loss')]);
}
