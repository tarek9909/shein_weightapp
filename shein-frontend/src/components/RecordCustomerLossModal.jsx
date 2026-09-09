import React, { useState } from "react";
import { addLoss } from "../api/lossesApi";

const LOSS_TYPES = [
  { value: "package not added / missing", label: "⚠️ Package Not Added / Missing Cargo" },
  { value: "out of stock item", label: "📦 Out of Stock Item" },
  { value: "damaged package", label: "💔 Damaged Package / Cargo" },
  { value: "customer refused / cancelled", label: "🚫 Customer Refused / Cancelled" },
  { value: "wrong item", label: "🔄 Wrong Item / Mismatch" },
  { value: "delivery charge", label: "🚚 Delivery / Courier Issue" },
  { value: "lost cargo / transit", label: "✈️ Lost in Transit / Customs" },
  { value: "refund / discount", label: "💵 Customer Refund / Discount" },
  { value: "customs penalty", label: "📑 Customs / Tax Fee" },
  { value: "other", label: "❓ Other Loss" },
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
    !isBulk && single?.usd_to_collect != null
      ? String(Number(single.usd_to_collect || single.final_amount || 0).toFixed(2))
      : ""
  );
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!targetList.length) return null;

  const totalCalculatedLoss = isBulk
    ? (bulkAmountMode === "individual"
        ? targetList.reduce((sum, c) => sum + Number(c.usd_to_collect || c.final_amount || c.base_amount || 0), 0)
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
        for (const item of targetList) {
          const itemAmt = bulkAmountMode === "individual"
            ? Number(item.usd_to_collect || item.final_amount || item.base_amount || 0)
            : parseFloat(amount);
          if (itemAmt <= 0) continue;
          const payload = {
            customer_id: item.customer_id || item.id,
            order_id: item.order_id || null,
            month_id: item.month_id || null,
            loss_type: lossType,
            amount: Math.round(itemAmt * 100) / 100,
            description: description.trim() || `Bulk loss: ${item.customer_name || "Customer"} (${lossType})`,
          };
          await addLoss(payload);
        }
        if (onSuccess) onSuccess({ count: targetList.length, total: totalCalculatedLoss });
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
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "linear-gradient(145deg, #1e293b, #0f172a)",
          border: "1px solid rgba(239, 68, 68, 0.35)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: isBulk ? "540px" : "480px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 24px rgba(239, 68, 68, 0.18)",
          color: "#f8fafc",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                background: "rgba(239, 68, 68, 0.2)",
                color: "#f87171",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                fontSize: "1.1rem",
              }}
            >
              📉
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                {isBulk ? `Record Bulk Loss (${targetList.length} Customers)` : "Record Customer Loss"}
              </h3>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>
                {isBulk
                  ? `Immediately register losses across ${targetList.length} selected customers`
                  : "Immediately register a loss against this customer & order"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: "1.25rem",
              cursor: "pointer",
              padding: "0.25rem 0.5rem",
              borderRadius: "6px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Target Details / Snapshot */}
        {isBulk ? (
          <div
            style={{
              margin: "1rem 1.5rem 0",
              padding: "0.85rem 1rem",
              borderRadius: "10px",
              background: "rgba(30, 41, 59, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              fontSize: "0.875rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
              <span style={{ color: "#94a3b8" }}>Selected Customers:</span>
              <span style={{ fontWeight: 700, color: "#f87171" }}>{targetList.length} customers</span>
            </div>
            <div style={{ maxHeight: "80px", overflowY: "auto", color: "#cbd5e1", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
              {targetList.map((c, i) => (
                <span key={i} style={{ display: "inline-block", background: "#334155", padding: "2px 8px", borderRadius: "4px", margin: "2px 4px 2px 0" }}>
                  {c.customer_name || `Customer #${c.customer_id || c.id}`} (${Number(c.usd_to_collect || c.final_amount || 0).toFixed(2)})
                </span>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #334155", paddingTop: "0.35rem" }}>
              <span style={{ color: "#94a3b8" }}>Total Customer Value:</span>
              <span style={{ color: "#38bdf8", fontWeight: 700 }}>
                ${targetList.reduce((sum, c) => sum + Number(c.usd_to_collect || c.final_amount || c.base_amount || 0), 0).toFixed(2)}
              </span>
            </div>
          </div>
        ) : (
          <div
            style={{
              margin: "1rem 1.5rem 0",
              padding: "0.75rem 1rem",
              borderRadius: "10px",
              background: "rgba(30, 41, 59, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              fontSize: "0.875rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
              <span style={{ color: "#94a3b8" }}>Customer:</span>
              <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{single.customer_name || "Unknown"}</span>
            </div>
            {single.order_name && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                <span style={{ color: "#94a3b8" }}>Order:</span>
                <span style={{ color: "#cbd5e1" }}>{single.order_name}</span>
              </div>
            )}
            {(single.usd_to_collect !== undefined || single.final_amount !== undefined) && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Target to Collect:</span>
                <span style={{ color: "#38bdf8", fontWeight: 600 }}>
                  ${Number(single.usd_to_collect ?? single.final_amount ?? 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "1.25rem 1.5rem" }}>
          {error && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                color: "#fca5a5",
                fontSize: "0.85rem",
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem", color: "#cbd5e1" }}>
              Loss Reason / Category
            </label>
            <select
              value={lossType}
              onChange={(e) => setLossType(e.target.value)}
              style={{
                width: "100%",
                padding: "0.6rem 0.75rem",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "0.9rem",
              }}
            >
              {LOSS_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {isBulk ? (
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem", color: "#cbd5e1" }}>
                Bulk Loss Calculation Mode
              </label>
              <div style={{ display: "flex", gap: "10px", marginBottom: "0.75rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.85rem" }}>
                  <input
                    type="radio"
                    name="bulkAmountMode"
                    value="individual"
                    checked={bulkAmountMode === "individual"}
                    onChange={() => setBulkAmountMode("individual")}
                  />
                  <span>Each customer's target value (${totalCalculatedLoss.toFixed(2)})</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.85rem" }}>
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
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "0.3rem" }}>
                    Amount per customer ($ USD):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g. 10.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.75rem",
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                      color: "#f8fafc",
                      fontSize: "0.95rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1" }}>
                  Loss Amount ($ USD) *
                </label>
                {(single?.usd_to_collect != null || single?.final_amount != null) && (
                  <button
                    type="button"
                    onClick={() => setAmount(String(Number(single.usd_to_collect || single.final_amount || 0).toFixed(2)))}
                    style={{
                      background: "rgba(56, 189, 248, 0.15)",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                      color: "#38bdf8",
                      borderRadius: "4px",
                      padding: "2px 6px",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    Use Full Target (${Number(single.usd_to_collect || single.final_amount || 0).toFixed(2)})
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
                style={{
                  width: "100%",
                  padding: "0.6rem 0.75rem",
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#f8fafc",
                  fontSize: "0.95rem",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem", color: "#cbd5e1" }}>
              Description / Notes
            </label>
            <textarea
              rows={3}
              placeholder={isBulk ? "e.g. Batch cargo not added to delivery / missing items" : "Why was this loss recorded? (e.g. package not added, missing cargo)"}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: "100%",
                padding: "0.6rem 0.75rem",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "0.875rem",
                boxSizing: "border-box",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: "0.6rem 1.2rem",
                background: "#334155",
                color: "#f1f5f9",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (isBulk && bulkAmountMode === "fixed" && (!amount || parseFloat(amount) <= 0)) || (!isBulk && (!amount || parseFloat(amount) <= 0))}
              style={{
                padding: "0.6rem 1.2rem",
                background: loading ? "#7f1d1d" : "linear-gradient(135deg, #ef4444, #dc2626)",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                cursor: loading ? "wait" : "pointer",
                fontSize: "0.875rem",
                boxShadow: "0 4px 12px rgba(239, 68, 68, 0.4)",
              }}
            >
              {loading ? "Recording..." : isBulk ? `Record Loss ($${totalCalculatedLoss.toFixed(2)})` : "Record Loss"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
