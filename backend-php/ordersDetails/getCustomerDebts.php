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
$month_id = isset($_GET["month_id"]) ? (int)$_GET["month_id"] : 0;
$status = strtolower(trim((string)($_GET["status"] ?? "")));

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

$sql = "SELECT * FROM customer_debts WHERE user_id=? AND month_id=?";
$types = "ii";
$params = [$user_id, $month_id];
if (in_array($status, ["open", "partial", "closed"], true)) {
  $sql .= " AND status=?";
  $types .= "s";
  $params[] = $status;
}
$sql .= " ORDER BY FIELD(status, 'open', 'partial', 'closed'), id DESC";

$stmt = $conn->prepare($sql);
$refs = [];
$refs[] = &$types;
foreach ($params as $k => $v) $refs[] = &$params[$k];
call_user_func_array([$stmt, "bind_param"], $refs);
$stmt->execute();
$res = $stmt->get_result();
$rows = [];
while ($r = $res->fetch_assoc()) $rows[] = $r;

echo json_encode(["ok" => true, "rows" => $rows]);
?>
