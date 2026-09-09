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
$query = trim((string)($_GET['q'] ?? ''));
$entityType = trim((string)($_GET['entity_type'] ?? ''));
$action = trim((string)($_GET['action'] ?? ''));
$from = trim((string)($_GET['from'] ?? ''));
$to = trim((string)($_GET['to'] ?? ''));
if ($monthId <= 0) { http_response_code(400); echo json_encode(['ok' => false, 'error' => 'month_id is required']); exit; }
$monthStmt = $conn->prepare('SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1');
$monthStmt->bind_param('ii', $monthId, $userId); $monthStmt->execute();
if (!$monthStmt->get_result()->fetch_assoc()) { http_response_code(403); echo json_encode(['ok' => false, 'error' => 'Invalid month for this user']); exit; }

$sql = "SELECT id, month_id, entity_type, entity_id, action, before_json, after_json,
  metadata_json, created_by, created_at FROM activity_log WHERE user_id=? AND month_id=?";
$types = 'ii'; $params = [$userId, $monthId];
if ($entityType !== '') { $sql .= ' AND entity_type=?'; $types .= 's'; $params[] = $entityType; }
if ($action !== '') { $sql .= ' AND action=?'; $types .= 's'; $params[] = $action; }
if ($from !== '') { $sql .= ' AND created_at >= ?'; $types .= 's'; $params[] = $from . ' 00:00:00'; }
if ($to !== '') { $sql .= ' AND created_at <= ?'; $types .= 's'; $params[] = $to . ' 23:59:59'; }
if ($query !== '') {
  $like = '%' . $query . '%';
  $sql .= ' AND (action LIKE ? OR entity_type LIKE ? OR CAST(entity_id AS CHAR) LIKE ? OR before_json LIKE ? OR after_json LIKE ? OR metadata_json LIKE ?)';
  $types .= 'ssssss'; array_push($params, $like, $like, $like, $like, $like, $like);
}
$sql .= ' ORDER BY created_at DESC, id DESC LIMIT 1000';
$stmt = $conn->prepare($sql);
$refs = [&$types]; foreach ($params as $index => $value) $refs[] = &$params[$index];
call_user_func_array([$stmt, 'bind_param'], $refs); $stmt->execute();
$events = [];
$result = $stmt->get_result();
while ($row = $result->fetch_assoc()) {
  foreach (['before_json', 'after_json', 'metadata_json'] as $key) $row[$key] = $row[$key] !== null ? json_decode($row[$key], true) : null;
  $row['id'] = (int)$row['id'];
  $row['entity_id'] = $row['entity_id'] === null ? null : (int)$row['entity_id'];
  $row['created_by'] = (int)$row['created_by'];
  $events[] = $row;
}
echo json_encode(['ok' => true, 'events' => $events]);
