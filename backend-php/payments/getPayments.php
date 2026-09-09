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

$month_id = isset($_GET["month_id"]) ? (int)$_GET["month_id"] : 0;
if ($month_id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "month_id is required"]);
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
  SELECT id, month_id, payment_amount,
         COALESCE(payment_type, 'manual') AS payment_type,
         original_amount, delivery_charge, customer_count, customer_ids_json, note
  FROM payments
  WHERE month_id=? AND user_id=?
  ORDER BY id DESC
");
$stmt->bind_param("ii", $month_id, $user_id);
$stmt->execute();

$res = $stmt->get_result();
$payments = [];
while ($row = $res->fetch_assoc()) $payments[] = $row;

echo json_encode($payments);
?>
