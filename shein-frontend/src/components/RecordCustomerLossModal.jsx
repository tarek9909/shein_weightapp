import React, { useState } from "react";
import { addLoss, addLosses } from "../api/lossesApi";
import "./recordCustomerLossModal.css";

const customerTargetAmount = (customer) => {
  const finalAmount = customer?.final_amount_to_collect ?? customer?.final_amount;
  if (finalAmount !== null && finalAmount !== undefined && Number.isFinite(Number(finalAmount))) return Number(finalAmount);
  const base = customer?.base_amount_to_collect ?? customer?.base_amount;
  if (base !== null && base !== undefined && Number.isFinite(Number(base))) {
    const adjustment = Number(customer?.delivery_adjustment ?? 0);
    return Number(base) + (Number.isFinite(adjustment) ? adjustment : 0);
  }
  return Number(customer?.usd_to_collect || 0);
};

const LOSS_TYPES = [
  { value: "package not added / missing", label: "Package Not Added / Missing Cargo" },
  { value: "out of stock item", label: "Out of Stock Item" },
  { value: "damaged package", label: "Damaged Package / Cargo" },
  { value: "customer refused / cancelled", label: "Customer Refused / Cancelled" },
  { value: "wrong item", label: "Wrong Item / Mismatch" },
  { value: "delivery charge", label: "Delivery / Courier Issue" },
  { value: "lost cargo / transit", label: "Lost in Transit / Customs" },
  { value: "refund / discount", label: "Customer Refund / Discount" },
  { value: "customs penalty", label: "Customs / Tax Fee" },
  { value: "other", label: "Other Loss" },
];

