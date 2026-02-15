<?php
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

$payload = require_auth();
$user_id = (int)($payload["user_id"] ?? 0);

$search = isset($_GET["search"]) ? trim((string)$_GET["search"]) : "";

/**
 * ✅ Only customers of the logged in user:
 * cart_customers -> order_carts -> orders -> month.user_id
 */
$sql = "
  SELECT 
    cc.id AS customer_id,
    cc.customer_name,
    cc.usd_to_collect,
    cc.delivery_number,
    cc.status,
    cc.delivery_status,
    oc.id AS cart_id,
    oc.cart_order_number,
    o.id AS order_id,
    o.order_details,
    o.order_name
  FROM cart_customers cc
  JOIN order_carts oc ON cc.cart_id = oc.id
  JOIN orders o ON oc.order_id = o.id
  JOIN month m ON o.month_id = m.id
  WHERE cc.status = 'withdelivery'
    AND m.user_id = ?
";

$params = [$user_id];
$types = "i";

// Optional search by delivery_number (works even if delivery_number is numeric or string)
if ($search !== "") {
  $sql .= " AND CAST(cc.delivery_number AS CHAR) LIKE ?";
  $params[] = "%" . $search . "%";
  $types .= "s";
}

$sql .= " ORDER BY cc.id DESC";

$stmt = $conn->prepare($sql);
if (!$stmt) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => $conn->error]);
  exit;
}

$stmt->bind_param($types, ...$params);

if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => $stmt->error]);
  exit;
}

$res = $stmt->get_result();
$data = [];
while ($row = $res->fetch_assoc()) $data[] = $row;

echo json_encode($data);
