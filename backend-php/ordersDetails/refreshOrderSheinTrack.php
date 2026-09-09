<?php
require_once "../sheinAccounts/_common.php";
require_once "./_jointShipment.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];
$data = json_input();
$order_id = (int)($data["order_id"] ?? $data["id"] ?? 0);

if ($order_id <= 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Order id is required"]);
  exit;
}

$orderStmt = $conn->prepare("SELECT id FROM orders WHERE id=? AND user_id=? LIMIT 1");
$orderStmt->bind_param("ii", $order_id, $user_id);
$orderStmt->execute();
if (!$orderStmt->get_result()->fetch_assoc()) {
  http_response_code(404);
  echo json_encode(["ok" => false, "error" => "Order not found"]);
  exit;
}

$cartsStmt = $conn->prepare("
  SELECT id, shein_email, shein_order_no, shein_delivered, shein_tracking_no
  FROM order_carts
  WHERE order_id=? AND user_id=? AND COALESCE(shein_delivered, 0)=0
  ORDER BY id DESC
");
$cartsStmt->bind_param("ii", $order_id, $user_id);
$cartsStmt->execute();
$res = $cartsStmt->get_result();

$carts = [];
while ($row = $res->fetch_assoc()) $carts[] = $row;

$accountCache = [];
$updated = 0;
$skipped = 0;
$errors = [];

$updStmt = $conn->prepare("
  UPDATE order_carts
  SET shein_carrier=?, shein_tracking_no=?, shein_status_text=?, shein_last_details=?, shein_last_timestamp=?,
      shein_track_url=?, shein_delivered=?,
      shein_is_split_shipment=?, shein_split_count=?, shein_split_tracking_numbers_json=?, shein_split_package_refs_json=?
  WHERE id=? AND user_id=?
");

foreach ($carts as $cart) {
  $cart_id = (int)$cart["id"];
  $old_tracking_no = $cart["shein_tracking_no"] ?? null;
  $api_email = norm_email($cart["shein_email"] ?? "");
  $order_no = trim((string)($cart["shein_order_no"] ?? ""));

  if ($api_email === "" || $order_no === "") {
    $skipped++;
    continue;
  }

  if (!array_key_exists($api_email, $accountCache)) {
    $accStmt = $conn->prepare("
      SELECT api_email, shein_email, shein_password, gmail_email, gmail_app_password, cookies_json, profile_key
      FROM shein_accounts
      WHERE user_id=? AND api_email=?
      LIMIT 1
    ");
    $accStmt->bind_param("is", $user_id, $api_email);
    $accStmt->execute();
    $accountCache[$api_email] = $accStmt->get_result()->fetch_assoc() ?: null;
  }

  $acc = $accountCache[$api_email];
  if (!$acc) {
    $errors[] = "Cart {$cart_id}: SHEIN account not found for {$api_email}";
    continue;
  }

  $profile_key = trim((string)($acc["profile_key"] ?? ""));
  if ($profile_key === "") $profile_key = "user_" . $user_id . "_" . preg_replace("/[^a-z0-9_]+/i", "_", $api_email);

  $trackPayload = [
    "order_no" => $order_no,
    "shein_email" => (string)$acc["shein_email"],
    "shein_password" => (string)$acc["shein_password"],
    "gmail_email" => (string)$acc["gmail_email"],
    "gmail_app_password" => (string)$acc["gmail_app_password"],
    "profile_key" => $profile_key,
    "storage_state_json" => $acc["cookies_json"] ? (string)$acc["cookies_json"] : null,
  ];

  [$okTrack, $trackErr, $trackData] = call_shein_scraper_json("track_one", $trackPayload);
  if (!$okTrack) {
    $errors[] = "Cart {$cart_id}: {$trackErr}";
    continue;
  }

  $carrier = $trackData["carrier"] ?? null;
  $tracking_no = $trackData["tracking_no"] ?? null;
  $status_text = $trackData["status_text"] ?? null;
  $last_details = $trackData["last_details"] ?? null;
  $last_timestamp = $trackData["last_timestamp"] ?? null;
  $track_url = $trackData["track_url"] ?? null;
  $delivered = !empty($trackData["delivered"]) ? 1 : 0;
  $is_split = !empty($trackData["is_split"]) ? 1 : 0;
  $split_count = isset($trackData["split_count"]) ? (int)$trackData["split_count"] : 0;
  $split_tracking_numbers_json = null;
  $split_package_refs_json = null;
  if (isset($trackData["all_tracking_numbers"]) && is_array($trackData["all_tracking_numbers"])) {
    $split_tracking_numbers_json = json_encode(array_values($trackData["all_tracking_numbers"]));
  }
  if (isset($trackData["all_package_refs"]) && is_array($trackData["all_package_refs"])) {
    $split_package_refs_json = json_encode(array_values($trackData["all_package_refs"]));
  }

  $updStmt->bind_param(
    "ssssssiiissii",
    $carrier,
    $tracking_no,
    $status_text,
    $last_details,
    $last_timestamp,
    $track_url,
    $delivered,
    $is_split,
    $split_count,
    $split_tracking_numbers_json,
    $split_package_refs_json,
    $cart_id,
    $user_id
  );

  if (!$updStmt->execute()) {
    error_log("[shein-php] refresh order tracking update failed for cart {$cart_id}: " . $updStmt->error);
    $errors[] = "Cart {$cart_id}: Internal server error";
    continue;
  }
  refresh_joint_shipment_for_tracking($conn, $user_id, $old_tracking_no);
  refresh_joint_shipment_for_tracking($conn, $user_id, $tracking_no);
  $updated++;
}

$aggStmt = $conn->prepare("
  SELECT
    COALESCE(SUM(COALESCE(shein_total_weight_kg, 0)), 0) AS total_weight_kg,
    COALESCE(SUM(COALESCE(shein_total_weight_plus_2kg, 0)), 0) AS total_weight_plus_2kg,
    SUM(
      CASE
        WHEN COALESCE(shein_delivered, 0)=0 AND shein_order_no IS NOT NULL AND TRIM(shein_order_no) <> ''
        THEN 1
        ELSE 0
      END
    ) AS undelivered_carts
  FROM order_carts
  WHERE order_id=? AND user_id=?
");
$aggStmt->bind_param("ii", $order_id, $user_id);
$aggStmt->execute();
$agg = $aggStmt->get_result()->fetch_assoc() ?: [];

echo json_encode([
  "ok" => true,
  "order_id" => $order_id,
  "updated" => $updated,
  "skipped" => $skipped,
  "errors" => $errors,
  "summary" => [
    "total_weight_kg" => isset($agg["total_weight_kg"]) ? (float)$agg["total_weight_kg"] : 0.0,
    "total_weight_plus_2kg" => isset($agg["total_weight_plus_2kg"]) ? (float)$agg["total_weight_plus_2kg"] : 0.0,
    "undelivered_carts" => isset($agg["undelivered_carts"]) ? (int)$agg["undelivered_carts"] : 0,
  ],
]);
