<?php
ini_set('display_errors', '0');
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") exit(0);

register_shutdown_function(function () {
  $e = error_get_last();
  if (!$e) return;
  $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
  if (!in_array((int)$e["type"], $fatalTypes, true)) return;
  if (!headers_sent()) {
    http_response_code(500);
    header("Content-Type: application/json; charset=utf-8");
  }
  echo json_encode([
    "ok" => false,
    "error" => "Fatal error: " . (string)($e["message"] ?? "unknown"),
    "file" => basename((string)($e["file"] ?? "")),
    "line" => (int)($e["line"] ?? 0),
  ]);
});

require_once "../db.php";
require_once "../auth/auth.php";
require_once "./_deliveryExcelImport.php";

try {
  $payload = require_auth();
  $user_id = (int)($payload["user_id"] ?? 0);
  $month_id = (int)($_POST["month_id"] ?? 0);

  if ($user_id <= 0) throw new Exception("Invalid token payload");
  if ($month_id <= 0) {
    http_response_code(400);
    echo json_encode(["ok" => false, "error" => "month_id is required"]);
    exit;
  }
  if (!isset($_FILES["file"]) || !is_uploaded_file($_FILES["file"]["tmp_name"])) {
    http_response_code(400);
    echo json_encode(["ok" => false, "error" => "Excel file is required"]);
    exit;
  }

  $chk = $conn->prepare("SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1");
  if (!$chk) throw new Exception("Month validation prepare failed: " . $conn->error);
  $chk->bind_param("ii", $month_id, $user_id);
  if (!$chk->execute()) throw new Exception("Month validation execute failed: " . $chk->error);
  $chkRes = $chk->get_result();
  if (!$chkRes || !$chkRes->fetch_assoc()) {
    http_response_code(403);
    echo json_encode(["ok" => false, "error" => "Invalid month for this user"]);
    exit;
  }

  try {
    $rows = delivery_xlsx_rows($_FILES["file"]["tmp_name"]);
  } catch (Throwable $e) {
    http_response_code(400);
    error_log('[shein-php] preview delivery Excel import failure: ' . (string)$e);
    echo json_encode(["ok" => false, "error" => backend_public_exception_message($e)]);
    exit;
  }

  if (count($rows) < 2) {
    http_response_code(400);
    echo json_encode(["ok" => false, "error" => "Excel file has no data"]);
    exit;
  }

  $headerCells = [];
  foreach ($rows as $r) {
    $cells = $r["cells"];
    $statusIdxGuess = delivery_find_header_index($cells, ["Status"]);
    $recipientIdxGuess = delivery_find_header_index($cells, ["Reciepient Details", "Recipient Details"]);
    if ($statusIdxGuess >= 0 && $recipientIdxGuess >= 0) {
      $headerCells = $cells;
      break;
    }
  }
  if (!$headerCells) {
    http_response_code(400);
    echo json_encode(["ok" => false, "error" => "Could not detect Excel headers"]);
    exit;
  }

  $idxDeliveryNo = delivery_find_header_index($headerCells, ["#", "No", "Number"]);
  $idxStatus = delivery_find_header_index($headerCells, ["Status"]);
  $idxRecipient = delivery_find_header_index($headerCells, ["Reciepient Details", "Recipient Details"]);
  $idxDeliveryCharge = delivery_find_header_index($headerCells, ["Delivery Amount"]);
  $idxTotalUsd = delivery_find_header_index($headerCells, ["Total Amount USD"]);

  if ($idxDeliveryNo < 0 || $idxStatus < 0 || $idxRecipient < 0 || $idxDeliveryCharge < 0 || $idxTotalUsd < 0) {
    http_response_code(400);
    echo json_encode(["ok" => false, "error" => "Required columns not found (#, Status, Recipient Details, Delivery Amount, Total Amount USD)"]);
    exit;
  }

  // Detect whether delivery_charge_usd column exists (avoid hard 500 if production DB differs)
  $hasDeliveryChargeCol = false;
  $colRes = $conn->query("SHOW COLUMNS FROM cart_customers LIKE 'delivery_charge_usd'");
  if ($colRes && $colRes->fetch_assoc()) $hasDeliveryChargeCol = true;

  $deliveryChargeSelect = $hasDeliveryChargeCol ? "cc.delivery_charge_usd," : "NULL AS delivery_charge_usd,";
  $custSql = "
    SELECT
      cc.id AS customer_id,
      cc.customer_name,
      cc.usd_to_collect,
      {$deliveryChargeSelect}
      cc.delivery_number,
      cc.status,
      cc.delivery_status,
      oc.id AS cart_id,
      oc.cart_order_number,
      o.id AS order_id,
      o.order_name
    FROM cart_customers cc
    JOIN order_carts oc ON oc.id = cc.cart_id AND oc.user_id = cc.user_id
    JOIN orders o ON o.id = oc.order_id AND o.user_id = oc.user_id
    WHERE cc.user_id=?
      AND o.month_id=?
      AND (cc.delivery_number IS NULL OR TRIM(CAST(cc.delivery_number AS CHAR))='')
      AND (cc.delivery_status IS NULL OR cc.delivery_status='not added' OR cc.delivery_status='')
  ";
  $custStmt = $conn->prepare($custSql);
  if (!$custStmt) throw new Exception("Customer query prepare failed: " . $conn->error);
  $custStmt->bind_param("ii", $user_id, $month_id);
  if (!$custStmt->execute()) throw new Exception("Customer query execute failed: " . $custStmt->error);
  $custRes = $custStmt->get_result();
  if (!$custRes) throw new Exception("Customer query result failed");

  $candidatesByNorm = [];
  while ($c = $custRes->fetch_assoc()) {
    $norm = delivery_norm_name((string)($c["customer_name"] ?? ""));
    if ($norm === "") continue;
    if (!isset($candidatesByNorm[$norm])) $candidatesByNorm[$norm] = [];
    $candidatesByNorm[$norm][] = [
      "customer_id" => (int)$c["customer_id"],
      "customer_name" => (string)($c["customer_name"] ?? ""),
      "usd_to_collect" => (float)($c["usd_to_collect"] ?? 0),
      "delivery_charge_usd" => ($c["delivery_charge_usd"] === null ? null : (float)$c["delivery_charge_usd"]),
      "order_id" => (int)$c["order_id"],
      "order_name" => (string)($c["order_name"] ?? ""),
      "cart_id" => (int)$c["cart_id"],
      "cart_order_number" => (string)($c["cart_order_number"] ?? ""),
    ];
  }

  $allowedStatuses = ["pending" => true, "confirmed" => true];
  $outRows = [];
  foreach ($rows as $r) {
    $cells = $r["cells"];
    $rawStatus = trim((string)($cells[$idxStatus] ?? ""));
    $statusKey = strtolower($rawStatus);
    if ($statusKey === "status" || !isset($allowedStatuses[$statusKey])) continue;

    $deliveryNumber = trim((string)($cells[$idxDeliveryNo] ?? ""));
    $recipient = trim((string)($cells[$idxRecipient] ?? ""));
    $totalUsd = delivery_to_float($cells[$idxTotalUsd] ?? "");
    $deliveryCharge = delivery_to_float($cells[$idxDeliveryCharge] ?? "");
    $netUsd = $totalUsd - $deliveryCharge;
    if ($netUsd < 0) $netUsd = 0.0;

    $nameOnly = preg_replace('/\([^)]*\)/', '', $recipient);
    $nameOnly = trim((string)$nameOnly);
    $norm = delivery_norm_name($nameOnly);
    $matches = $candidatesByNorm[$norm] ?? [];

    $selected = null;
    $mismatch = null;
    if (count($matches) === 1) {
      $selected = $matches[0];
      $dbUsd = (float)($selected["usd_to_collect"] ?? 0);
      $mismatch = abs($dbUsd - $netUsd) > 0.009 ? 1 : 0;
    }

    $outRows[] = [
      "excel_row_num" => (int)$r["row_num"],
      "status" => $rawStatus,
      "delivery_number" => $deliveryNumber,
      "recipient_details" => $recipient,
      "customer_name_extracted" => $nameOnly,
      "total_amount_usd" => $totalUsd,
      "delivery_charge_usd" => $deliveryCharge,
      "net_amount_usd" => $netUsd,
      "match_count" => count($matches),
      "matches" => $matches,
      "selected_customer_id" => $selected ? (int)$selected["customer_id"] : null,
      "amount_mismatch" => $mismatch,
    ];
  }

  echo json_encode([
    "ok" => true,
    "rows" => $outRows,
    "summary" => [
      "total_rows" => count($outRows),
      "single_matches" => count(array_filter($outRows, function ($x) { return (int)$x["match_count"] === 1; })),
      "duplicate_matches" => count(array_filter($outRows, function ($x) { return (int)$x["match_count"] > 1; })),
      "no_matches" => count(array_filter($outRows, function ($x) { return (int)$x["match_count"] === 0; })),
    ],
  ]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode([
    "ok" => false,
    "error" => backend_public_exception_message($e),
  ]);
}
?>
