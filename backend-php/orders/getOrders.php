<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require "../db.php";
require "../auth/auth.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$month_id = isset($_GET["month_id"]) ? (int)$_GET["month_id"] : 0;
if ($month_id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "month_id is required"]);
  exit;
}

/* Ensure month belongs to this user */
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
    o.id,
    o.month_id,
    o.order_name,
    o.order_details,
    o.amount_to_collect,
    COALESCE(SUM(COALESCE(oc.shein_total_weight_kg, 0)), 0) AS shein_total_weight_kg_sum,
    COALESCE(SUM(COALESCE(oc.shein_total_weight_plus_2kg, 0)), 0) AS shein_total_weight_plus_2kg_sum,
    SUM(CASE WHEN COALESCE(oc.is_joint_shipment, 0)=1 THEN 1 ELSE 0 END) AS joint_shipment_carts,
    SUM(
      CASE
        WHEN COALESCE(oc.shein_delivered, 0) = 0
         AND oc.shein_order_no IS NOT NULL
         AND TRIM(oc.shein_order_no) <> ''
        THEN 1
        ELSE 0
      END
    ) AS shein_undelivered_carts
  FROM orders o
  LEFT JOIN order_carts oc
    ON oc.order_id = o.id
   AND oc.user_id = o.user_id
  WHERE o.month_id=? AND o.user_id=?
  GROUP BY o.id, o.month_id, o.order_name, o.order_details, o.amount_to_collect
  ORDER BY o.id DESC
");
$stmt->bind_param("ii", $month_id, $user_id);
$stmt->execute();

$res = $stmt->get_result();
$orders = [];
while ($row = $res->fetch_assoc()) $orders[] = $row;

echo json_encode($orders);
?>
