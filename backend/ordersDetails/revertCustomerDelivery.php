<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  http_response_code(200);
  exit();
}

require_once "../db.php";
require_once "../auth/auth.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$data = json_decode(file_get_contents("php://input"), true);
$customer_id = isset($data["id"]) ? (int)$data["id"] : 0;

if ($customer_id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Invalid customer id"]);
  exit;
}

/**
 * Recommended rule:
 * - Only allow reverting customers that were previously "added" / "confirmed"
 * - And only for this user
 */
$stmt = $conn->prepare("
  UPDATE cart_customers
  SET delivery_status='not added', status='withdelivery'
  WHERE id=? AND user_id=?
    AND (delivery_status='added' OR status='confirmed')
");
$stmt->bind_param("ii", $customer_id, $user_id);

if ($stmt->execute()) {
  echo json_encode([
    "success" => true,
    "affected" => $stmt->affected_rows
  ]);
} else {
  http_response_code(500);
  echo json_encode([
    "success" => false,
    "error" => $stmt->error
  ]);
}
?>
