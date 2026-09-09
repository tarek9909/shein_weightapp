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
$rows = isset($data["rows"]) && is_array($data["rows"]) ? $data["rows"] : [];

if ($month_id <= 0 || !$rows) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "month_id and rows are required"]);
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

$stmt = $conn->prepare("
  INSERT INTO delivery_losses (
    month_id, user_id, status, loss_type, amount, signed_diff, description,
    customer_id, customer_name_snapshot, order_id, order_name_snapshot, cart_id, cart_order_number_snapshot,
    ref_label, source_key
  ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
");

if (!$stmt) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}

$created = 0;
$conn->begin_transaction();
try {
  foreach ($rows as $r) {
    $loss_type = trim((string)($r["type"] ?? ""));
    $amount = (float)($r["amount"] ?? 0);
    if ($loss_type === "" || $amount <= 0) continue;

    $signed_diff = array_key_exists("signed_diff", $r) ? (float)$r["signed_diff"] : 0.0;
    $description = trim((string)($r["description"] ?? ""));
    $customer_id = !empty($r["customer_id"]) ? (int)$r["customer_id"] : null;
    $customer_name = trim((string)($r["customer_name"] ?? ""));
    $order_id = !empty($r["order_id"]) ? (int)$r["order_id"] : null;
    $order_name = trim((string)($r["order_name"] ?? ""));
    $cart_id = !empty($r["cart_id"]) ? (int)$r["cart_id"] : null;
    $cart_order = trim((string)($r["cart_order_number"] ?? ""));
    $ref_label = trim((string)($r["ref"] ?? ""));
    $source_key = trim((string)($r["source_key"] ?? ""));

    $stmt->bind_param(
      "iisddsisisisss",
      $month_id,
      $user_id,
      $loss_type,
      $amount,
      $signed_diff,
      $description,
      $customer_id,
      $customer_name,
      $order_id,
      $order_name,
      $cart_id,
      $cart_order,
      $ref_label,
      $source_key
    );
    if (!$stmt->execute()) {
      throw new Exception($stmt->error ?: "Failed to insert loss");
    }
    $created++;
  }

  $conn->commit();
  echo json_encode(["ok" => true, "created" => $created]);
} catch (Throwable $e) {
  $conn->rollback();
  http_response_code(500);
  error_log('[shein-php] add delivery losses failure: ' . (string)$e);
  echo json_encode(["ok" => false, "error" => backend_public_exception_message($e)]);
}
?>
