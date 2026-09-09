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

$month_id = isset($_GET["month_id"]) ? (int)$_GET["month_id"] : 0;
$q = trim((string)($_GET["q"] ?? ""));
$qLike = "%" . $q . "%";

if ($month_id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "month_id is required"]);
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

$stmt = $conn->prepare("
  SELECT
    cc.id AS customer_id,
    cc.customer_name,
    cc.usd_to_collect,
    cc.status,
    cc.delivery_status,
    cc.delivery_number,
    oc.cart_order_number,
    o.order_name,
    o.id AS order_id
  FROM cart_customers cc
  INNER JOIN order_carts oc ON cc.cart_id = oc.id
  INNER JOIN orders o ON oc.order_id = o.id
  WHERE cc.user_id = ?
    AND o.month_id = ?
    AND COALESCE(cc.status, '') NOT IN ('paid', 'done')
    AND COALESCE(cc.delivery_status, '') NOT IN ('paid', 'done')
    AND NOT EXISTS (
      SELECT 1
      FROM payment_customer_items pci
      WHERE pci.user_id = cc.user_id
        AND pci.customer_id = cc.id
    )
    AND (
      ? = ''
      OR cc.customer_name LIKE ?
      OR oc.cart_order_number LIKE ?
      OR COALESCE(cc.delivery_number, '') LIKE ?
      OR COALESCE(o.order_name, '') LIKE ?
      OR CAST(cc.id AS CHAR) LIKE ?
    )
  ORDER BY cc.id DESC
  LIMIT 300
");
$stmt->bind_param("iissssss", $user_id, $month_id, $q, $qLike, $qLike, $qLike, $qLike, $qLike);
$stmt->execute();
$res = $stmt->get_result();

$out = [];
while ($row = $res->fetch_assoc()) {
  $out[] = $row;
}

echo json_encode(["success" => true, "customers" => $out]);
?>
