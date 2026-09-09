<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") exit(0);

require "../db.php";
require "../auth/auth.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$payment_id = isset($_GET["payment_id"]) ? (int)$_GET["payment_id"] : 0;
if ($payment_id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "payment_id is required"]);
  exit;
}

$chk = $conn->prepare("SELECT id FROM payments WHERE id=? AND user_id=? LIMIT 1");
$chk->bind_param("ii", $payment_id, $user_id);
$chk->execute();
if (!$chk->get_result()->fetch_assoc()) {
  http_response_code(404);
  echo json_encode(["success" => false, "error" => "Payment not found"]);
  exit;
}

$sql = "
  SELECT
    pci.id,
    pci.payment_id,
    pci.customer_id,
    pci.customer_name_snapshot,
    pci.amount,
    COALESCE(pci.base_amount, pci.amount) AS base_amount,
    COALESCE(pci.delivery_adjustment, pci.delivery_charge, 0) AS delivery_adjustment,
    COALESCE(pci.final_amount, pci.amount - COALESCE(pci.delivery_charge, 0)) AS final_amount,
    COALESCE(pci.final_amount, pci.amount - COALESCE(pci.delivery_charge, 0)) AS net_amount,
    pci.delivery_charge,
    pci.delivery_method,
    pci.delivery_number,
    pci.order_name_snapshot,
    pci.cart_order_number_snapshot,
    cc.status,
    cc.delivery_status,
    oc.cart_order_number,
    oc.id AS cart_id,
    o.order_name,
    o.id AS order_id
  FROM payment_customer_items pci
  LEFT JOIN cart_customers cc ON cc.id = pci.customer_id AND cc.user_id = pci.user_id
  LEFT JOIN order_carts oc ON oc.id = cc.cart_id AND oc.user_id = pci.user_id
  LEFT JOIN orders o ON o.id = oc.order_id AND o.user_id = pci.user_id
  WHERE pci.payment_id = ? AND pci.user_id = ?
  ORDER BY pci.id DESC
";
$stmt = $conn->prepare($sql);
$stmt->bind_param("ii", $payment_id, $user_id);
$stmt->execute();
$res = $stmt->get_result();
$out = [];
while ($row = $res->fetch_assoc()) $out[] = $row;

echo json_encode(["success" => true, "items" => $out]);
?>
