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

$order_id = isset($_GET["order_id"]) ? (int)$_GET["order_id"] : 0;
if ($order_id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "order_id is required"]);
  exit;
}

/* ensure order belongs to user */
$chk = $conn->prepare("SELECT id FROM orders WHERE id=? AND user_id=? LIMIT 1");
$chk->bind_param("ii", $order_id, $user_id);
$chk->execute();
if (!$chk->get_result()->fetch_assoc()) {
  http_response_code(403);
  echo json_encode(["success" => false, "error" => "Invalid order for this user"]);
  exit;
}

$stmt = $conn->prepare("
  SELECT id, order_id, cart_order_number, cart_price,
         shein_email, shein_order_no, shein_carrier, shein_tracking_no,
         shein_status_text, shein_last_details, shein_last_timestamp,
         shein_track_url, shein_delivered, is_joint_shipment, joint_shipment_count,
         joint_combined_weight_kg, joint_combined_weight_plus_2kg, shein_total_weight_g,
         shein_total_weight_kg, shein_total_weight_plus_2kg,
         shein_is_split_shipment, shein_split_count, shein_split_tracking_numbers_json, shein_split_package_refs_json
  FROM order_carts
  WHERE order_id=? AND user_id=?
  ORDER BY id DESC
");
$stmt->bind_param("ii", $order_id, $user_id);
$stmt->execute();

$res = $stmt->get_result();
$out = [];
while ($row = $res->fetch_assoc()) $out[] = $row;

echo json_encode($out);
?>
