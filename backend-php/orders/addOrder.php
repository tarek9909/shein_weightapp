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

$month_id = (int)($data["month_id"] ?? 0);
$order_name = isset($data["order_name"]) ? trim($data["order_name"]) : null;
$order_details = isset($data["order_details"]) ? (string)$data["order_details"] : "";
$amount_to_collect = isset($data["amount_to_collect"]) ? (float)$data["amount_to_collect"] : 0.0;

if ($month_id <= 0 || $order_details === "") {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "month_id and order_details are required"]);
  exit;
}

if ($amount_to_collect < 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "amount_to_collect must be >= 0"]);
  exit;
}

/* Ensure month belongs to this user */
$chk = $conn->prepare("SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1");
$chk->bind_param("ii", $month_id, $user_id);
$chk->execute();
if (!$chk->get_result()->fetch_assoc()) {
  http_response_code(403);
  echo json_encode(["success" => false, "error" => "Invalid month for this user"]);
  exit;
}

$stmt = $conn->prepare("
  INSERT INTO orders (month_id, order_name, order_details, amount_to_collect, user_id)
  VALUES (?, ?, ?, ?, ?)
");
$stmt->bind_param("issdi", $month_id, $order_name, $order_details, $amount_to_collect, $user_id);

if ($stmt->execute()) {
  echo json_encode(["success" => true, "id" => $stmt->insert_id]);
} else {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
}
?>
