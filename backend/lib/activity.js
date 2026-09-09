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

module.exports = { appendActivity };
