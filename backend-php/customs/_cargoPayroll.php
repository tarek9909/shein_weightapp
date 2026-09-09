<?php
require_once "./_cargoPackageGroups.php";

function get_pending_payroll_group_keys(mysqli $conn, int $user_id, int $month_id, bool $pending_only = false): array {
  $sql = "
    SELECT p.group_key
    FROM cargo_payroll_pending_packages p
    JOIN cargo_payroll_pending h ON h.id = p.pending_id
    WHERE h.user_id=? AND h.month_id=?
  ";
  if ($pending_only) $sql .= " AND h.status='pending'";
  $stmt = $conn->prepare($sql);
  if (!$stmt) return [];
  $stmt->bind_param("ii", $user_id, $month_id);
  $stmt->execute();
  $res = $stmt->get_result();
  $out = [];
  while ($r = $res->fetch_assoc()) {
    $k = trim((string)($r["group_key"] ?? ""));
    if ($k !== "") $out[$k] = true;
  }
  return array_keys($out);
}

function build_cargo_payroll_breakdown(
  mysqli $conn,
  int $user_id,
  int $month_id,
  float $per_unit_amount,
  array $exclude_group_keys = []
): array {
  $groups = get_cargo_package_groups($conn, $user_id, $month_id);
  $excludeMap = [];
  foreach ($exclude_group_keys as $k) {
    $kv = trim((string)$k);
    if ($kv !== "") $excludeMap[$kv] = true;
  }
  $sorted = array_values(array_filter($groups, function ($g) {
    return ((string)($g["status"] ?? "")) === "sorted";
  }));
  if ($excludeMap) {
    $sorted = array_values(array_filter($sorted, function ($g) use ($excludeMap) {
      $k = (string)($g["group_key"] ?? "");
      return !isset($excludeMap[$k]);
    }));
  }

  $packages = [];
  $orderTotals = [];
  $totalPayroll = 0.0;

  foreach ($sorted as $g) {
    $weight = (float)($g["total_weight_kg"] ?? 0);
    $isFree = ($weight < 10.0);
    $amount = $isFree ? 0.0 : $per_unit_amount;
    $totalPayroll += $amount;

    $refs = isset($g["order_cart_refs"]) && is_array($g["order_cart_refs"]) ? $g["order_cart_refs"] : [];
    $orderKeys = [];
    foreach ($refs as $ref) {
      $s = trim((string)$ref);
      if ($s === "") continue;
      if (preg_match('/order\s+([^\/]+)\s*\/\s*cart/i', $s, $m)) {
        $orderName = trim((string)$m[1]);
        if ($orderName !== "") $orderKeys[$orderName] = true;
      }
    }
    $orderKeys = array_keys($orderKeys);
    if (!$orderKeys) $orderKeys = ["Unknown"];

    $share = count($orderKeys) > 0 ? ($amount / count($orderKeys)) : 0.0;
    foreach ($orderKeys as $ok) {
      if (!isset($orderTotals[$ok])) $orderTotals[$ok] = 0.0;
      $orderTotals[$ok] += $share;
    }

    $packages[] = [
      "group_key" => $g["group_key"] ?? "",
      "display_label" => $g["display_label"] ?? "",
      "group_type" => $g["group_type"] ?? "single",
      "tracking_numbers" => $g["tracking_numbers"] ?? [],
      "weight_kg" => $weight,
      "is_free_under_10kg" => $isFree ? 1 : 0,
      "amount" => $amount,
      "order_refs" => $refs,
      "orders" => $orderKeys,
    ];
  }

  $ordersOut = [];
  foreach ($orderTotals as $orderName => $amount) {
    $ordersOut[] = [
      "order_name" => $orderName,
      "amount" => (float)$amount,
    ];
  }
  usort($ordersOut, function ($a, $b) {
    return strcmp((string)$a["order_name"], (string)$b["order_name"]);
  });

  return [
    "per_unit_amount" => $per_unit_amount,
    "sorted_count" => count($sorted),
    "packages" => $packages,
    "orders" => $ordersOut,
    "orders_count" => count($ordersOut),
    "total_payroll" => (float)$totalPayroll,
  ];
}
