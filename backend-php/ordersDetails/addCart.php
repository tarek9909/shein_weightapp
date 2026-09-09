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
$user_id = (int)$payload["user_id"];

$data = json_decode(file_get_contents("php://input"), true);

$order_id = (int)($data["order_id"] ?? 0);
$cart_order_number = trim((string)($data["cart_order_number"] ?? ""));
$cart_price = (float)($data["cart_price"] ?? 0);
$shein_email = trim((string)($data["shein_email"] ?? ""));
$shein_order_no = trim((string)($data["shein_order_no"] ?? ""));

if ($order_id <= 0 || $cart_order_number === "") {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "order_id and cart_order_number are required"]);
  exit;
}

/* ensure order belongs to user */
$chk = $conn->prepare("SELECT id FROM orders WHERE id=? AND user_id=? LIMIT 1");
$chk->bind_param("ii", $order_id, $user_id);
$chk->execute();
if (!$chk->get_result()->fetch_assoc()) {
  http_response_code(403);
  echo json_encode(["success" => false, "error" => "Invalid order for this user"]);
  exit;
}

$stmt = $conn->prepare("
  INSERT INTO order_carts (order_id, cart_order_number, cart_price, user_id, shein_email, shein_order_no)
  VALUES (?, ?, ?, ?, ?, ?)
");
$stmt->bind_param("isdiss", $order_id, $cart_order_number, $cart_price, $user_id, $shein_email, $shein_order_no);

if ($stmt->execute()) {
  echo json_encode(["success" => true, "id" => $stmt->insert_id]);
} else {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
}
?>
