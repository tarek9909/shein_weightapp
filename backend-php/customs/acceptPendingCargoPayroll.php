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

$pending_id = (int)($data["pending_id"] ?? 0);
$extra_note = trim((string)($data["note"] ?? ""));
if ($pending_id <= 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "pending_id is required"]);
  exit;
}

$stmt = $conn->prepare("
  SELECT id, month_id, total_payroll, note, summary_json, status
  FROM cargo_payroll_pending
  WHERE id=? AND user_id=?
  LIMIT 1
");
$stmt->bind_param("ii", $pending_id, $user_id);
$stmt->execute();
$pending = $stmt->get_result()->fetch_assoc();
if (!$pending) {
  http_response_code(404);
  echo json_encode(["ok" => false, "error" => "Pending payroll not found"]);
  exit;
}
if ((string)$pending["status"] !== "pending") {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Pending payroll already accepted"]);
  exit;
}

$month_id = (int)$pending["month_id"];
$total_payroll = isset($pending["total_payroll"]) ? (float)$pending["total_payroll"] : 0.0;
$baseNote = trim((string)($pending["note"] ?? ""));
$finalNote = $baseNote;
if ($extra_note !== "") {
  $finalNote = ($finalNote !== "") ? ($finalNote . " | " . $extra_note) : $extra_note;
}
$summaryJson = (string)($pending["summary_json"] ?? "");

$insCustom = $conn->prepare("
  INSERT INTO customs (
    month_id, customs_fee, user_id, tracking_no, invoice_no, weight_kg, unit_price, delivery_fee,
    order_id, cart_id, order_ref, cart_ref, note, description, source_message
  ) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, ?, 'payment', ?)
");
$insCustom->bind_param("idiss", $month_id, $total_payroll, $user_id, $finalNote, $summaryJson);
if (!$insCustom->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}
$customId = (int)$insCustom->insert_id;

$upd = $conn->prepare("
  UPDATE cargo_payroll_pending
  SET status='accepted', accepted_at=NOW(), customs_id=?
  WHERE id=? AND user_id=? AND status='pending'
");
$upd->bind_param("iii", $customId, $pending_id, $user_id);
if (!$upd->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}

echo json_encode([
  "ok" => true,
  "message" => "Pending payroll accepted and added to customs.",
  "customs_id" => $customId,
]);
?>
