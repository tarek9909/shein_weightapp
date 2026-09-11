const express = require("express");
const { pool } = require("../config/db");
const { requireAuth, requireWriteAccess } = require("../middleware/auth");
const { asyncHandler, paths, int, number, finite, trim, placeholders, uniquePositiveInts, execute, first, rows, HttpError } = require("../lib/helpers");

const router = express.Router(); router.use(requireAuth, requireWriteAccess);
const uid = (req) => Number(req.user.user_id);
const ensureMonth = async (monthId, userId) => Boolean(await first(pool, "SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1", [monthId, userId]));
const hasColumn = async (db, table, column) => Boolean(await first(db, "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1", [table, column]));

router.get(paths("getPayments", true), asyncHandler(async (req, res) => {
  const monthId = int(req.query.month_id); if (monthId <= 0) return res.status(400).json({ success: false, error: "month_id is required" });
  if (!(await ensureMonth(monthId, uid(req)))) return res.status(403).json({ success: false, error: "Invalid month for this user" });
  res.json(await rows(pool, `SELECT id,month_id,payment_amount,COALESCE(payment_type,'manual') AS payment_type,original_amount,delivery_charge,customer_count,customer_ids_json,note FROM payments WHERE month_id=? AND user_id=? ORDER BY id DESC`, [monthId, uid(req)]));
}));

router.post(paths("addPayment"), asyncHandler(async (req, res) => {
  const data = req.body || {}; const monthId = int(data.month_id); if (monthId <= 0) return res.status(400).json({ success: false, error: "month_id is required" }); if (!(await ensureMonth(monthId, uid(req)))) return res.status(403).json({ success: false, error: "Unauthorized month" });
  const paymentType = trim(data.payment_type || "manual").toLowerCase() || "manual";
  if (!["manual", "customers"].includes(paymentType)) return res.status(400).json({ success: false, error: "payment_type must be manual or customers" });
  if (paymentType === "customers") {
    const items = Array.isArray(data.customer_items) ? data.customer_items : []; if (!items.length) return res.status(400).json({ success: false, error: "customer_items is required" });
    const prepared = []; const selected = []; let original = 0; let charge = 0;
    for (const item of items) { if (!item || typeof item !== "object") throw new HttpError(400, "Each customer item must be an object", { success: false, error: "Each customer item must be an object" }); const customerId = int(item.customer_id); const amount = number(item.amount); const itemCharge = number(item.delivery_charge); const name = trim(item.customer_name); if (!finite(item.amount) || amount < 0 || !finite(item.delivery_charge) || itemCharge < 0 || itemCharge > amount || (customerId <= 0 && !name)) throw new HttpError(400, "Each customer item must contain valid amounts and a customer", { success: false, error: "Each customer item must contain valid amounts and a customer" }); prepared.push({ customer_id: customerId > 0 ? customerId : null, customer_name: name || null, amount, delivery_charge: itemCharge }); original += amount; charge += itemCharge; if (customerId > 0) selected.push(customerId); }
    if (!prepared.length) return res.status(400).json({ success: false, error: "No valid customer items" });
    const db = await pool.getConnection(); try { await db.beginTransaction(); if (selected.length) { const eligible = await rows(db, `SELECT cc.id FROM cart_customers cc JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id WHERE cc.user_id=? AND o.month_id=? AND cc.id IN (${placeholders(selected)}) AND COALESCE(cc.collection_status,'') <> 'collected' AND COALESCE(cc.payment_status,'') <> 'paid' AND COALESCE(cc.status,'') NOT IN ('paid','done') AND COALESCE(cc.delivery_status,'') NOT IN ('paid','done') AND NOT EXISTS (SELECT 1 FROM payment_customer_items pci WHERE pci.user_id=cc.user_id AND pci.customer_id=cc.id)`, [uid(req), monthId, ...selected]); const eligibleSet = new Set(eligible.map((r) => Number(r.id))); if (selected.some((id) => !eligibleSet.has(id))) throw new HttpError(400, "One or more selected customers are already paid or not eligible", { success: false, error: "One or more selected customers are already paid or not eligible" }); }
      const net = Math.round((original - charge) * 100) / 100; const ids = uniquePositiveInts(selected); const idsJson = JSON.stringify(ids); const note = trim(data.note) || "Customer payment"; const payment = await execute(db, `INSERT INTO payments (user_id,month_id,payment_amount,payment_type,original_amount,delivery_charge,customer_count,customer_ids_json,note) VALUES (?, ?, ?, 'customers', ?, ?, ?, ?, ?)`, [uid(req), monthId, net, original, charge, prepared.length, idsJson, note]); const paymentId = Number(payment.insertId); const chargeColumn = await hasColumn(db, "payment_customer_items", "delivery_charge"); const canonicalColumns = await hasColumn(db, "payment_customer_items", "final_amount"); for (const item of prepared) { const sql = canonicalColumns ? "INSERT INTO payment_customer_items (payment_id,customer_id,customer_name_snapshot,amount,delivery_charge,base_amount,delivery_adjustment,final_amount,collected_at,collection_key,user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)" : (chargeColumn ? "INSERT INTO payment_customer_items (payment_id,customer_id,customer_name_snapshot,amount,delivery_charge,user_id) VALUES (?, ?, ?, ?, ?, ?)" : "INSERT INTO payment_customer_items (payment_id,customer_id,customer_name_snapshot,amount,user_id) VALUES (?, ?, ?, ?, ?)" ); const params = canonicalColumns ? [paymentId,item.customer_id,item.customer_name,item.amount,item.delivery_charge,item.amount,item.delivery_charge,Math.round((item.amount - item.delivery_charge) * 100) / 100,item.customer_id ? `bulk-customer:${item.customer_id}:${paymentId}` : null,uid(req)] : chargeColumn ? [paymentId,item.customer_id,item.customer_name,item.amount,item.delivery_charge,uid(req)] : [paymentId,item.customer_id,item.customer_name,item.amount,uid(req)]; await execute(db, sql, params); } if (selected.length) await execute(db, `UPDATE cart_customers SET collection_status='collected',payment_status='paid',delivery_assignment_status='collected',status='paid',delivery_status='paid',collection_payment_id=?,collected_at=NOW() WHERE user_id=? AND id IN (${placeholders(ids)})`, [paymentId, uid(req), ...ids]); await db.commit(); res.json({ success:true,id:paymentId,payment_type:"customers",payment_amount:net,original_amount:original,delivery_charge:charge,customer_count:prepared.length,customer_ids_json:idsJson,note }); } catch(e) { try { await db.rollback(); } catch (_) {} throw e; } finally { db.release(); }
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(data, "payment_amount") || data.payment_amount === "") return res.status(400).json({ success: false, error: "payment_amount is required" }); const amount = number(data.payment_amount); if (!finite(data.payment_amount) || amount < 0) return res.status(400).json({ success: false, error: "payment_amount must be a finite number >= 0" }); const note = trim(data.note) || null; const result = await execute(pool, `INSERT INTO payments (user_id,month_id,payment_amount,payment_type,original_amount,delivery_charge,customer_count,customer_ids_json,note) VALUES (?, ?, ?, 'manual', NULL, 0, 0, NULL, ?)`, [uid(req), monthId, amount, note]); res.json({ success:true,id:Number(result.insertId),payment_type:"manual" });
}));

