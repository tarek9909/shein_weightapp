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

$hdr = $conn->prepare("
  SELECT id, per_unit_amount, sorted_count, total_payroll, note, summary_json, created_at
  FROM cargo_payroll_pending
  WHERE user_id=? AND month_id=? AND status='pending'
  ORDER BY id DESC
");
$hdr->bind_param("ii", $user_id, $month_id);
$hdr->execute();
$hdrRes = $hdr->get_result();

$pkg = $conn->prepare("
  SELECT id, group_key, display_label, group_type, tracking_numbers_json, weight_kg, amount, order_refs_json
  FROM cargo_payroll_pending_packages
  WHERE pending_id=?
  ORDER BY id ASC
");

$rows = [];
while ($h = $hdrRes->fetch_assoc()) {
  $pendingId = (int)$h["id"];
  $pkg->bind_param("i", $pendingId);
  $pkg->execute();
  $pkgRes = $pkg->get_result();
  $packages = [];
  while ($p = $pkgRes->fetch_assoc()) {
    $packages[] = [
      "id" => (int)$p["id"],
      "group_key" => (string)($p["group_key"] ?? ""),
      "display_label" => (string)($p["display_label"] ?? ""),
      "group_type" => (string)($p["group_type"] ?? "single"),
      "tracking_numbers" => json_decode((string)($p["tracking_numbers_json"] ?? "[]"), true) ?: [],
      "weight_kg" => isset($p["weight_kg"]) ? (float)$p["weight_kg"] : 0.0,
      "amount" => isset($p["amount"]) ? (float)$p["amount"] : 0.0,
      "order_refs" => json_decode((string)($p["order_refs_json"] ?? "[]"), true) ?: [],
    ];
  }
  $rows[] = [
    "id" => $pendingId,
    "per_unit_amount" => isset($h["per_unit_amount"]) ? (float)$h["per_unit_amount"] : 0.0,
    "sorted_count" => (int)($h["sorted_count"] ?? 0),
    "total_payroll" => isset($h["total_payroll"]) ? (float)$h["total_payroll"] : 0.0,
    "note" => (string)($h["note"] ?? ""),
    "created_at" => $h["created_at"] ?? null,
    "summary" => json_decode((string)($h["summary_json"] ?? "null"), true),
    "packages" => $packages,
  ];
}

echo json_encode([
  "ok" => true,
  "pending_payrolls" => $rows,
]);
?>