export default function RecordCustomerLossModal({
  customer,
  customers,
  onClose,
  onSuccess,
}) {
  const targetList = Array.isArray(customers) && customers.length > 0
    ? customers
    : (customer ? [customer] : []);

  const isBulk = targetList.length > 1;
  const single = targetList[0] || null;

  const initialType = single?.loss_type || (
    single?.is_received === false || single?.delivery_assignment_status === "unassigned" || single?.legacy_delivery_status === "not added"
      ? "package not added / missing"
      : "out of stock item"
  );

  const [lossType, setLossType] = useState(initialType);
  const [bulkAmountMode, setBulkAmountMode] = useState("individual");
  const [amount, setAmount] = useState(
    !isBulk && (single?.usd_to_collect != null || single?.final_amount_to_collect != null || single?.final_amount != null || single?.base_amount_to_collect != null || single?.base_amount != null)
      ? String(customerTargetAmount(single).toFixed(2))
      : ""
  );
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!targetList.length) return null;

  const totalCalculatedLoss = isBulk
    ? (bulkAmountMode === "individual"
        ? targetList.reduce((sum, c) => sum + customerTargetAmount(c), 0)
        : (parseFloat(amount) || 0) * targetList.length)
    : (parseFloat(amount) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isBulk) {
        if (bulkAmountMode === "fixed") {
          const numFixed = parseFloat(amount);
          if (isNaN(numFixed) || numFixed <= 0) {
            setError("Please enter a valid positive amount per customer.");
            setLoading(false);
            return;
          }
        }
        const payloadRows = targetList.map((item, index) => {
          const itemAmt = bulkAmountMode === "individual"
            ? customerTargetAmount(item)
            : parseFloat(amount);
          if (!Number.isFinite(itemAmt) || itemAmt <= 0) {
            throw new Error(`Customer ${item.customer_name || `#${index + 1}`} does not have a positive loss amount.`);
          }
          return {
            customer_id: item.customer_id || item.id,
            order_id: item.order_id || null,
            month_id: item.month_id || null,
            loss_type: lossType,
            amount: Math.round(itemAmt * 100) / 100,
            description: description.trim() || `Bulk loss: ${item.customer_name || "Customer"} (${lossType})`,
          };
        });
        const res = await addLosses(payloadRows);
        if (Number(res?.created) !== payloadRows.length) {
          throw new Error("The bulk loss request did not create every selected loss.");
        }
        if (onSuccess) onSuccess({ count: payloadRows.length, total: totalCalculatedLoss });
        onClose();
      } else {
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
          setError("Please enter a valid positive loss amount.");
          setLoading(false);
          return;
        }
        const payload = {
          customer_id: single.customer_id || single.id,
          order_id: single.order_id || null,
          month_id: single.month_id || null,
          loss_type: lossType,
          amount: Math.round(numAmount * 100) / 100,
          description: description.trim() || `Customer loss: ${single.customer_name || ""}`,
        };
        const res = await addLoss(payload);
        if (res.ok || res.success) {
          if (onSuccess) onSuccess(res.id || res);
          onClose();
        } else {
          setError(res.error || "Failed to record loss");
        }
      }
    } catch (err) {
      setError(err.message || "Network error while recording loss");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rclOverlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`rclModal ${isBulk ? "bulk" : ""}`}>
        {/* Header */}
        <div className="rclHeader">
          <div>
            <h3 className="rclTitle">
              {isBulk ? `Record Bulk Loss (${targetList.length} Customers)` : "Record Customer Loss"}
            </h3>
            <p className="rclSub">
              {isBulk
                ? `Register losses across ${targetList.length} selected customers`
                : "Register a loss against this customer & order"}
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="rclCloseBtn"
            type="button"
          >
            ✕
          </button>
        </div>

        {/* Target Details / Snapshot */}
        {isBulk ? (
          <div className="rclSnapshot">
            <div className="rclSnapshotRow">
              <span style={{ color: "#64748b", fontWeight: 600 }}>Selected Customers:</span>
              <span style={{ fontWeight: 750, color: "#b91c1c" }}>{targetList.length} customers</span>
            </div>
            <div style={{ maxHeight: "80px", overflowY: "auto", color: "#1e293b", fontSize: "0.8rem" }}>
              {targetList.map((c, i) => (
                <span key={i} style={{ display: "inline-block", background: "#e2e8f0", padding: "2px 8px", borderRadius: "5px", margin: "2px 4px 2px 0", fontWeight: 600 }}>
                  {c.customer_name || `Customer #${c.customer_id || c.id}`} (${customerTargetAmount(c).toFixed(2)})
                </span>
              ))}
            </div>
            <div className="rclSnapshotRow" style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.35rem" }}>
              <span style={{ color: "#64748b", fontWeight: 600 }}>Total Customer Value:</span>
              <span style={{ color: "#0284c7", fontWeight: 800 }}>
                ${targetList.reduce((sum, c) => sum + customerTargetAmount(c), 0).toFixed(2)}
              </span>
            </div>
          </div>
        ) : (
          <div className="rclSnapshot">
            <div className="rclSnapshotRow">
              <span style={{ color: "#64748b", fontWeight: 600 }}>Customer:</span>
              <span style={{ fontWeight: 750, color: "#0f172a" }}>{single.customer_name || "Unknown"}</span>
            </div>
            {single.order_name && (
              <div className="rclSnapshotRow">
                <span style={{ color: "#64748b", fontWeight: 600 }}>Order:</span>
                <span style={{ color: "#334155", fontWeight: 600 }}>{single.order_name}</span>
              </div>
            )}
            {(single.usd_to_collect !== undefined || single.final_amount_to_collect !== undefined || single.final_amount !== undefined || single.base_amount_to_collect !== undefined || single.base_amount !== undefined) && (
              <div className="rclSnapshotRow">
                <span style={{ color: "#64748b", fontWeight: 600 }}>Target to Collect:</span>
                <span style={{ color: "#0284c7", fontWeight: 800 }}>
                  ${customerTargetAmount(single).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="rclForm">
          {error && (
            <div
              style={{
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <div className="rclField">
            <label className="rclLabel">
              Loss Reason / Category
            </label>
            <select
              value={lossType}
              onChange={(e) => setLossType(e.target.value)}
              className="rclSelect"
            >
              {LOSS_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {isBulk ? (
            <div className="rclField">
              <label className="rclLabel">
                Bulk Loss Calculation Mode
              </label>
              <div className="rclRadioGroup">
                <label className={`rclRadioPill ${bulkAmountMode === "individual" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="bulkAmountMode"
                    value="individual"
                    checked={bulkAmountMode === "individual"}
                    onChange={() => setBulkAmountMode("individual")}
                  />
                  <span>Each customer's target value (${totalCalculatedLoss.toFixed(2)})</span>
                </label>
                <label className={`rclRadioPill ${bulkAmountMode === "fixed" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="bulkAmountMode"
                    value="fixed"
                    checked={bulkAmountMode === "fixed"}
                    onChange={() => setBulkAmountMode("fixed")}
                  />
                  <span>Fixed amount per customer</span>
                </label>
              </div>

              {bulkAmountMode === "fixed" && (
                <div className="rclField" style={{ marginTop: "8px" }}>
                  <label className="rclLabel" style={{ fontSize: "12px", color: "#64748b" }}>
                    Amount per customer ($ USD):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g. 10.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="rclInput"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="rclField">
              <div className="rclLabel">
                <span>Loss Amount ($ USD) *</span>
                {(single?.usd_to_collect != null || single?.final_amount_to_collect != null || single?.final_amount != null || single?.base_amount_to_collect != null || single?.base_amount != null) && (
                  <button
                    type="button"
                    onClick={() => setAmount(String(customerTargetAmount(single).toFixed(2)))}
                    style={{
                      background: "#e0f2fe",
                      border: "1px solid #7dd3fc",
                      color: "#0369a1",
                      borderRadius: "6px",
                      padding: "2px 8px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Use Full Target (${customerTargetAmount(single).toFixed(2)})
                  </button>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="e.g. 15.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rclInput"
              />
            </div>
          )}

          <div className="rclField">
            <label className="rclLabel">
              Description / Notes
            </label>
            <textarea
              rows={3}
              placeholder={isBulk ? "e.g. Batch cargo not added to delivery / missing items" : "Why was this loss recorded? (e.g. package not added, missing cargo)"}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rclTextarea"
            />
          </div>

          <div className="rclFooterBtns">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rclCancelBtn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (isBulk && bulkAmountMode === "fixed" && (!amount || parseFloat(amount) <= 0)) || (!isBulk && (!amount || parseFloat(amount) <= 0))}
              className="rclSubmitBtn"
            >
              {loading ? "Recording..." : isBulk ? `Record Loss ($${totalCalculatedLoss.toFixed(2)})` : "Record Loss"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
