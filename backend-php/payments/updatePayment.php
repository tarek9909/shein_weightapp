<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require "../db.php";
require "../auth/auth.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$data = json_decode(file_get_contents("php://input"), true);

$id = (int)($data["id"] ?? 0);
$payment_amount = (float)($data["payment_amount"] ?? 0);

if ($id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "id is required"]);
  exit;
}

$stmt = $conn->prepare("UPDATE payments SET payment_amount=? WHERE id=? AND user_id=? AND COALESCE(payment_type,'manual')='manual'");
$stmt->bind_param("dii", $payment_amount, $id, $user_id);

if ($stmt->execute()) {
  echo json_encode(["success" => true, "affected" => $stmt->affected_rows]);
} else {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
}
?>
