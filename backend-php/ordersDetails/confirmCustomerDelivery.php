<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(200);
  exit();
}

require_once "../db.php";
require_once "../auth/auth.php";

$payload = require_auth();
$user_id = (int)($payload["user_id"] ?? 0);

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Invalid JSON body"]);
  exit;
}
$customer_id = (int)($data["customer_id"] ?? $data["id"] ?? 0);
$usd_to_collect = array_key_exists("usd_to_collect", $data) ? (float)$data["usd_to_collect"] : null;
$delivery_charge_usd = array_key_exists("delivery_charge_usd", $data) ? (float)$data["delivery_charge_usd"] : null;

if ($customer_id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "customer_id is required"]);
  exit;
}

$stmt = $conn->prepare("
  UPDATE cart_customers
  SET status='confirmed',
      usd_to_collect = COALESCE(?, usd_to_collect),
      delivery_charge_usd = COALESCE(?, delivery_charge_usd)
  WHERE id=? AND user_id=?
");
$stmt->bind_param("ddii", $usd_to_collect, $delivery_charge_usd, $customer_id, $user_id);

if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
  exit;
}

if ($stmt->affected_rows === 0) {
  http_response_code(404);
  echo json_encode(["success" => false, "error" => "Customer not found for this user"]);
  exit;
}

echo json_encode(["success" => true]);
