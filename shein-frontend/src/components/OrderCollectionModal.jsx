import React, { useState, useEffect, useCallback } from "react";
import { getOrderCustomersDetail, collectCustomerPayment, putProfitAside } from "../api/ordersApi";
import RecordCustomerLossModal from "./RecordCustomerLossModal";

export default function OrderCollectionModal({
  order,
  onClose,
  onOrderUpdated,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [orderData, setOrderData] = useState(order);
  const [customers, setCustomers] = useState([]);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [profitAsideLoading, setProfitAsideLoading] = useState(false);
  const [lossTargetCustomer, setLossTargetCustomer] = useState(null);

  const fetchDetails = useCallback(async () => {
    if (!order?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getOrderCustomersDetail(order.id);
      if (res.success || res.ok) {
        if (res.order) setOrderData((prev) => ({ ...prev, ...res.order }));
        setCustomers(res.customers || []);
      } else {
        setError(res.error || "Failed to load order collection details");
      }
    } catch (err) {
      setError(err.message || "Failed to load order customers");
    } finally {
      setLoading(false);
    }
  }, [order?.id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleCollect = async (customer, overrideAmount = null) => {
    const cid = customer.customer_id || customer.id;
    setActionLoadingId(cid);
    setError(null);
    setSuccessMsg(null);
    try {
      const amount = overrideAmount !== null ? overrideAmount : customer.usd_to_collect;
      const res = await collectCustomerPayment({
        customer_id: cid,
        amount: Number(amount),
        delivery_charge: Number(customer.delivery_charge_usd || 0),
        note: `Direct collection for ${customer.customer_name}`,
      });
      if (res.success || res.ok) {
        setSuccessMsg(`Collected $${Number(amount).toFixed(2)} from ${customer.customer_name}!`);
        await fetchDetails();
        if (onOrderUpdated) onOrderUpdated();
      } else {
        setError(res.error || "Failed to collect payment");
      }
    } catch (err) {
      setError(err.message || "Payment collection failed");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePutProfitAside = async (amount, clear = false) => {
    setProfitAsideLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await putProfitAside({
        order_id: orderData.id,
        amount: Number(amount),
        clear,
      });
      if (res.success || res.ok) {
        setOrderData((prev) => ({
          ...prev,
          profit_put_aside: clear ? null : Number(amount),
          profit_put_aside_at: clear ? null : (res.profit_put_aside_at || new Date().toISOString()),
        }));
        setSuccessMsg(
          clear
            ? "Profit set-aside removed."
            : `Secured $${Number(amount).toFixed(2)} profit set aside from order!`
        );
        if (onOrderUpdated) onOrderUpdated();
      } else {
        setError(res.error || "Failed to put profit aside");
      }
    } catch (err) {
      setError(err.message || "Error saving profit set-aside");
    } finally {
      setProfitAsideLoading(false);
    }
  };

  // Calculations
  const targetBudget = Number(orderData.amount_to_collect || 0) > 0
    ? Number(orderData.amount_to_collect)
    : customers.reduce((s, c) => s + Number(c.usd_to_collect || 0), 0);

  const collectedTotal = customers.reduce((s, c) => {
    const isPaid = c.is_collected || c.collection_status === "collected" || c.payment_status === "paid";
    return isPaid ? s + Number(c.usd_to_collect || 0) : s;
  }, 0);

  const progressPercent = targetBudget > 0
    ? Math.min(100, Math.round((collectedTotal / targetBudget) * 1000) / 10)
    : 0;

  const isComplete = targetBudget > 0 && collectedTotal >= targetBudget;

  const initialCost = Number(orderData.order_details_cost ?? orderData.order_details ?? 0) || 0;
  const customsFee = Number(orderData.customs_sum || 0);
  const totalLosses = Number(orderData.losses_sum || 0) +
    customers.reduce((s, c) => s + (Number(c.losses_sum || 0) > 0 ? 0 : 0), 0); // already tracked in orderData.losses_sum

  // Pure profit formula requested by user: Total Collection - Initial - Customs - Losses
  const pureProfit = Math.round((collectedTotal - initialCost - customsFee - totalLosses) * 100) / 100;
  const projectedPureProfit = Math.round((targetBudget - initialCost - customsFee - totalLosses) * 100) / 100;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.8)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9998,
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
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "18px",
          width: "100%",
          maxWidth: "860px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.1)",
          color: "#f8fafc",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "1.25rem 1.75rem",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(15, 23, 42, 0.6)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            <div
              style={{
                background: isComplete
                  ? "linear-gradient(135deg, #10b981, #059669)"
                  : "linear-gradient(135deg, #3b82f6, #6366f1)",
                color: "#ffffff",
                padding: "0.5rem 0.75rem",
                borderRadius: "10px",
                fontSize: "1.25rem",
                boxShadow: isComplete
                  ? "0 0 15px rgba(16, 185, 129, 0.5)"
                  : "0 0 15px rgba(99, 102, 241, 0.3)",
              }}
            >
              {isComplete ? "🎉" : "📦"}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700 }}>
                Order Collection: {orderData.order_name || `#${orderData.id}`}
              </h2>
              <p style={{ margin: 0, fontSize: "0.825rem", color: "#94a3b8" }}>
                Track budget collection progress & put pure profit aside
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#94a3b8",
              fontSize: "1.25rem",
              cursor: "pointer",
              padding: "0.3rem 0.6rem",
              borderRadius: "8px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ overflowY: "auto", padding: "1.5rem 1.75rem", flex: 1 }}>
          {error && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.75rem 1rem",
                borderRadius: "10px",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                color: "#fca5a5",
                fontSize: "0.875rem",
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.75rem 1rem",
                borderRadius: "10px",
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                color: "#6ee7b7",
                fontSize: "0.875rem",
              }}
            >
              ✅ {successMsg}
            </div>
          )}

          {/* 1. Live Budget Collection Progress Bar */}
          <div
            style={{
              background: "rgba(30, 41, 59, 0.7)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "14px",
              padding: "1.25rem",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginBottom: "0.6rem",
              }}
            >
              <div>
                <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8" }}>
                  Budget Collection Progress
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#f8fafc" }}>
                  ${collectedTotal.toFixed(2)}{" "}
                  <span style={{ fontSize: "1.1rem", fontWeight: 500, color: "#94a3b8" }}>
                    / ${targetBudget.toFixed(2)}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span
                  style={{
                    padding: "0.25rem 0.6rem",
                    borderRadius: "20px",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    background: isComplete ? "rgba(16, 185, 129, 0.2)" : "rgba(59, 130, 246, 0.2)",
                    color: isComplete ? "#34d399" : "#60a5fa",
                    border: `1px solid ${isComplete ? "rgba(16, 185, 129, 0.4)" : "rgba(59, 130, 246, 0.4)"}`,
                  }}
                >
                  {isComplete ? "✓ 100% Complete" : `${progressPercent}% Collected`}
                </span>
              </div>
            </div>

            {/* Progress Bar Track */}
            <div
              style={{
                height: "12px",
                background: "rgba(15, 23, 42, 0.8)",
                borderRadius: "6px",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progressPercent}%`,
                  background: isComplete
                    ? "linear-gradient(90deg, #10b981, #34d399)"
                    : "linear-gradient(90deg, #3b82f6, #06b6d4)",
                  borderRadius: "6px",
                  transition: "width 0.4s ease-out",
                  boxShadow: isComplete
                    ? "0 0 12px rgba(52, 211, 153, 0.6)"
                    : "0 0 10px rgba(6, 182, 212, 0.5)",
                }}
              />
            </div>
          </div>

          {/* 2. Pure Profit Breakdown Banner */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))",
              border: `1px solid ${isComplete ? "rgba(16, 185, 129, 0.35)" : "rgba(99, 102, 241, 0.25)"}`,
              borderRadius: "14px",
              padding: "1.25rem",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#cbd5e1" }}>
                💰 Pure Profit Calculation Formula
              </div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Total Collection − Initial Cost − Customs − Losses
              </div>
            </div>

            {/* Math row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Total Collected</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#34d399" }}>
                  +${collectedTotal.toFixed(2)}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Initial Cost</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f87171" }}>
                  -${initialCost.toFixed(2)}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Customs / Freight</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fb923c" }}>
                  -${customsFee.toFixed(2)}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Losses</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#ef4444" }}>
                  -${totalLosses.toFixed(2)}
                </div>
              </div>

              {/* Result: Pure Profit */}
              <div
                style={{
                  background: pureProfit >= 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: `1px solid ${pureProfit >= 0 ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
                }}
              >
                <div style={{ fontSize: "0.72rem", color: pureProfit >= 0 ? "#6ee7b7" : "#fca5a5", fontWeight: 600 }}>
                  Realized Pure Profit
                </div>
                <div
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: 800,
                    color: pureProfit >= 0 ? "#10b981" : "#f87171",
                  }}
                >
                  ${pureProfit.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Put Aside Profit Action Section */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                paddingTop: "0.85rem",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <div>
                {orderData.profit_put_aside != null ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span
                      style={{
                        padding: "0.3rem 0.75rem",
                        borderRadius: "8px",
                        background: "rgba(16, 185, 129, 0.2)",
                        border: "1px solid rgba(16, 185, 129, 0.5)",
                        color: "#34d399",
                        fontWeight: 700,
                        fontSize: "0.9rem",
                      }}
                    >
                      ✓ Profit Put Aside: ${Number(orderData.profit_put_aside).toFixed(2)}
                    </span>
                    {orderData.profit_put_aside_at && (
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        ({new Date(orderData.profit_put_aside_at).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                    {isComplete
                      ? "Order collection is 100% complete! Secure your pure profit now."
                      : `Projected profit on full collection: $${projectedPureProfit.toFixed(2)}`}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.6rem" }}>
                {orderData.profit_put_aside != null && (
                  <button
                    onClick={() => handlePutProfitAside(0, true)}
                    disabled={profitAsideLoading}
                    style={{
                      padding: "0.5rem 0.9rem",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#94a3b8",
                      borderRadius: "8px",
                      fontSize: "0.825rem",
                      cursor: "pointer",
                    }}
                  >
                    Clear Set-Aside
                  </button>
                )}

                <button
                  onClick={() => handlePutProfitAside(pureProfit)}
                  disabled={profitAsideLoading || pureProfit <= 0}
                  style={{
                    padding: "0.55rem 1.25rem",
                    background:
                      orderData.profit_put_aside != null
                        ? "#0284c7"
                        : isComplete
                        ? "linear-gradient(135deg, #10b981, #059669)"
                        : "linear-gradient(135deg, #6366f1, #4f46e5)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    cursor: profitAsideLoading || pureProfit <= 0 ? "not-allowed" : "pointer",
                    opacity: pureProfit <= 0 ? 0.6 : 1,
                    boxShadow:
                      pureProfit > 0
                        ? isComplete
                          ? "0 4px 15px rgba(16, 185, 129, 0.4)"
                          : "0 4px 15px rgba(99, 102, 241, 0.3)"
                        : "none",
                  }}
                >
                  {profitAsideLoading
                    ? "Securing..."
                    : orderData.profit_put_aside != null
                    ? `Update Set-Aside ($${pureProfit.toFixed(2)})`
                    : `Put Aside Profit ($${pureProfit.toFixed(2)})`}
                </button>
              </div>
            </div>
          </div>

          {/* 3. Customer Collection List */}
          <div style={{ marginBottom: "1rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#f1f5f9" }}>
                Customers in Order ({customers.length})
              </h3>
              <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                Click to collect full payment or record customer loss
              </span>
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
                Loading customers and collection records...
              </div>
            ) : customers.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "2rem",
                  background: "rgba(30, 41, 59, 0.4)",
                  borderRadius: "10px",
                  color: "#94a3b8",
                }}
              >
                No customers assigned to this order yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {customers.map((c) => {
                  const isPaid =
                    c.is_collected ||
                    c.collection_status === "collected" ||
                    c.payment_status === "paid";
                  const cid = c.customer_id || c.id;
                  const isActing = actionLoadingId === cid;

                  return (
                    <div
                      key={cid}
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.85rem 1rem",
                        background: isPaid ? "rgba(16, 185, 129, 0.06)" : "rgba(30, 41, 59, 0.6)",
                        border: `1px solid ${
                          isPaid ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.08)"
                        }`,
                        borderRadius: "10px",
                        gap: "0.75rem",
                      }}
                    >
                      {/* Customer Info */}
                      <div style={{ flex: "1 1 200px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "#f8fafc" }}>
                            {c.customer_name}
                          </span>
                          {c.delivery_number && (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                background: "rgba(59, 130, 246, 0.2)",
                                color: "#93c5fd",
                                padding: "0.15rem 0.45rem",
                                borderRadius: "4px",
                              }}
                            >
                              #{c.delivery_number}
                            </span>
                          )}
                          {c.cart_order_number && (
                            <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                              Cart: {c.cart_order_number}
                            </span>
                          )}
                        </div>

                        {/* Customer Loss Badge if any */}
                        {Number(c.losses_sum || 0) > 0 && (
                          <div style={{ marginTop: "0.2rem" }}>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                background: "rgba(239, 68, 68, 0.2)",
                                color: "#fca5a5",
                                border: "1px solid rgba(239, 68, 68, 0.3)",
                                padding: "0.1rem 0.4rem",
                                borderRadius: "4px",
                                fontWeight: 600,
                              }}
                            >
                              Loss recorded: -${Number(c.losses_sum).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Target Amount */}
                      <div style={{ textAlign: "right", minWidth: "100px" }}>
                        <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>To Collect</div>
                        <div
                          style={{
                            fontSize: "1.05rem",
                            fontWeight: 700,
                            color: isPaid ? "#34d399" : "#38bdf8",
                          }}
                        >
                          ${Number(c.usd_to_collect || 0).toFixed(2)}
                        </div>
                      </div>

                      {/* Status / Quick Actions */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {isPaid ? (
                          <span
                            style={{
                              padding: "0.35rem 0.75rem",
                              borderRadius: "6px",
                              background: "rgba(16, 185, 129, 0.2)",
                              border: "1px solid rgba(16, 185, 129, 0.4)",
                              color: "#34d399",
                              fontSize: "0.8rem",
                              fontWeight: 700,
                            }}
                          >
                            ✓ Collected
                          </span>
                        ) : (
                          <button
                            onClick={() => handleCollect(c)}
                            disabled={isActing}
                            style={{
                              padding: "0.4rem 0.85rem",
                              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "6px",
                              fontSize: "0.825rem",
                              fontWeight: 600,
                              cursor: isActing ? "wait" : "pointer",
                              boxShadow: "0 2px 8px rgba(59, 130, 246, 0.4)",
                            }}
                          >
                            {isActing ? "Collecting..." : `Collect $${Number(c.usd_to_collect || 0).toFixed(2)}`}
                          </button>
                        )}

                        {/* Record Loss button immediately on customer */}
                        <button
                          onClick={() => setLossTargetCustomer({ ...c, order_name: orderData.order_name })}
                          style={{
                            padding: "0.4rem 0.75rem",
                            background: "rgba(239, 68, 68, 0.15)",
                            border: "1px solid rgba(239, 68, 68, 0.4)",
                            color: "#f87171",
                            borderRadius: "6px",
                            fontSize: "0.825rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          title="Record a loss immediately for this customer"
                        >
                          📉 Record Loss
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "1rem 1.75rem",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            justifyContent: "flex-end",
            background: "rgba(15, 23, 42, 0.6)",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "0.55rem 1.4rem",
              background: "#334155",
              color: "#f1f5f9",
              border: "none",
              borderRadius: "8px",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Embedded Record Customer Loss Modal */}
      {lossTargetCustomer && (
        <RecordCustomerLossModal
          customer={lossTargetCustomer}
          onClose={() => setLossTargetCustomer(null)}
          onSuccess={async () => {
            setLossTargetCustomer(null);
            setSuccessMsg("Loss recorded successfully!");
            await fetchDetails();
            if (onOrderUpdated) onOrderUpdated();
          }}
        />
      )}
    </div>
  );
}
