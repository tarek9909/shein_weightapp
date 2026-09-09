<?php
require_once "../sheinAccounts/_common.php";
require_once "./_jointShipment.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];
$data = json_input();
$cart_id = (int)($data["id"] ?? 0);
$requested_profile_key = trim((string)($data["profile_key"] ?? ""));
set_time_limit(180);
ini_set('max_execution_time', '180');

if ($cart_id <= 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Cart id is required"]);
  exit;
}

$cartStmt = $conn->prepare("
  SELECT id, cart_order_number, cart_price, shein_email, shein_order_no, shein_tracking_no
  FROM order_carts
  WHERE id=? AND user_id=?
  LIMIT 1
");
$cartStmt->bind_param("ii", $cart_id, $user_id);
$cartStmt->execute();
$cart = $cartStmt->get_result()->fetch_assoc();

if (!$cart) {
  http_response_code(404);
  echo json_encode(["ok" => false, "error" => "Cart not found"]);
  exit;
}

$api_email = norm_email($cart["shein_email"] ?? "");
$order_no = trim((string)($cart["shein_order_no"] ?? ""));
if ($api_email === "" || $order_no === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Cart missing SHEIN email/order number"]);
  exit;
}

$accStmt = $conn->prepare("
  SELECT api_email, shein_email, shein_password, gmail_email, gmail_app_password, cookies_json, profile_key
  FROM shein_accounts
  WHERE user_id=? AND api_email=?
  LIMIT 1
");
$accStmt->bind_param("is", $user_id, $api_email);
$accStmt->execute();
$acc = $accStmt->get_result()->fetch_assoc();

if (!$acc) {
  http_response_code(404);
  echo json_encode(["ok" => false, "error" => "SHEIN account not found for selected email"]);
  exit;
}

$profile_key = $requested_profile_key !== ""
  ? $requested_profile_key
  : trim((string)($acc["profile_key"] ?? ""));
if ($profile_key === "") $profile_key = "user_" . $user_id . "_" . preg_replace("/[^a-z0-9_]+/i", "_", $api_email);

$basePayload = [
  "order_no" => $order_no,
  "shein_email" => (string)$acc["shein_email"],
  "shein_password" => (string)$acc["shein_password"],
  "gmail_email" => (string)$acc["gmail_email"],
  "gmail_app_password" => (string)$acc["gmail_app_password"],
  "profile_key" => $profile_key,
  "storage_state_json" => $acc["cookies_json"] ? (string)$acc["cookies_json"] : null,
];

[$okTrack, $trackErr, $trackData] = call_shein_scraper_json("track_one", $basePayload);
if (!$okTrack) {
  http_response_code(502);
  echo json_encode(["ok" => false, "error" => "Track failed: " . $trackErr]);
  exit;
}

[$okWeight, $weightErr, $weightData] = call_shein_scraper_json("weight_one", $basePayload);
if (!$okWeight) {
  http_response_code(502);
  echo json_encode(["ok" => false, "error" => "Weight failed: " . $weightErr]);
  exit;
}

$totalKg = isset($weightData["total_weight_kg"]) ? (float)$weightData["total_weight_kg"] : null;
$plus2 = ($totalKg !== null) ? $totalKg + 2.0 : null;

$upd = $conn->prepare("
  UPDATE order_carts
  SET shein_carrier=?, shein_tracking_no=?, shein_status_text=?, shein_last_details=?, shein_last_timestamp=?,
      shein_track_url=?, shein_delivered=?, shein_total_weight_g=?, shein_total_weight_kg=?, shein_total_weight_plus_2kg=?,
      shein_is_split_shipment=?, shein_split_count=?, shein_split_tracking_numbers_json=?, shein_split_package_refs_json=?
  WHERE id=? AND user_id=?
");
$carrier = $trackData["carrier"] ?? null;
$tracking_no = $trackData["tracking_no"] ?? null;
$status_text = $trackData["status_text"] ?? null;
$last_details = $trackData["last_details"] ?? null;
$last_timestamp = $trackData["last_timestamp"] ?? null;
$track_url = $trackData["track_url"] ?? null;
$delivered = !empty($trackData["delivered"]) ? 1 : 0;
$weight_g = $weightData["total_weight_g"] ?? null;
$is_split = !empty($trackData["is_split"]) ? 1 : (!empty($weightData["is_split"]) ? 1 : 0);
$split_count = isset($trackData["split_count"]) ? (int)$trackData["split_count"] : (isset($weightData["split_count"]) ? (int)$weightData["split_count"] : 0);
$split_tracking_numbers_json = null;
$split_package_refs_json = null;
if (isset($trackData["all_tracking_numbers"]) && is_array($trackData["all_tracking_numbers"])) {
  $split_tracking_numbers_json = json_encode(array_values($trackData["all_tracking_numbers"]));
} elseif (isset($weightData["all_tracking_numbers"]) && is_array($weightData["all_tracking_numbers"])) {
  $split_tracking_numbers_json = json_encode(array_values($weightData["all_tracking_numbers"]));
}
if (isset($trackData["all_package_refs"]) && is_array($trackData["all_package_refs"])) {
  $split_package_refs_json = json_encode(array_values($trackData["all_package_refs"]));
} elseif (isset($weightData["all_package_refs"]) && is_array($weightData["all_package_refs"])) {
  $split_package_refs_json = json_encode(array_values($weightData["all_package_refs"]));
}
$old_tracking_no = $cart["shein_tracking_no"] ?? null;

$upd->bind_param(
  "ssssssiiddiissii",
  $carrier,
  $tracking_no,
  $status_text,
  $last_details,
  $last_timestamp,
  $track_url,
  $delivered,
  $weight_g,
  $totalKg,
  $plus2,
  $is_split,
  $split_count,
  $split_tracking_numbers_json,
  $split_package_refs_json,
  $cart_id,
  $user_id
);

if (!$upd->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}

refresh_joint_shipment_for_tracking($conn, $user_id, $old_tracking_no);
refresh_joint_shipment_for_tracking($conn, $user_id, $tracking_no);

echo json_encode([
  "ok" => true,
  "track" => $trackData,
  "weight" => $weightData,
  "saved" => true
]);
