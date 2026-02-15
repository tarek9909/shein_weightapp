<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  http_response_code(200);
  exit();
}

require_once "../db.php";
require_once "../auth/auth.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data["ids"]) || !is_array($data["ids"]) || empty($data["ids"])) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "No customer IDs provided"]);
  exit;
}

// sanitize ids
$ids = array_values(array_filter(array_map("intval", $data["ids"]), fn($v) => $v > 0));
if (empty($ids)) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Invalid customer IDs"]);
  exit;
}

// Build placeholders for IN (...)
$placeholders = implode(",", array_fill(0, count($ids), "?"));
$types = str_repeat("i", count($ids));

try {
  $conn->begin_transaction();

  /**
   * Get customer info for THIS USER only.
   * We also pull month_id through the joins.
   * (Recommended) limit to confirmed only to avoid paying wrong statuses.
   */
  $sql = "
    SELECT
      cc.id AS customer_id,
      cc.usd_to_collect,
      o.month_id
    FROM cart_customers cc
    JOIN order_carts oc ON cc.cart_id = oc.id
    JOIN orders o ON oc.order_id = o.id
    WHERE cc.user_id = ?
      AND cc.id IN ($placeholders)
      AND cc.status = 'confirmed'
  ";

  $stmt = $conn->prepare($sql);
  if (!$stmt) throw new Exception($conn->error);

  // bind user_id + ids
  $bindTypes = "i" . $types;
  $params = array_merge([$user_id], $ids);

  // mysqli bind_param needs references
  $refs = [];
  $refs[] = &$bindTypes;
  foreach ($params as $k => $v) $refs[] = &$params[$k];
  call_user_func_array([$stmt, "bind_param"], $refs);

  $stmt->execute();
  $res = $stmt->get_result();

  $customers = [];
  while ($row = $res->fetch_assoc()) $customers[] = $row;

  if (empty($customers)) {
    throw new Exception("No eligible customers found (must be your customers and status=confirmed).");
  }

  // Group customers by month_id
  $groups = [];
  foreach ($customers as $c) {
    $mid = (int)$c["month_id"];
    if ($mid <= 0) continue;
    if (!isset($groups[$mid])) $groups[$mid] = [];
    $groups[$mid][] = $c;
  }

  if (empty($groups)) {
    throw new Exception("No valid month_id found for provided customers.");
  }

  // Insert a payment per month, then mark customers as paid
  foreach ($groups as $monthId => $groupCustomers) {
    $total = 0.0;
    $customerIds = [];
    foreach ($groupCustomers as $gc) {
      $total += (float)$gc["usd_to_collect"];
      $customerIds[] = (int)$gc["customer_id"];
    }

    // Insert payment (per-user)
    $ins = $conn->prepare("INSERT INTO payments (month_id, payment_amount, user_id) VALUES (?, ?, ?)");
    if (!$ins) throw new Exception($conn->error);
    $ins->bind_param("idi", $monthId, $total, $user_id);
    if (!$ins->execute()) throw new Exception($ins->error);

    // Update customers as paid (only this user, only those ids)
    $ph2 = implode(",", array_fill(0, count($customerIds), "?"));
    $t2 = str_repeat("i", count($customerIds));

    $updSql = "
      UPDATE cart_customers
      SET status='paid', delivery_status='paid'
      WHERE user_id=?
        AND id IN ($ph2)
    ";
    $upd = $conn->prepare($updSql);
    if (!$upd) throw new Exception($conn->error);

    $bindTypes2 = "i" . $t2;
    $params2 = array_merge([$user_id], $customerIds);

    $refs2 = [];
    $refs2[] = &$bindTypes2;
    foreach ($params2 as $k => $v) $refs2[] = &$params2[$k];
    call_user_func_array([$upd, "bind_param"], $refs2);

    if (!$upd->execute()) throw new Exception($upd->error);
  }

  $conn->commit();
  echo json_encode(["success" => true, "message" => "Payments added and customers marked as paid"]);

} catch (Exception $e) {
  $conn->rollback();
  http_response_code(500);
  echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
?>
