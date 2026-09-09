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
if ($id <= 0) { http_response_code(400); echo json_encode(['ok' => false, 'error' => 'id is required']); exit; }
$stmt = $conn->prepare('UPDATE delivery_charge_presets SET active=0 WHERE id=? AND user_id=?');
$stmt->bind_param('ii', $id, $userId);
if (!$stmt->execute()) { http_response_code(500); echo json_encode(['ok' => false, 'error' => 'Internal server error']); exit; }
echo json_encode(['ok' => true, 'affected' => $stmt->affected_rows]);
