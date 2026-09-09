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
$customer_id = (int)($data["customer_id"] ?? 0);
$amount = round((float)($data["amount"] ?? 0), 2);
$note = trim((string)($data["note"] ?? ""));

if ($month_id <= 0 || $customer_id <= 0 || $amount <= 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "month_id, customer_id and amount are required"]);
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

$sel = $conn->prepare("
  SELECT
    cc.id AS customer_id,
    cc.customer_name,
    cc.cart_id,
    oc.cart_order_number,
    o.id AS order_id,
    o.order_name
  FROM cart_customers cc
  JOIN order_carts oc ON oc.id = cc.cart_id AND oc.user_id = cc.user_id
  JOIN orders o ON o.id = oc.order_id AND o.user_id = oc.user_id
  WHERE cc.user_id=? AND cc.id=? AND o.month_id=?
  LIMIT 1
");
$sel->bind_param("iii", $user_id, $customer_id, $month_id);
$sel->execute();
$c = $sel->get_result()->fetch_assoc();
if (!$c) {
  http_response_code(404);
  echo json_encode(["ok" => false, "error" => "Customer not found in selected month"]);
  exit;
}

$status = "open";
$ins = $conn->prepare("
  INSERT INTO customer_debts (
    user_id, month_id, customer_id, customer_name_snapshot,
    order_id, order_name_snapshot, cart_id, cart_order_number_snapshot,
    original_amount, outstanding_amount, status, note
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
");
$customer_name = (string)($c["customer_name"] ?? "");
$order_id = (int)($c["order_id"] ?? 0);
$order_name = (string)($c["order_name"] ?? "");
$cart_id = (int)($c["cart_id"] ?? 0);
$cart_order = (string)($c["cart_order_number"] ?? "");
$ins->bind_param(
  "iiisisisddss",
  $user_id,
  $month_id,
  $customer_id,
  $customer_name,
  $order_id,
  $order_name,
  $cart_id,
  $cart_order,
  $amount,
  $amount,
  $status,
  $note
);
if (!$ins->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}

echo json_encode(["ok" => true, "id" => (int)$ins->insert_id]);
?>
