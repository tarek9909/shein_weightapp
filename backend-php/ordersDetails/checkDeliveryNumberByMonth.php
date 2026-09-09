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
$user_id = (int)$payload["user_id"];
$month_id = isset($_GET["month_id"]) ? (int)$_GET["month_id"] : 0;
$delivery_number = trim((string)($_GET["delivery_number"] ?? ""));

if ($month_id <= 0 || $delivery_number === "") {
  http_response_code(400);
  echo json_encode(["exists" => false, "error" => "month_id and delivery_number are required"]);
  exit;
}

$chk = $conn->prepare("SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1");
$chk->bind_param("ii", $month_id, $user_id);
$chk->execute();
if (!$chk->get_result()->fetch_assoc()) {
  http_response_code(403);
  echo json_encode(["exists" => false, "error" => "Invalid month for this user"]);
  exit;
}

$stmt = $conn->prepare("
  SELECT cc.id
  FROM cart_customers cc
  JOIN order_carts oc ON oc.id = cc.cart_id AND oc.user_id = cc.user_id
  JOIN orders o ON o.id = oc.order_id AND o.user_id = oc.user_id
  WHERE cc.user_id=? AND o.month_id=? AND CAST(cc.delivery_number AS CHAR)=?
  LIMIT 1
");
$stmt->bind_param("iis", $user_id, $month_id, $delivery_number);
$stmt->execute();
$exists = $stmt->get_result()->fetch_assoc() ? true : false;
echo json_encode(["exists" => $exists]);
?>
