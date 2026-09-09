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
$user_id = (int)($payload["user_id"] ?? 0);
$data = json_decode(file_get_contents("php://input"), true);

$id = (int)($data["id"] ?? 0);
$loss_type = trim((string)($data["loss_type"] ?? ""));
$amount = isset($data["amount"]) ? (float)$data["amount"] : null;
$description = trim((string)($data["description"] ?? ""));

if ($id <= 0 || $loss_type === "" || $amount === null || $amount < 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Invalid input"]);
  exit;
}

$stmt = $conn->prepare("
  UPDATE delivery_losses
  SET loss_type=?, amount=?, description=?
  WHERE id=? AND user_id=? AND status='pending'
");
$stmt->bind_param("sdsii", $loss_type, $amount, $description, $id, $user_id);
if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}
echo json_encode(["ok" => true]);
?>
