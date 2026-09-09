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
$stmt = $conn->prepare('SELECT id, label, adjustment_amount, active, sort_order FROM delivery_charge_presets WHERE user_id=? ORDER BY sort_order ASC, id ASC');
$stmt->bind_param('i', $userId);
$stmt->execute();
$rows = [];
$result = $stmt->get_result();
while ($row = $result->fetch_assoc()) {
  $row['id'] = (int)$row['id'];
  $row['adjustment_amount'] = (float)$row['adjustment_amount'];
  $row['active'] = (bool)$row['active'];
  $row['sort_order'] = (int)$row['sort_order'];
  $rows[] = $row;
}
echo json_encode(['ok' => true, 'presets' => $rows]);
