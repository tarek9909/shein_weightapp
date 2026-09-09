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

$cart_id = isset($_GET["cart_id"]) ? (int)$_GET["cart_id"] : 0;
$delivery_number = isset($_GET["delivery_number"]) ? trim((string)$_GET["delivery_number"]) : "";

if ($cart_id <= 0 || $delivery_number === "") {
  http_response_code(400);
  echo json_encode(["exists" => false, "error" => "cart_id and delivery_number are required"]);
  exit;
}

/* ensure cart belongs to user */
$chk = $conn->prepare("SELECT id FROM order_carts WHERE id=? AND user_id=? LIMIT 1");
$chk->bind_param("ii", $cart_id, $user_id);
$chk->execute();
if (!$chk->get_result()->fetch_assoc()) {
  http_response_code(403);
  echo json_encode(["exists" => false, "error" => "Invalid cart for this user"]);
  exit;
}

$stmt = $conn->prepare("
  SELECT 1
  FROM cart_customers
  WHERE cart_id=? AND delivery_number=? AND user_id=?
  LIMIT 1
");
$dn = (int)$delivery_number;
$stmt->bind_param("iii", $cart_id, $dn, $user_id);
$stmt->execute();

$exists = $stmt->get_result()->fetch_assoc() ? true : false;
echo json_encode(["exists" => $exists]);
?>
