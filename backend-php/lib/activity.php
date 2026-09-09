<?php

function activity_append(
  mysqli $conn,
  int $userId,
  ?int $monthId,
  string $entityType,
  ?int $entityId,
  string $action,
  $before = null,
  $after = null,
  $metadata = null,
  ?int $createdBy = null
): void {
  $beforeJson = $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  $afterJson = $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  $metadataJson = $metadata === null ? null : json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  $actor = $createdBy ?? $userId;

  $stmt = $conn->prepare(
    'INSERT INTO activity_log
      (user_id, month_id, entity_type, entity_id, action, before_json, after_json, metadata_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  if (!$stmt) throw new Exception($conn->error ?: 'Failed to prepare activity log');
  $stmt->bind_param(
    'iisissssi',
    $userId,
    $monthId,
    $entityType,
    $entityId,
    $action,
    $beforeJson,
    $afterJson,
    $metadataJson,
    $actor
  );
  if (!$stmt->execute()) throw new Exception($stmt->error ?: 'Failed to append activity log');
}
