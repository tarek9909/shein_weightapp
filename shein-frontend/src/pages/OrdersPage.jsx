// src/pages/OrdersPage.jsx
import { useEffect, useMemo, useState } from "react";
import { getOrders } from "../api/ordersApi";
import { getMonths } from "../api/monthApi";
import MonthSelector from "../components/MonthSelector";
import CartsEditor from "../components/CartsEditor";
import { CustomModal } from "../components/CustomModal";
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

  // Optional auth guard (works with your backend require_auth)
  const ensureAuth = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      openInfo({
        title: "Login required",
        message: "Please sign in to view your orders.",
      });
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
      const data = await getOrders(mId); // should also be apiFetch-based
      setOrders(data || []);
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

  useEffect(() => {
    loadMonths();
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
      </div>

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

                <button className="ordBtn" onClick={() => setSelectedOrder(order)}>
                  Edit Carts
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedOrder && (
        <CartsEditor
          key={selectedOrder.id}
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdated={() => loadOrders(monthId)}
        />
      )}

      <CustomModal {...modal} />
    </div>
  );
};

export default OrdersPage;
