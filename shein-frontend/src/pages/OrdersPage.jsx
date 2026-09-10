// src/pages/OrdersPage.jsx
import { useEffect, useMemo, useState } from "react";
import { getOrders, addOrder, updateOrder, deleteOrder } from "../api/ordersApi";
import { getMonths } from "../api/monthApi";
import { getHistory } from "../api/historyApi";
import { getKgPrice } from "../api/settingsApi";
import {
  listChromeProfiles,
  refreshOrderSheinTrack,
  refreshOrderSheinWeight,
} from "../api/sheinTrackerApi";
import { getCustomerDirectory } from "../api/customersApi";
import MonthSelector from "../components/MonthSelector";
import CartsEditor from "../components/CartsEditor";
import CustomDropdown from "../components/CustomDropdown";
import OrderCollectionModal from "../components/OrderCollectionModal";
import RecordCustomerLossModal from "../components/RecordCustomerLossModal";
import { CustomModal } from "../components/CustomModal";
import { isAuthenticated, triggerSessionExpired } from "../utils/auth";
import "../orders.css";

const money = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const OrdersPage = () => {
  const [months, setMonths] = useState([]);
  const [monthId, setMonthId] = useState("");
  const [orders, setOrders] = useState([]);
  const [kgPrice, setKgPrice] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshingTrackOrderId, setRefreshingTrackOrderId] = useState(null);
  const [refreshingWeightOrderId, setRefreshingWeightOrderId] = useState(null);
  const [chromeProfiles, setChromeProfiles] = useState([]);
  const [refreshProfileKey, setRefreshProfileKey] = useState("");
  const [directoryCustomers, setDirectoryCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customersLoading, setCustomersLoading] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderCustomerCollectByOrderId, setOrderCustomerCollectByOrderId] = useState({});
  const [collectionOrder, setCollectionOrder] = useState(null);
  const [lossCustomer, setLossCustomer] = useState(null);

  // Order Add / Edit Modal state
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderModalMode, setOrderModalMode] = useState("add"); // "add" | "edit"
  const [editingOrder, setEditingOrder] = useState(null);
  const [orderForm, setOrderForm] = useState({
    order_name: "",
    order_details: "",
    amount_to_collect: "",
    customer_ids: [],
  });
  const [formError, setFormError] = useState("");

  // Info modal state
  const [modal, setModal] = useState({ isOpen: false });
  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });

  const closeModal = () => setModal({ isOpen: false });
  const closeConfirm = () => setConfirmModal({ isOpen: false });

  const openInfo = ({ title, message }) => {
    setModal({
      isOpen: true,
      title,
      message,
      onConfirm: closeModal,
      onCancel: closeModal,
      onClose: closeModal,
      confirmText: "OK",
      showCancel: false,
    });
  };

  const openConfirm = ({ title, message, onYes }) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      variant: "danger",
      showCancel: true,
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        closeConfirm();
        await onYes();
      },
      onCancel: closeConfirm,
      onClose: closeConfirm,
    });
  };

  // Auth guard
  const ensureAuth = () => {
    if (!isAuthenticated()) {
      triggerSessionExpired("/orders");
      return false;
    }
    return true;
  };

  const loadMonths = async () => {
    if (!ensureAuth()) return;
    setLoading(true);
    try {
      const data = await getMonths();
      const arr = data || [];
      setMonths(arr);

      if (arr.length && !monthId) setMonthId(String(arr[0].id));
      if (!arr.length) setMonthId("");
    } catch (err) {
      console.error(err);
      openInfo({
        title: "Error",
        message:
          err?.message?.includes("Unauthorized")
            ? "Session expired. Please login again."
            : "Failed to load months.",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async (mId) => {
    if (!ensureAuth()) return;
    if (!mId) return;

    setLoading(true);
    try {
      const [ordersData, historyData, kgPriceData] = await Promise.all([
        getOrders(mId),
        getHistory(mId).catch(() => null),
        getKgPrice(mId).catch(() => null),
      ]);
      setOrders(ordersData || []);
      setKgPrice(Number(kgPriceData?.kg_price || 0));

      const map = {};
      if (historyData && (historyData.ok === true || historyData.success === true) && Array.isArray(historyData.orders)) {
        for (const ho of historyData.orders) {
          const oid = Number(ho?.id || 0);
          if (!oid) continue;
          map[oid] = Number(ho?.collected_total || 0);
        }
      }
      setOrderCustomerCollectByOrderId(map);
    } catch (err) {
      console.error(err);
      openInfo({
        title: "Error",
        message:
          err?.message?.includes("Unauthorized")
            ? "Session expired. Please login again."
            : "Failed to load orders.",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadChromeProfiles = async () => {
    try {
      const data = await listChromeProfiles();
      const profiles = data?.chrome_profiles || [];
      setChromeProfiles(profiles);
      setRefreshProfileKey((current) => current || profiles[0]?.profile_key || "");
    } catch {
      setChromeProfiles([]);
      setRefreshProfileKey("");
    }
  };

  const loadDirectoryCustomers = async () => {
    setCustomersLoading(true);
    try {
      const data = await getCustomerDirectory();
      setDirectoryCustomers(Array.isArray(data?.customers) ? data.customers : []);
    } catch (error) {
      setDirectoryCustomers([]);
      openInfo({
        title: "Customers Unavailable",
        message: error?.message || "Could not load reusable customers.",
      });
    } finally {
      setCustomersLoading(false);
    }
  };

  useEffect(() => {
    loadMonths();
    loadChromeProfiles();
    loadDirectoryCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelectedOrder(null);
    if (monthId) loadOrders(monthId);
    else setOrders([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthId]);

  const totalOrdersAmount = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.order_details || 0), 0),
    [orders]
  );
  const totalToCollect = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.amount_to_collect || 0), 0),
    [orders]
  );
  const totalEstimatedWeight = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.shein_total_weight_plus_2kg_sum || 0), 0),
    [orders]
  );
  const totalEstimatedShipping = useMemo(
    () => totalEstimatedWeight * Number(kgPrice || 0),
    [totalEstimatedWeight, kgPrice]
  );
  const totalEstimatedProfit = useMemo(
    () => totalToCollect - totalOrdersAmount - totalEstimatedShipping,
    [totalToCollect, totalOrdersAmount, totalEstimatedShipping]
  );
  const filteredDirectoryCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return directoryCustomers;
    return directoryCustomers.filter((customer) =>
      [customer.customer_name, customer.phone, customer.notes]
        .some((value) => String(value || "").toLowerCase().includes(query))
    );
  }, [customerSearch, directoryCustomers]);

  const handleOpenAddOrder = () => {
    if (!monthId) {
      openInfo({ title: "Select Month", message: "Please select an active month cycle first." });
      return;
    }
    setOrderModalMode("add");
    setEditingOrder(null);
    setOrderForm({
      order_name: `Order ${orders.length + 1}`,
      order_details: "",
      amount_to_collect: "",
      customer_ids: [],
    });
    setCustomerSearch("");
    setFormError("");
    setIsOrderModalOpen(true);
  };

  const handleOpenEditOrder = (order) => {
    setOrderModalMode("edit");
    setEditingOrder(order);
    setOrderForm({
      order_name: order.order_name || "",
      order_details: order.order_details || "",
      amount_to_collect: order.amount_to_collect ?? "",
      customer_ids: [],
    });
    setCustomerSearch("");
    setFormError("");
    setIsOrderModalOpen(true);
  };

  const toggleOrderCustomer = (customerId) => {
    setOrderForm((current) => {
      const id = Number(customerId);
      const selected = Array.isArray(current.customer_ids) ? current.customer_ids : [];
      return {
        ...current,
        customer_ids: selected.includes(id)
          ? selected.filter((value) => value !== id)
          : [...selected, id],
      };
    });
  };

  const handleSaveOrder = async (e) => {
    if (e) e.preventDefault();
    if (savingOrder) return;
    if (!orderForm.order_name.trim()) {
      setFormError("Order Name is required.");
      return;
    }
    const cost = Number(orderForm.order_details);
    if (!Number.isFinite(cost) || cost < 0) {
      setFormError("Order Details / Amount must be a valid positive number.");
      return;
    }
    const collect = Number(orderForm.amount_to_collect || 0);
    if (!Number.isFinite(collect) || collect < 0) {
      setFormError("Amount To Collect must be a valid number >= 0.");
      return;
    }

    setSavingOrder(true);
    try {
      if (orderModalMode === "add") {
        const res = await addOrder(monthId, orderForm.order_name.trim(), String(cost), collect, orderForm.customer_ids);
        if (res?.ok === false || res?.success === false) {
          throw new Error(res?.error || "Failed to add order");
        }
      } else if (editingOrder) {
        const res = await updateOrder(editingOrder.id, orderForm.order_name.trim(), String(cost), collect);
        if (res?.ok === false || res?.success === false) {
          throw new Error(res?.error || "Failed to update order");
        }
      }
      setIsOrderModalOpen(false);
      await loadOrders(monthId);
    } catch (err) {
      setFormError(err.message || "Failed to save order.");
    } finally {
      setSavingOrder(false);
    }
  };

  const handleDeleteOrder = (order) => {
    openConfirm({
      title: "Delete Order",
      message: `Are you sure you want to delete order "${order.order_name || order.id}"? All associated carts and customers will be removed.`,
      onYes: async () => {
        try {
          const res = await deleteOrder(order.id);
          if (res?.ok === false || res?.success === false) {
            throw new Error(res?.error || "Failed to delete order");
          }
          await loadOrders(monthId);
        } catch (err) {
          openInfo({ title: "Delete Error", message: err?.message || "Failed to delete order." });
        }
      },
    });
  };

  const handleRefreshOrderTrack = async (order) => {
    if (!refreshProfileKey) {
      openInfo({ title: "Missing Chrome Profile", message: "Select a Chrome profile before refreshing track." });
      return;
    }
    setRefreshingTrackOrderId(order.id);
    try {
      const res = await refreshOrderSheinTrack(order.id, refreshProfileKey);
      await loadOrders(monthId);
      const errCount = Array.isArray(res?.errors) ? res.errors.length : 0;
      const errorDetails = errCount ? `\n${res.errors.join("\n")}` : "";
      openInfo({
        title: "Track Refreshed",
        message:
          `Updated carts: ${Number(res?.updated || 0)}\n` +
          `Skipped carts: ${Number(res?.skipped || 0)}\n` +
          `Errors: ${errCount}${errorDetails}`,
      });
    } catch (err) {
      openInfo({
        title: "Refresh Error",
        message: err?.message || "Failed to refresh order track.",
      });
    } finally {
      setRefreshingTrackOrderId(null);
    }
  };

  const handleRefreshOrderWeight = async (order) => {
    if (!refreshProfileKey) {
      openInfo({ title: "Missing Chrome Profile", message: "Select a Chrome profile before getting weight." });
      return;
    }
    setRefreshingWeightOrderId(order.id);
    try {
      const res = await refreshOrderSheinWeight(order.id, refreshProfileKey);
      await loadOrders(monthId);
      const totalPlus2 = Number(res?.summary?.total_weight_plus_2kg || 0);
      const errCount = Array.isArray(res?.errors) ? res.errors.length : 0;
      const errorDetails = errCount ? `\n${res.errors.join("\n")}` : "";
      openInfo({
        title: "Weight Updated",
        message:
          `Updated carts: ${Number(res?.updated || 0)}\n` +
          `Skipped carts: ${Number(res?.skipped || 0)}\n` +
          `Order total (+2kg/cart): ${totalPlus2.toFixed(3)} kg\n` +
          `Errors: ${errCount}${errorDetails}`,
      });
    } catch (err) {
      openInfo({
        title: "Weight Error",
        message: err?.message || "Failed to refresh order weight.",
      });
    } finally {
      setRefreshingWeightOrderId(null);
    }
  };

  return (
    <div className="ordPage">
      <div className="ordHeader">
        <div className="ordHeaderLeft">
          <h1 className="ordTitle">Orders Management</h1>
          <div className="ordSub">
            Create and manage orders, edit carts, track shipments, and allocate customer packages.
          </div>
        </div>

        <div className="ordHeaderRight">
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div className="ordLabel">Active Month Cycle</div>
              <div className="ordMonthWrap">
                <MonthSelector
                  months={months}
                  selectedMonth={monthId}
                  onChange={(id) => setMonthId(id)}
                  disabled={loading || !months.length}
                />
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div className="ordLabel">Chrome Profile for Refresh</div>
              <div className="ordMonthWrap">
                <CustomDropdown
                  value={refreshProfileKey}
                  placeholder="Select Chrome profile"
                  options={chromeProfiles.map((profile) => ({
                    value: profile.profile_key,
                    label: profile.name || profile.profile_key,
                  }))}
                  onChange={(event) => setRefreshProfileKey(event.target.value)}
                  disabled={!chromeProfiles.length || loading}
                  searchable={chromeProfiles.length > 8}
                />
              </div>
            </div>

            <div style={{ alignSelf: "flex-end", display: "flex", gap: "8px" }}>
              <a
                href="/customers"
                className="ordBtnSoft"
                style={{ padding: "10px 14px", height: "42px", display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap", textDecoration: "none" }}
                title="Manage reusable customer directory"
              >
                👥 Customers
              </a>

              <button
                type="button"
                className="ordBtn"
                style={{ padding: "10px 16px", height: "42px", display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}
                onClick={handleOpenAddOrder}
                disabled={!monthId}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>+ Add Order</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary KPI stats */}
      <div className="ordStats">
        <div className="ordStatCard">
          <div className="ordStatTitle">Orders Count</div>
          <div className="ordStatValue">{orders.length}</div>
        </div>
        <div className="ordStatCard">
          <div className="ordStatTitle">Goods Cost ($)</div>
          <div className="ordStatValue">${money(totalOrdersAmount)}</div>
        </div>
        <div className="ordStatCard">
          <div className="ordStatTitle">To Collect ($)</div>
          <div className="ordStatValue">${money(totalToCollect)}</div>
        </div>
        <div className="ordStatCard">
          <div className="ordStatTitle">Total Estimated Weight</div>
          <div className="ordStatValue">{Number(totalEstimatedWeight).toFixed(3)} kg</div>
        </div>
        <div className="ordStatCard">
          <div className="ordStatTitle">Est. Shipping ($)</div>
          <div className="ordStatValue">${money(totalEstimatedShipping)}</div>
        </div>
        <div className="ordStatCard">
          <div className="ordStatTitle">Est. Profit ($)</div>
          <div
            className="ordStatValue"
            style={{
              color: totalEstimatedProfit >= 0 ? "#059669" : "#dc2626",
              fontWeight: 800,
            }}
          >
            ${money(totalEstimatedProfit)}
          </div>
        </div>
      </div>

      <div className="ordGrid">
        {loading ? (
          <div className="ordEmpty">
            <div className="ordEmptyTitle">Loading orders...</div>
            <div className="ordEmptySub">Please wait.</div>
          </div>
        ) : orders.length === 0 ? (
          <div className="ordEmpty">
            <div className="ordEmptyTitle">No orders found</div>
            <div className="ordEmptySub">
              {monthId ? "This month cycle doesn’t have orders yet. Click below to add the first order." : "Select a month to see orders."}
            </div>
            {monthId ? (
              <button
                className="ordBtn"
                style={{ marginTop: "16px" }}
                onClick={handleOpenAddOrder}
              >
                + Create First Order
              </button>
            ) : null}
          </div>
        ) : (
          orders.map((order) => {
            const customerSum = Number(order.customers_collect_sum || orderCustomerCollectByOrderId[order.id] || 0);
            const toCollect = Number(order.amount_to_collect || 0);
            const remainingToAllocate = toCollect - customerSum;
            const orderWeight = Number(order.shein_total_weight_plus_2kg_sum || 0);
            const orderShipping = orderWeight * Number(kgPrice || 0);
            const orderCost = Number(order.order_details || 0);
            const orderProfit = toCollect - orderCost - orderShipping;

            const collectedSum = Number(order.customers_collected_sum || 0);
            const budgetToCollect = toCollect > 0 ? toCollect : customerSum;
            const collectionPct = budgetToCollect > 0 ? Math.min(100, Math.round((collectedSum / budgetToCollect) * 1000) / 10) : 0;
            const isCollectionComplete = budgetToCollect > 0 && collectedSum >= budgetToCollect;

            return (
              <div key={order.id} className="ordCard">
                <div className="ordCardHead">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: 10 }}>
                    <div className="ordCardTitle">Order # {order.order_name || order.id}</div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        className="ordBtnSoft"
                        style={{ padding: "4px 8px", fontSize: "12px" }}
                        onClick={() => handleOpenEditOrder(order)}
                        title="Edit order name and financial details"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ordBtnDanger"
                        style={{ padding: "4px 8px", fontSize: "12px" }}
                        onClick={() => handleDeleteOrder(order)}
                        title="Delete order"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Budget Collection Progress Bar */}
                  <div style={{ marginTop: "8px", marginBottom: "8px", background: "rgba(15, 23, 42, 0.6)", padding: "8px 12px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", fontSize: "12px" }}>
                      <span style={{ color: "#94a3b8", fontWeight: 600 }}>Collection Progress:</span>
                      <span style={{ fontWeight: 700, color: isCollectionComplete ? "#10b981" : "#38bdf8" }}>
                        ${money(collectedSum)} / ${money(budgetToCollect)} ({collectionPct}%)
                      </span>
                    </div>
                    <div style={{ height: "6px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "3px", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${collectionPct}%`,
                          background: isCollectionComplete ? "linear-gradient(90deg, #10b981, #34d399)" : "linear-gradient(90deg, #3b82f6, #06b6d4)",
                          borderRadius: "3px",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>

                  <div className="ordBadges">
                    {order.profit_put_aside != null && (
                      <span
                        className="ordBadgeSoft"
                        style={{
                          color: "#10b981",
                          background: "rgba(16, 185, 129, 0.15)",
                          border: "1px solid rgba(16, 185, 129, 0.4)",
                          fontWeight: 700,
                        }}
                      >
                        ✓ Profit Secured: ${money(order.profit_put_aside)}
                      </span>
                    )}
                    {isCollectionComplete && (
                      <span
                        className="ordBadgeSoft"
                        style={{
                          color: "#34d399",
                          background: "rgba(16, 185, 129, 0.2)",
                          fontWeight: 700,
                        }}
                      >
                        ✓ 100% Collected
                      </span>
                    )}
                    <span className="ordBadgeSoft">
                      Cost: ${money(order.order_details)}
                    </span>
                    <span className="ordBadgeSoft">
                      To Collect: ${money(order.amount_to_collect)}
                    </span>
                    <span
                      className="ordBadgeSoft"
                      style={{
                        color: orderProfit >= 0 ? "#059669" : "#dc2626",
                        background: orderProfit >= 0 ? "rgba(5, 150, 105, 0.08)" : "rgba(220, 38, 38, 0.08)",
                        fontWeight: 700,
                      }}
                    >
                      Est. Profit: ${money(orderProfit)}
                    </span>
                    <span className="ordBadgeSoft">
                      Customers: {Number(order.cart_customers_count || 0)} (${money(customerSum)})
                    </span>
                    <span className="ordBadgeSoft">
                      Carts: {Number(order.carts_count || 0)}
                    </span>
                    <span className="ordBadgeSoft">
                      Weight+2: {Number(order.shein_total_weight_plus_2kg_sum || 0).toFixed(3)} kg
                    </span>
                    {Math.abs(remainingToAllocate) > 0.01 ? (
                      <span className="ordBadgeSoft" style={{ color: remainingToAllocate > 0 ? "#d97706" : "#2563eb", background: "rgba(217, 119, 6, 0.08)" }}>
                        {remainingToAllocate > 0 ? `Unallocated: $${money(remainingToAllocate)}` : `Over-allocated: $${money(-remainingToAllocate)}`}
                      </span>
                    ) : null}
                    {Number(order.shein_undelivered_carts || 0) > 0 ? (
                      <span className="ordBadgeSoft" style={{ color: "#e11d48", background: "rgba(225, 29, 72, 0.08)" }}>
                        Undelivered: {Number(order.shein_undelivered_carts || 0)}
                      </span>
                    ) : null}
                    {Number(order.joint_shipment_carts || 0) > 0 ? (
                      <span className="ordBadgeSoft">
                        Joint: {Number(order.joint_shipment_carts || 0)} carts
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="ordCardBody">
                  <div className="ordDetails">
                    {String(order.order_details ?? "").trim() ? (
                      `Goods cost: $${money(order.order_details)}`
                    ) : (
                      <span className="ordMuted">-</span>
                    )}
                  </div>

                  <div className="ordButtonsRow">
                    <button
                      type="button"
                      className="ordBtn"
                      style={{
                        background: isCollectionComplete
                          ? "linear-gradient(135deg, #10b981, #059669)"
                          : "linear-gradient(135deg, #6366f1, #4f46e5)",
                        border: "none",
                        color: "#ffffff",
                        fontWeight: 700,
                        boxShadow: isCollectionComplete
                          ? "0 2px 10px rgba(16, 185, 129, 0.4)"
                          : "0 2px 10px rgba(99, 102, 241, 0.3)",
                      }}
                      onClick={() => setCollectionOrder(order)}
                      title="Collect payments and calculate/put aside pure profit"
                    >
                      {isCollectionComplete ? "🎉 Put Aside Profit" : "💰 Collect & Profit"}
                    </button>
                    <button
                      className="ordBtnSoft"
                      onClick={() => handleRefreshOrderTrack(order)}
                      disabled={refreshingTrackOrderId === order.id || refreshingWeightOrderId === order.id}
                      title="Fetch live carrier tracking status from SHEIN"
                    >
                      {refreshingTrackOrderId === order.id ? "Refreshing Track..." : "Refresh Track"}
                    </button>
                    <button
                      className="ordBtnSoft"
                      onClick={() => handleRefreshOrderWeight(order)}
                      disabled={refreshingWeightOrderId === order.id || refreshingTrackOrderId === order.id}
                      title="Fetch live parcel weights from SHEIN"
                    >
                      {refreshingWeightOrderId === order.id ? "Getting Weight..." : "Get Weight"}
                    </button>
                    <button className="ordBtn" onClick={() => setSelectedOrder(order)}>
                      <span>Edit Carts & Customers</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Carts and Customers Editor Modal */}
      {selectedOrder && (
        <CartsEditor
          key={selectedOrder.id}
          order={selectedOrder}
          chromeProfiles={chromeProfiles}
          onClose={() => setSelectedOrder(null)}
          onUpdated={() => loadOrders(monthId)}
        />
      )}

      {/* Unified Add / Edit Order Modal */}
      {isOrderModalOpen && (
        <div
          className="modalBackdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsOrderModalOpen(false);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOrderModalOpen(false);
          }}
        >
          <div
            className="modalCard"
            style={{ maxWidth: "480px" }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modalHeader">
              <h3 className="modalTitle">
                {orderModalMode === "add" ? "Create New Order" : `Edit ${editingOrder?.order_name || "Order"}`}
              </h3>
              <button
                type="button"
                className="modalClose"
                onClick={() => setIsOrderModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOrder}>
              <div className="modalBody" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {formError && (
                  <div style={{ color: "#ef4444", fontSize: "13px", padding: "8px 12px", background: "rgba(239, 68, 68, 0.1)", borderRadius: "6px" }}>
                    {formError}
                  </div>
                )}

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px", color: "var(--muted, #64748b)" }}>
                    ORDER NAME / NUMBER *
                  </label>
                  <input
                    type="text"
                    className="modalInput"
                    placeholder="e.g. Order 15 or Batch A"
                    value={orderForm.order_name}
                    onChange={(e) => setOrderForm({ ...orderForm, order_name: e.target.value })}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px", color: "var(--muted, #64748b)" }}>
                    ORDER AMOUNT / GOODS COST ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="modalInput"
                    placeholder="0.00"
                    value={orderForm.order_details}
                    onChange={(e) => setOrderForm({ ...orderForm, order_details: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px", color: "var(--muted, #64748b)" }}>
                    EXPECTED REVENUE TO COLLECT ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="modalInput"
                    placeholder="0.00"
                    value={orderForm.amount_to_collect}
                    onChange={(e) => setOrderForm({ ...orderForm, amount_to_collect: e.target.value })}
                    required
                  />
                </div>

                {orderModalMode === "add" && (
                  <div className="ordCustomerPicker">
                    <div className="ordCustomerPickerHead">
                      <div>
                        <label className="ordCustomerPickerLabel">ASSIGN CUSTOMERS (OPTIONAL)</label>
                        <div className="ordCustomerPickerHint">
                          {orderForm.customer_ids.length} selected
                        </div>
                      </div>
                      <input
                        className="ordCustomerSearch"
                        value={customerSearch}
                        onChange={(event) => setCustomerSearch(event.target.value)}
                        placeholder="Search customers"
                        aria-label="Search customers"
                      />
                    </div>
                    {customersLoading ? (
                      <div className="ordCustomerEmpty">Loading customers...</div>
                    ) : filteredDirectoryCustomers.length === 0 ? (
                      <div className="ordCustomerEmpty">
                        {directoryCustomers.length ? "No customers match your search." : "Add customers from the Customers page first."}
                      </div>
                    ) : (
                      <div className="ordCustomerOptions">
                        {filteredDirectoryCustomers.map((customer) => {
                          const id = Number(customer.id);
                          const selected = orderForm.customer_ids.includes(id);
                          return (
                            <label key={id} className={`ordCustomerOption${selected ? " isSelected" : ""}`}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleOrderCustomer(id)}
                              />
                              <span>
                                <strong>{customer.customer_name}</strong>
                                {customer.phone ? <small>{customer.phone}</small> : null}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="modalFooter" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button
                  type="button"
                  className="modalBtn modalBtnCancel"
                  onClick={() => setIsOrderModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modalBtn modalBtnConfirm"
                  disabled={savingOrder}
                >
                  {savingOrder ? "Saving..." : orderModalMode === "add" ? "Create Order" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Collection & Profit Modal */}
      {collectionOrder && (
        <OrderCollectionModal
          order={collectionOrder}
          onClose={() => setCollectionOrder(null)}
          onOrderUpdated={() => loadOrders(monthId)}
        />
      )}

      {/* Record Customer Loss Modal */}
      {lossCustomer && (
        <RecordCustomerLossModal
          customer={lossCustomer}
          onClose={() => setLossCustomer(null)}
          onSuccess={() => {
            setLossCustomer(null);
            loadOrders(monthId);
          }}
        />
      )}

      <CustomModal {...modal} />
      <CustomModal {...confirmModal} />
    </div>
  );
};

export default OrdersPage;
