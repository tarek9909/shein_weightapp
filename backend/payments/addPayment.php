<?php
ini_set('display_errors', '0');
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  http_response_code(200);
  echo json_encode(["ok" => true]);
  exit;
}

ob_start();

require_once "../db.php";
require_once "../auth/auth.php";

try {
  // AUTH
  $payload = require_auth();
  $user_id = (int)($payload["user_id"] ?? 0);
  if ($user_id <= 0) throw new Exception("Invalid token payload (missing user_id)");

  // INPUT
  $raw = file_get_contents("php://input");
  $data = json_decode($raw, true);

  if (!is_array($data)) {
    http_response_code(400);
    ob_clean();
    echo json_encode(["success" => false, "error" => "Invalid JSON body"]);
    exit;
  }

  $month_id = (int)($data["month_id"] ?? 0);
  $payment_amount = $data["payment_amount"] ?? null;

  if ($month_id <= 0 || $payment_amount === null || $payment_amount === "") {
    http_response_code(400);
    ob_clean();
    echo json_encode(["success" => false, "error" => "month_id and payment_amount are required"]);
    exit;
  }

  $payment_amount = (float)$payment_amount;

  // SECURITY: ensure month belongs to this user
  $stmt = $conn->prepare("SELECT id FROM month WHERE id = ? AND user_id = ? LIMIT 1");
  $stmt->bind_param("ii", $month_id, $user_id);
  $stmt->execute();
  $res = $stmt->get_result();
  $stmt->close();

  if ($res->num_rows === 0) {
    http_response_code(403);
    ob_clean();
    echo json_encode(["success" => false, "error" => "Unauthorized month"]);
    exit;
  }

  // ✅ INSERT INCLUDING user_id (THIS FIXES YOUR FK ERROR)
  $stmt = $conn->prepare("INSERT INTO payments (user_id, month_id, payment_amount) VALUES (?, ?, ?)");
  $stmt->bind_param("iid", $user_id, $month_id, $payment_amount);

  if (!$stmt->execute()) throw new Exception($stmt->error);

  $newId = $stmt->insert_id;
  $stmt->close();

  ob_clean();
  echo json_encode(["success" => true, "id" => $newId]);
  exit;

} catch (Throwable $e) {
  http_response_code(500);
  ob_clean();
  echo json_encode(["success" => false, "error" => $e->getMessage()]);
  exit;
}
