<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

// ✅ Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
require "../db.php";
require "./auth.php";

$body = json_decode(file_get_contents("php://input"), true);
$username = trim($body["username"] ?? "");
$password = $body["password"] ?? "";

if (!$username || !$password) {
  http_response_code(400);
  echo json_encode(["ok"=>false,"error"=>"Username and password required"]);
  exit;
}

$stmt = $conn->prepare("SELECT id, username, password_hash FROM users WHERE username=? LIMIT 1");
$stmt->bind_param("s", $username);
$stmt->execute();
$res = $stmt->get_result();
$user = $res->fetch_assoc();

if (!$user || !password_verify($password, $user["password_hash"])) {
  http_response_code(401);
  echo json_encode(["ok"=>false,"error"=>"Invalid credentials"]);
  exit;
}

$secret = "CHANGE_THIS_SECRET_123";
$token = make_token([
  "user_id" => (int)$user["id"],
  "username" => $user["username"],
  "exp" => time() + (60 * 60 * 24 * 7) // 7 days
], $secret);

echo json_encode([
  "ok" => true,
  "token" => $token,
  "user" => ["id" => (int)$user["id"], "username" => $user["username"]]
]);
