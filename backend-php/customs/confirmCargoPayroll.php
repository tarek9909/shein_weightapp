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
$note = trim((string)($data["note"] ?? ""));
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
$summary = build_cargo_payroll_breakdown($conn, $user_id, $month_id, $per_unit_amount, $exclude);
if ((int)($summary["sorted_count"] ?? 0) <= 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "No sorted packages available for pending payment"]);
  exit;
}
$summaryJson = json_encode($summary, JSON_UNESCAPED_UNICODE);
if ($summaryJson === false) $summaryJson = null;

$autoNote = "Payroll pending | Sorted packages: " . (int)($summary["sorted_count"] ?? 0)
  . " | Per unit: " . number_format((float)$per_unit_amount, 2)
  . " | Total payroll: " . number_format((float)($summary["total_payroll"] ?? 0), 2);
if ($note !== "") $autoNote .= " | " . $note;

$insHeader = $conn->prepare("
  INSERT INTO cargo_payroll_pending (
    month_id, user_id, per_unit_amount, sorted_count, total_payroll, status, note, summary_json
  ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
");
$totalPayroll = (float)($summary["total_payroll"] ?? 0);
$sortedCount = (int)($summary["sorted_count"] ?? 0);
$insHeader->bind_param("iididss", $month_id, $user_id, $per_unit_amount, $sortedCount, $totalPayroll, $autoNote, $summaryJson);
if (!$insHeader->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}
$pendingId = (int)$insHeader->insert_id;

$insPkg = $conn->prepare("
  INSERT INTO cargo_payroll_pending_packages (
    pending_id, group_key, display_label, group_type, tracking_numbers_json, weight_kg, amount, order_refs_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
");
if (!$insPkg) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}
foreach (($summary["packages"] ?? []) as $pkg) {
  $groupKey = (string)($pkg["group_key"] ?? "");
  if ($groupKey === "") continue;
  $display = (string)($pkg["display_label"] ?? "");
  $groupType = (string)($pkg["group_type"] ?? "single");
  $tracksJson = json_encode(array_values($pkg["tracking_numbers"] ?? []), JSON_UNESCAPED_UNICODE);
  $refsJson = json_encode(array_values($pkg["order_refs"] ?? []), JSON_UNESCAPED_UNICODE);
  $weightKg = (float)($pkg["weight_kg"] ?? 0);
  $amount = (float)($pkg["amount"] ?? 0);
  $insPkg->bind_param("issssdds", $pendingId, $groupKey, $display, $groupType, $tracksJson, $weightKg, $amount, $refsJson);
  if (!$insPkg->execute()) {
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "Internal server error"]);
    exit;
  }
}

echo json_encode([
  "ok" => true,
  "message" => "Payroll moved to pending payment. Accept is required to add to customs.",
  "pending_id" => $pendingId,
  "summary" => $summary,
]);
?>
