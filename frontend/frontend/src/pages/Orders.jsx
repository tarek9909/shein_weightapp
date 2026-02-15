import { useEffect, useState } from "react";
import { api } from "../api/client";
import Topbar from "../components/Topbar";
import axios from "axios";

export default function Orders({ email, onLogout }) {
  const [orders, setOrders] = useState([]);
  const [orderNo, setOrderNo] = useState("");
  const [msg, setMsg] = useState("");

  // weight cache: { [order_no]: { total_weight_g, total_weight_kg, items_counted, loading, error } }
  const [weights, setWeights] = useState({});

  const load = async () => {
    const res = await api.get("/api/orders", { params: { email } });
    setOrders(res.data.orders || []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addOrder = async () => {
    if (!orderNo.trim()) return;

    setMsg("Adding...");
    await api.post("/api/orders", { email, order_no: orderNo.trim() });
    setOrderNo("");
    await load();
    setMsg("");
  };

  const refresh = async () => {
    setMsg("Refreshing tracking...");
    try {
      // Use your same axios base call (or switch to api.post("/api/refresh"))
      const res = await axios.post("http://localhost:8000/api/refresh", { email });
      console.log("refresh res:", res.data);

      // Reload list so UI updates delivered/status
      await load();
    } catch (err) {
      console.log("refresh error status:", err?.response?.status);
      console.log("refresh error data:", err?.response?.data);
      console.log("refresh message:", err.message);
      setMsg(err?.response?.data?.detail || "Refresh failed");
      return;
    }

    setMsg("");
  };

  const loadWeightForOrder = async (order_no) => {
    // prevent double fetch
    if (weights[order_no]?.loading) return;

    setWeights((prev) => ({
      ...prev,
      [order_no]: { ...(prev[order_no] || {}), loading: true, error: "" },
    }));

    try {
      // You can use api.post since it already points to your backend base URL
      // Ensure your api client baseURL is http://localhost:8000
      const res = await api.post("/api/weight", { email, order_no });

      setWeights((prev) => ({
        ...prev,
        [order_no]: {
          total_weight_g: res.data.total_weight_g,
          total_weight_kg: res.data.total_weight_kg,
          items_counted: res.data.items_counted,
          loading: false,
          error: "",
        },
      }));
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err.message ||
        "Weight fetch failed";

      setWeights((prev) => ({
        ...prev,
        [order_no]: { ...(prev[order_no] || {}), loading: false, error: msg },
      }));
    }
  };

  return (
    <div className="container">
      <Topbar email={email} onRefresh={refresh} onLogout={onLogout} />

      <div className="card">
        <div className="responsive-row">
          <input
            className="input"
            placeholder="Enter Order Number (GSH...)"
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
          />
          <button className="button button-dark" onClick={addOrder}>
            Add Order
          </button>
        </div>

        {msg && <div className="small-text">{msg}</div>}
      </div>

      {orders.map((o) => {
        const w = weights[o.order_no];
        const weightText =
          w && !w.loading && !w.error && (w.total_weight_g != null || w.total_weight_kg != null)
            ? `${w.total_weight_g ?? "-"} g • ${w.total_weight_kg ?? "-"} kg${
                w.items_counted != null ? ` • items: ${w.items_counted}` : ""
              }`
            : "";

        return (
          <div className="card" key={o.order_no}>
            <div className="flex-between">
              <div style={{ flex: 1, paddingRight: 16 }}>
                <strong>{o.order_no}</strong>

                <div className="small-text" style={{ marginTop: 4 }}>
                  {o.carrier || "—"} • {o.tracking_no || "—"}
                </div>

                <div style={{ marginTop: 8 }}>
                  {o.last_details || o.status_text || "—"}
                </div>

                {/* Weight section */}
                <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    className="button"
                    onClick={() => loadWeightForOrder(o.order_no)}
                    disabled={!!w?.loading}
                    style={{ padding: "8px 12px" }}
                  >
                    {w?.loading ? "Loading weight..." : "Load Weight"}
                  </button>

                  {weightText && <div className="small-text">{weightText}</div>}

                  {w?.error ? (
                    <div className="small-text" style={{ color: "crimson" }}>
                      {w.error}
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                className={
                  o.delivered
                    ? "status-badge status-delivered"
                    : "status-badge status-progress"
                }
              >
                {o.delivered ? "Delivered" : "In Progress"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
