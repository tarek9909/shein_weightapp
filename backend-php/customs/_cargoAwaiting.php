<?php

function _await_norm_track(?string $value): string {
  return strtoupper(trim((string)$value));
}

function _await_parse_tracks_json(?string $json): array {
  $json = trim((string)$json);
  if ($json === "") return [];
  $arr = json_decode($json, true);
  if (!is_array($arr)) return [];
  $out = [];
  foreach ($arr as $t) {
    $tv = trim((string)$t);
    if ($tv === "") continue;
    $out[_await_norm_track($tv)] = $tv;
  }
  return array_values($out);
}

function get_delivered_not_in_customs(mysqli $conn, int $user_id, int $month_id): array {
  $customsStmt = $conn->prepare("
    SELECT tracking_no
    FROM customs
    WHERE user_id=? AND month_id=? AND tracking_no IS NOT NULL AND TRIM(tracking_no) <> ''
  ");
  $customsStmt->bind_param("ii", $user_id, $month_id);
  $customsStmt->execute();
  $customsRes = $customsStmt->get_result();
  $customsTracks = [];
  while ($r = $customsRes->fetch_assoc()) {
    $t = _await_norm_track((string)($r["tracking_no"] ?? ""));
    if ($t !== "") $customsTracks[$t] = true;
  }

  $stmt = $conn->prepare("
    SELECT
      oc.id AS cart_id,
      oc.order_id,
      oc.cart_order_number,
      oc.shein_tracking_no,
      oc.shein_split_tracking_numbers_json,
      oc.shein_delivered,
      o.order_name
    FROM order_carts oc
    JOIN orders o ON o.id = oc.order_id AND o.user_id = oc.user_id
    WHERE oc.user_id=? AND o.month_id=?
      AND COALESCE(oc.shein_delivered,0)=1
      AND (
        (oc.shein_tracking_no IS NOT NULL AND TRIM(oc.shein_tracking_no) <> '')
        OR (oc.shein_split_tracking_numbers_json IS NOT NULL AND TRIM(oc.shein_split_tracking_numbers_json) <> '')
      )
    ORDER BY oc.id DESC
  ");
  $stmt->bind_param("ii", $user_id, $month_id);
  $stmt->execute();
  $res = $stmt->get_result();

  $refsByTrack = [];
  $splitKeyByTrack = [];
  $splitTracksByKey = [];
  $allTracksFromCarts = [];

  $rows = [];
  while ($row = $res->fetch_assoc()) {
    $rows[] = $row;
    $ord = trim((string)($row["order_name"] ?? ""));
    $cartNo = trim((string)($row["cart_order_number"] ?? ""));
    $ref = "order " . ($ord !== "" ? $ord : "-") . " / cart " . ($cartNo !== "" ? $cartNo : "-");

    $direct = _await_norm_track((string)($row["shein_tracking_no"] ?? ""));
    if ($direct !== "") {
      if (!isset($refsByTrack[$direct])) $refsByTrack[$direct] = [];
      $refsByTrack[$direct][] = $ref;
      $allTracksFromCarts[$direct] = true;
    }

    $splitTracks = _await_parse_tracks_json((string)($row["shein_split_tracking_numbers_json"] ?? ""));
    if (count($splitTracks) >= 2) {
      $upperTracks = [];
      foreach ($splitTracks as $t) {
        $tu = _await_norm_track($t);
        if ($tu !== "") {
          $upperTracks[] = $tu;
          $allTracksFromCarts[$tu] = true;
        }
      }
      $upperTracks = array_values(array_unique($upperTracks));
      sort($upperTracks, SORT_STRING);
      if ($upperTracks) {
        $splitKey = "split:" . implode("|", $upperTracks);
        $splitTracksByKey[$splitKey] = $upperTracks;
        foreach ($upperTracks as $tu) {
          $splitKeyByTrack[$tu] = $splitKey;
          if (!isset($refsByTrack[$tu])) $refsByTrack[$tu] = [];
          $refsByTrack[$tu][] = $ref;
        }
      }
    }
  }

  foreach ($refsByTrack as $k => $refs) {
    $refsByTrack[$k] = array_values(array_unique($refs));
  }

  $groups = [];
  foreach (array_keys($allTracksFromCarts) as $trackUpper) {
    $groupType = "single";
    $groupKey = "single:" . $trackUpper;
    $trackingNumbers = [$trackUpper];
    if (isset($splitKeyByTrack[$trackUpper])) {
      $groupType = "split";
      $groupKey = $splitKeyByTrack[$trackUpper];
      $trackingNumbers = $splitTracksByKey[$groupKey] ?? [$trackUpper];
    } elseif (count($refsByTrack[$trackUpper] ?? []) > 1) {
      $groupType = "joint";
      $groupKey = "joint:" . $trackUpper;
    }

    if (!isset($groups[$groupKey])) {
      $groups[$groupKey] = [
        "group_key" => $groupKey,
        "group_type" => $groupType,
        "tracking_numbers" => $trackingNumbers,
        "order_cart_refs" => [],
      ];
    }

    foreach ($trackingNumbers as $tn) {
      foreach (($refsByTrack[$tn] ?? []) as $ref) $groups[$groupKey]["order_cart_refs"][] = $ref;
    }
  }

  $out = [];
  foreach ($groups as $group) {
    $refs = array_values(array_unique($group["order_cart_refs"]));
    $expected = $group["tracking_numbers"] ?? [];
    $added = [];
    $missing = [];
    foreach ($expected as $t) {
      $tu = _await_norm_track((string)$t);
      if ($tu === "") continue;
      if (!empty($customsTracks[$tu])) $added[] = $tu;
      else $missing[] = $tu;
    }
    if (!$missing) continue; // already fully added to customs

    $label = "Package: " . implode(", ", $expected);
    if (($group["group_type"] ?? "") === "split") $label = "Split package: " . implode(" + ", $expected);
    elseif (($group["group_type"] ?? "") === "joint") $label = "Joint package: " . implode(", ", $expected);

    $out[] = [
      "group_key" => $group["group_key"],
      "group_type" => $group["group_type"],
      "display_label" => $label,
      "tracking_numbers" => $expected,
      "added_to_customs_tracking_numbers" => $added,
      "missing_from_customs_tracking_numbers" => $missing,
      "order_cart_refs" => $refs,
      "is_fully_missing" => count($added) === 0 ? 1 : 0,
    ];
  }

  usort($out, function ($a, $b) {
    return ((int)$b["is_fully_missing"]) <=> ((int)$a["is_fully_missing"]);
  });

  return $out;
}
