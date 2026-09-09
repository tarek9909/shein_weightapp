<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") exit(0);

require "../db.php";
require "../auth/auth.php";
require_once "./_cargoPayroll.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];
$data = json_decode(file_get_contents("php://input"), true);

$month_id = (int)($data["month_id"] ?? 0);
$per_unit_amount = isset($data["per_unit_amount"]) ? (float)$data["per_unit_amount"] : 0.0;

if ($month_id <= 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "month_id is required"]);
  exit;
}
if (!is_finite($per_unit_amount) || $per_unit_amount < 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "per_unit_amount must be >= 0"]);
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

$exclude = get_pending_payroll_group_keys($conn, $user_id, $month_id);
$preview = build_cargo_payroll_breakdown($conn, $user_id, $month_id, $per_unit_amount, $exclude);
echo json_encode([
  "ok" => true,
  "preview" => $preview,
]);
?>
