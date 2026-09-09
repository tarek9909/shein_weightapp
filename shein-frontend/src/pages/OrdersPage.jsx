// src/pages/OrdersPage.jsx
import { useEffect, useMemo, useState } from "react";
import { getOrders } from "../api/ordersApi";
import { getMonths } from "../api/monthApi";
import { getHistory } from "../api/historyApi";
import {
  listSheinUsers,
  refreshOrderSheinTrack,
  refreshOrderSheinWeight,
} from "../api/sheinTrackerApi";
import MonthSelector from "../components/MonthSelector";
import CartsEditor from "../components/CartsEditor";
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
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshingTrackOrderId, setRefreshingTrackOrderId] = useState(null);
  const [refreshingWeightOrderId, setRefreshingWeightOrderId] = useState(null);
  const [sheinUsers, setSheinUsers] = useState([]);
  const [chromeProfiles, setChromeProfiles] = useState([]);
  const [sheinEmail, setSheinEmail] = useState("");
  const [orderCustomerCollectByOrderId, setOrderCustomerCollectByOrderId] = useState({});

  // Modal state (same pattern used in other pages)
  const [modal, setModal] = useState({ isOpen: false });
  const closeModal = () => setModal({ isOpen: false });

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
      const data = await getMonths(); // apiFetch -> sends Authorization
      const arr = data || [];
      setMonths(arr);

      // auto-select first month if none selected
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
      const [ordersData, historyData] = await Promise.all([
        getOrders(mId),
        getHistory(mId).catch(() => null),
      ]);
      setOrders(ordersData || []);

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

  const loadSheinUsers = async () => {
    try {
      const data = await listSheinUsers();
      setSheinUsers(data?.users || []);
      setChromeProfiles(data?.chrome_profiles || []);
    } catch {
      setSheinUsers([]);
      setChromeProfiles([]);
    }
  };

  useEffect(() => {
    let currentUser = null;
    try {
      currentUser = JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      currentUser = null;
    }

    const storedEmail = localStorage.getItem("shein_api_email") || "";
    const fallbackUserEmail = currentUser?.email || "";
    const initialEmail = storedEmail || fallbackUserEmail;
    if (initialEmail) {
      setSheinEmail(initialEmail);
    }

    loadMonths();
    loadSheinUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (sheinEmail) localStorage.setItem("shein_api_email", sheinEmail);
  }, [sheinEmail]);

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

  const orderCollectIssues = useMemo(() => {
    const issues = [];
    for (const o of orders || []) {
      const oid = Number(o?.id || 0);
      if (!oid) continue;
      const orderCollect = Number(o?.amount_to_collect || 0);
      const customersCollect = Number(orderCustomerCollectByOrderId[oid] || 0);
      const diff = Number((orderCollect - customersCollect).toFixed(2));
      if (Math.abs(diff) > 0.009) {
        issues.push({
          order_id: oid,
          order_name: o?.order_name || "",
          order_collect: orderCollect,
          customers_collect: customersCollect,
          diff,
        });
      }
    }
    return issues;
  }, [orders, orderCustomerCollectByOrderId]);

  const handleRefreshOrderTrack = async (order) => {
    setRefreshingTrackOrderId(order.id);
    try {
      const res = await refreshOrderSheinTrack(order.id);
      await loadOrders(monthId);
      const errCount = Array.isArray(res?.errors) ? res.errors.length : 0;
      openInfo({
        title: "Track Refreshed",
        message:
          `Updated carts: ${Number(res?.updated || 0)}\n` +
          `Skipped carts: ${Number(res?.skipped || 0)}\n` +
          `Errors: ${errCount}`,
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
    setRefreshingWeightOrderId(order.id);
    try {
      const res = await refreshOrderSheinWeight(order.id);
      await loadOrders(monthId);
      const totalPlus2 = Number(res?.summary?.total_weight_plus_2kg || 0);
      const errCount = Array.isArray(res?.errors) ? res.errors.length : 0;
      openInfo({
        title: "Weight Updated",
        message:
          `Updated carts: ${Number(res?.updated || 0)}\n` +
          `Skipped carts: ${Number(res?.skipped || 0)}\n` +
          `Order total (+2kg/cart): ${totalPlus2.toFixed(3)} kg\n` +
          `Errors: ${errCount}`,
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
            Select a month, then open an order to edit its carts.
          </div>
        </div>

        <div className="ordHeaderRight">
          <div className="ordLabel">Month</div>
          <div className="ordMonthWrap">
            <MonthSelector
              months={months}
              selectedMonth={monthId}
              onChange={(id) => setMonthId(id)}
              disabled={loading || !months.length}
            />
          </div>
        </div>
      </div>

      {/* Optional summary */}
      <div className="ordStats">
        <div className="ordStatCard">
          <div className="ordStatTitle">Orders</div>
          <div className="ordStatValue">{orders.length}</div>
        </div>
        <div className="ordStatCard">
          <div className="ordStatTitle">Total Amount</div>
          <div className="ordStatValue">${money(totalOrdersAmount)}</div>
        </div>
        <div className="ordStatCard">
          <div className="ordStatTitle">To Collect</div>
          <div className="ordStatValue">${money(totalToCollect)}</div>
        </div>
        <div className="ordStatCard">
          <div className="ordStatTitle">Estimated Weight</div>
          <div className="ordStatValue">{Number(totalEstimatedWeight).toFixed(3)} kg</div>
        </div>
      </div>

        {orderCollectIssues.length > 0 ? (
        <div className="ordAlert">
          <div className="ordAlertTitle">
            Collect mismatch found in {orderCollectIssues.length} order{orderCollectIssues.length > 1 ? "s" : ""}
          </div>
          {orderCollectIssues.map((x) => (
            <div key={x.order_id} className="ordAlertRow">
              Order #{x.order_id} ({x.order_name || "-"}) | To Collect: ${money(x.order_collect)} | Customers: ${money(x.customers_collect)} | Diff: ${money(x.diff)}
            </div>
          ))}
        </div>
      ) : null}

      <div className="ordGrid">
        {loading ? (
          <div className="ordEmpty">
            <div className="ordEmptyTitle">Loading...</div>
            <div className="ordEmptySub">Please wait.</div>
          </div>
        ) : orders.length === 0 ? (
          <div className="ordEmpty">
            <div className="ordEmptyTitle">No orders</div>
            <div className="ordEmptySub">
              {monthId ? "This month doesn’t have orders yet." : "Select a month to see orders."}
            </div>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="ordCard">
              <div className="ordCardHead">
                <div className="ordCardTitle">Order # {order.order_name || "-"}</div>

                <div className="ordBadges">
                  <span className="ordBadgeSoft">
                    Amount: ${money(order.order_details)}
                  </span>
                  <span className="ordBadgeSoft">
                    To Collect: ${money(order.amount_to_collect)}
                  </span>
                  {(() => {
                    const customersCollect = Number(orderCustomerCollectByOrderId[order.id] || 0);
                    const diff = Number((Number(order.amount_to_collect || 0) - customersCollect).toFixed(2));
                    if (Math.abs(diff) <= 0.009) return null;
                    return (
                      <span className="ordBadgeSoft ordBadgeAlert">
                        Collect mismatch | Customers: ${money(customersCollect)} | Diff: ${money(diff)}
                      </span>
                    );
                  })()}
                  <span className="ordBadgeSoft">
                    Undelivered: {Number(order.shein_undelivered_carts || 0)}
                  </span>
                  <span className="ordBadgeSoft">
                    Weight+2: {Number(order.shein_total_weight_plus_2kg_sum || 0).toFixed(3)} kg
                  </span>
                  {Number(order.joint_shipment_carts || 0) > 0 ? (
                    <span className="ordBadgeSoft">
                      Joint Shipment: {Number(order.joint_shipment_carts || 0)} carts
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="ordCardBody">
                <div className="ordDetails">
                  {String(order.order_details ?? "").trim() ? (
                    order.order_details
                  ) : (
                    <span className="ordMuted">-</span>
                  )}
                </div>

                <div className="ordButtonsRow">
                  <button
                    className="ordBtnSoft"
                    onClick={() => handleRefreshOrderTrack(order)}
                    disabled={refreshingTrackOrderId === order.id}
                  >
                    {refreshingTrackOrderId === order.id ? "Refreshing Track..." : "Refresh Order"}
                  </button>
                  <button
                    className="ordBtnSoft"
                    onClick={() => handleRefreshOrderWeight(order)}
                    disabled={refreshingWeightOrderId === order.id}
                  >
                    {refreshingWeightOrderId === order.id ? "Getting Weight..." : "Get Weight"}
                  </button>
                  <button className="ordBtn" onClick={() => setSelectedOrder(order)}>
                    Edit Carts
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedOrder && (
        <CartsEditor
          key={selectedOrder.id}
          order={selectedOrder}
          sheinUsers={sheinUsers}
          chromeProfiles={chromeProfiles}
          defaultSheinEmail={sheinEmail}
          onClose={() => setSelectedOrder(null)}
          onUpdated={() => loadOrders(monthId)}
        />
      )}

      <CustomModal {...modal} />
    </div>
  );
};

export default OrdersPage;
