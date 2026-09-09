<?php
ini_set("display_errors", "0");
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

require_once "../db.php";
require_once "../auth/auth.php";

function fail_json(int $code, string $msg) {
  http_response_code($code);
  echo json_encode(["success" => false, "error" => $msg]);
  exit;
}

function table_has_column(mysqli $conn, string $table, string $column): bool {
  $sql = "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1";
  $st = $conn->prepare($sql);
  if (!$st) return false;
  $st->bind_param("ss", $table, $column);
  if (!$st->execute()) return false;
  return (bool)$st->get_result()->fetch_assoc();
}

try {
  $payload = require_auth();
  $user_id = (int)($payload["user_id"] ?? 0);
  if ($user_id <= 0) fail_json(401, "Invalid token payload");

  $data = json_decode(file_get_contents("php://input"), true);
  if (!is_array($data)) fail_json(400, "Invalid JSON body");

  $month_id = (int)($data["month_id"] ?? 0);
  if ($month_id <= 0) fail_json(400, "month_id is required");

  $chk = $conn->prepare("SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1");
  $chk->bind_param("ii", $month_id, $user_id);
  $chk->execute();
  if (!$chk->get_result()->fetch_assoc()) fail_json(403, "Unauthorized month");

  $payment_type = strtolower(trim((string)($data["payment_type"] ?? "manual")));
  if ($payment_type === "") $payment_type = "manual";

  if ($payment_type === "customers") {
    $items = $data["customer_items"] ?? null;
    if (!is_array($items) || count($items) === 0) fail_json(400, "customer_items is required");

    $preparedItems = [];
    $original_amount = 0.0;
    $delivery_charge = 0.0;
    $selectedCustomerIds = [];
    foreach ($items as $it) {
      if (!is_array($it)) continue;
      $customer_id = isset($it["customer_id"]) ? (int)$it["customer_id"] : 0;
      $amount = isset($it["amount"]) ? (float)$it["amount"] : 0.0;
      $item_delivery_charge = isset($it["delivery_charge"]) ? (float)$it["delivery_charge"] : 0.0;
      $name = trim((string)($it["customer_name"] ?? ""));
      if (!is_finite($amount) || $amount < 0) continue;
      if (!is_finite($item_delivery_charge) || $item_delivery_charge < 0) continue;
      if ($item_delivery_charge > $amount) continue;
      if ($customer_id <= 0 && $name === "") continue;
      $preparedItems[] = [
        "customer_id" => $customer_id > 0 ? $customer_id : null,
        "customer_name" => $name !== "" ? $name : null,
        "amount" => $amount,
        "delivery_charge" => $item_delivery_charge,
      ];
      $original_amount += $amount;
      $delivery_charge += $item_delivery_charge;
      if ($customer_id > 0) $selectedCustomerIds[] = $customer_id;
    }

    if (count($preparedItems) === 0) fail_json(400, "No valid customer items");

    if (count($selectedCustomerIds) > 0) {
      $ph = implode(",", array_fill(0, count($selectedCustomerIds), "?"));
      $types = str_repeat("i", count($selectedCustomerIds));
      $sql = "
        SELECT cc.id
        FROM cart_customers cc
        JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id
        JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
        WHERE cc.user_id=?
          AND o.month_id=?
          AND cc.id IN ($ph)
          AND COALESCE(cc.status, '') NOT IN ('paid', 'done')
          AND COALESCE(cc.delivery_status, '') NOT IN ('paid', 'done')
      ";
      $stmtSel = $conn->prepare($sql);
      $bindTypes = "ii" . $types;
      $params = array_merge([$user_id, $month_id], $selectedCustomerIds);
      $refs = [];
      $refs[] = &$bindTypes;
      foreach ($params as $k => $v) $refs[] = &$params[$k];
      call_user_func_array([$stmtSel, "bind_param"], $refs);
      $stmtSel->execute();
      $okRows = $stmtSel->get_result()->fetch_all(MYSQLI_ASSOC);
      $okMap = [];
      foreach ($okRows as $r) $okMap[(int)$r["id"]] = true;
      foreach ($selectedCustomerIds as $cid) {
        if (!isset($okMap[(int)$cid])) {
          fail_json(400, "One or more selected customers are already paid or not eligible");
        }
      }
    }

    $net_amount = $original_amount - $delivery_charge;
    $customer_count = count($preparedItems);
    $customer_ids = [];
    foreach ($preparedItems as $it) {
      if (!empty($it["customer_id"])) $customer_ids[] = (int)$it["customer_id"];
    }
    $customer_ids_json = json_encode(array_values(array_unique($customer_ids)));
    $note = trim((string)($data["note"] ?? ""));
    if ($note === "") $note = "Customer payment";

    $conn->begin_transaction();

    $ins = $conn->prepare("
      INSERT INTO payments
        (user_id, month_id, payment_amount, payment_type, original_amount, delivery_charge, customer_count, customer_ids_json, note)
      VALUES
        (?, ?, ?, 'customers', ?, ?, ?, ?, ?)
    ");
    $ins->bind_param(
      "iidddiss",
      $user_id,
      $month_id,
      $net_amount,
      $original_amount,
      $delivery_charge,
      $customer_count,
      $customer_ids_json,
      $note
    );
    if (!$ins->execute()) throw new Exception($ins->error);
    $payment_id = (int)$ins->insert_id;

    $hasItemDeliveryCharge = table_has_column($conn, "payment_customer_items", "delivery_charge");
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
    foreach ($preparedItems as $it) {
      $cid = $it["customer_id"];
      $cname = $it["customer_name"];
      $amt = (float)$it["amount"];
      $item_delivery_charge = (float)$it["delivery_charge"];
      if ($hasItemDeliveryCharge) {
        $insItem->bind_param("iisddi", $payment_id, $cid, $cname, $amt, $item_delivery_charge, $user_id);
      } else {
        $insItem->bind_param("iisdi", $payment_id, $cid, $cname, $amt, $user_id);
      }
      if (!$insItem->execute()) throw new Exception($insItem->error);
    }

    if (count($selectedCustomerIds) > 0) {
      $uniqIds = array_values(array_unique(array_map("intval", $selectedCustomerIds)));
      $ph2 = implode(",", array_fill(0, count($uniqIds), "?"));
      $types2 = str_repeat("i", count($uniqIds));
      $sqlUpd = "
        UPDATE cart_customers
        SET status='paid', delivery_status='paid'
        WHERE user_id=?
          AND id IN ($ph2)
      ";
      $stmtUpd = $conn->prepare($sqlUpd);
      $bindTypes2 = "i" . $types2;
      $params2 = array_merge([$user_id], $uniqIds);
      $refs2 = [];
      $refs2[] = &$bindTypes2;
      foreach ($params2 as $k => $v) $refs2[] = &$params2[$k];
      call_user_func_array([$stmtUpd, "bind_param"], $refs2);
      if (!$stmtUpd->execute()) throw new Exception($stmtUpd->error);
    }

    $conn->commit();
    echo json_encode([
      "success" => true,
      "id" => $payment_id,
      "payment_type" => "customers",
      "payment_amount" => $net_amount,
      "original_amount" => $original_amount,
      "delivery_charge" => $delivery_charge,
      "customer_count" => $customer_count,
      "customer_ids_json" => $customer_ids_json,
      "note" => $note
    ]);
    exit;
  }

  $payment_amount = $data["payment_amount"] ?? null;
  if ($payment_amount === null || $payment_amount === "") fail_json(400, "payment_amount is required");
  $payment_amount = (float)$payment_amount;
  if (!is_finite($payment_amount)) fail_json(400, "payment_amount invalid");
  $note = trim((string)($data["note"] ?? ""));
  if ($note === "") $note = null;

  $stmt = $conn->prepare("
    INSERT INTO payments
      (user_id, month_id, payment_amount, payment_type, original_amount, delivery_charge, customer_count, customer_ids_json, note)
    VALUES
      (?, ?, ?, 'manual', NULL, 0, 0, NULL, ?)
  ");
  $stmt->bind_param("iids", $user_id, $month_id, $payment_amount, $note);
  if (!$stmt->execute()) throw new Exception($stmt->error);

  echo json_encode(["success" => true, "id" => (int)$stmt->insert_id, "payment_type" => "manual"]);
  exit;
} catch (Throwable $e) {
  if ($conn && $conn->errno) {
    try {
      $conn->rollback();
    } catch (Throwable $ignored) {}
  }
  error_log("[shein-php] addPayment failure: " . (string)$e);
  fail_json(500, "Internal server error");
}
?>