router.post(paths("updatePayment"), asyncHandler(async (req, res) => { const id=int(req.body?.id); const amount=number(req.body?.payment_amount); if(id<=0 || !finite(req.body?.payment_amount) || amount < 0)return res.status(400).json({success:false,error:"id and a valid non-negative payment_amount are required"}); const result=await execute(pool,"UPDATE payments SET payment_amount=? WHERE id=? AND user_id=? AND COALESCE(payment_type,'manual')='manual'",[amount,id,uid(req)]); res.json({success:true,affected:result.affectedRows}); }));
router.post(paths("deletePayment"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id);
  if (id <= 0) return res.status(400).json({ success: false, error: "id is required" });
  const payment = await first(pool, "SELECT id, month_id, payment_type, customer_ids_json FROM payments WHERE id=? AND user_id=? LIMIT 1", [id, uid(req)]);
  if (!payment) return res.status(404).json({ success: false, error: "Payment not found" });

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const items = await rows(db, "SELECT customer_id FROM payment_customer_items WHERE payment_id=? AND user_id=?", [id, uid(req)]);
    let customerIds = items.map((it) => Number(it.customer_id)).filter((cid) => cid > 0);
    if (!customerIds.length && payment.customer_ids_json) {
      try {
        const parsed = JSON.parse(payment.customer_ids_json);
        if (Array.isArray(parsed)) customerIds = parsed.map((n) => Number(n)).filter((cid) => cid > 0);
      } catch (_) {}
    }

    if (customerIds.length) {
      const qs = placeholders(customerIds);
      await execute(db, `UPDATE cart_customers
        SET collection_status='pending',
            payment_status='unpaid',
            delivery_assignment_status=CASE WHEN delivery_method IS NOT NULL THEN 'assigned' ELSE 'unassigned' END,
            status='withdelivery',
            delivery_status='added',
            collection_payment_id=NULL,
            collected_at=NULL
        WHERE user_id=? AND id IN (${qs})`, [uid(req), ...customerIds]);
    }

    await execute(db, "DELETE FROM payment_customer_items WHERE payment_id=? AND user_id=?", [id, uid(req)]);
    const result = await execute(db, "DELETE FROM payments WHERE id=? AND user_id=?", [id, uid(req)]);

    await db.commit();
    res.json({ success: true, affected: result.affectedRows, reverted_customers: customerIds.length });
  } catch (e) {
    try { await db.rollback(); } catch (_) {}
    throw e;
  } finally {
    db.release();
  }
}));

