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
$user_id = (int)($payload["user_id"] ?? 0);
$data = json_decode(file_get_contents("php://input"), true);

$month_id = (int)($data["month_id"] ?? 0);
$rows = isset($data["rows"]) && is_array($data["rows"]) ? $data["rows"] : [];

if ($month_id <= 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "month_id is required"]);
  exit;
}
if (!$rows) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "rows are required"]);
  exit;
}

$chk = $conn->prepare("SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1");
$chk->bind_param("ii", $month_id, $user_id);
$chk->execute();
if (!$chk->get_result()->fetch_assoc()) {
  http_response_code(403);
  echo json_encode(["ok" => false, "error" => "Invalid month for this user"]);
  exit;
}

// Ownership / month validation for selected customers
$customerIds = [];
foreach ($rows as $r) {
  $cid = (int)($r["selected_customer_id"] ?? 0);
  if ($cid > 0) $customerIds[$cid] = $cid;
}
if (!$customerIds) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "No selected customers in rows"]);
  exit;
}

$idList = array_values($customerIds);
$ph = implode(",", array_fill(0, count($idList), "?"));
$types = str_repeat("i", count($idList));
$sql = "
  SELECT cc.id, cc.delivery_number, cc.delivery_status
  FROM cart_customers cc
  JOIN order_carts oc ON oc.id = cc.cart_id AND oc.user_id = cc.user_id
  JOIN orders o ON o.id = oc.order_id AND o.user_id = oc.user_id
  WHERE cc.user_id=? AND o.month_id=? AND cc.id IN ($ph)
";
$stmtOwn = $conn->prepare($sql);
$bindTypes = "ii" . $types;
$params = array_merge([$user_id, $month_id], $idList);
$refs = [];
$refs[] = &$bindTypes;
foreach ($params as $k => $v) $refs[] = &$params[$k];
call_user_func_array([$stmtOwn, "bind_param"], $refs);
$stmtOwn->execute();
$resOwn = $stmtOwn->get_result();
$allowedMap = [];
while ($x = $resOwn->fetch_assoc()) $allowedMap[(int)$x["id"]] = $x;

$upd = $conn->prepare("
  UPDATE cart_customers
  SET delivery_number = ?,
      status = 'withdelivery',
      usd_to_collect = ?,
      delivery_charge_usd = ?
  WHERE id = ? AND user_id = ?
");

$dupCheck = $conn->prepare("
  SELECT id FROM cart_customers
  WHERE delivery_number = ? AND id <> ?
  LIMIT 1
");

$conn->begin_transaction();
try {
  $applied = [];
  $skipped = [];

  foreach ($rows as $idx => $r) {
    $cid = (int)($r["selected_customer_id"] ?? 0);
    $deliveryNo = trim((string)($r["delivery_number"] ?? ""));
    $status = strtolower(trim((string)($r["status"] ?? "")));
    $totalUsd = (float)($r["total_amount_usd"] ?? 0);
    $deliveryCharge = (float)($r["delivery_charge_usd"] ?? 0);
    $netUsd = array_key_exists("net_amount_usd", $r) ? (float)$r["net_amount_usd"] : ($totalUsd - $deliveryCharge);
    if ($netUsd < 0) $netUsd = 0.0;

    if (!isset($status, $deliveryNo) || ($status !== "pending" && $status !== "confirmed")) {
      $skipped[] = ["row_index" => $idx, "reason" => "invalid status"];
      continue;
    }
    if ($cid <= 0) {
      $skipped[] = ["row_index" => $idx, "reason" => "no selected customer"];
      continue;
    }
    if (!isset($allowedMap[$cid])) {
      throw new Exception("Customer #{$cid} is not valid for selected month/user");
    }
    if ($deliveryNo === "") {
      $skipped[] = ["row_index" => $idx, "reason" => "empty delivery number"];
      continue;
    }

    $dupCheck->bind_param("si", $deliveryNo, $cid);
    $dupCheck->execute();
    if ($dupCheck->get_result()->fetch_assoc()) {
      $skipped[] = ["row_index" => $idx, "reason" => "delivery number already exists", "delivery_number" => $deliveryNo];
      continue;
    }

    $upd->bind_param("sddii", $deliveryNo, $netUsd, $deliveryCharge, $cid, $user_id);
    if (!$upd->execute()) {
      throw new Exception($upd->error ?: "Failed to update customer #{$cid}");
    }

    $applied[] = [
      "customer_id" => $cid,
      "delivery_number" => $deliveryNo,
      "usd_to_collect" => $netUsd,
      "delivery_charge_usd" => $deliveryCharge,
      "source_status" => $status,
    ];
  }

  $conn->commit();
  echo json_encode([
    "ok" => true,
    "applied_count" => count($applied),
    "skipped_count" => count($skipped),
    "applied" => $applied,
    "skipped" => $skipped,
  ]);
} catch (Throwable $e) {
  $conn->rollback();
  http_response_code(500);
  error_log('[shein-php] delivery Excel import failure: ' . (string)$e);
  echo json_encode(["ok" => false, "error" => backend_public_exception_message($e)]);
}
?>
