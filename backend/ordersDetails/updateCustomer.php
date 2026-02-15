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
$customer_name = isset($data["customer_name"]) ? trim($data["customer_name"]) : "";
$usd_to_collect = isset($data["usd_to_collect"]) ? (float)$data["usd_to_collect"] : null;

if ($id <= 0 || $customer_name === "" || $usd_to_collect === null) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Invalid input"]);
  exit;
}

/**
 * Business rule (important):
 * - Only allow editing customers that are still pending
 *   (optional but recommended)
 */
$stmt = $conn->prepare("
  UPDATE cart_customers
  SET customer_name=?, usd_to_collect=?
  WHERE id=? AND user_id=? AND status='pending'
");
$stmt->bind_param("sdii", $customer_name, $usd_to_collect, $id, $user_id);

if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => $stmt->error]);
  exit;
}

if ($stmt->affected_rows === 0) {
  http_response_code(403);
  echo json_encode([
    "success" => false,
    "error" => "Customer not found, not owned, or cannot be edited"
  ]);
  exit;
}

echo json_encode(["success" => true]);
?>
