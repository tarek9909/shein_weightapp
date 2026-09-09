import React, { useState } from "react";
import { addLoss } from "../api/lossesApi";

const LOSS_TYPES = [
  { value: "out of stock item", label: "Out of Stock Item" },
  { value: "damaged package", label: "Damaged Package" },
  { value: "wrong item", label: "Wrong Item / Mismatch" },
  { value: "delivery charge", label: "Delivery / Courier Issue" },
  { value: "refund / discount", label: "Customer Refund / Discount" },
  { value: "customs penalty", label: "Customs / Tax Fee" },
  { value: "other", label: "Other Loss" },
];

export default function RecordCustomerLossModal({
  customer,
  onClose,
  onSuccess,
}) {
  const [lossType, setLossType] = useState("out of stock item");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!customer) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Please enter a valid positive loss amount");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = {
        customer_id: customer.customer_id || customer.id,
        order_id: customer.order_id || null,
        month_id: customer.month_id || null,
        loss_type: lossType,
        amount: numAmount,
        description: description.trim() || `Customer loss: ${customer.customer_name || ""}`,
      };
      const res = await addLoss(payload);
      if (res.ok || res.success) {
        if (onSuccess) onSuccess(res.id || res);
        onClose();
      } else {
        setError(res.error || "Failed to record loss");
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "linear-gradient(145deg, #1e293b, #0f172a)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "480px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 20px rgba(239, 68, 68, 0.15)",
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
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Record Customer Loss</h3>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>
                Immediately register a loss against this customer & order
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

        {/* Customer snapshot banner */}
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
            <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{customer.customer_name || "Unknown"}</span>
          </div>
          {customer.order_name && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
              <span style={{ color: "#94a3b8" }}>Order:</span>
              <span style={{ color: "#cbd5e1" }}>{customer.order_name}</span>
            </div>
          )}
          {customer.usd_to_collect !== undefined && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#94a3b8" }}>Target to Collect:</span>
              <span style={{ color: "#38bdf8", fontWeight: 600 }}>${Number(customer.usd_to_collect).toFixed(2)}</span>
            </div>
          )}
        </div>

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

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem", color: "#cbd5e1" }}>
              Loss Amount ($ USD) *
            </label>
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

          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem", color: "#cbd5e1" }}>
              Description / Details
            </label>
            <textarea
              rows={3}
              placeholder="Why was this loss recorded? (e.g. customer refused damaged jacket)"
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
              disabled={loading || !amount || parseFloat(amount) <= 0}
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
              {loading ? "Recording..." : "Record Loss"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
