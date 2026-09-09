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
if (!is_array($data)) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Invalid JSON body"]);
  exit;
}

$cart_id = (int)($data["cart_id"] ?? 0);
$customer_name = trim((string)($data["customer_name"] ?? ""));
$usd_to_collect = (float)($data["usd_to_collect"] ?? 0);
$delivery_charge_usd = array_key_exists("delivery_charge_usd", $data) ? (float)$data["delivery_charge_usd"] : 0.0;

if ($cart_id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "cart_id is required"]);
  exit;
}

/* ensure cart belongs to user */
$chk = $conn->prepare("SELECT id FROM order_carts WHERE id=? AND user_id=? LIMIT 1");
$chk->bind_param("ii", $cart_id, $user_id);
$chk->execute();
if (!$chk->get_result()->fetch_assoc()) {
  http_response_code(403);
  echo json_encode(["success" => false, "error" => "Invalid cart for this user"]);
  exit;
}

$stmt = $conn->prepare("
  INSERT INTO cart_customers (cart_id, customer_name, usd_to_collect, delivery_charge_usd, user_id)
  VALUES (?, ?, ?, ?, ?)
");
$stmt->bind_param("isddi", $cart_id, $customer_name, $usd_to_collect, $delivery_charge_usd, $user_id);

if ($stmt->execute()) {
  echo json_encode(["success" => true, "id" => $stmt->insert_id]);
} else {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
}
?>
