const { first, execute } = require("./helpers");

async function refreshJointShipmentForTracking(db, userId, trackingNo) {
  const tracking = String(trackingNo ?? "").trim();
  if (!tracking) return;
  const countRow = await first(db, `SELECT COUNT(DISTINCT TRIM(shein_order_no)) AS c FROM order_carts
    WHERE user_id=? AND UPPER(TRIM(COALESCE(shein_tracking_no,'')))=UPPER(TRIM(?))
    AND TRIM(COALESCE(shein_order_no,''))<>''`, [userId, tracking]);
  const weight = await first(db, `SELECT COALESCE(SUM(COALESCE(shein_total_weight_kg,0)),0) AS total_weight_kg,
    COALESCE(SUM(COALESCE(shein_total_weight_plus_2kg,0)),0) AS total_weight_plus_2kg
    FROM order_carts WHERE user_id=? AND UPPER(TRIM(COALESCE(shein_tracking_no,'')))=UPPER(TRIM(?))`, [userId, tracking]);
  const count = Number(countRow?.c || 0);
  const joint = count >= 2 ? 1 : 0;
  await execute(db, `UPDATE order_carts SET is_joint_shipment=?, joint_shipment_count=?,
    joint_combined_weight_kg=?, joint_combined_weight_plus_2kg=?
    WHERE user_id=? AND UPPER(TRIM(COALESCE(shein_tracking_no,'')))=UPPER(TRIM(?))`, [
    joint, joint ? count : 0, joint ? Number(weight?.total_weight_kg || 0) : null,
    joint ? Number(weight?.total_weight_plus_2kg || 0) : null, userId, tracking,
  ]);
}

module.exports = { refreshJointShipmentForTracking };
