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
  SELECT id, shein_email, shein_order_no, shein_tracking_no
  FROM order_carts
  WHERE order_id=? AND user_id=?
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
$touched_trackings = [];

$updStmt = $conn->prepare("
  UPDATE order_carts
  SET shein_total_weight_g=?, shein_total_weight_kg=?, shein_total_weight_plus_2kg=?,
      shein_is_split_shipment=?, shein_split_count=?, shein_split_tracking_numbers_json=?, shein_split_package_refs_json=?
  WHERE id=? AND user_id=?
");

$apply_weight_to_cart = function (int $cart_id, array $weightData) use ($updStmt, $user_id, &$errors, &$updated) {
  $weight_g = isset($weightData["total_weight_g"]) ? (int)$weightData["total_weight_g"] : null;
  $totalKg = isset($weightData["total_weight_kg"]) ? (float)$weightData["total_weight_kg"] : null;
  $plus2 = ($totalKg !== null) ? ($totalKg + 2.0) : null;
  $is_split = !empty($weightData["is_split"]) ? 1 : 0;
  $split_count = isset($weightData["split_count"]) ? (int)$weightData["split_count"] : 0;
  $split_tracking_numbers_json = null;
  $split_package_refs_json = null;
  if (isset($weightData["all_tracking_numbers"]) && is_array($weightData["all_tracking_numbers"])) {
    $split_tracking_numbers_json = json_encode(array_values($weightData["all_tracking_numbers"]));
  }
  if (isset($weightData["all_package_refs"]) && is_array($weightData["all_package_refs"])) {
    $split_package_refs_json = json_encode(array_values($weightData["all_package_refs"]));
  }

  $updStmt->bind_param(
    "iddiissii",
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

  if (!$updStmt->execute()) {
    error_log("[shein-php] refresh order weight update failed for cart {$cart_id}: " . $updStmt->error);
    $errors[] = "Cart {$cart_id}: Internal server error";
    return;
  }
  $updated++;
};

$groups = []; // api_email => ["acc" => [...], "orders" => ["GSH..." => [cart_id,...]]]

foreach ($carts as $cart) {
  $cart_id = (int)$cart["id"];
  $api_email = norm_email($cart["shein_email"] ?? "");
  $order_no = trim((string)($cart["shein_order_no"] ?? ""));
  $tracking_no = trim((string)($cart["shein_tracking_no"] ?? ""));
  if ($tracking_no !== "") $touched_trackings[$tracking_no] = true;

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

  if (!isset($groups[$api_email])) {
    $groups[$api_email] = ["acc" => $acc, "orders" => []];
  }
  if (!isset($groups[$api_email]["orders"][$order_no])) {
    $groups[$api_email]["orders"][$order_no] = [];
  }
  $groups[$api_email]["orders"][$order_no][] = $cart_id;
}

foreach ($groups as $api_email => $group) {
  $acc = $group["acc"];
  $profile_key = trim((string)($acc["profile_key"] ?? ""));
  if ($profile_key === "") $profile_key = "user_" . $user_id . "_" . preg_replace("/[^a-z0-9_]+/i", "_", $api_email);

  $order_nos = array_keys($group["orders"]);
  if (!$order_nos) continue;

  $weightPayload = [
    "order_nos" => array_values($order_nos),
    "shein_email" => (string)$acc["shein_email"],
    "shein_password" => (string)$acc["shein_password"],
    "gmail_email" => (string)$acc["gmail_email"],
    "gmail_app_password" => (string)$acc["gmail_app_password"],
    "profile_key" => $profile_key,
    "storage_state_json" => $acc["cookies_json"] ? (string)$acc["cookies_json"] : null,
  ];

  [$okWeightMany, $weightManyErr, $weightManyData] =
    call_shein_scraper_json("weight_many", $weightPayload);

  if (!$okWeightMany) {
    foreach ($group["orders"] as $order_no => $cart_ids) {
      foreach ($cart_ids as $cid) {
        $errors[] = "Cart {$cid}: {$weightManyErr}";
      }
    }
    continue;
  }

  $results = $weightManyData["results"] ?? [];
  $byOrderNo = [];
  if (is_array($results)) {
    foreach ($results as $row) {
      if (!is_array($row)) continue;
      $ono = trim((string)($row["order_no"] ?? ""));
      if ($ono === "") continue;
      $byOrderNo[$ono] = $row;
    }
  }

  foreach ($group["orders"] as $order_no => $cart_ids) {
    $row = $byOrderNo[$order_no] ?? null;
    if (!$row) {
      foreach ($cart_ids as $cid) $errors[] = "Cart {$cid}: Missing weight result for order {$order_no}";
      continue;
    }
    if (empty($row["ok"])) {
      $errMsg = (string)($row["error"] ?? "Weight fetch failed");
      foreach ($cart_ids as $cid) $errors[] = "Cart {$cid}: {$errMsg}";
      continue;
    }
    foreach ($cart_ids as $cid) $apply_weight_to_cart((int)$cid, $row);
  }
}

foreach (array_keys($touched_trackings) as $tn) {
  refresh_joint_shipment_for_tracking($conn, $user_id, $tn);
}

$aggStmt = $conn->prepare("
  SELECT
    COALESCE(SUM(COALESCE(shein_total_weight_kg, 0)), 0) AS total_weight_kg,
    COALESCE(SUM(COALESCE(shein_total_weight_plus_2kg, 0)), 0) AS total_weight_plus_2kg
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
  ],
]);
