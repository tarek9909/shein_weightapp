<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") exit(0);

require "../db.php";
require "../auth/auth.php";
require_once "./_cargoPackageGroups.php";
require_once "./_cargoPayroll.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$month_id = isset($_GET["month_id"]) ? (int)$_GET["month_id"] : 0;
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

$all = get_cargo_package_groups($conn, $user_id, $month_id);
$pendingGroupKeys = get_pending_payroll_group_keys($conn, $user_id, $month_id);
$pendingMap = [];
foreach ($pendingGroupKeys as $k) {
  $kv = trim((string)$k);
  if ($kv !== "") $pendingMap[$kv] = true;
}
$all = array_values(array_filter($all, function ($row) use ($pendingMap) {
  $k = trim((string)($row["group_key"] ?? ""));
  return !isset($pendingMap[$k]);
}));
$pending = [];
$confirmed = [];
foreach ($all as $row) {
  if (($row["status"] ?? null) === null || trim((string)$row["status"]) === "") $pending[] = $row;
  else $confirmed[] = $row;
}

echo json_encode([
  "ok" => true,
  "pending" => $pending,
  "confirmed" => $confirmed,
  "all" => $all,
]);
?>
