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

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$data = json_decode(file_get_contents("php://input"), true);

$month_id = (int)($data["month_id"] ?? 0);
$customs_fee = (float)($data["customs_fee"] ?? 0);
$tracking_no = isset($data["tracking_no"]) ? trim((string)$data["tracking_no"]) : null;
$invoice_no = isset($data["invoice_no"]) ? trim((string)$data["invoice_no"]) : null;
$weight_kg = isset($data["weight_kg"]) ? (float)$data["weight_kg"] : null;
$unit_price = isset($data["unit_price"]) ? (float)$data["unit_price"] : null;
$delivery_fee = isset($data["delivery_fee"]) ? (float)$data["delivery_fee"] : 0.0;
$order_id = isset($data["order_id"]) ? (int)$data["order_id"] : null;
$cart_id = isset($data["cart_id"]) ? (int)$data["cart_id"] : null;
$order_ref = isset($data["order_ref"]) ? trim((string)$data["order_ref"]) : null;
$cart_ref = isset($data["cart_ref"]) ? trim((string)$data["cart_ref"]) : null;
$note = isset($data["note"]) ? trim((string)$data["note"]) : null;
$description = isset($data["description"]) ? strtolower(trim((string)$data["description"])) : null;
$source_message = isset($data["source_message"]) ? (string)$data["source_message"] : null;
$notifications = [];

if ($description === "") $description = null;
if ($description !== null && $description !== "benzene" && $description !== "bags") {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "description must be benzene or bags"]);
  exit;
}

if ($month_id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "month_id is required"]);
  exit;
}

/* Optional but recommended: ensure month belongs to this user */
$chk = $conn->prepare("SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1");
$chk->bind_param("ii", $month_id, $user_id);
$chk->execute();
if (!$chk->get_result()->fetch_assoc()) {
  http_response_code(403);
  echo json_encode(["success" => false, "error" => "Invalid month for this user"]);
  exit;
}

if ($tracking_no !== null && $tracking_no !== "") {
  $dup = customs_find_duplicate_tracking($conn, $user_id, $tracking_no);
  if ($dup) {
    http_response_code(409);
    echo json_encode([
      "success" => false,
      "error" => "Tracking already exists in customs",
      "duplicate" => [
        "id" => (int)$dup["id"],
        "month_id" => (int)$dup["month_id"],
        "tracking_no" => (string)($dup["tracking_no"] ?? $tracking_no),
      ]
    ]);
    exit;
  }

  $ctx = build_shipment_note_context($conn, $user_id, $month_id, $tracking_no);
  $notifications = is_array($ctx["notifications"] ?? null) ? $ctx["notifications"] : [];
  if (!empty($ctx["resolved_month_id"]) && (int)$ctx["resolved_month_id"] > 0 && (int)$ctx["resolved_month_id"] !== $month_id) {
    $month_id = (int)$ctx["resolved_month_id"];
  }
  if ($order_id === null && $ctx["order_id"] !== null) $order_id = (int)$ctx["order_id"];
  if ($cart_id === null && $ctx["cart_id"] !== null) $cart_id = (int)$ctx["cart_id"];
  if (($order_ref === null || $order_ref === "") && !empty($ctx["order_ref"])) $order_ref = $ctx["order_ref"];
  if (($cart_ref === null || $cart_ref === "") && !empty($ctx["cart_ref"])) $cart_ref = $ctx["cart_ref"];

  $parts = [];
  if ($note !== null && trim((string)$note) !== "") $parts[] = trim((string)$note);
  if (!empty($ctx["note_parts"])) {
    foreach ($ctx["note_parts"] as $np) $parts[] = $np;
  }
  $parts = array_values(array_unique(array_filter($parts, function($x) {
    return trim((string)$x) !== "";
  })));
  $note = $parts ? implode(" | ", $parts) : $note;
}

$stmt = $conn->prepare("
  INSERT INTO customs (
    month_id, customs_fee, user_id, tracking_no, invoice_no, weight_kg, unit_price, delivery_fee,
    order_id, cart_id, order_ref, cart_ref, note, description, source_message
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
");
$stmt->bind_param(
  "idissdddiisssss",
  $month_id,
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
  $description,
  $source_message
);

if ($stmt->execute()) {
  echo json_encode(["success" => true, "id" => $stmt->insert_id, "month_id" => $month_id, "notifications" => $notifications]);
} else {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
}
?>
