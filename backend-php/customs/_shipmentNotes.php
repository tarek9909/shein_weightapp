<?php

function build_shipment_note_context(mysqli $conn, int $user_id, int $month_id, ?string $tracking_no, bool $apply_side_effects = true): array {
  $tracking = trim((string)$tracking_no);
  if ($tracking === "") {
    return [
      "order_id" => null,
      "cart_id" => null,
      "order_ref" => null,
      "cart_ref" => null,
      "note_parts" => [],
      "notifications" => [],
      "resolved_month_id" => $month_id,
      "split_conflict" => 0,
    ];
  }

  $lookup = $conn->prepare("
    SELECT
      oc.id AS cart_id,
      oc.order_id,
      oc.cart_order_number,
      oc.shein_tracking_no,
      oc.shein_is_split_shipment,
      oc.shein_split_tracking_numbers_json,
      o.order_name
    FROM order_carts oc
    JOIN orders o ON o.id = oc.order_id AND o.user_id = oc.user_id
    WHERE oc.user_id = ?
      AND UPPER(TRIM(oc.shein_tracking_no)) = UPPER(TRIM(?))
    ORDER BY oc.id ASC
  ");
  $lookup->bind_param("is", $user_id, $tracking);
  $lookup->execute();
  $res = $lookup->get_result();

  $rows = [];
  while ($r = $res->fetch_assoc()) $rows[] = $r;
  if (!$rows) {
    // Fallback for split packages where this tracking may exist only as a sibling
    // inside shein_split_tracking_numbers_json, not as shein_tracking_no itself.
    $likeQuoted = '%"' . $tracking . '"%';
    $likeRaw = '%' . $tracking . '%';
    $lookupSplit = $conn->prepare("
      SELECT
        oc.id AS cart_id,
        oc.order_id,
        oc.cart_order_number,
        oc.shein_tracking_no,
        oc.shein_is_split_shipment,
        oc.shein_split_tracking_numbers_json,
        o.order_name
      FROM order_carts oc
      JOIN orders o ON o.id = oc.order_id AND o.user_id = oc.user_id
      WHERE oc.user_id = ?
        AND (
          oc.shein_split_tracking_numbers_json LIKE ?
          OR oc.shein_split_tracking_numbers_json LIKE ?
        )
      ORDER BY oc.id ASC
    ");
    $lookupSplit->bind_param("iss", $user_id, $likeQuoted, $likeRaw);
    $lookupSplit->execute();
    $resSplit = $lookupSplit->get_result();
    while ($r = $resSplit->fetch_assoc()) $rows[] = $r;
  }

  if (!$rows) {
    return [
      "order_id" => null,
      "cart_id" => null,
      "order_ref" => null,
      "cart_ref" => null,
      "note_parts" => [],
      "notifications" => [],
      "resolved_month_id" => $month_id,
      "split_conflict" => 0,
    ];
  }

  $first = $rows[0];
  $order_id = isset($first["order_id"]) ? (int)$first["order_id"] : null;
  $cart_id = isset($first["cart_id"]) ? (int)$first["cart_id"] : null;
  $order_ref = "order " . (($first["order_name"] !== null && $first["order_name"] !== "") ? $first["order_name"] : (string)$order_id);
  $cart_ref = "cart " . (string)($first["cart_order_number"] ?? "");
  $note_parts = [];
  $notifications = [];
  $resolved_month_id = $month_id;
  $splitConflict = 0;

  // Joint shipment: same tracking linked to multiple carts/orders.
  if (count($rows) > 1) {
    $jointRefs = [];
    foreach ($rows as $r) {
      $ord = trim((string)($r["order_name"] ?? ""));
      $cartNo = trim((string)($r["cart_order_number"] ?? ""));
      if ($ord === "") $ord = (string)($r["order_id"] ?? "");
      $jointRefs[] = "order {$ord} / cart {$cartNo}";
    }
    $jointRefs = array_values(array_unique($jointRefs));
    if ($jointRefs) {
      $note_parts[] = "Joint shipment with: " . implode(" ; ", $jointRefs);
    }
  }

  // Split shipment: check if sibling tracking numbers already appeared in customs.
  // Detect inconsistent split definitions for the same tracking (data-quality warning).
  $splitSetKeys = [];
  foreach ($rows as $r) {
    $jsonChk = trim((string)($r["shein_split_tracking_numbers_json"] ?? ""));
    if ($jsonChk === "") continue;
    $arrChk = json_decode($jsonChk, true);
    if (!is_array($arrChk)) continue;
    $set = [];
    foreach ($arrChk as $t) {
      $tv = strtoupper(trim((string)$t));
      if ($tv !== "") $set[$tv] = $tv;
    }
    if ($tracking !== "") $set[strtoupper($tracking)] = strtoupper($tracking);
    $vals = array_values($set);
    sort($vals, SORT_STRING);
    if ($vals) $splitSetKeys[implode("|", $vals)] = true;
  }
  if (count($splitSetKeys) > 1) {
    $splitConflict = 1;
    $notifications[] = "Warning: inconsistent split definitions detected for this tracking in order carts.";
  }

  $peerTracks = [];
  foreach ($rows as $r) {
    $json = trim((string)($r["shein_split_tracking_numbers_json"] ?? ""));
    if ($json === "") continue;
    $arr = json_decode($json, true);
    if (!is_array($arr)) continue;
    foreach ($arr as $t) {
      $tv = trim((string)$t);
      if ($tv === "" || strcasecmp($tv, $tracking) === 0) continue;
      $peerTracks[strtoupper($tv)] = $tv;
    }
  }
  $peerTracks = array_values($peerTracks);

  if ($peerTracks) {
    // If sibling split package already exists in customs in another month, move this insert to that month.
    $phAll = implode(",", array_fill(0, count($peerTracks), "?"));
    $typesAll = "i" . str_repeat("s", count($peerTracks));
    $sqlAnyMonths = "
      SELECT month_id, tracking_no
      FROM customs
      WHERE user_id=? AND tracking_no IS NOT NULL AND tracking_no IN ($phAll)
      ORDER BY id DESC
    ";
    $anyStmt = $conn->prepare($sqlAnyMonths);
    $paramsAny = array_merge([$user_id], $peerTracks);
    $refsAny = [];
    $refsAny[] = &$typesAll;
    foreach ($paramsAny as $k => $v) $refsAny[] = &$paramsAny[$k];
    call_user_func_array([$anyStmt, "bind_param"], $refsAny);
    $anyStmt->execute();
    $anyRes = $anyStmt->get_result();
    $peerMonths = [];
    while ($am = $anyRes->fetch_assoc()) {
      $mid = (int)($am["month_id"] ?? 0);
      if ($mid > 0) $peerMonths[$mid] = true;
    }
    if ($peerMonths) {
      $peerMonthList = array_keys($peerMonths);
      if (count($peerMonthList) === 1) {
        $peerMonth = (int)$peerMonthList[0];
        if ($peerMonth > 0 && $peerMonth !== $month_id) {
          $resolved_month_id = $peerMonth;
          $notifications[] = "Split sibling already exists in month {$peerMonth}; item will be added to that month.";
        }
      } else {
        $notifications[] = "Warning: split siblings exist across multiple months (" . implode(", ", $peerMonthList) . "). Kept selected month.";
      }
    }

    $effectiveMonthId = (int)$resolved_month_id;
    if ($effectiveMonthId <= 0) $effectiveMonthId = $month_id;

    $ph = implode(",", array_fill(0, count($peerTracks), "?"));
    $types = "ii" . str_repeat("s", count($peerTracks));
    $sqlPending = "
      SELECT tracking_no, order_ref, cart_ref
      FROM customs
      WHERE user_id=? AND month_id=? AND tracking_no IS NOT NULL AND tracking_no IN ($ph)
        AND (
          COALESCE(note, '') LIKE '%waiting for next split package%'
          OR COALESCE(note, '') LIKE '%Split shipment pending%'
        )
      ORDER BY id DESC
    ";
    $seenStmt = $conn->prepare($sqlPending);
    $params = array_merge([$user_id, $effectiveMonthId], $peerTracks);
    $refs = [];
    $refs[] = &$types;
    foreach ($params as $k => $v) $refs[] = &$params[$k];
    call_user_func_array([$seenStmt, "bind_param"], $refs);
    $seenStmt->execute();
    $seenRes = $seenStmt->get_result();
    $seenPeers = [];
    $seenRefs = [];
    while ($sr = $seenRes->fetch_assoc()) {
      $t = trim((string)($sr["tracking_no"] ?? ""));
      if ($t === "") continue;
      $seenPeers[strtoupper($t)] = $t;
      $oref = trim((string)($sr["order_ref"] ?? ""));
      $cref = trim((string)($sr["cart_ref"] ?? ""));
      $labelParts = [$t];
      if ($oref !== "") $labelParts[] = $oref;
      if ($cref !== "") $labelParts[] = $cref;
      $seenRefs[] = implode(" / ", $labelParts);
    }
    $seenList = array_values(array_unique($seenRefs));

    if ($seenList) {
      // Mark previously pending split records as received by this tracking.
      $receivedTracks = array_values(array_unique(array_values($seenPeers)));
      if ($apply_side_effects && $receivedTracks) {
        $phUpd = implode(",", array_fill(0, count($receivedTracks), "?"));
        $typesUpd = "ii" . str_repeat("s", count($receivedTracks));
        $sqlSelUpd = "
          SELECT id, note
          FROM customs
          WHERE user_id=?
            AND month_id=?
            AND tracking_no IN ($phUpd)
            AND (
              COALESCE(note, '') LIKE '%waiting for next split package%'
              OR COALESCE(note, '') LIKE '%Split shipment pending%'
            )
        ";
        $selUpd = $conn->prepare($sqlSelUpd);
        $paramsUpd = array_merge([$user_id, $effectiveMonthId], $receivedTracks);
        $refsUpd = [];
        $refsUpd[] = &$typesUpd;
        foreach ($paramsUpd as $k => $v) $refsUpd[] = &$paramsUpd[$k];
        call_user_func_array([$selUpd, "bind_param"], $refsUpd);
        $selUpd->execute();
        $rowsToUpdate = $selUpd->get_result();

        $updById = $conn->prepare("UPDATE customs SET note=? WHERE id=? AND user_id=?");
        while ($ru = $rowsToUpdate->fetch_assoc()) {
          $oldNote = trim((string)($ru["note"] ?? ""));
          $parts = preg_split('/\s*\|\s*/', $oldNote);
          if (!is_array($parts)) $parts = [];
          $cleanParts = [];
          foreach ($parts as $p) {
            $pt = trim((string)$p);
            if ($pt === "") continue;
            $lc = strtolower($pt);
            if (strpos($lc, "waiting for next split package") !== false) continue;
            if (strpos($lc, "split shipment pending - waiting for next package") !== false) continue;
            if (strpos($lc, "split received:") === 0) continue;
            $cleanParts[] = $pt;
          }
          $cleanParts[] = "Split received: " . $tracking;
          $newNote = implode(" | ", array_values(array_unique($cleanParts)));
          $idUpd = (int)$ru["id"];
          $updById->bind_param("sii", $newNote, $idUpd, $user_id);
          $updById->execute();
        }
      }

      $note_parts[] = "Split received from package(s): " . implode(", ", $seenList);
    } else {
      $note_parts[] = "Split shipment pending - waiting for next package(s): " . implode(", ", $peerTracks);
    }
  }

  return [
    "order_id" => $order_id,
    "cart_id" => $cart_id,
    "order_ref" => $order_ref,
    "cart_ref" => $cart_ref,
    "note_parts" => $note_parts,
    "notifications" => $notifications,
    "resolved_month_id" => $resolved_month_id,
    "split_conflict" => $splitConflict,
  ];
}

function _split_cleanup_note_parts(string $note): string {
  $parts = preg_split('/\s*\|\s*/', trim($note));
  if (!is_array($parts)) $parts = [];
  $out = [];
  foreach ($parts as $p) {
    $pt = trim((string)$p);
    if ($pt === "") continue;
    $lc = strtolower($pt);
    if (strpos($lc, "split shipment pending - waiting for next package") !== false) continue;
    if (strpos($lc, "waiting for next split package") !== false) continue;
    if (strpos($lc, "split received:") === 0) continue;
    if (strpos($lc, "split received from package(s):") === 0) continue;
    $out[] = $pt;
  }
  return implode(" | ", array_values(array_unique($out)));
}

function refresh_split_notes_for_tracking(mysqli $conn, int $user_id, int $month_id, ?string $tracking_no): void {
  $tracking = strtoupper(trim((string)$tracking_no));
  if ($tracking === "") return;

  // Find related split tracks from order_carts.
  $likeQuoted = '%"' . $tracking . '"%';
  $likeRaw = '%' . $tracking . '%';
  $rel = $conn->prepare("
    SELECT shein_split_tracking_numbers_json
    FROM order_carts
    WHERE user_id=?
      AND (
        UPPER(TRIM(shein_tracking_no)) = ?
        OR shein_split_tracking_numbers_json LIKE ?
        OR shein_split_tracking_numbers_json LIKE ?
      )
  ");
  $rel->bind_param("isss", $user_id, $tracking, $likeQuoted, $likeRaw);
  $rel->execute();
  $relRes = $rel->get_result();
  $tracks = [$tracking => $tracking];
  while ($r = $relRes->fetch_assoc()) {
    $json = trim((string)($r["shein_split_tracking_numbers_json"] ?? ""));
    if ($json === "") continue;
    $arr = json_decode($json, true);
    if (!is_array($arr)) continue;
    foreach ($arr as $t) {
      $tv = strtoupper(trim((string)$t));
      if ($tv !== "") $tracks[$tv] = $tv;
    }
  }
  $trackList = array_values($tracks);
  if (!$trackList) return;

  // Recompute notes across all months where any related split track currently exists.
  // This keeps split status consistent when siblings were entered in different months.
  $monthIds = [];
  if ($month_id > 0) $monthIds[$month_id] = true;
  $phMonths = implode(",", array_fill(0, count($trackList), "?"));
  $typesMonths = "i" . str_repeat("s", count($trackList));
  $selMonthsSql = "
    SELECT DISTINCT month_id
    FROM customs
    WHERE user_id=? AND tracking_no IN ($phMonths)
  ";
  $selMonths = $conn->prepare($selMonthsSql);
  if ($selMonths) {
    $paramsMonths = array_merge([$user_id], $trackList);
    $refsMonths = [];
    $refsMonths[] = &$typesMonths;
    foreach ($paramsMonths as $k => $v) $refsMonths[] = &$paramsMonths[$k];
    call_user_func_array([$selMonths, "bind_param"], $refsMonths);
    if ($selMonths->execute()) {
      $monthRows = $selMonths->get_result();
      while ($mr = $monthRows->fetch_assoc()) {
        $mid = (int)($mr["month_id"] ?? 0);
        if ($mid > 0) $monthIds[$mid] = true;
      }
    }
  }

  if (!$monthIds) return;

  $ph = implode(",", array_fill(0, count($trackList), "?"));
  $types = "ii" . str_repeat("s", count($trackList));
  $selSql = "
    SELECT id, tracking_no, note
    FROM customs
    WHERE user_id=? AND month_id=? AND tracking_no IN ($ph)
  ";
  $sel = $conn->prepare($selSql);
  $upd = $conn->prepare("UPDATE customs SET note=? WHERE id=? AND user_id=?");
  if (!$sel || !$upd) return;

  foreach (array_keys($monthIds) as $targetMonthId) {
    $targetMonthId = (int)$targetMonthId;
    if ($targetMonthId <= 0) continue;
    $params = array_merge([$user_id, $targetMonthId], $trackList);
    $refs = [];
    $refs[] = &$types;
    foreach ($params as $k => $v) $refs[] = &$params[$k];
    call_user_func_array([$sel, "bind_param"], $refs);
    if (!$sel->execute()) continue;
    $rows = $sel->get_result();
    while ($row = $rows->fetch_assoc()) {
      $id = (int)$row["id"];
      $trk = trim((string)($row["tracking_no"] ?? ""));
      if ($trk === "") continue;
      $base = _split_cleanup_note_parts((string)($row["note"] ?? ""));
      $ctx = build_shipment_note_context($conn, $user_id, $targetMonthId, $trk, false);
      $parts = [];
      if ($base !== "") $parts[] = $base;
      foreach (($ctx["note_parts"] ?? []) as $np) {
        $v = trim((string)$np);
        if ($v !== "") $parts[] = $v;
      }
      $newNote = implode(" | ", array_values(array_unique($parts)));
      $upd->bind_param("sii", $newNote, $id, $user_id);
      $upd->execute();
    }
  }
}


function customs_find_duplicate_tracking(mysqli $conn, int $user_id, ?string $tracking_no): ?array {
  $tracking = trim((string)$tracking_no);
  if ($tracking === "") return null;
  $st = $conn->prepare("
    SELECT id, month_id, tracking_no
    FROM customs
    WHERE user_id=? AND tracking_no IS NOT NULL AND UPPER(TRIM(tracking_no)) = UPPER(TRIM(?))
    ORDER BY id DESC
    LIMIT 1
  ");
  if (!$st) return null;
  $st->bind_param("is", $user_id, $tracking);
  if (!$st->execute()) return null;
  $row = $st->get_result()->fetch_assoc();
  return $row ?: null;
}
