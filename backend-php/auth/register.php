<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  http_response_code(204);
  exit;
}

require_once "../db.php";

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Invalid JSON body"]);
  exit;
}

$username = trim((string)($data["username"] ?? ""));
$password = (string)($data["password"] ?? "");
if ($username === "" || $password === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Username and password required"]);
  exit;
}
if (strlen($password) < 6) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Password must be at least 6 characters"]);
  exit;
}

try {
  $hash = password_hash($password, PASSWORD_DEFAULT);
  $stmt = $conn->prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
  $stmt->bind_param("ss", $username, $hash);
  $stmt->execute();
  echo json_encode(["ok" => true, "id" => (int)$stmt->insert_id, "message" => "Registered"]);
} catch (mysqli_sql_exception $error) {
  if ((int)$error->getCode() === 1062) {
    http_response_code(409);
    echo json_encode(["ok" => false, "error" => "Username already exists"]);
    exit;
  }
  error_log("[shein-php] Registration failed: " . (string)$error);
  backend_json_error();
}
?>
