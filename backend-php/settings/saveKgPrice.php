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
if (!is_array($data)) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Invalid JSON body"]);
  exit;
}
$kg_price = isset($data["kg_price"]) ? (float)$data["kg_price"] : 0.0;

if (!is_finite($kg_price) || $kg_price < 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "kg_price must be >= 0"]);
  exit;
}

$stmt = $conn->prepare("
  INSERT INTO user_settings (user_id, kg_price)
  VALUES (?, ?)
  ON DUPLICATE KEY UPDATE kg_price=VALUES(kg_price)
");
$stmt->bind_param("id", $user_id, $kg_price);

if ($stmt->execute()) {
  echo json_encode([
    "success" => true,
    "kg_price" => $kg_price,
  ]);
} else {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
}
?>
