<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") exit(0);

require_once "../db.php";
require_once "../auth/auth.php";
$payload = require_auth();
$user_id = (int)($payload["user_id"] ?? 0);
$data = json_decode(file_get_contents("php://input"), true);
$month_id = (int)($data["month_id"] ?? 0);
$ids = isset($data["ids"]) && is_array($data["ids"]) ? array_values(array_filter(array_map("intval", $data["ids"]))) : [];

if ($month_id <= 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "month_id is required"]);
  exit;
}

$chk = $conn->prepare("SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1");
$chk->bind_param("ii", $month_id, $user_id);
$chk->execute();
if (!$chk->get_result()->fetch_assoc()) {
  http_response_code(403);
  echo json_encode(["ok" => false, "error" => "Invalid month for this user"]);
  exit;
}

if ($ids) {
  $ph = implode(",", array_fill(0, count($ids), "?"));
  $sql = "UPDATE delivery_losses SET status='confirmed', confirmed_at=NOW() WHERE user_id=? AND month_id=? AND status='pending' AND id IN ($ph)";
  $stmt = $conn->prepare($sql);
  $types = "ii" . str_repeat("i", count($ids));
  $params = array_merge([$user_id, $month_id], $ids);
  $refs = [];
  $refs[] = &$types;
  foreach ($params as $k => $v) $refs[] = &$params[$k];
  call_user_func_array([$stmt, "bind_param"], $refs);
} else {
  $stmt = $conn->prepare("UPDATE delivery_losses SET status='confirmed', confirmed_at=NOW() WHERE user_id=? AND month_id=? AND status='pending'");
  $stmt->bind_param("ii", $user_id, $month_id);
}

if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}

echo json_encode(["ok" => true, "affected" => $stmt->affected_rows]);
?>
