<?php
function refresh_joint_shipment_for_tracking(mysqli $conn, int $user_id, ?string $tracking_no): void {
  $tracking_no = trim((string)$tracking_no);
  if ($tracking_no === "") return;

  $countStmt = $conn->prepare("
    SELECT COUNT(DISTINCT TRIM(shein_order_no)) AS c
    FROM order_carts
    WHERE user_id=?
      AND UPPER(TRIM(COALESCE(shein_tracking_no, ''))) = UPPER(TRIM(?))
      AND TRIM(COALESCE(shein_order_no, '')) <> ''
  ");
  $countStmt->bind_param("is", $user_id, $tracking_no);
  $countStmt->execute();
  $row = $countStmt->get_result()->fetch_assoc();
  $count = (int)($row["c"] ?? 0);

  $weightStmt = $conn->prepare("
    SELECT
      COALESCE(SUM(COALESCE(shein_total_weight_kg, 0)), 0) AS total_weight_kg,
      COALESCE(SUM(COALESCE(shein_total_weight_plus_2kg, 0)), 0) AS total_weight_plus_2kg
    FROM order_carts
    WHERE user_id=?
      AND UPPER(TRIM(COALESCE(shein_tracking_no, ''))) = UPPER(TRIM(?))
  ");
  $weightStmt->bind_param("is", $user_id, $tracking_no);
  $weightStmt->execute();
  $w = $weightStmt->get_result()->fetch_assoc() ?: [];
  $joint_weight_kg = isset($w["total_weight_kg"]) ? (float)$w["total_weight_kg"] : 0.0;
  $joint_weight_plus_2kg = isset($w["total_weight_plus_2kg"]) ? (float)$w["total_weight_plus_2kg"] : 0.0;

  $is_joint = $count >= 2 ? 1 : 0;
  $joint_count = $count >= 2 ? $count : 0;
  $combined_kg = $is_joint ? $joint_weight_kg : null;
  $combined_plus_2kg = $is_joint ? $joint_weight_plus_2kg : null;

  $updStmt = $conn->prepare("
    UPDATE order_carts
    SET is_joint_shipment=?, joint_shipment_count=?, joint_combined_weight_kg=?, joint_combined_weight_plus_2kg=?
    WHERE user_id=? AND UPPER(TRIM(COALESCE(shein_tracking_no, ''))) = UPPER(TRIM(?))
  ");
  $updStmt->bind_param("iiddis", $is_joint, $joint_count, $combined_kg, $combined_plus_2kg, $user_id, $tracking_no);
  $updStmt->execute();
}
?>