router.get(paths("getPaymentCustomers"), asyncHandler(async (req, res) => { const monthId=int(req.query.month_id); const query=trim(req.query.q); if(monthId<=0)return res.status(400).json({success:false,error:"month_id is required"}); if(!(await ensureMonth(monthId,uid(req))))return res.status(403).json({success:false,error:"Invalid month for this user"}); const like=`%${query}%`; const result=await rows(pool,`SELECT cc.id AS customer_id,cc.customer_name,cc.usd_to_collect,cc.base_amount_to_collect,cc.delivery_adjustment,cc.final_amount_to_collect,cc.status,cc.delivery_status,cc.collection_status,cc.payment_status,cc.delivery_number,oc.cart_order_number,o.order_name,o.id AS order_id FROM cart_customers cc INNER JOIN order_carts oc ON cc.cart_id=oc.id AND oc.user_id=cc.user_id INNER JOIN orders o ON oc.order_id=o.id AND o.user_id=oc.user_id WHERE cc.user_id=? AND o.month_id=? AND COALESCE(cc.collection_status,'') <> 'collected' AND COALESCE(cc.payment_status,'') <> 'paid' AND COALESCE(cc.status,'') NOT IN ('paid','done') AND COALESCE(cc.delivery_status,'') NOT IN ('paid','done') AND NOT EXISTS (SELECT 1 FROM payment_customer_items pci WHERE pci.user_id=cc.user_id AND pci.customer_id=cc.id) AND (?='' OR cc.customer_name LIKE ? OR oc.cart_order_number LIKE ? OR COALESCE(cc.delivery_number,'') LIKE ? OR COALESCE(o.order_name,'') LIKE ? OR CAST(cc.id AS CHAR) LIKE ?) ORDER BY cc.id DESC LIMIT 300`,[uid(req),monthId,query,like,like,like,like,like]); res.json({success:true,customers:result}); }));
router.get(paths("getPaymentItems"), asyncHandler(async (req, res) => { const paymentId=int(req.query.payment_id); if(paymentId<=0)return res.status(400).json({success:false,error:"payment_id is required"}); if(!(await first(pool,"SELECT id FROM payments WHERE id=? AND user_id=? LIMIT 1",[paymentId,uid(req)])))return res.status(404).json({success:false,error:"Payment not found"}); const result=await rows(pool,`SELECT pci.id,pci.payment_id,pci.customer_id,pci.customer_name_snapshot,pci.amount,COALESCE(pci.base_amount,pci.amount) AS base_amount,COALESCE(pci.delivery_adjustment,pci.delivery_charge,0) AS delivery_adjustment,COALESCE(pci.final_amount,pci.amount-COALESCE(pci.delivery_charge,0)) AS final_amount,COALESCE(pci.final_amount,pci.amount-COALESCE(pci.delivery_charge,0)) AS net_amount,pci.delivery_charge,pci.delivery_method,pci.delivery_number,pci.order_name_snapshot,pci.cart_order_number_snapshot,cc.status,cc.delivery_status,oc.cart_order_number,oc.id AS cart_id,o.order_name,o.id AS order_id FROM payment_customer_items pci LEFT JOIN cart_customers cc ON cc.id=pci.customer_id AND cc.user_id=pci.user_id LEFT JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=pci.user_id LEFT JOIN orders o ON o.id=oc.order_id AND o.user_id=pci.user_id WHERE pci.payment_id=? AND pci.user_id=? ORDER BY pci.id DESC`,[paymentId,uid(req)]); res.json({success:true,items:result}); }));

module.exports = router;
