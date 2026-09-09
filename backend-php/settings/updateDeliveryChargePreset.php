<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);
require_once '../db.php';
require_once '../auth/auth.php';
$payload = require_auth();
$userId = (int)($payload['user_id'] ?? 0);
$data = json_decode(file_get_contents('php://input'), true);
$id = (int)($data['id'] ?? 0);
$label = trim((string)($data['label'] ?? ''));
$amount = isset($data['adjustment_amount']) ? (float)$data['adjustment_amount'] : null;
$active = array_key_exists('active', (array)$data) ? (int)(bool)$data['active'] : 1;
$sortOrder = (int)($data['sort_order'] ?? 0);
if ($id <= 0 || $label === '' || strlen($label) > 32 || $amount === null || !is_finite($amount)) {
  http_response_code(400); echo json_encode(['ok' => false, 'error' => 'id, label, and a finite adjustment_amount are required']); exit;
}
$stmt = $conn->prepare('UPDATE delivery_charge_presets SET label=?, adjustment_amount=?, active=?, sort_order=? WHERE id=? AND user_id=?');
$stmt->bind_param('sdiiii', $label, $amount, $active, $sortOrder, $id, $userId);
if (!$stmt->execute()) {
  http_response_code($stmt->errno === 1062 ? 409 : 500);
  echo json_encode(['ok' => false, 'error' => $stmt->errno === 1062 ? 'A preset with this label already exists' : 'Internal server error']); exit;
}
echo json_encode(['ok' => true, 'affected' => $stmt->affected_rows]);
