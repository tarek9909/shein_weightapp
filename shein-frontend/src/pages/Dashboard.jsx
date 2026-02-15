import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getMonths, addMonth } from "../api/monthApi";
import { getOrders, addOrder, updateOrder, deleteOrder } from "../api/ordersApi";
import { getPayments, addPayment, updatePayment, deletePayment } from "../api/paymentsApi";
import { getCustoms, addCustom, updateCustom, deleteCustom } from "../api/customsApi";
import { getBudgets, addBudget, updateBudget, deleteBudget } from "../api/budgetApi";

import { CustomModal } from "../components/CustomModal";
import "../dashboard.css";

const money = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function isAuthErrorPayload(payload) {
  const msg = String(payload?.error || payload?.message || "").toLowerCase();
  return (
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("invalid token") ||
    msg.includes("token") ||
    msg.includes("jwt")
  );
}

function normalizeArrayResponse(res) {
  // if backend returns array -> OK
  if (Array.isArray(res)) return { ok: true, data: res };

  // if backend returns {ok:false} or {success:false}
  const ok =
    res?.ok === true ||
    res?.success === true ||
    (res && typeof res === "object" && !("ok" in res) && !("success" in res) && !("error" in res));

  const error = res?.error || res?.message || null;

  // if it's an object but not an array, treat as error unless ok is true
  if (!Array.isArray(res) && !ok) return { ok: false, data: [], error: error || "Request failed" };

  // ok object but no array -> return empty list
  return { ok: true, data: Array.isArray(res?.data) ? res.data : [] };
}

