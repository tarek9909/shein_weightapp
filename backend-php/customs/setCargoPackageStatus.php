<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") exit(0);

require "../db.php";
require "../auth/auth.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];
$data = json_decode(file_get_contents("php://input"), true);

$month_id = (int)($data["month_id"] ?? 0);
$group_key = trim((string)($data["group_key"] ?? ""));
$group_type = trim((string)($data["group_type"] ?? "single"));
$display_label = trim((string)($data["display_label"] ?? ""));
$status = trim((string)($data["status"] ?? ""));
$tracking_numbers = isset($data["tracking_numbers"]) && is_array($data["tracking_numbers"])
  ? array_values($data["tracking_numbers"])
  : [];

if ($month_id <= 0 || $group_key === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "month_id and group_key are required"]);
  exit;
}

if ($status !== "sorted" && $status !== "not_sorted") {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "status must be sorted or not_sorted"]);
  exit;
}

if ($group_type === "") $group_type = "single";

$chk = $conn->prepare("SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1");
$chk->bind_param("ii", $month_id, $user_id);
$chk->execute();
if (!$chk->get_result()->fetch_assoc()) {
  http_response_code(403);
  echo json_encode(["ok" => false, "error" => "Invalid month for this user"]);
  exit;
}

$tracking_numbers_json = $tracking_numbers ? json_encode($tracking_numbers) : null;

$stmt = $conn->prepare("
  INSERT INTO cargo_package_sort_status (
    month_id, user_id, group_key, group_type, display_label, tracking_numbers_json, status, confirmed_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
  ON DUPLICATE KEY UPDATE
    group_type=VALUES(group_type),
    display_label=VALUES(display_label),
    tracking_numbers_json=VALUES(tracking_numbers_json),
    status=VALUES(status),
    confirmed_at=NOW()
");
$stmt->bind_param(
  "iisssss",
  $month_id,
  $user_id,
  $group_key,
  $group_type,
  $display_label,
  $tracking_numbers_json,
  $status
);

if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}

echo json_encode([
  "ok" => true,
  "group_key" => $group_key,
  "status" => $status,
]);
?>
