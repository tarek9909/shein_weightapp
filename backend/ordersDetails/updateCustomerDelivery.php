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
  /* ===================== AUTH ===================== */
  $payload = require_auth();
  $user_id = (int)($payload["user_id"] ?? 0);
  if ($user_id <= 0) throw new Exception("Invalid token payload");

  /* ===================== INPUT ===================== */
  $data = json_decode(file_get_contents("php://input"), true);
  if (!is_array($data)) {
    http_response_code(400);
    ob_clean();
    echo json_encode(["success" => false, "error" => "Invalid JSON body"]);
    exit;
  }

  $id = (int)($data["id"] ?? 0);
  $delivery_number = trim((string)($data["delivery_number"] ?? ""));
  $status = trim((string)($data["status"] ?? "pending"));

  if ($id <= 0 || $delivery_number === "") {
    http_response_code(400);
    ob_clean();
    echo json_encode(["success" => false, "error" => "id and delivery_number are required"]);
    exit;
  }

  /* ===================== OWNERSHIP CHECK ===================== */
  // Ensure this customer belongs to the logged-in user
  $stmt = $conn->prepare("
    SELECT cc.id
    FROM cart_customers cc
    JOIN order_carts oc ON cc.cart_id = oc.id
    JOIN orders o ON oc.order_id = o.id
    JOIN month m ON o.month_id = m.id
    WHERE cc.id = ? AND m.user_id = ?
    LIMIT 1
  ");
  $stmt->bind_param("ii", $id, $user_id);
  $stmt->execute();
  $res = $stmt->get_result();
  $stmt->close();

  if ($res->num_rows === 0) {
    http_response_code(403);
    ob_clean();
    echo json_encode(["success" => false, "error" => "Unauthorized"]);
    exit;
  }

  /* ===================== GLOBAL UNIQUE CHECK ===================== */
  // Delivery number must not exist anywhere else in DB (except same customer)
  $stmt = $conn->prepare("
    SELECT id
    FROM cart_customers
    WHERE delivery_number = ?
      AND id <> ?
    LIMIT 1
  ");
  $stmt->bind_param("si", $delivery_number, $id);
  $stmt->execute();
  $dup = $stmt->get_result();
  $stmt->close();

  if ($dup->num_rows > 0) {
    http_response_code(409); // Conflict
    ob_clean();
    echo json_encode([
      "success" => false,
      "error" => "Delivery number already exists"
    ]);
    exit;
  }

  /* ===================== UPDATE ===================== */
  $stmt = $conn->prepare("
    UPDATE cart_customers
    SET delivery_number = ?, status = ?
    WHERE id = ?
  ");
  $status="withdelivery";
  $stmt->bind_param("ssi", $delivery_number, $status, $id);

  if (!$stmt->execute()) throw new Exception($stmt->error);
  $stmt->close();

  ob_clean();
  echo json_encode(["success" => true]);
  exit;

} catch (Throwable $e) {
  http_response_code(500);
  ob_clean();
  echo json_encode(["success" => false, "error" => $e->getMessage()]);
  exit;
}
