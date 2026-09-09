<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require "../db.php";
require "../auth/auth.php";
require_once "./_shipmentNotes.php";

function clean_number($v) {
  if ($v === null) return null;
  $v = trim((string)$v);
  $v = str_replace(["\xC2\xA0", "$", "USD", "Kg", "KG", "kg"], "", $v);
  $v = preg_replace('/[^0-9,.\-]/', '', $v);
  if ($v === '') return null;

  $commaPos = strrpos($v, ',');
  $dotPos = strrpos($v, '.');
  if ($commaPos !== false && $dotPos !== false) {
    if ($commaPos > $dotPos) {
      $v = str_replace('.', '', $v);
      $v = str_replace(',', '.', $v);
    } else {
      $v = str_replace(',', '', $v);
    }
  } elseif ($commaPos !== false) {
    $v = str_replace(',', '.', $v);
  }

  return is_numeric($v) ? (float)$v : null;
}

function parse_invoice_lines($text) {
  $items = [];
  $unitPrice = null;

  if (preg_match('/Unit\s*Price\s*=?\s*([0-9]+(?:[.,][0-9]+)?)/i', $text, $m)) {
    $unitPrice = clean_number($m[1]);
  }

  $parts = preg_split('/Order\s*#\s*\d+(?:\s*\([^)]+\))?\s*:/i', $text);
  foreach ($parts as $part) {
    $tracking = null;
    $weight = null;
    $price = null;
    $delivery = 0.0;

    if (preg_match('/Tracking\s*Number#?\s*:\s*([A-Za-z0-9\-]+)/i', $part, $m)) $tracking = trim($m[1]);
    if (preg_match('/Weight\s*:\s*([0-9]+(?:[.,][0-9]+)?)\s*K?G?/i', $part, $m)) $weight = clean_number($m[1]);
    if (preg_match('/Price\s*:\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)/i', $part, $m)) $price = clean_number($m[1]);
    if (preg_match('/Delivery\s*:\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)/i', $part, $m)) $delivery = clean_number($m[1]) ?? 0.0;

    if ($weight === null && $price !== null && $unitPrice !== null && $unitPrice > 0) {
      $weight = round($price / $unitPrice, 3);
    }

    if ($tracking || $price !== null || $weight !== null) {
      $items[] = [
        "tracking_no" => $tracking,
        "weight_kg" => $weight,
        "customs_fee" => $price ?? 0.0,
        "unit_price" => $unitPrice,
        "delivery_fee" => $delivery,
      ];
    }
  }

  return $items;
}

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$data = json_decode(file_get_contents("php://input"), true);
$month_id = (int)($data["month_id"] ?? 0);
$message = trim((string)($data["message"] ?? ""));

if ($month_id <= 0 || $message === "") {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "month_id and message are required"]);
  exit;
}

$chk = $conn->prepare("SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1");
$chk->bind_param("ii", $month_id, $user_id);
$chk->execute();
if (!$chk->get_result()->fetch_assoc()) {
  http_response_code(403);
  echo json_encode(["success" => false, "error" => "Invalid month for this user"]);
  exit;
}

$items = parse_invoice_lines($message);
if (!$items) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "No invoice lines were parsed"]);
  exit;
}

$insertStmt = $conn->prepare("
  INSERT INTO customs (
    month_id, customs_fee, user_id, tracking_no, invoice_no, weight_kg, unit_price, delivery_fee,
    order_id, cart_id, order_ref, cart_ref, note, source_message
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
");

$created = 0;
$skipped = [];
$notifications = [];
$out = [];
foreach ($items as $item) {
  $tracking_no = $item["tracking_no"] ?: null;
  $invoice_no = null;
  $weight_kg = $item["weight_kg"];
  $customs_fee = (float)($item["customs_fee"] ?? 0);
  $unit_price = $item["unit_price"];
  $delivery_fee = (float)($item["delivery_fee"] ?? 0.0);
  $order_id = null;
  $cart_id = null;
  $order_ref = null;
  $cart_ref = null;
  $note = null;
  $source_message = $message;
  $effective_month_id = $month_id;

  if ($tracking_no) {
    $dup = customs_find_duplicate_tracking($conn, $user_id, $tracking_no);
    if ($dup) {
      $skipped[] = [
        "tracking_no" => $tracking_no,
        "reason" => "duplicate tracking already exists",
        "duplicate_id" => (int)$dup["id"],
        "month_id" => (int)$dup["month_id"],
      ];
      continue;
    }

    $ctx = build_shipment_note_context($conn, $user_id, $month_id, $tracking_no);
    foreach ((array)($ctx["notifications"] ?? []) as $n) {
      $notifications[] = ["tracking_no" => $tracking_no, "message" => (string)$n];
    }
    $effective_month_id = $month_id;
    if (!empty($ctx["resolved_month_id"]) && (int)$ctx["resolved_month_id"] > 0) {
      $effective_month_id = (int)$ctx["resolved_month_id"];
    }
    $order_id = $ctx["order_id"];
    $cart_id = $ctx["cart_id"];
    $order_ref = $ctx["order_ref"];
    $cart_ref = $ctx["cart_ref"];
    $parts = [];
    if (!empty($cart_ref)) $parts[] = $cart_ref;
    if (!empty($order_ref)) $parts[] = $order_ref;
    if (!empty($ctx["note_parts"])) {
      foreach ($ctx["note_parts"] as $np) $parts[] = $np;
    }
    $note = trim(implode(" | ", array_filter($parts, function($x) {
      return trim((string)$x) !== "";
    })));
  }

  $insertStmt->bind_param(
    "idissdddiissss",
    $effective_month_id,
    $customs_fee,
    $user_id,
    $tracking_no,
    $invoice_no,
    $weight_kg,
    $unit_price,
    $delivery_fee,
    $order_id,
    $cart_id,
    $order_ref,
    $cart_ref,
    $note,
    $source_message
  );
    if ($insertStmt->execute()) {
      $created++;
      $out[] = [
        "id" => $insertStmt->insert_id,
        "tracking_no" => $tracking_no,
        "weight_kg" => $weight_kg,
        "customs_fee" => $customs_fee,
        "month_id" => $effective_month_id,
        "order_ref" => $order_ref,
        "cart_ref" => $cart_ref,
      ];
    }
}

echo json_encode([
  "success" => true,
  "created" => $created,
  "items" => $out,
  "skipped" => $skipped,
  "notifications" => $notifications
]);
?>
