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
$type = trim((string)($data['loss_type'] ?? $data['type'] ?? ''));
$amount = isset($data['amount']) ? (float)$data['amount'] : 0.0;
$description = trim((string)($data['description'] ?? ''));
if ($id <= 0 || $type === '' || !is_finite($amount) || $amount <= 0) { http_response_code(400); echo json_encode(['ok' => false, 'error' => 'Invalid loss update']); exit; }
$stmt = $conn->prepare('SELECT * FROM delivery_losses WHERE id=? AND user_id=? AND reversed_at IS NULL LIMIT 1');
$stmt->bind_param('ii', $id, $userId); $stmt->execute(); $before = $stmt->get_result()->fetch_assoc();
if (!$before) { http_response_code(404); echo json_encode(['ok' => false, 'error' => 'Loss not found']); exit; }
$conn->begin_transaction();
try {
  $update = $conn->prepare('UPDATE delivery_losses SET loss_type=?, amount=?, description=? WHERE id=? AND user_id=? AND reversed_at IS NULL');
  if (!$update) throw new Exception($conn->error ?: 'Failed to prepare loss update');
  $update->bind_param('sdsii', $type, $amount, $description, $id, $userId);
  if (!$update->execute() || $update->affected_rows !== 1) throw new Exception($update->error ?: 'Loss was not updated');
  activity_append($conn, $userId, (int)$before['month_id'], 'loss', $id, 'loss_edited', $before, ['loss_type' => $type, 'amount' => $amount, 'description' => $description]);
  $conn->commit();
  echo json_encode(['ok' => true]);
} catch (Throwable $e) {
  $conn->rollback();
  http_response_code(500);
  error_log('[shein-php] update loss failure: ' . (string)$e);
  echo json_encode(['ok' => false, 'error' => backend_public_exception_message($e, 'Failed to update loss')]);
}
