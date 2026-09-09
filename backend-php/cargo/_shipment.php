<?php

/**
 * Shipment helpers shared by the cargo receipt endpoints.
 * These helpers only read persisted tracking fields; they do not call or
 * mutate any SHEIN or weight API.
 */
function shipment_normalize_tracking(string $tracking): string {
  return strtoupper(trim($tracking));
}

function shipment_decode_tracking_json($value): array {
  if (!is_string($value) || trim($value) === '') return [];
  $decoded = json_decode($value, true);
  if (!is_array($decoded)) return [];

  $out = [];
  foreach ($decoded as $tracking) {
    $normalized = shipment_normalize_tracking((string)$tracking);
    if ($normalized !== '') $out[] = $normalized;
  }
  return array_values(array_unique($out));
}

function shipment_expected_tracking_numbers(array $cart): array {
  $numbers = shipment_decode_tracking_json($cart['shein_split_tracking_numbers_json'] ?? null);
  $primary = shipment_normalize_tracking((string)($cart['shein_tracking_no'] ?? ''));
  if ($primary !== '') $numbers[] = $primary;

  $numbers = array_values(array_unique(array_filter($numbers)));
  sort($numbers, SORT_STRING);
  return $numbers;
}

function shipment_group_key(array $trackingNumbers): string {
  $numbers = array_values(array_unique(array_filter(array_map(
    fn($value) => shipment_normalize_tracking((string)$value),
    $trackingNumbers
  ))));
  sort($numbers, SORT_STRING);
  if (count($numbers) === 1) return 'single:' . $numbers[0];
  return 'split:' . implode('|', $numbers);
}

function shipment_json($value): string {
  $encoded = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  return $encoded === false ? '{}' : $encoded;
}

function shipment_receipts_for_tracking(mysqli $conn, int $userId, array $trackingNumbers, bool $forUpdate = false): array {
  $trackingNumbers = array_values(array_unique(array_filter(array_map(
    fn($value) => shipment_normalize_tracking((string)$value),
    $trackingNumbers
  ))));
  if (!$trackingNumbers) return [];

  $placeholders = implode(',', array_fill(0, count($trackingNumbers), '?'));
  $sql = "SELECT tracking_no, received_at, id FROM shipment_receipts WHERE user_id=? AND tracking_no IN ($placeholders)";
  if ($forUpdate) $sql .= ' FOR UPDATE';
  $stmt = $conn->prepare($sql);
  if (!$stmt) throw new Exception($conn->error ?: 'Failed to prepare receipt lookup');

  $types = 'i' . str_repeat('s', count($trackingNumbers));
  $params = array_merge([$userId], $trackingNumbers);
  $refs = [&$types];
  foreach ($params as $index => $value) $refs[] = &$params[$index];
  call_user_func_array([$stmt, 'bind_param'], $refs);
  if (!$stmt->execute()) throw new Exception($stmt->error ?: 'Failed to load shipment receipts');

  $out = [];
  $result = $stmt->get_result();
  while ($row = $result->fetch_assoc()) {
    $out[shipment_normalize_tracking((string)$row['tracking_no'])] = $row;
  }
  return $out;
}

function shipment_state(array $expected, array $receipts): array {
  $received = [];
  foreach ($expected as $tracking) {
    $normalized = shipment_normalize_tracking((string)$tracking);
    if (isset($receipts[$normalized])) $received[] = $normalized;
  }
  $expectedCount = count($expected);
  $receivedCount = count(array_unique($received));
  return [
    'expected_count' => $expectedCount,
    'received_count' => $receivedCount,
    'complete' => $expectedCount > 0 && $receivedCount === $expectedCount,
    'status' => $receivedCount === 0 ? 'pending' : ($receivedCount === $expectedCount ? 'complete' : 'partial'),
    'received_tracking_numbers' => array_values(array_unique($received)),
  ];
}
