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

$id = (int)($data["id"] ?? 0);
$outstanding_amount = round((float)($data["outstanding_amount"] ?? -1), 2);
$note = array_key_exists("note", (array)$data) ? trim((string)($data["note"] ?? "")) : null;

if ($id <= 0 || $outstanding_amount < 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "id and valid outstanding_amount are required"]);
  exit;
}

$sel = $conn->prepare("SELECT id, original_amount FROM customer_debts WHERE id=? AND user_id=? LIMIT 1");
$sel->bind_param("ii", $id, $user_id);
$sel->execute();
$row = $sel->get_result()->fetch_assoc();
if (!$row) {
  http_response_code(404);
  echo json_encode(["ok" => false, "error" => "Debt not found"]);
  exit;
}

$original = (float)($row["original_amount"] ?? 0);
if ($outstanding_amount > $original + 0.009) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Outstanding amount cannot exceed original amount"]);
  exit;
}

$status = "open";
$closed_at = null;
if ($outstanding_amount <= 0.009) {
  $outstanding_amount = 0.0;
  $status = "closed";
  $closed_at = date("Y-m-d H:i:s");
} elseif ($outstanding_amount + 0.009 < $original) {
  $status = "partial";
}

if ($note !== null && $note === "") $note = null;

$stmt = $conn->prepare("
  UPDATE customer_debts
  SET outstanding_amount=?, status=?, note=COALESCE(?, note), closed_at=?
  WHERE id=? AND user_id=?
");
$stmt->bind_param("dsssii", $outstanding_amount, $status, $note, $closed_at, $id, $user_id);
if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}

echo json_encode(["ok" => true]);
?>
