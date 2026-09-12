import React, { useState, useEffect, useCallback } from "react";
import { getOrderCustomersDetail, collectCustomerPayment, putProfitAside } from "../api/ordersApi";
import RecordCustomerLossModal from "./RecordCustomerLossModal";
import "./orderCollectionModal.css";

const customerFinalAmount = (customer) => {
  const storedFinal = Number(customer?.final_amount_to_collect);
  if (customer?.final_amount_to_collect !== null && customer?.final_amount_to_collect !== undefined && Number.isFinite(storedFinal)) return Math.round(storedFinal * 100) / 100;
  const base = Number(customer?.base_amount_to_collect ?? customer?.usd_to_collect ?? 0);
  const adjustment = Number(customer?.delivery_adjustment ?? 0);
  return Math.round((base + (Number.isFinite(adjustment) ? adjustment : 0)) * 100) / 100;
};

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
      const amount = overrideAmount !== null ? overrideAmount : customerFinalAmount(customer);
      const res = await collectCustomerPayment({
        customer_id: cid,
        amount: Number(amount),
        delivery_charge: 0,
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
      setError(err.message || "Network error while putting profit aside");
    } finally {
      setProfitAsideLoading(false);
    }
  };

  // Calculations
  const targetBudget = Number(orderData.amount_to_collect || 0) > 0
    ? Number(orderData.amount_to_collect)
    : customers.reduce((s, c) => s + customerFinalAmount(c), 0);

  const collectedTotal = customers.reduce((s, c) => {
    const isPaid = c.is_collected || c.collection_status === "collected" || c.payment_status === "paid";
    return isPaid ? s + customerFinalAmount(c) : s;
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
      className="ocmOverlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ocmModal">
        {/* Modal Header */}
        <div className="ocmHeader">
          <div className="ocmHeaderMain">
            <div className={`ocmIconBadge ${isComplete ? "complete" : "pending"}`}>
              {isComplete ? "🎉" : "📦"}
            </div>
            <div className="ocmHeaderTitles">
              <h2 className="ocmTitle">
                Order Collection: {orderData.order_name || `#${orderData.id}`}
              </h2>
              <p className="ocmSub">
                Track budget collection progress & put pure profit aside
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="ocmCloseBtn"
            type="button"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="ocmBody">
          {error && (
            <div className="ocmAlert ocmAlertError">
              ⚠️ {error}
            </div>
          )}

          {successMsg && (
            <div className="ocmAlert ocmAlertSuccess">
              ✅ {successMsg}
            </div>
          )}

          {/* 1. Live Budget Collection Progress Bar */}
          <div className="ocmProgressCard">
            <div className="ocmProgressHead">
              <div>
                <div className="ocmProgressLabel">
                  Budget Collection Progress
                </div>
                <div className="ocmProgressValues">
                  ${collectedTotal.toFixed(2)}{" "}
                  <span className="ocmProgressTarget">
                    / ${targetBudget.toFixed(2)}
                  </span>
                </div>
              </div>
              <div>
                <span className={`ocmProgressPill ${isComplete ? "complete" : "pending"}`}>
                  {isComplete ? "✓ 100% Complete" : `${progressPercent}% Collected`}
                </span>
              </div>
            </div>

            {/* Progress Bar Track */}
            <div className="ocmProgressTrack">
              <div
                className={`ocmProgressBar ${isComplete ? "complete" : "pending"}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* 2. Pure Profit Breakdown Banner */}
          <div className={`ocmFormulaCard ${isComplete ? "complete" : ""}`}>
            <div className="ocmFormulaHeader">
              <div className="ocmFormulaTitle">
                💰 Pure Profit Calculation Formula
              </div>
              <div className="ocmFormulaSub">
                Total Collection − Initial Cost − Customs − Losses
              </div>
            </div>

            {/* Math row */}
            <div className="ocmMathGrid">
              <div className="ocmMathBox ocmMathBoxCollected">
                <div className="ocmMathLabel" style={{ color: "#166534" }}>Total Collected</div>
                <div className="ocmMathValue" style={{ color: "#15803d" }}>
                  +${collectedTotal.toFixed(2)}
                </div>
              </div>

              <div className="ocmMathBox ocmMathBoxCost">
                <div className="ocmMathLabel" style={{ color: "#991b1b" }}>Initial Cost</div>
                <div className="ocmMathValue" style={{ color: "#b91c1c" }}>
                  -${initialCost.toFixed(2)}
                </div>
              </div>

              <div className="ocmMathBox ocmMathBoxCustoms">
                <div className="ocmMathLabel" style={{ color: "#9a3412" }}>Customs / Freight</div>
                <div className="ocmMathValue" style={{ color: "#c2410c" }}>
                  -${customsFee.toFixed(2)}
                </div>
              </div>

              <div className="ocmMathBox ocmMathBoxLosses">
                <div className="ocmMathLabel" style={{ color: "#991b1b" }}>Losses</div>
                <div className="ocmMathValue" style={{ color: "#dc2626" }}>
                  -${totalLosses.toFixed(2)}
                </div>
              </div>

              {/* Result: Pure Profit */}
              <div className={`ocmMathBox ${pureProfit >= 0 ? "ocmMathBoxProfit" : "ocmMathBoxProfitNegative"}`}>
                <div className="ocmMathLabel" style={{ color: pureProfit >= 0 ? "#065f46" : "#9f1239" }}>
                  Realized Pure Profit
                </div>
                <div className="ocmMathValue" style={{ color: pureProfit >= 0 ? "#047857" : "#be123c" }}>
                  ${pureProfit.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Put Aside Profit Action Section */}
            <div className="ocmProfitAsideRow">
              <div>
                {orderData.profit_put_aside != null ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span className="ocmProfitStatusPill">
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

              <div className="ocmAsideBtns">
                {orderData.profit_put_aside != null && (
                  <button
                    type="button"
                    onClick={() => handlePutProfitAside(0, true)}
                    disabled={profitAsideLoading}
                    className="ocmClearBtn"
                  >
                    Clear Set-Aside
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handlePutProfitAside(pureProfit)}
                  disabled={profitAsideLoading || pureProfit <= 0}
                  className="ocmSecureBtn"
                  style={{
                    background:
                      orderData.profit_put_aside != null
                        ? "#0284c7"
                        : isComplete
                        ? "linear-gradient(135deg, #10b981, #059669)"
                        : "linear-gradient(135deg, #6366f1, #4f46e5)",
                    opacity: pureProfit <= 0 ? 0.6 : 1,
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
            <div className="ocmCustomerHeader">
              <h3 className="ocmCustomerTitle">
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
              <div className="ocmCustomerList">
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
                      className={`ocmCustomerCard ${isPaid ? "paid" : "pending"}`}
                    >
                      {/* Customer Info */}
                      <div className="ocmCustomerMain">
                        <div className="ocmCustomerNameRow">
                          <span className="ocmCustomerName">
                            {c.customer_name}
                          </span>
                          {c.delivery_number && (
                            <span className="ocmDeliveryTag">
                              #{c.delivery_number}
                            </span>
                          )}
                          {c.cart_order_number && (
                            <span className="ocmCartTag">
                              Cart: {c.cart_order_number}
                            </span>
                          )}
                        </div>

                        {/* Customer Loss Badge if any */}
                        {Number(c.losses_sum || 0) > 0 && (
                          <div>
                            <span className="ocmLossBadge">
                              Loss recorded: -${Number(c.losses_sum).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Target Amount */}
                      <div className="ocmCustomerAmountWrap">
                        <div className="ocmCustomerAmountLabel">To Collect</div>
                        <div
                          className="ocmCustomerAmount"
                          style={{
                            color: isPaid ? "#166534" : "#0284c7",
                          }}
                        >
                          ${customerFinalAmount(c).toFixed(2)}
                        </div>
                      </div>

                      {/* Status / Quick Actions */}
                      <div className="ocmCustomerActions">
                        {isPaid ? (
                          <span className="ocmCollectedBadge">
                            ✓ Collected
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCollect(c)}
                            disabled={isActing}
                            className="ocmCollectBtn"
                          >
                            {isActing ? "Collecting..." : `Collect $${customerFinalAmount(c).toFixed(2)}`}
                          </button>
                        )}

                        {/* Record Loss button immediately on customer */}
                        <button
                          type="button"
                          onClick={() => setLossTargetCustomer({ ...c, order_name: orderData.order_name })}
                          className="ocmRecordLossBtn"
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
        <div className="ocmFooter">
          <button
            type="button"
            onClick={onClose}
            className="ocmCloseFooterBtn"
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
