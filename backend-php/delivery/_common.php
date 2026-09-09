<?php

function delivery_json_error(int $status, string $message): void {
  http_response_code($status);
  echo json_encode(['ok' => false, 'error' => $message]);
  exit;
}

function delivery_ids_from_payload(array $data): array {
  $raw = [];
  if (isset($data['customer_ids']) && is_array($data['customer_ids'])) $raw = $data['customer_ids'];
  elseif (isset($data['ids']) && is_array($data['ids'])) $raw = $data['ids'];
  elseif (isset($data['customer_id'])) $raw = [$data['customer_id']];

  $ids = array_values(array_unique(array_filter(array_map('intval', $raw), fn($id) => $id > 0)));
  sort($ids, SORT_NUMERIC);
  return $ids;
}

function delivery_decimal($value, ?float $fallback = null): ?float {
  if ($value === null || $value === '') return $fallback;
  $number = (float)$value;
  return is_finite($number) ? $number : $fallback;
}

function delivery_final_amount(array $customer): float {
  $base = delivery_decimal($customer['base_amount_to_collect'] ?? null, (float)($customer['usd_to_collect'] ?? 0)) ?? 0.0;
  $adjustment = delivery_decimal($customer['delivery_adjustment'] ?? null, 0.0) ?? 0.0;
  $final = delivery_decimal($customer['final_amount_to_collect'] ?? null, $base + $adjustment) ?? ($base + $adjustment);
  return round($final, 2);
}
