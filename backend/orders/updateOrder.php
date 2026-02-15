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
$order_name = isset($data["order_name"]) ? trim($data["order_name"]) : null;
$order_details = isset($data["order_details"]) ? (string)$data["order_details"] : "";

if ($id <= 0 || $order_details === "") {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "id and order_details are required"]);
  exit;
}

$stmt = $conn->prepare("
  UPDATE orders
  SET order_name=?, order_details=?
  WHERE id=? AND user_id=?
");
$stmt->bind_param("ssii", $order_name, $order_details, $id, $user_id);

if ($stmt->execute()) {
  echo json_encode(["success" => true, "affected" => $stmt->affected_rows]);
} else {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => $stmt->error]);
}
?>
