<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  http_response_code(200);
  exit;
}

require_once "../db.php";
require_once "./auth.php"; // contains require_auth()

$payload = require_auth();
$user_id = (int)($payload["user_id"] ?? 0);

$body = json_decode(file_get_contents("php://input"), true);
$old_password = (string)($body["old_password"] ?? "");
$new_password = (string)($body["new_password"] ?? "");
$confirm_password = (string)($body["confirm_password"] ?? "");

if (!$user_id) {
  http_response_code(401);
  echo json_encode(["ok" => false, "error" => "Unauthorized"]);
  exit;
}

if ($old_password === "" || $new_password === "" || $confirm_password === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "All fields are required"]);
  exit;
}

if ($new_password !== $confirm_password) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Passwords do not match"]);
  exit;
}

if (strlen($new_password) < 6) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "New password must be at least 6 characters"]);
  exit;
}

// Fetch current hash
$stmt = $conn->prepare("SELECT password_hash FROM users WHERE id=? LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$res = $stmt->get_result();
$row = $res->fetch_assoc();

if (!$row) {
  http_response_code(404);
  echo json_encode(["ok" => false, "error" => "User not found"]);
  exit;
}

if (!password_verify($old_password, $row["password_hash"])) {
  http_response_code(401);
  echo json_encode(["ok" => false, "error" => "Old password is incorrect"]);
  exit;
}

$new_hash = password_hash($new_password, PASSWORD_DEFAULT);

$upd = $conn->prepare("UPDATE users SET password_hash=? WHERE id=?");
$upd->bind_param("si", $new_hash, $user_id);

if (!$upd->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Failed to update password"]);
  exit;
}

echo json_encode(["ok" => true, "message" => "Password updated"]);
