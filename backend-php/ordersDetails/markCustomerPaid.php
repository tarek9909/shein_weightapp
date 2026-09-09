<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  http_response_code(200);
  exit();
}

require_once "../db.php";
require_once "../auth/auth.php";

function table_has_column(mysqli $conn, string $table, string $column): bool {
  $sql = "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1";
  $st = $conn->prepare($sql);
  if (!$st) return false;
  $st->bind_param("ss", $table, $column);
  if (!$st->execute()) return false;
  return (bool)$st->get_result()->fetch_assoc();
}

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data["ids"]) || !is_array($data["ids"]) || empty($data["ids"])) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "No customer IDs provided"]);
  exit;
}

// sanitize ids
$ids = array_values(array_unique(array_filter(array_map("intval", $data["ids"]), fn($v) => $v > 0)));
if (empty($ids)) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Invalid customer IDs"]);
  exit;
}

// Build placeholders for IN (...)
$placeholders = implode(",", array_fill(0, count($ids), "?"));
$types = str_repeat("i", count($ids));

try {
  $conn->begin_transaction();

  /**
   * Get customer info for THIS USER only.
   * We also pull month_id through the joins.
   * (Recommended) limit to confirmed only to avoid paying wrong statuses.
   */
  $sql = "
    SELECT
      cc.id AS customer_id,
      cc.usd_to_collect,
      cc.delivery_charge_usd,
      cc.customer_name,
      o.month_id
    FROM cart_customers cc
    JOIN order_carts oc ON cc.cart_id = oc.id AND oc.user_id = cc.user_id
    JOIN orders o ON oc.order_id = o.id AND o.user_id = oc.user_id
    JOIN month m ON m.id = o.month_id AND m.user_id = cc.user_id
    WHERE cc.user_id = ?
      AND cc.id IN ($placeholders)
      AND cc.status = 'confirmed'
  ";

  $stmt = $conn->prepare($sql);
  if (!$stmt) throw new Exception($conn->error);

  // bind user_id + ids
  $bindTypes = "i" . $types;
  $params = array_merge([$user_id], $ids);

  // mysqli bind_param needs references
  $refs = [];
  $refs[] = &$bindTypes;
  foreach ($params as $k => $v) $refs[] = &$params[$k];
  call_user_func_array([$stmt, "bind_param"], $refs);

  $stmt->execute();
  $res = $stmt->get_result();

  $customers = [];
  while ($row = $res->fetch_assoc()) $customers[] = $row;

  if (count($customers) !== count($ids)) {
    throw new RuntimeException("One or more customers are not eligible (they must be your customers with status=confirmed).", 400);
  }

  // Group customers by month_id
  $groups = [];
  foreach ($customers as $c) {
    $mid = (int)$c["month_id"];
    if ($mid <= 0) continue;
    if (!isset($groups[$mid])) $groups[$mid] = [];
    $groups[$mid][] = $c;
  }

  if (empty($groups)) {
    throw new Exception("No valid month_id found for provided customers.");
  }

  $hasItemDeliveryCharge = table_has_column($conn, "payment_customer_items", "delivery_charge");
  $createdPaymentIds = [];

  // Insert a payment per month, add payment_customer_items details, then mark customers as paid
  foreach ($groups as $monthId => $groupCustomers) {
    $total = 0.0;
    $originalAmount = 0.0;
    $deliveryChargeTotal = 0.0;
    $customerIds = [];
    foreach ($groupCustomers as $gc) {
      $net = (float)($gc["usd_to_collect"] ?? 0);
      $dc = (float)($gc["delivery_charge_usd"] ?? 0);
      $total += $net;
      $originalAmount += ($net + $dc);
      $deliveryChargeTotal += $dc;
      $customerIds[] = (int)$gc["customer_id"];
    }
    $customerCount = count($groupCustomers);
    $customerIdsJson = json_encode(array_values(array_unique($customerIds)));
    if ($customerIdsJson === false) $customerIdsJson = null;
    $note = "Customer payment (Delivery collection)";

    $ins = $conn->prepare("
      INSERT INTO payments
        (user_id, month_id, payment_amount, payment_type, original_amount, delivery_charge, customer_count, customer_ids_json, note)
      VALUES
        (?, ?, ?, 'customers', ?, ?, ?, ?, ?)
    ");
    if (!$ins) throw new Exception($conn->error);
    $ins->bind_param("iidddiss", $user_id, $monthId, $total, $originalAmount, $deliveryChargeTotal, $customerCount, $customerIdsJson, $note);
    if (!$ins->execute()) throw new Exception($ins->error);
    $payment_id = (int)$ins->insert_id;
    $createdPaymentIds[] = $payment_id;

    if ($hasItemDeliveryCharge) {
      $insItem = $conn->prepare("
        INSERT INTO payment_customer_items
          (payment_id, customer_id, customer_name_snapshot, amount, delivery_charge, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      ");
    } else {
      $insItem = $conn->prepare("
        INSERT INTO payment_customer_items
          (payment_id, customer_id, customer_name_snapshot, amount, user_id)
        VALUES (?, ?, ?, ?, ?)
      ");
    }
    if (!$insItem) throw new Exception($conn->error);

    foreach ($groupCustomers as $gc) {
      $cid = (int)$gc["customer_id"];
      $cname = (string)($gc["customer_name"] ?? "");
      $amt = (float)($gc["usd_to_collect"] ?? 0);
      $itemDeliveryCharge = (float)($gc["delivery_charge_usd"] ?? 0);
      if ($hasItemDeliveryCharge) {
        $insItem->bind_param("iisddi", $payment_id, $cid, $cname, $amt, $itemDeliveryCharge, $user_id);
      } else {
        $insItem->bind_param("iisdi", $payment_id, $cid, $cname, $amt, $user_id);
      }
      if (!$insItem->execute()) throw new Exception($insItem->error);
    }

    $ph2 = implode(",", array_fill(0, count($customerIds), "?"));
    $t2 = str_repeat("i", count($customerIds));

    $updSql = "
      UPDATE cart_customers
      SET status='paid', delivery_status='paid'
      WHERE user_id=?
        AND id IN ($ph2)
    ";
    $upd = $conn->prepare($updSql);
    if (!$upd) throw new Exception($conn->error);

    $bindTypes2 = "i" . $t2;
    $params2 = array_merge([$user_id], $customerIds);

    $refs2 = [];
    $refs2[] = &$bindTypes2;
    foreach ($params2 as $k => $v) $refs2[] = &$params2[$k];
    call_user_func_array([$upd, "bind_param"], $refs2);

    if (!$upd->execute()) throw new Exception($upd->error);
  }

  $conn->commit();
  echo json_encode(["success" => true, "message" => "Payments added and customers marked as paid", "payment_ids" => $createdPaymentIds]);

} catch (Exception $e) {
  $conn->rollback();
  $status = (int)$e->getCode();
  http_response_code($status >= 400 && $status < 500 ? $status : 500);
  echo json_encode(["success" => false, "error" => $status >= 400 && $status < 500 ? $e->getMessage() : "Internal server error"]);
}
?>
