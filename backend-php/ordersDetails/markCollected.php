<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(200);
  echo json_encode(["ok" => true]);
  exit;
}

require_once "../db.php";
require_once "../auth/auth.php";

$payload = require_auth();
$user_id = (int)($payload["user_id"] ?? 0);

$raw = file_get_contents("php://input");
$data = json_decode($raw, true);
if (!is_array($data)) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Invalid JSON body"]);
  exit;
}

$customer_id = (int)($data["id"] ?? ($data["customer_id"] ?? 0));
$usd_to_collect = array_key_exists('usd_to_collect', $data) ? (float)$data['usd_to_collect'] : null;
$delivery_charge_usd = array_key_exists('delivery_charge_usd', $data) ? (float)$data['delivery_charge_usd'] : null;
if ($customer_id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Missing customer id"]);
  exit;
}

$sel = $conn->prepare("
  SELECT
    cc.id AS customer_id,
    cc.customer_name,
    cc.usd_to_collect,
    cc.delivery_charge_usd,
    oc.id AS cart_id,
    oc.cart_order_number,
    o.id AS order_id,
    o.order_name,
    o.month_id
  FROM cart_customers cc
  JOIN order_carts oc ON cc.cart_id = oc.id
  JOIN orders o ON oc.order_id = o.id
  JOIN month m ON o.month_id = m.id
  WHERE cc.id=? AND m.user_id=?
  LIMIT 1
");
if (!$sel) {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
  exit;
}
$sel->bind_param("ii", $customer_id, $user_id);
if (!$sel->execute()) {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
  exit;
}
$current = $sel->get_result()->fetch_assoc();
if (!$current) {
  http_response_code(404);
  echo json_encode(["success" => false, "error" => "Customer not found or not allowed"]);
  exit;
}

$finalUsd = ($usd_to_collect === null) ? (float)($current['usd_to_collect'] ?? 0) : $usd_to_collect;
$finalCharge = ($delivery_charge_usd === null) ? (float)($current['delivery_charge_usd'] ?? 0) : $delivery_charge_usd;
$currentUsd = (float)($current['usd_to_collect'] ?? 0);
$currentCharge = (float)($current['delivery_charge_usd'] ?? 0);
$month_id = (int)($current['month_id'] ?? 0);

$upd = $conn->prepare("
  UPDATE cart_customers cc
  JOIN order_carts oc ON cc.cart_id = oc.id
  JOIN orders o ON oc.order_id = o.id
  JOIN month m ON o.month_id = m.id
  SET cc.status='collected',
      cc.delivery_status='added',
      cc.usd_to_collect = ?,
      cc.delivery_charge_usd = ?
  WHERE cc.id=? AND m.user_id=?
");
if (!$upd) {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
  exit;
}

$insLoss = $conn->prepare("
  INSERT INTO delivery_losses (
    month_id, user_id, status, loss_type, amount, signed_diff, description,
    customer_id, customer_name_snapshot, order_id, order_name_snapshot, cart_id, cart_order_number_snapshot,
    ref_label, source_key
  ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
");
if (!$insLoss) {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
  exit;
}

$refLabel = trim((string)($current['customer_name'] ?? ''))
  . ' | order ' . trim((string)($current['order_name'] ?? $current['order_id']))
  . ' / cart ' . trim((string)($current['cart_order_number'] ?? $current['cart_id']));
$createdLosses = 0;

$conn->begin_transaction();
try {
  $upd->bind_param("ddii", $finalUsd, $finalCharge, $customer_id, $user_id);
  if (!$upd->execute()) throw new Exception($upd->error ?: 'Update failed');
  if ($upd->affected_rows === 0) throw new Exception('Customer not found or not allowed');

  if ($month_id > 0) {
    $netDiff = round($finalUsd - $currentUsd, 2);
    if (abs($netDiff) > 0.009) {
      $lossType = 'out of stock item';
      $amount = abs($netDiff);
      $signed = $netDiff;
      $desc = 'Delivery tracking net difference (' . ($netDiff > 0 ? '+' : '') . number_format($netDiff, 2, '.', '') . ')';
      $custId = (int)$current['customer_id'];
      $custName = (string)($current['customer_name'] ?? '');
      $orderId = (int)($current['order_id'] ?? 0);
      $orderName = (string)($current['order_name'] ?? '');
      $cartId = (int)($current['cart_id'] ?? 0);
      $cartOrder = (string)($current['cart_order_number'] ?? '');
      $sourceKey = 'delivery-tracking|amount|' . $custId . '|' . $orderId . '|' . $cartId;
      $insLoss->bind_param(
        "iisddsisisisss",
        $month_id, $user_id, $lossType, $amount, $signed, $desc,
        $custId, $custName, $orderId, $orderName, $cartId, $cartOrder,
        $refLabel, $sourceKey
      );
      if (!$insLoss->execute()) throw new Exception($insLoss->error ?: 'Failed to insert net loss');
      $createdLosses++;
    }

    $chargeDiff = round($finalCharge - $currentCharge, 2);
    if (abs($chargeDiff) > 0.009) {
      $lossType = 'delivery charge';
      $amount = abs($chargeDiff);
      $signed = $chargeDiff;
      $desc = 'Delivery tracking charge difference (' . ($chargeDiff > 0 ? '+' : '') . number_format($chargeDiff, 2, '.', '') . ')';
      $custId = (int)$current['customer_id'];
      $custName = (string)($current['customer_name'] ?? '');
      $orderId = (int)($current['order_id'] ?? 0);
      $orderName = (string)($current['order_name'] ?? '');
      $cartId = (int)($current['cart_id'] ?? 0);
      $cartOrder = (string)($current['cart_order_number'] ?? '');
      $sourceKey = 'delivery-tracking|charge|' . $custId . '|' . $orderId . '|' . $cartId;
      $insLoss->bind_param(
        "iisddsisisisss",
        $month_id, $user_id, $lossType, $amount, $signed, $desc,
        $custId, $custName, $orderId, $orderName, $cartId, $cartOrder,
        $refLabel, $sourceKey
      );
      if (!$insLoss->execute()) throw new Exception($insLoss->error ?: 'Failed to insert charge loss');
      $createdLosses++;
    }
  }

  $conn->commit();
  echo json_encode(["success" => true, "losses_created" => $createdLosses]);
} catch (Throwable $e) {
  $conn->rollback();
  http_response_code(($e->getMessage() === 'Customer not found or not allowed') ? 404 : 500);
  error_log('[shein-php] mark collected failure: ' . (string)$e);
  echo json_encode(["success" => false, "error" => backend_public_exception_message($e, "Customer not found or not allowed")]);
}
