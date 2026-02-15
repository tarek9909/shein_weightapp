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

$id = isset($data["id"]) ? (int)$data["id"] : 0;
$cart_order_number = isset($data["cart_order_number"]) ? (string)$data["cart_order_number"] : "";
$cart_price = isset($data["cart_price"]) ? (float)$data["cart_price"] : 0;

if ($id <= 0 || $cart_order_number === "") {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Invalid input"]);
  exit;
}

$stmt = $conn->prepare("
  UPDATE order_carts
  SET cart_order_number=?, cart_price=?
  WHERE id=? AND user_id=?
");
$stmt->bind_param("sdii", $cart_order_number, $cart_price, $id, $user_id);

if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => $stmt->error]);
  exit;
}

if ($stmt->affected_rows === 0) {
  // Either not found or not owned by this user
  http_response_code(403);
  echo json_encode(["success" => false, "error" => "Cart not found or not allowed"]);
  exit;
}

echo json_encode(["success" => true]);
?>
