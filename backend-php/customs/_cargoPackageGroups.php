<?php

function _cargo_norm_track(?string $value): string {
  return strtoupper(trim((string)$value));
}

function _cargo_parse_tracks_json(?string $json): array {
  $json = trim((string)$json);
  if ($json === "") return [];
  $arr = json_decode($json, true);
  if (!is_array($arr)) return [];
  $out = [];
  foreach ($arr as $t) {
    $tv = trim((string)$t);
    if ($tv === "") continue;
    $out[_cargo_norm_track($tv)] = $tv;
  }
  return array_values($out);
}

function get_cargo_package_groups(mysqli $conn, int $user_id, int $month_id): array {
  $customsStmt = $conn->prepare("
    SELECT id, tracking_no, customs_fee, weight_kg, order_ref, cart_ref, note
    FROM customs
    WHERE user_id=? AND month_id=? AND tracking_no IS NOT NULL AND TRIM(tracking_no) <> ''
    ORDER BY id DESC
  ");
  $customsStmt->bind_param("ii", $user_id, $month_id);
  $customsStmt->execute();
  $customsRows = [];
  $customsRes = $customsStmt->get_result();
  while ($row = $customsRes->fetch_assoc()) $customsRows[] = $row;

  $cartsStmt = $conn->prepare("
    SELECT
      oc.id AS cart_id,
      oc.cart_order_number,
      oc.shein_tracking_no,
      oc.shein_is_split_shipment,
      oc.shein_split_tracking_numbers_json,
      oc.is_joint_shipment,
      o.order_name
    FROM order_carts oc
    JOIN orders o ON o.id = oc.order_id AND o.user_id = oc.user_id
    WHERE oc.user_id=? AND o.month_id=?
      AND (
        (oc.shein_tracking_no IS NOT NULL AND TRIM(oc.shein_tracking_no) <> '')
        OR (oc.shein_split_tracking_numbers_json IS NOT NULL AND TRIM(oc.shein_split_tracking_numbers_json) <> '')
      )
  ");
  $cartsStmt->bind_param("ii", $user_id, $month_id);
  $cartsStmt->execute();
  $cartRes = $cartsStmt->get_result();

  $refsByTrack = [];       // TRACK -> ["order X / cart Y", ...]
  $splitKeyByTrack = [];   // TRACK -> split:...
  $splitTracksByKey = [];  // split:... -> [TRACK,...]

  while ($cart = $cartRes->fetch_assoc()) {
    $ord = trim((string)($cart["order_name"] ?? ""));
    $cartNo = trim((string)($cart["cart_order_number"] ?? ""));
    $cartRef = "order " . ($ord !== "" ? $ord : "-") . " / cart " . ($cartNo !== "" ? $cartNo : "-");

    $directTrackUpper = _cargo_norm_track((string)($cart["shein_tracking_no"] ?? ""));
    if ($directTrackUpper !== "") {
      if (!isset($refsByTrack[$directTrackUpper])) $refsByTrack[$directTrackUpper] = [];
      $refsByTrack[$directTrackUpper][] = $cartRef;
    }

    $splitTracks = _cargo_parse_tracks_json((string)($cart["shein_split_tracking_numbers_json"] ?? ""));
    if (count($splitTracks) >= 2) {
      $upperTracks = [];
      foreach ($splitTracks as $t) $upperTracks[] = _cargo_norm_track($t);
      $upperTracks = array_values(array_unique(array_filter($upperTracks, function ($x) { return $x !== ""; })));
      sort($upperTracks, SORT_STRING);
      if ($upperTracks) {
        $splitKey = "split:" . implode("|", $upperTracks);
        $splitTracksByKey[$splitKey] = $upperTracks;
        foreach ($upperTracks as $tUpper) {
          $splitKeyByTrack[$tUpper] = $splitKey;
          if (!isset($refsByTrack[$tUpper])) $refsByTrack[$tUpper] = [];
          $refsByTrack[$tUpper][] = $cartRef;
        }
      }
    }
  }

  foreach ($refsByTrack as $t => $refs) {
    $refsByTrack[$t] = array_values(array_unique($refs));
  }

  $statusStmt = $conn->prepare("
    SELECT group_key, status, confirmed_at
    FROM cargo_package_sort_status
    WHERE user_id=? AND month_id=?
  ");
  $statusStmt->bind_param("ii", $user_id, $month_id);
  $statusStmt->execute();
  $statusMap = [];
  $statusRes = $statusStmt->get_result();
  while ($s = $statusRes->fetch_assoc()) {
    $statusMap[(string)$s["group_key"]] = [
      "status" => (string)$s["status"],
      "confirmed_at" => $s["confirmed_at"],
    ];
  }

  $groups = [];
  foreach ($customsRows as $row) {
    $trackingRaw = trim((string)($row["tracking_no"] ?? ""));
    if ($trackingRaw === "") continue;
    $trackUpper = _cargo_norm_track($trackingRaw);

    $groupType = "single";
    $groupKey = "single:" . $trackUpper;
    $trackingNumbers = [$trackUpper];

    if (isset($splitKeyByTrack[$trackUpper])) {
      $groupType = "split";
      $groupKey = $splitKeyByTrack[$trackUpper];
      $trackingNumbers = $splitTracksByKey[$groupKey] ?? [$trackUpper];
    } else {
      $refs = $refsByTrack[$trackUpper] ?? [];
      if (count($refs) > 1) {
        $groupType = "joint";
        $groupKey = "joint:" . $trackUpper;
      }
    }

    if (!isset($groups[$groupKey])) {
      $statusRow = $statusMap[$groupKey] ?? null;
      $groups[$groupKey] = [
        "group_key" => $groupKey,
        "group_type" => $groupType,
        "display_label" => "",
        "tracking_numbers" => $trackingNumbers,
        "order_cart_refs" => [],
        "entries_count" => 0,
        "total_customs_fee" => 0.0,
        "total_weight_kg" => 0.0,
        "latest_custom_id" => 0,
        "status" => $statusRow["status"] ?? null,
        "confirmed_at" => $statusRow["confirmed_at"] ?? null,
        "received_tracking_map" => [],
      ];
    }

    $groups[$groupKey]["entries_count"]++;
    $groups[$groupKey]["total_customs_fee"] += (float)($row["customs_fee"] ?? 0);
    $groups[$groupKey]["total_weight_kg"] += (float)($row["weight_kg"] ?? 0);
    $groups[$groupKey]["latest_custom_id"] = max((int)$groups[$groupKey]["latest_custom_id"], (int)($row["id"] ?? 0));
    $groups[$groupKey]["received_tracking_map"][$trackUpper] = true;

    $orderRef = trim((string)($row["order_ref"] ?? ""));
    $cartRef = trim((string)($row["cart_ref"] ?? ""));
    if ($orderRef !== "" || $cartRef !== "") {
      $groups[$groupKey]["order_cart_refs"][] = trim($orderRef . ($orderRef !== "" && $cartRef !== "" ? " / " : "") . $cartRef);
    }
  }

  foreach ($groups as $key => $group) {
    $refs = $group["order_cart_refs"];
    foreach ($group["tracking_numbers"] as $tUpper) {
      if (isset($refsByTrack[$tUpper])) {
        foreach ($refsByTrack[$tUpper] as $ref) $refs[] = $ref;
      }
    }
    $refs = array_values(array_unique(array_filter($refs, function ($v) { return trim((string)$v) !== ""; })));
    $groups[$key]["order_cart_refs"] = $refs;

    if ($group["group_type"] === "split") {
      $groups[$key]["display_label"] = "Split package: " . implode(" + ", $group["tracking_numbers"]);
    } elseif ($group["group_type"] === "joint") {
      $groups[$key]["display_label"] = "Joint package: " . implode(", ", $group["tracking_numbers"]);
    } else {
      $groups[$key]["display_label"] = "Package: " . implode(", ", $group["tracking_numbers"]);
    }

    $receivedMap = is_array($group["received_tracking_map"] ?? null) ? $group["received_tracking_map"] : [];
    $receivedCount = 0;
    $missingTracks = [];
    foreach (($group["tracking_numbers"] ?? []) as $trk) {
      $tu = _cargo_norm_track((string)$trk);
      if ($tu !== "" && !empty($receivedMap[$tu])) $receivedCount++;
      else if ($tu !== "") $missingTracks[] = $tu;
    }
    $totalTracks = count($group["tracking_numbers"] ?? []);
    $groups[$key]["split_total_count"] = $totalTracks;
    $groups[$key]["split_received_count"] = $receivedCount;
    $groups[$key]["split_missing_tracking_numbers"] = $missingTracks;
    $groups[$key]["split_completed"] = ($group["group_type"] === "split" && $totalTracks > 0 && $receivedCount >= $totalTracks) ? 1 : 0;
    unset($groups[$key]["received_tracking_map"]);
  }

  $groups = array_values($groups);
  usort($groups, function ($a, $b) {
    return (int)($b["latest_custom_id"] ?? 0) <=> (int)($a["latest_custom_id"] ?? 0);
  });

  return $groups;
}
