<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require "../db.php";          // $conn (mysqli)
require "../auth/auth.php";   // require_auth()

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$month_id = isset($_GET["month_id"]) ? (int)$_GET["month_id"] : 0;

if ($month_id <= 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "month_id is required"]);
  exit;
}

function dec($v) {
  if ($v === null) return 0.0;
  return (float)$v;
}

try {
  // Month info (MUST belong to this user)
  $stmt = $conn->prepare("SELECT id, name FROM month WHERE id = ? AND user_id = ? LIMIT 1");
  $stmt->bind_param("ii", $month_id, $user_id);
  $stmt->execute();
  $month = $stmt->get_result()->fetch_assoc();
  $stmt->close();

  if (!$month) {
    http_response_code(404);
    echo json_encode(["ok" => false, "error" => "Month not found"]);
    exit;
  }

  // Customs (sum)
  $stmt = $conn->prepare("
    SELECT COALESCE(SUM(customs_fee),0) AS customs_fee
    FROM customs
    WHERE month_id = ? AND user_id = ?
  ");
  $stmt->bind_param("ii", $month_id, $user_id);
  $stmt->execute();
  $customs_fee = dec($stmt->get_result()->fetch_assoc()["customs_fee"] ?? 0);
  $stmt->close();

  // Payments total
  $stmt = $conn->prepare("
    SELECT COALESCE(SUM(payment_amount),0) AS payments_total
    FROM payments
    WHERE month_id = ? AND user_id = ?
  ");
  $stmt->bind_param("ii", $month_id, $user_id);
  $stmt->execute();
  $payments_total = dec($stmt->get_result()->fetch_assoc()["payments_total"] ?? 0);
  $stmt->close();

  // Orders for month (only for this user)
  $stmt = $conn->prepare("
    SELECT
      id,
      month_id,
      order_name,
      order_details,
      CAST(order_details AS DECIMAL(10,2)) AS paid_amount
    FROM orders
    WHERE month_id = ? AND user_id = ?
    ORDER BY id DESC
  ");
  $stmt->bind_param("ii", $month_id, $user_id);
  $stmt->execute();
  $ordersRes = $stmt->get_result();

  $orders = [];
  $orderIds = [];
  $orders_paid_total = 0.0;

  while ($row = $ordersRes->fetch_assoc()) {
    $oid = (int)$row["id"];
    $paid = dec($row["paid_amount"]);
    $orders_paid_total += $paid;

    $orders[] = [
      "id" => $oid,
      "order_name" => $row["order_name"],
      "order_details" => $row["order_details"],
      "paid_amount" => $paid,
      "collected_total" => 0.0,
      "carts" => []
    ];
    $orderIds[] = $oid;
  }
  $stmt->close();

  if (count($orderIds) === 0) {
    echo json_encode([
      "ok" => true,
      "month" => $month,
      "summary" => [
        "customs_fee" => $customs_fee,
        "payments_total" => $payments_total,
        "orders_paid_total" => 0.0,
        "orders_collected_total" => 0.0
      ],
      "orders" => []
    ]);
    exit;
  }

  // Map orderId -> index in $orders
  $orderIndex = [];
  foreach ($orders as $i => $o) $orderIndex[$o["id"]] = $i;

  // Fetch carts for all orders (only this user)
  $inOrders = implode(",", array_fill(0, count($orderIds), "?"));
  $types = str_repeat("i", count($orderIds)) . "i"; // + user_id

  $stmt = $conn->prepare("
    SELECT id AS cart_id, order_id, cart_order_number, cart_price
    FROM order_carts
    WHERE order_id IN ($inOrders) AND user_id = ?
    ORDER BY id DESC
  ");

  $params = array_merge($orderIds, [$user_id]);
  $stmt->bind_param($types, ...$params);

  $stmt->execute();
  $cartsRes = $stmt->get_result();

  $carts = [];
  $cartIds = [];

  while ($row = $cartsRes->fetch_assoc()) {
    $cid = (int)$row["cart_id"];
    $carts[] = [
      "cart_id" => $cid,
      "order_id" => (int)$row["order_id"],
      "cart_order_number" => $row["cart_order_number"],
      "cart_price" => dec($row["cart_price"]),
      "collected_total" => 0.0,
      "customers" => []
    ];
    $cartIds[] = $cid;
  }
  $stmt->close();

  // Map cart_id -> index
  $cartIndex = [];
  foreach ($carts as $i => $c) $cartIndex[$c["cart_id"]] = $i;

  // Fetch customers for all carts (only this user)
  if (count($cartIds) > 0) {
    $inCarts = implode(",", array_fill(0, count($cartIds), "?"));
    $typesC = str_repeat("i", count($cartIds)) . "i"; // + user_id

    $stmt = $conn->prepare("
      SELECT id, cart_id, customer_name, usd_to_collect, delivery_number, status, delivery_status
      FROM cart_customers
      WHERE cart_id IN ($inCarts) AND user_id = ?
      ORDER BY id DESC
    ");

    $paramsC = array_merge($cartIds, [$user_id]);
    $stmt->bind_param($typesC, ...$paramsC);

    $stmt->execute();
    $custRes = $stmt->get_result();

    while ($row = $custRes->fetch_assoc()) {
      $cid = (int)$row["cart_id"];
      if (!isset($cartIndex[$cid])) continue;

      $customer = [
        "id" => (int)$row["id"],
        "customer_name" => $row["customer_name"],
        "usd_to_collect" => dec($row["usd_to_collect"]),
        "delivery_number" => $row["delivery_number"] !== null ? (int)$row["delivery_number"] : null,
        "status" => $row["status"],
        "delivery_status" => $row["delivery_status"],
      ];

      $cIdx = $cartIndex[$cid];
      $carts[$cIdx]["customers"][] = $customer;
      $carts[$cIdx]["collected_total"] += $customer["usd_to_collect"];
    }
    $stmt->close();
  }

  // Attach carts to orders + compute totals
  $orders_collected_total = 0.0;

  foreach ($carts as $c) {
    $oid = $c["order_id"];
    if (!isset($orderIndex[$oid])) continue;

    $oIdx = $orderIndex[$oid];
    $orders[$oIdx]["carts"][] = $c;
    $orders[$oIdx]["collected_total"] += dec($c["collected_total"]);
  }

  foreach ($orders as $o) {
    $orders_collected_total += dec($o["collected_total"]);
  }

  echo json_encode([
    "ok" => true,
    "month" => $month,
    "summary" => [
      "customs_fee" => $customs_fee,
      "payments_total" => $payments_total,
      "orders_paid_total" => $orders_paid_total,
      "orders_collected_total" => $orders_collected_total
    ],
    "orders" => $orders
  ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Server error"]);
}
?>
