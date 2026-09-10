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
    const grossAmount = Number(c.usd_to_collect || 0);
    const deliveryCharge = Number(c.delivery_charge_usd || 0);
    return isPaid ? s + Math.max(0, grossAmount - deliveryCharge) : s;
  }, 0);

  const progressPercent = targetBudget > 0
    ? Math.min(100, Math.round((collectedTotal / targetBudget) * 1000) / 10)
    : 0;

  const isComplete = targetBudget > 0 && collectedTotal >= targetBudget;

  const initialCost = Number(orderData.order_details_cost ?? orderData.order_details ?? 0) || 0;
  const customsFee = Number(orderData.customs_sum || 0);
  const totalLosses = Number(orderData.losses_sum || 0);

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
        backgroundColor: "rgba(15, 23, 42, 0.48)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9998,
        padding: "1rem",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "860px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(226, 232, 240, 0.9)",
          color: "#0f172a",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "1.25rem 1.75rem",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
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
                borderRadius: "12px",
                fontSize: "1.25rem",
                boxShadow: isComplete
                  ? "0 4px 12px rgba(16, 185, 129, 0.3)"
                  : "0 4px 12px rgba(99, 102, 241, 0.25)",
              }}
            >
              {isComplete ? "🎉" : "📦"}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "#0f172a" }}>
                Order Collection: {orderData.order_name || `#${orderData.id}`}
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.825rem", color: "#64748b" }}>
                Track budget collection progress & put pure profit aside
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close"
            style={{
              border: "1.5px solid #e2e8f0",
              background: "#ffffff",
              color: "#64748b",
              borderRadius: "10px",
              width: "34px",
              height: "34px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "16px",
              transition: "all 0.15s ease",
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
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#dc2626",
                fontSize: "0.875rem",
                fontWeight: 600,
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
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                color: "#166534",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              ✅ {successMsg}
            </div>
          )}

          {/* 1. Live Budget Collection Progress Bar */}
          <div
            style={{
              background: "#f8fafc",
              border: "1.5px solid #e2e8f0",
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
                <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b", fontWeight: 750 }}>
                  BUDGET COLLECTION PROGRESS
                </div>
                <div style={{ fontSize: "1.6rem", fontWeight: 850, color: "#0f172a", marginTop: "2px" }}>
                  ${collectedTotal.toFixed(2)}{" "}
                  <span style={{ fontSize: "1.15rem", fontWeight: 600, color: "#64748b" }}>
                    / ${targetBudget.toFixed(2)}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span
                  style={{
                    padding: "0.3rem 0.75rem",
                    borderRadius: "20px",
                    fontSize: "0.85rem",
                    fontWeight: 750,
                    background: isComplete ? "#dcfce7" : "#eff6ff",
                    color: isComplete ? "#166534" : "#1d4ed8",
                    border: `1.5px solid ${isComplete ? "#86efac" : "#bfdbfe"}`,
                  }}
                >
                  {isComplete ? "✓ 100% Complete" : `${progressPercent}% Collected`}
                </span>
              </div>
            </div>

            {/* Progress Bar Track */}
            <div
              style={{
                height: "14px",
                background: "#e2e8f0",
                borderRadius: "7px",
                overflow: "hidden",
                border: "1px solid #cbd5e1",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progressPercent}%`,
                  background: isComplete
                    ? "linear-gradient(90deg, #10b981, #34d399)"
                    : "linear-gradient(90deg, #3b82f6, #06b6d4)",
                  borderRadius: "7px",
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
              background: "#ffffff",
              border: `1.5px solid ${isComplete ? "#86efac" : "#e2e8f0"}`,
              borderRadius: "14px",
              padding: "1.25rem",
              marginBottom: "1.5rem",
              boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
              <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "#0f172a" }}>
                💰 Pure Profit Calculation Formula
              </div>
              <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 600 }}>
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
                  background: "#f0fdf4",
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: "1.5px solid #bbf7d0",
                }}
              >
                <div style={{ fontSize: "0.74rem", color: "#166534", fontWeight: 650 }}>Total Collected</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#15803d" }}>
                  +${collectedTotal.toFixed(2)}
                </div>
              </div>

              <div
                style={{
                  background: "#fef2f2",
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: "1.5px solid #fecaca",
                }}
              >
                <div style={{ fontSize: "0.74rem", color: "#991b1b", fontWeight: 650 }}>Initial Cost</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#b91c1c" }}>
                  -${initialCost.toFixed(2)}
                </div>
              </div>

              <div
                style={{
                  background: "#fff7ed",
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: "1.5px solid #fed7aa",
                }}
              >
                <div style={{ fontSize: "0.74rem", color: "#9a3412", fontWeight: 650 }}>Customs / Freight</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#c2410c" }}>
                  -${customsFee.toFixed(2)}
                </div>
              </div>

              <div
                style={{
                  background: "#fef2f2",
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: "1.5px solid #fecaca",
                }}
              >
                <div style={{ fontSize: "0.74rem", color: "#991b1b", fontWeight: 650 }}>Losses</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#dc2626" }}>
                  -${totalLosses.toFixed(2)}
                </div>
              </div>

              {/* Result: Pure Profit */}
              <div
                style={{
                  background: pureProfit >= 0 ? "linear-gradient(135deg, #ecfdf5, #d1fae5)" : "#fff1f2",
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: `2px solid ${pureProfit >= 0 ? "#34d399" : "#fda4af"}`,
                  boxShadow: pureProfit >= 0 ? "0 4px 12px rgba(16, 185, 129, 0.15)" : "none",
                }}
              >
                <div style={{ fontSize: "0.74rem", color: pureProfit >= 0 ? "#065f46" : "#9f1239", fontWeight: 750 }}>
                  Realized Pure Profit
                </div>
                <div
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 850,
                    color: pureProfit >= 0 ? "#047857" : "#be123c",
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
                borderTop: "1px solid #f1f5f9",
              }}
            >
              <div>
                {orderData.profit_put_aside != null ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span
                      style={{
                        padding: "0.35rem 0.85rem",
                        borderRadius: "8px",
                        background: "#ecfdf5",
                        border: "1.5px solid #6ee7b7",
                        color: "#065f46",
                        fontWeight: 750,
                        fontSize: "0.9rem",
                      }}
                    >
                      ✓ Profit Put Aside: ${Number(orderData.profit_put_aside).toFixed(2)}
                    </span>
                    {orderData.profit_put_aside_at && (
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        ({new Date(orderData.profit_put_aside_at).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.85rem", color: "#475569", fontWeight: 500 }}>
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
                      padding: "0.55rem 0.95rem",
                      background: "#f1f5f9",
                      border: "1.5px solid #cbd5e1",
                      color: "#475569",
                      borderRadius: "8px",
                      fontSize: "0.825rem",
                      fontWeight: 700,
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
                    padding: "0.6rem 1.35rem",
                    background:
                      orderData.profit_put_aside != null
                        ? "#0284c7"
                        : isComplete
                        ? "linear-gradient(135deg, #10b981, #059669)"
                        : "linear-gradient(135deg, #6366f1, #4f46e5)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 750,
                    fontSize: "0.875rem",
                    cursor: profitAsideLoading || pureProfit <= 0 ? "not-allowed" : "pointer",
                    opacity: pureProfit <= 0 ? 0.6 : 1,
                    boxShadow:
                      pureProfit > 0
                        ? isComplete
                          ? "0 4px 14px rgba(16, 185, 129, 0.35)"
                          : "0 4px 14px rgba(99, 102, 241, 0.3)"
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
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                Customers in Order ({customers.length})
              </h3>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                Click to collect full payment or record customer loss
              </span>
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                Loading customers and collection records...
              </div>
            ) : customers.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "2rem",
                  background: "#f8fafc",
                  borderRadius: "10px",
                  border: "1px solid #e2e8f0",
                  color: "#64748b",
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
                        background: isPaid ? "#f0fdf4" : "#ffffff",
                        border: `1.5px solid ${isPaid ? "#bbf7d0" : "#e2e8f0"}`,
                        borderRadius: "10px",
                        gap: "0.75rem",
                        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
                      }}
                    >
                      {/* Customer Info */}
                      <div style={{ flex: "1 1 200px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 750, fontSize: "0.95rem", color: "#0f172a" }}>
                            {c.customer_name}
                          </span>
                          {c.delivery_number && (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                background: "#e0e7ff",
                                color: "#3730a3",
                                padding: "0.15rem 0.5rem",
                                borderRadius: "5px",
                                fontWeight: 750,
                              }}
                            >
                              #{c.delivery_number}
                            </span>
                          )}
                          {c.cart_order_number && (
                            <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 500 }}>
                              Cart: {c.cart_order_number}
                            </span>
                          )}
                        </div>

                        {/* Customer Loss Badge if any */}
                        {Number(c.losses_sum || 0) > 0 && (
                          <div style={{ marginTop: "0.25rem" }}>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                background: "#fee2e2",
                                color: "#991b1b",
                                border: "1px solid #fca5a5",
                                padding: "0.12rem 0.45rem",
                                borderRadius: "5px",
                                fontWeight: 700,
                              }}
                            >
                              Loss recorded: -${Number(c.losses_sum).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Target Amount */}
                      <div style={{ textAlign: "right", minWidth: "100px" }}>
                        <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>To Collect</div>
                        <div
                          style={{
                            fontSize: "1.1rem",
                            fontWeight: 800,
                            color: isPaid ? "#166534" : "#0284c7",
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
                              padding: "0.4rem 0.85rem",
                              borderRadius: "7px",
                              background: "#dcfce7",
                              border: "1.5px solid #86efac",
                              color: "#15803d",
                              fontSize: "0.825rem",
                              fontWeight: 750,
                            }}
                          >
                            ✓ Collected
                          </span>
                        ) : (
                          <button
                            onClick={() => handleCollect(c)}
                            disabled={isActing}
                            style={{
                              padding: "0.45rem 0.95rem",
                              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "7px",
                              fontSize: "0.825rem",
                              fontWeight: 700,
                              cursor: isActing ? "wait" : "pointer",
                              boxShadow: "0 2px 8px rgba(37, 99, 235, 0.3)",
                            }}
                          >
                            {isActing ? "Collecting..." : `Collect $${Number(c.usd_to_collect || 0).toFixed(2)}`}
                          </button>
                        )}

                        {/* Record Loss button immediately on customer */}
                        <button
                          onClick={() => setLossTargetCustomer({ ...c, order_name: orderData.order_name })}
                          style={{
                            padding: "0.45rem 0.8rem",
                            background: "#fef2f2",
                            border: "1.5px solid #fca5a5",
                            color: "#b91c1c",
                            borderRadius: "7px",
                            fontSize: "0.825rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
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
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            justifyContent: "flex-end",
            background: "#f8fafc",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "0.6rem 1.6rem",
              background: "#ffffff",
              color: "#334155",
              border: "1.5px solid #cbd5e1",
              borderRadius: "9px",
              fontWeight: 750,
              cursor: "pointer",
              fontSize: "0.9rem",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
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
