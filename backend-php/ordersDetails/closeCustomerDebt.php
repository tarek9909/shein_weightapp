<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") exit(0);

require_once "../db.php";
require_once "../auth/auth.php";

function table_has_column_local(mysqli $conn, string $table, string $column): bool {
  $sql = "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1";
  $st = $conn->prepare($sql);
  if (!$st) return false;
  $st->bind_param("ss", $table, $column);
  if (!$st->execute()) return false;
  return (bool)$st->get_result()->fetch_assoc();
}

$payload = require_auth();
$user_id = (int)($payload["user_id"] ?? 0);
$data = json_decode(file_get_contents("php://input"), true);

$id = (int)($data["id"] ?? 0);
$paid_amount = round((float)($data["paid_amount"] ?? 0), 2);
$note = trim((string)($data["note"] ?? ""));

if ($id <= 0 || $paid_amount <= 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "id and paid_amount are required"]);
  exit;
}

$sel = $conn->prepare("
  SELECT *
  FROM customer_debts
  WHERE id=? AND user_id=?
  LIMIT 1
");
$sel->bind_param("ii", $id, $user_id);
$sel->execute();
$debt = $sel->get_result()->fetch_assoc();
if (!$debt) {
  http_response_code(404);
  echo json_encode(["ok" => false, "error" => "Debt not found"]);
  exit;
}

$outstanding = (float)($debt["outstanding_amount"] ?? 0);
if ($outstanding <= 0.009 || strtolower((string)($debt["status"] ?? "")) === "closed") {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Debt is already closed"]);
  exit;
}
if ($paid_amount - $outstanding > 0.009) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Paid amount exceeds outstanding debt"]);
  exit;
}

$month_id = (int)($debt["month_id"] ?? 0);
$customer_id = (int)($debt["customer_id"] ?? 0);
$customer_name = trim((string)($debt["customer_name_snapshot"] ?? ""));
if ($customer_name === "") $customer_name = "Customer";

$paymentNote = "Debt payment from {$customer_name}";
if ($note !== "") $paymentNote .= " - {$note}";

$hasItemDeliveryCharge = table_has_column_local($conn, "payment_customer_items", "delivery_charge");

$conn->begin_transaction();
try {
  $insPay = $conn->prepare("
    INSERT INTO payments
      (user_id, month_id, payment_amount, payment_type, original_amount, delivery_charge, customer_count, customer_ids_json, note)
    VALUES
      (?, ?, ?, 'manual', NULL, 0, 1, ?, ?)
  ");
  $customerIdsJson = json_encode([$customer_id]);
  $insPay->bind_param("iidss", $user_id, $month_id, $paid_amount, $customerIdsJson, $paymentNote);
  if (!$insPay->execute()) throw new Exception($insPay->error ?: "Failed to create payment");
  $payment_id = (int)$insPay->insert_id;

  if ($hasItemDeliveryCharge) {
    $insItem = $conn->prepare("
      INSERT INTO payment_customer_items
        (payment_id, customer_id, customer_name_snapshot, amount, delivery_charge, user_id)
      VALUES (?, ?, ?, ?, 0, ?)
    ");
    $insItem->bind_param("iisdi", $payment_id, $customer_id, $customer_name, $paid_amount, $user_id);
  } else {
    $insItem = $conn->prepare("
      INSERT INTO payment_customer_items
        (payment_id, customer_id, customer_name_snapshot, amount, user_id)
      VALUES (?, ?, ?, ?, ?)
    ");
    $insItem->bind_param("iisdi", $payment_id, $customer_id, $customer_name, $paid_amount, $user_id);
  }
  if (!$insItem->execute()) throw new Exception($insItem->error ?: "Failed to create payment item");

  $insDebtPayment = $conn->prepare("
    INSERT INTO customer_debt_payments (debt_id, user_id, payment_id, paid_amount, note)
    VALUES (?, ?, ?, ?, ?)
  ");
  $insDebtPayment->bind_param("iiids", $id, $user_id, $payment_id, $paid_amount, $note);
  if (!$insDebtPayment->execute()) throw new Exception($insDebtPayment->error ?: "Failed to log debt payment");

  $remaining = round($outstanding - $paid_amount, 2);
  if ($remaining < 0) $remaining = 0.0;
  $status = $remaining <= 0.009 ? "closed" : "partial";
  $closed_at = $status === "closed" ? date("Y-m-d H:i:s") : null;

  $upd = $conn->prepare("
    UPDATE customer_debts
    SET outstanding_amount=?, status=?, closed_at=?
    WHERE id=? AND user_id=?
  ");
  $upd->bind_param("dssii", $remaining, $status, $closed_at, $id, $user_id);
  if (!$upd->execute()) throw new Exception($upd->error ?: "Failed to update debt");

  $conn->commit();
  echo json_encode([
    "ok" => true,
    "payment_id" => $payment_id,
    "paid_amount" => $paid_amount,
    "remaining_amount" => $remaining,
    "status" => $status,
  ]);
} catch (Throwable $e) {
  $conn->rollback();
  http_response_code(500);
  error_log('[shein-php] close customer debt failure: ' . (string)$e);
  echo json_encode(["ok" => false, "error" => backend_public_exception_message($e)]);
}
?>
