<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") exit(0);

require_once "../db.php";
require_once "../auth/auth.php";
require_once "./_jointShipment.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$data = json_decode(file_get_contents("php://input"), true);

$id = isset($data["id"]) ? (int)$data["id"] : 0;
$cart_order_number = isset($data["cart_order_number"]) ? (string)$data["cart_order_number"] : "";
$cart_price = isset($data["cart_price"]) ? (float)$data["cart_price"] : 0;

if ($id <= 0 || $cart_order_number === "") {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Invalid input"]);
  exit;
}

// Verify ownership explicitly first.
$check = $conn->prepare("SELECT * FROM order_carts WHERE id=? AND user_id=? LIMIT 1");
$check->bind_param("ii", $id, $user_id);
$check->execute();
$checkRes = $check->get_result();
$existing = $checkRes ? $checkRes->fetch_assoc() : null;
if (!$existing) {
  http_response_code(403);
  echo json_encode(["success" => false, "error" => "Cart not found or not allowed"]);
  exit;
}
$old_tracking_no = $existing["shein_tracking_no"] ?? null;

$shein_email = array_key_exists("shein_email", $data) ? (string)$data["shein_email"] : ($existing["shein_email"] ?? null);
$shein_order_no = array_key_exists("shein_order_no", $data) ? (string)$data["shein_order_no"] : ($existing["shein_order_no"] ?? null);
$shein_carrier = array_key_exists("shein_carrier", $data) ? (string)$data["shein_carrier"] : ($existing["shein_carrier"] ?? null);
$shein_tracking_no = array_key_exists("shein_tracking_no", $data) ? (string)$data["shein_tracking_no"] : ($existing["shein_tracking_no"] ?? null);
$shein_status_text = array_key_exists("shein_status_text", $data) ? (string)$data["shein_status_text"] : ($existing["shein_status_text"] ?? null);
$shein_last_details = array_key_exists("shein_last_details", $data) ? (string)$data["shein_last_details"] : ($existing["shein_last_details"] ?? null);
$shein_last_timestamp = array_key_exists("shein_last_timestamp", $data) ? (string)$data["shein_last_timestamp"] : ($existing["shein_last_timestamp"] ?? null);
$shein_track_url = array_key_exists("shein_track_url", $data) ? (string)$data["shein_track_url"] : ($existing["shein_track_url"] ?? null);
$shein_delivered = array_key_exists("shein_delivered", $data) ? (int)((bool)$data["shein_delivered"]) : (int)($existing["shein_delivered"] ?? 0);
$shein_total_weight_g = array_key_exists("shein_total_weight_g", $data) ? (int)$data["shein_total_weight_g"] : (isset($existing["shein_total_weight_g"]) ? (int)$existing["shein_total_weight_g"] : null);
$shein_total_weight_kg = array_key_exists("shein_total_weight_kg", $data) ? (float)$data["shein_total_weight_kg"] : (isset($existing["shein_total_weight_kg"]) ? (float)$existing["shein_total_weight_kg"] : null);
$shein_total_weight_plus_2kg = array_key_exists("shein_total_weight_plus_2kg", $data) ? (float)$data["shein_total_weight_plus_2kg"] : (isset($existing["shein_total_weight_plus_2kg"]) ? (float)$existing["shein_total_weight_plus_2kg"] : null);

$stmt = $conn->prepare("
  UPDATE order_carts
  SET cart_order_number=?, cart_price=?,
      shein_email=?, shein_order_no=?, shein_carrier=?, shein_tracking_no=?,
      shein_status_text=?, shein_last_details=?, shein_last_timestamp=?,
      shein_track_url=?, shein_delivered=?, shein_total_weight_g=?,
      shein_total_weight_kg=?, shein_total_weight_plus_2kg=?
  WHERE id=? AND user_id=?
");
$stmt->bind_param(
  "sdssssssssidddii",
  $cart_order_number,
  $cart_price,
  $shein_email,
  $shein_order_no,
  $shein_carrier,
  $shein_tracking_no,
  $shein_status_text,
  $shein_last_details,
  $shein_last_timestamp,
  $shein_track_url,
  $shein_delivered,
  $shein_total_weight_g,
  $shein_total_weight_kg,
  $shein_total_weight_plus_2kg,
  $id,
  $user_id
);

if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
  exit;
}

refresh_joint_shipment_for_tracking($conn, $user_id, $old_tracking_no);
refresh_joint_shipment_for_tracking($conn, $user_id, $shein_tracking_no);

// affected_rows can be 0 when values are unchanged; that's still a valid request.
echo json_encode(["success" => true, "affected" => $stmt->affected_rows]);
?>
