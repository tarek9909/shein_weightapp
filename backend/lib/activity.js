const { execute } = require("./helpers");

async function appendActivity(db, userId, monthId, entityType, entityId, action, before = null, after = null, metadata = null, createdBy = null) {
  await execute(db, `INSERT INTO activity_log
    (user_id, month_id, entity_type, entity_id, action, before_json, after_json, metadata_json, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    userId, monthId ?? null, entityType, entityId ?? null, action,
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
    metadata == null ? null : JSON.stringify(metadata),
    createdBy ?? userId,
  ]);
}

async function appendSecurityAudit(db, actorUserId, targetUserId, eventType, ipAddress = null, metadata = null) {
  try {
    await execute(db, `INSERT INTO security_audit_log
      (actor_user_id, target_user_id, event_type, ip_address, metadata_json)
      VALUES (?, ?, ?, ?, ?)`, [
      actorUserId ?? null, targetUserId ?? null, eventType,
      ipAddress ? String(ipAddress).slice(0, 64) : null,
      metadata == null ? null : JSON.stringify(metadata),
    ]);
  } catch (error) {
    console.error(JSON.stringify({ event: "audit_write_failed", error: error.code || error.message }));
  }
}

module.exports = { appendActivity, appendSecurityAudit };
