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
$user_id = (int)$payload["user_id"];

/*
Return rows with:
customer_id, customer_name, usd_to_collect, delivery_number, status, delivery_status,
cart_order_number, order_name
*/
$stmt = $conn->prepare("
  SELECT
    cc.id AS customer_id,
    cc.customer_name,
    cc.usd_to_collect,
    cc.delivery_number,
    cc.status,
    cc.delivery_status,
    oc.cart_order_number,
    o.order_name
  FROM cart_customers cc
  JOIN order_carts oc ON oc.id = cc.cart_id
  JOIN orders o ON o.id = oc.order_id
  WHERE cc.user_id = ?
    AND (cc.delivery_status = 'added' OR cc.status = 'confirmed')
  ORDER BY cc.id DESC
");
$stmt->bind_param("i", $user_id);
$stmt->execute();

$res = $stmt->get_result();
$out = [];
while ($row = $res->fetch_assoc()) $out[] = $row;

echo json_encode($out);
?>
