<?php

function losses_json_error(int $status, string $message): void {
  http_response_code($status);
  echo json_encode(['ok' => false, 'error' => $message]);
  exit;
}

function losses_require_month(mysqli $conn, int $userId, int $monthId): void {
  $stmt = $conn->prepare('SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1');
  $stmt->bind_param('ii', $monthId, $userId);
  $stmt->execute();
  if (!$stmt->get_result()->fetch_assoc()) losses_json_error(403, 'Invalid month for this user');
}
