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
$name = trim($data["name"] ?? "");

if ($name === "") {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "name is required"]);
  exit;
}

$stmt = $conn->prepare("INSERT INTO month (name, user_id) VALUES (?, ?)");
$stmt->bind_param("si", $name, $user_id);

if ($stmt->execute()) {
  echo json_encode(["success" => true, "id" => $stmt->insert_id]);
} else {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
}
?>