export default function Dashboard() {
  const nav = useNavigate();

  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("");

  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [customs, setCustoms] = useState([]);
  const [budgets, setBudgets] = useState([]);

  const [newMonthName, setNewMonthName] = useState("");
  const [newOrderName, setNewOrderName] = useState("");
  const [newOrder, setNewOrder] = useState("");
  const [newPayment, setNewPayment] = useState("");
  const [newCustom, setNewCustom] = useState("");
  const [newBudgetValue, setNewBudgetValue] = useState("");
  const [newBudgetDesc, setNewBudgetDesc] = useState("");

  const [modal, setModal] = useState({ isOpen: false });
  const [confirm, setConfirm] = useState({ isOpen: false });

  const closeModal = () => setModal({ isOpen: false });

  const openError = (message, title = "Error") => {
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
    setConfirm({
      isOpen: true,
      title,
      message,
      showCancel: true,
      confirmText: "Confirm",
      cancelText: "Cancel",
      onConfirm: async () => {
        setConfirm({ isOpen: false });
        await onYes();
      },
      onCancel: () => setConfirm({ isOpen: false }),
      onClose: () => setConfirm({ isOpen: false }),
    });
  };

  const ensureAuth = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      nav("/login");
      return false;
    }
    return true;
  };

  const handleAuthFail = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    nav("/login");
  };

  // load months
  useEffect(() => {
    if (!ensureAuth()) return;

    (async () => {
      try {
        const res = await getMonths();
        const norm = normalizeArrayResponse(res);

        if (!norm.ok) {
          if (isAuthErrorPayload(res)) return handleAuthFail();
          openError(norm.error || "Failed to load months.");
          setMonths([]);
          return;
        }

        setMonths(norm.data);
        if (norm.data.length > 0) setSelectedMonth(String(norm.data[0].id));
        else setSelectedMonth("");
      } catch (err) {
        openError("Failed to load months.");
        setMonths([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load month data
  useEffect(() => {
    if (!selectedMonth) return;
    if (!ensureAuth()) return;

    (async () => {
      try {
        const monthId = selectedMonth;

        const [oRes, pRes, cRes, bRes] = await Promise.all([
          getOrders(monthId),
          getPayments(monthId),
          getCustoms(monthId),
          getBudgets(monthId),
        ]);

        const o = normalizeArrayResponse(oRes);
        const p = normalizeArrayResponse(pRes);
        const c = normalizeArrayResponse(cRes);
        const b = normalizeArrayResponse(bRes);

        // auth fail detection (any endpoint)
        if (
          !o.ok || !p.ok || !c.ok || !b.ok
        ) {
          const payload = (!o.ok && oRes) || (!p.ok && pRes) || (!c.ok && cRes) || (!b.ok && bRes);
          if (isAuthErrorPayload(payload)) return handleAuthFail();
          openError("Failed to load month data.");
        }

        setOrders(o.data || []);
        setPayments(p.data || []);
        setCustoms(c.data || []);
        setBudgets(b.data || []);
      } catch (err) {
        openError("Failed to load month data.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const handleAddMonth = async () => {
    if (!newMonthName.trim()) return;
    try {
      const res = await addMonth(newMonthName.trim());

      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to add month");
      }

      // backend returns {success:true, id} OR {ok:true, id}
      const id = res?.id;
      if (!id) throw new Error("Missing new month id from server");

      const next = [{ id, name: newMonthName.trim() }, ...months];
      setMonths(next);
      setSelectedMonth(String(id));
      setNewMonthName("");
    } catch (err) {
      openError(err?.message || "Failed to add month.");
    }
  };

  const handleAddOrder = async () => {
    if (!newOrderName.trim() || !newOrder || !selectedMonth) return;
    try {
      const res = await addOrder(selectedMonth, newOrderName.trim(), newOrder);
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to add order");
      }
      setOrders((prev) => [
        ...prev,
        { id: res.id, order_name: newOrderName.trim(), order_details: newOrder },
      ]);
      setNewOrderName("");
      setNewOrder("");
    } catch (err) {
      openError(err?.message || "Failed to add order.");
    }
  };

  const handleAddPayment = async () => {
    if (!newPayment || !selectedMonth) return;
    try {
      const res = await addPayment(selectedMonth, newPayment);
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to add payment");
      }
      setPayments((prev) => [...prev, { id: res.id, payment_amount: newPayment }]);
      setNewPayment("");
    } catch (err) {
      openError(err?.message || "Failed to add payment.");
    }
  };

  const handleAddCustom = async () => {
    if (!newCustom || !selectedMonth) return;
    try {
      const res = await addCustom(selectedMonth, newCustom);
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to add customs");
      }
      setCustoms((prev) => [...prev, { id: res.id, customs_fee: newCustom }]);
      setNewCustom("");
    } catch (err) {
      openError(err?.message || "Failed to add customs.");
    }
  };

  const handleAddBudget = async () => {
    if (!newBudgetValue || !selectedMonth) return;
    try {
      const res = await addBudget(selectedMonth, newBudgetValue, newBudgetDesc);
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to add budget");
      }
      setBudgets((prev) => [
        ...prev,
        { id: res.id, value: newBudgetValue, description: newBudgetDesc },
      ]);
      setNewBudgetValue("");
      setNewBudgetDesc("");
    } catch (err) {
      openError(err?.message || "Failed to add budget.");
    }
  };

  const handleUpdateOrder = async (id, name, value) => {
    try {
      const res = await updateOrder(id, name, value);
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to update order");
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, order_name: name, order_details: value } : o))
      );
    } catch (err) {
      openError(err?.message || "Failed to update order.");
    }
  };

  const handleUpdatePayment = async (id, value) => {
    try {
      const res = await updatePayment(id, value);
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to update payment");
      }
      setPayments((prev) =>
        prev.map((p) => (p.id === id ? { ...p, payment_amount: value } : p))
      );
    } catch (err) {
      openError(err?.message || "Failed to update payment.");
    }
  };

  const handleUpdateCustom = async (id, value) => {
    try {
      const res = await updateCustom(id, value);
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to update customs");
      }
      setCustoms((prev) =>
        prev.map((c) => (c.id === id ? { ...c, customs_fee: value } : c))
      );
    } catch (err) {
      openError(err?.message || "Failed to update customs.");
    }
  };

  const handleUpdateBudget = async (id, value, description) => {
    try {
      const res = await updateBudget(id, value, description);
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to update budget");
      }
      setBudgets((prev) =>
        prev.map((b) => (b.id === id ? { ...b, value, description } : b))
      );
    } catch (err) {
      openError(err?.message || "Failed to update budget.");
    }
  };

  const totals = useMemo(() => {
    const totalOrders = orders.reduce((sum, o) => sum + Number(o.order_details || 0), 0);
    const totalCustoms = customs.reduce((sum, c) => sum + Number(c.customs_fee || 0), 0);
    const totalPayments = payments.reduce((sum, p) => sum + Number(p.payment_amount || 0), 0);
    return { totalOrders, totalCustoms, totalPayments };
  }, [orders, customs, payments]);

  const remaining = totals.totalOrders + totals.totalCustoms - totals.totalPayments;

  const actualCash = useMemo(() => {
    const initialBudget = budgets.find((b) => (b.description || "").toLowerCase() === "initial");
    const initialValue = initialBudget ? Number(initialBudget.value || 0) : 0;
    return initialValue + totals.totalPayments - totals.totalOrders - totals.totalCustoms;
  }, [budgets, totals]);

  return (
    <div className="dashPage dashTopSpacer">
      <div className="dashHeader">
        <div className="dashHeaderLeft">
          <h1 className="dashTitle">Dashboard</h1>
          <div className="dashSub">Manage months, budgets, orders, payments, and customs.</div>
        </div>

        <div className="dashHeaderRight">
          <label className="dashLabel">Month</label>

          <select
            className="dashSelect"
            onChange={(e) => setSelectedMonth(String(e.target.value))}
            value={selectedMonth || ""}
            disabled={!Array.isArray(months) || months.length === 0}
          >
            {(Array.isArray(months) ? months : []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} (#{m.id})
              </option>
            ))}
          </select>

          <div className="dashAddMonth">
            <input
              className="dashInput"
              value={newMonthName}
              onChange={(e) => setNewMonthName(e.target.value)}
              placeholder="New Month"
            />
            <button className="dashBtn" onClick={handleAddMonth}>
              Add Month
            </button>
          </div>
        </div>
      </div>

      <div className="dashStats">
        <StatCard title="Orders Total" value={`$${money(totals.totalOrders)}`} />
        <StatCard title="Customs Total" value={`$${money(totals.totalCustoms)}`} />
        <StatCard title="Payments Total" value={`$${money(totals.totalPayments)}`} />
        <StatCard title="Remaining" value={`$${money(remaining)}`} />
        <StatCard title="Actual Cash" value={`$${money(actualCash)}`} />
      </div>

      <div className="dashGrid">
        {/* Budgets */}
        <SectionCard title="Budgets" subtitle="Track starting budget and monthly entries">
          <div className="dashFormRow">
            <input
              className="dashInput"
              type="number"
              value={newBudgetValue}
              onChange={(e) => setNewBudgetValue(e.target.value)}
              placeholder="Value"
            />
            <input
              className="dashInput"
              value={newBudgetDesc}
              onChange={(e) => setNewBudgetDesc(e.target.value)}
              placeholder="Description (ex: initial)"
            />
            <button className="dashBtn" onClick={handleAddBudget}>
              Add
            </button>
          </div>

          <List>
            {budgets.map((b) => (
              <Row key={b.id}>
                <input
                  className="dashInput"
                  type="number"
                  value={b.value}
                  onChange={(e) =>
                    setBudgets((prev) =>
                      prev.map((bu) => (bu.id === b.id ? { ...bu, value: e.target.value } : bu))
                    )
                  }
                  onBlur={(e) => handleUpdateBudget(b.id, e.target.value, b.description)}
                />
                <input
                  className="dashInput"
                  value={b.description}
                  onChange={(e) =>
                    setBudgets((prev) =>
                      prev.map((bu) =>
                        bu.id === b.id ? { ...bu, description: e.target.value } : bu
                      )
                    )
                  }
                  onBlur={(e) => handleUpdateBudget(b.id, b.value, e.target.value)}
                />
                <button
                  className="dashBtnDanger"
                  onClick={() =>
                    openConfirm({
                      title: "Delete Budget",
                      message: "Are you sure you want to delete this budget item?",
                      onYes: async () => {
                        const res = await deleteBudget(b.id);
                        if (res?.ok === false || res?.success === false) throw new Error(res?.error || "Delete failed");
                        setBudgets((prev) => prev.filter((x) => x.id !== b.id));
                      },
                    })
                  }
                >
                  Delete
                </button>
              </Row>
            ))}
          </List>
        </SectionCard>

        {/* Orders */}
        <SectionCard title="Orders" subtitle="Order name + order amount">
          <div className="dashFormRow">
            <input
              className="dashInput"
              value={newOrderName}
              onChange={(e) => setNewOrderName(e.target.value)}
              placeholder="Order Name"
            />
            <input
              className="dashInput"
              value={newOrder}
              onChange={(e) => setNewOrder(e.target.value)}
              placeholder="Order Amount"
            />
            <button className="dashBtn" onClick={handleAddOrder}>
              Add
            </button>
          </div>

          <List>
            {orders.map((o) => (
              <Row key={o.id}>
                <input
                  className="dashInput"
                  value={o.order_name}
                  onChange={(e) =>
                    setOrders((prev) =>
                      prev.map((ord) =>
                        ord.id === o.id ? { ...ord, order_name: e.target.value } : ord
                      )
                    )
                  }
                  onBlur={(e) => handleUpdateOrder(o.id, e.target.value, o.order_details)}
                />
                <input
                  className="dashInput"
                  value={o.order_details}
                  onChange={(e) =>
                    setOrders((prev) =>
                      prev.map((ord) =>
                        ord.id === o.id ? { ...ord, order_details: e.target.value } : ord
                      )
                    )
                  }
                  onBlur={(e) => handleUpdateOrder(o.id, o.order_name, e.target.value)}
                />
                <button
                  className="dashBtnDanger"
                  onClick={() =>
                    openConfirm({
                      title: "Delete Order",
                      message: "Are you sure you want to delete this order?",
                      onYes: async () => {
                        const res = await deleteOrder(o.id);
                        if (res?.ok === false || res?.success === false) throw new Error(res?.error || "Delete failed");
                        setOrders((prev) => prev.filter((x) => x.id !== o.id));
                      },
                    })
                  }
                >
                  Delete
                </button>
              </Row>
            ))}
          </List>
        </SectionCard>

        {/* Payments */}
        <SectionCard title="Payments" subtitle="Track payments made">
          <div className="dashFormRow">
            <input
              className="dashInput"
              value={newPayment}
              onChange={(e) => setNewPayment(e.target.value)}
              placeholder="New Payment"
            />
            <button className="dashBtn" onClick={handleAddPayment}>
              Add
            </button>
          </div>

          <List>
            {payments.map((p) => (
              <Row key={p.id}>
                <input
                  className="dashInput"
                  value={p.payment_amount}
                  onChange={(e) =>
                    setPayments((prev) =>
                      prev.map((pay) =>
                        pay.id === p.id ? { ...pay, payment_amount: e.target.value } : pay
                      )
                    )
                  }
                  onBlur={(e) => handleUpdatePayment(p.id, e.target.value)}
                />
                <button
                  className="dashBtnDanger"
                  onClick={() =>
                    openConfirm({
                      title: "Delete Payment",
                      message: "Are you sure you want to delete this payment?",
                      onYes: async () => {
                        const res = await deletePayment(p.id);
                        if (res?.ok === false || res?.success === false) throw new Error(res?.error || "Delete failed");
                        setPayments((prev) => prev.filter((x) => x.id !== p.id));
                      },
                    })
                  }
                >
                  Delete
                </button>
              </Row>
            ))}
          </List>
        </SectionCard>

        {/* Customs */}
        <SectionCard title="Customs" subtitle="Track customs fees">
          <div className="dashFormRow">
            <input
              className="dashInput"
              value={newCustom}
              onChange={(e) => setNewCustom(e.target.value)}
              placeholder="New Custom"
            />
            <button className="dashBtn" onClick={handleAddCustom}>
              Add
            </button>
          </div>

          <List>
            {customs.map((c) => (
              <Row key={c.id}>
                <input
                  className="dashInput"
                  value={c.customs_fee}
                  onChange={(e) =>
                    setCustoms((prev) =>
                      prev.map((cu) =>
                        cu.id === c.id ? { ...cu, customs_fee: e.target.value } : cu
                      )
                    )
                  }
                  onBlur={(e) => handleUpdateCustom(c.id, e.target.value)}
                />
                <button
                  className="dashBtnDanger"
                  onClick={() =>
                    openConfirm({
                      title: "Delete Customs",
                      message: "Are you sure you want to delete this customs entry?",
                      onYes: async () => {
                        const res = await deleteCustom(c.id);
                        if (res?.ok === false || res?.success === false) throw new Error(res?.error || "Delete failed");
                        setCustoms((prev) => prev.filter((x) => x.id !== c.id));
                      },
                    })
                  }
                >
                  Delete
                </button>
              </Row>
            ))}
          </List>
        </SectionCard>
      </div>

      <CustomModal {...modal} />
      <CustomModal {...confirm} />
    </div>
  );
}

/* ---------- small UI components ---------- */

function StatCard({ title, value }) {
  return (
    <div className="dashStat">
      <div className="dashStatTitle">{title}</div>
      <div className="dashStatValue">{value}</div>
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="dashCard">
      <div className="dashCardHead">
        <div>
          <div className="dashCardTitle">{title}</div>
          {subtitle ? <div className="dashCardSub">{subtitle}</div> : null}
        </div>
      </div>
      <div className="dashCardBody">{children}</div>
    </div>
  );
}

function List({ children }) {
  return <div className="dashList">{children}</div>;
}

function Row({ children }) {
  return <div className="dashRow">{children}</div>;
}
