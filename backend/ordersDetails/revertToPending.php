<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");
// ✅ Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(200);
  echo json_encode(["ok" => true]);
  exit;
}

require_once "../db.php";
require_once "../auth/auth.php";

$payload = require_auth();
$user_id = (int)($payload["user_id"] ?? 0);

// ✅ Read JSON safely
$raw = file_get_contents("php://input");
$data = json_decode($raw, true);

if (!is_array($data)) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Invalid JSON body"]);
  exit;
}

// ✅ Accept both { id } and { customer_id } to be safe
$customer_id = (int)($data["id"] ?? ($data["customer_id"] ?? 0));
if ($customer_id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Missing customer id"]);
  exit;
}

/**
 * ✅ Ownership check:
 * cart_customers -> order_carts -> orders -> month (month.user_id)
 */
$sql = "
  UPDATE cart_customers cc
  JOIN order_carts oc ON cc.cart_id = oc.id
  JOIN orders o ON oc.order_id = o.id
  JOIN month m ON o.month_id = m.id
  SET
    cc.status='pending',
    cc.delivery_status='not added',
    cc.delivery_number=NULL
  WHERE cc.id=? AND m.user_id=?
";

$stmt = $conn->prepare($sql);
if (!$stmt) {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => $conn->error]);
  exit;
}

$stmt->bind_param("ii", $customer_id, $user_id);

if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => $stmt->error]);
  exit;
}

if ($stmt->affected_rows === 0) {
  http_response_code(404);
  echo json_encode(["success" => false, "error" => "Customer not found or not allowed"]);
  exit;
}

echo json_encode(["success" => true]);
