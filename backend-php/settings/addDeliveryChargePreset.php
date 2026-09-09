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
$label = trim((string)($data['label'] ?? ''));
$amount = isset($data['adjustment_amount']) ? (float)$data['adjustment_amount'] : null;
$sortOrder = (int)($data['sort_order'] ?? 0);
if ($label === '' || strlen($label) > 32 || $amount === null || !is_finite($amount)) {
  http_response_code(400); echo json_encode(['ok' => false, 'error' => 'label and a finite adjustment_amount are required']); exit;
}
$stmt = $conn->prepare('INSERT INTO delivery_charge_presets (user_id, label, adjustment_amount, active, sort_order) VALUES (?, ?, ?, 1, ?)');
$stmt->bind_param('isdi', $userId, $label, $amount, $sortOrder);
if (!$stmt->execute()) {
  http_response_code($stmt->errno === 1062 ? 409 : 500);
  echo json_encode(['ok' => false, 'error' => $stmt->errno === 1062 ? 'A preset with this label already exists' : 'Internal server error']); exit;
}
echo json_encode(['ok' => true, 'id' => (int)$stmt->insert_id]);
