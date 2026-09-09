import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getMonths, addMonth } from "../api/monthApi";
import { getOrders, addOrder, updateOrder, deleteOrder } from "../api/ordersApi";
import {
  getPayments,
  addPayment,
  addCustomerPayment,
  getPaymentCustomers,
  getPaymentItems,
  updatePayment,
  deletePayment,
} from "../api/paymentsApi";
import {
  getCustoms,
  addCustom,
  updateCustom,
  deleteCustom,
} from "../api/customsApi";
import { getDashboardSummary } from "../api/dashboardApi";
import { getBudgets, addBudget, updateBudget, deleteBudget } from "../api/budgetApi";
import { getKgPrice, saveKgPrice } from "../api/settingsApi";

import { CustomModal } from "../components/CustomModal";
import { isAuthenticated, clearAuthSession, getUser } from "../utils/auth";
import CustomDropdown from "../components/CustomDropdown";
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
  const readOnly = getUser()?.role === "dashboard";

  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("");

  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [customs, setCustoms] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [serverSummary, setServerSummary] = useState(null);

  const [newMonthName, setNewMonthName] = useState("");
  const [newOrderName, setNewOrderName] = useState("");
  const [newOrder, setNewOrder] = useState("");
  const [newOrderCollect, setNewOrderCollect] = useState("");
  const [newPayment, setNewPayment] = useState("");
  const [paymentMode, setPaymentMode] = useState("manual");
  const [paymentCustomerSearch, setPaymentCustomerSearch] = useState("");
  const [paymentCustomerOptions, setPaymentCustomerOptions] = useState([]);
  const [selectedPaymentCustomers, setSelectedPaymentCustomers] = useState([]);
  const [openPaymentDetails, setOpenPaymentDetails] = useState({});
  const [paymentItemsByPaymentId, setPaymentItemsByPaymentId] = useState({});
  const [paymentItemsLoading, setPaymentItemsLoading] = useState({});
  const [newCustom, setNewCustom] = useState("");
  const [newCustomWeight, setNewCustomWeight] = useState("");
  const [newCustomTracking, setNewCustomTracking] = useState("");
  const [newCustomDescription, setNewCustomDescription] = useState("benzene");
  const [newBudgetValue, setNewBudgetValue] = useState("");
  const [newBudgetDesc, setNewBudgetDesc] = useState("");
  const [kgPrice, setKgPrice] = useState("0");

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

  const openConfirm = ({ title, message, onYes, variant = "danger" }) => {
    setConfirm({
      isOpen: true,
      title,
      message,
      variant,
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

  const handleSaveKgPrice = async () => {
    try {
      const parsed = Number(kgPrice);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error("KG price must be a valid number greater than or equal to 0.");
      }
      const res = await saveKgPrice(parsed);
      setKgPrice(String(res?.kg_price ?? parsed));
    } catch (err) {
      openError(err?.message || "Failed to save KG price.");
    }
  };

  const ensureAuth = () => {
    if (!isAuthenticated()) {
      clearAuthSession();
      nav(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true });
      return false;
    }
    return true;
  };

  const handleAuthFail = () => {
    clearAuthSession();
    nav(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true });
  };

  // load months
  useEffect(() => {
    if (!ensureAuth()) return;

    (async () => {
      try {
        try {
          const sRes = await getKgPrice();
          setKgPrice(String(Number(sRes?.kg_price || 0)));
        } catch {
          setKgPrice("0");
        }

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

    setPaymentCustomerOptions([]);
    setSelectedPaymentCustomers([]);
    setPaymentCustomerSearch("");

    (async () => {
      try {
        const monthId = selectedMonth;

        const [oRes, pRes, cRes, bRes, summaryRes] = await Promise.all([
          getOrders(monthId),
          getPayments(monthId),
          getCustoms(monthId),
          getBudgets(monthId),
          getDashboardSummary(monthId),
        ]);

        const o = normalizeArrayResponse(oRes);
        const p = normalizeArrayResponse(pRes);
        const c = normalizeArrayResponse(cRes);
        const b = normalizeArrayResponse(bRes);
        // auth fail detection (any endpoint)
        if (
          !o.ok || !p.ok || !c.ok || !b.ok
        ) {
          const payload =
            (!o.ok && oRes) ||
            (!p.ok && pRes) ||
            (!c.ok && cRes) ||
            (!b.ok && bRes);
          if (isAuthErrorPayload(payload)) return handleAuthFail();
          openError("Failed to load month data.");
        }

        setOrders(o.data || []);
        setPayments(p.data || []);
        setCustoms(c.data || []);
        setBudgets(b.data || []);
        setServerSummary(summaryRes?.summary || null);

      } catch (err) {
        openError("Failed to load month data.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  useEffect(() => {
    if (paymentMode !== "customers") return;
    if (!selectedMonth) return;
    loadPaymentCustomerOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMode, selectedMonth]);

  useEffect(() => {
    if (paymentMode !== "customers") return;
    if (!selectedMonth) return;
    const t = setTimeout(() => {
      loadPaymentCustomerOptions();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentCustomerSearch, paymentMode, selectedMonth]);

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
      const collect = Number(newOrderCollect || 0);
      if (!Number.isFinite(collect) || collect < 0) throw new Error("Amount to collect must be >= 0");

      const res = await addOrder(selectedMonth, newOrderName.trim(), newOrder, collect);
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to add order");
      }
      setOrders((prev) => [
        ...prev,
        {
          id: res.id,
          order_name: newOrderName.trim(),
          order_details: newOrder,
          amount_to_collect: collect,
          shein_total_weight_plus_2kg_sum: 0,
        },
      ]);
      setNewOrderName("");
      setNewOrder("");
      setNewOrderCollect("");
    } catch (err) {
      openError(err?.message || "Failed to add order.");
    }
  };

  const loadPaymentCustomerOptions = async () => {
    if (!selectedMonth) return;
    try {
      const res = await getPaymentCustomers(selectedMonth, paymentCustomerSearch);
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to load customers");
      }
      const rows = Array.isArray(res?.customers) ? res.customers : [];
      setPaymentCustomerOptions(rows);
    } catch (err) {
      openError(err?.message || "Failed to load customers for payment.");
    }
  };

  const togglePaymentCustomer = (customer) => {
    const id = Number(customer?.customer_id || 0);
    if (!id) return;
    setSelectedPaymentCustomers((prev) => {
      const idx = prev.findIndex((x) => Number(x.customer_id) === id);
      if (idx >= 0) return prev.filter((x) => Number(x.customer_id) !== id);
      return [
        ...prev,
        {
          customer_id: id,
          customer_name: customer?.customer_name || "",
          amount: Number(customer?.usd_to_collect || 0),
          delivery_charge: 0,
          order_name: customer?.order_name || "",
          cart_order_number: customer?.cart_order_number || "",
        },
      ];
    });
  };

  const setSelectedPaymentCustomerAmount = (customerId, nextVal) => {
    setSelectedPaymentCustomers((prev) =>
      prev.map((x) =>
        Number(x.customer_id) === Number(customerId)
          ? { ...x, amount: nextVal === "" ? "" : Number(nextVal) }
          : x
      )
    );
  };

  const setSelectedPaymentCustomerDeliveryCharge = (customerId, nextVal) => {
    setSelectedPaymentCustomers((prev) =>
      prev.map((x) =>
        Number(x.customer_id) === Number(customerId)
          ? { ...x, delivery_charge: nextVal === "" ? "" : Number(nextVal) }
          : x
      )
    );
  };

  const togglePaymentDetails = async (paymentId) => {
    const id = Number(paymentId || 0);
    if (!id) return;
    setOpenPaymentDetails((prev) => ({ ...prev, [id]: !prev[id] }));
    if (paymentItemsByPaymentId[id]) return;
    try {
      setPaymentItemsLoading((prev) => ({ ...prev, [id]: true }));
      const res = await getPaymentItems(id);
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to load payment items");
      }
      setPaymentItemsByPaymentId((prev) => ({
        ...prev,
        [id]: Array.isArray(res?.items) ? res.items : [],
      }));
    } catch (err) {
      openError(err?.message || "Failed to load payment customers.");
    } finally {
      setPaymentItemsLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const selectedCustomersOriginalTotal = useMemo(
    () =>
      selectedPaymentCustomers.reduce((sum, c) => {
        const n = Number(c.amount || 0);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [selectedPaymentCustomers]
  );

  const selectedCustomersDeliveryCharge = useMemo(
    () =>
      selectedPaymentCustomers.reduce((sum, c) => {
        const n = Number(c.delivery_charge || 0);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [selectedPaymentCustomers]
  );

  const selectedCustomersNetTotal = useMemo(
    () => selectedCustomersOriginalTotal - selectedCustomersDeliveryCharge,
    [selectedCustomersOriginalTotal, selectedCustomersDeliveryCharge]
  );

  const handleAddPayment = async () => {
    if (!selectedMonth) return;
    try {
      if (paymentMode === "manual") {
        if (!newPayment) return;
        const res = await addPayment(selectedMonth, newPayment);
        if (res?.ok === false || res?.success === false) {
          if (isAuthErrorPayload(res)) return handleAuthFail();
          throw new Error(res?.error || "Failed to add payment");
        }
        setPayments((prev) => [
          ...prev,
          {
            id: res.id,
            payment_amount: newPayment,
            payment_type: "manual",
            original_amount: null,
            delivery_charge: 0,
            customer_count: 0,
            note: null,
          },
        ]);
        setNewPayment("");
        return;
      }

      if (selectedPaymentCustomers.length === 0) {
        throw new Error("Select at least one customer.");
      }
      const invalidItem = selectedPaymentCustomers.find((x) => {
        const n = Number(x.amount);
        const d = Number(x.delivery_charge || 0);
        return !Number.isFinite(n) || n < 0 || !Number.isFinite(d) || d < 0 || d > n;
      });
      if (invalidItem) throw new Error("Each customer must have amount >= 0 and delivery charge between 0 and amount.");

      openConfirm({
        title: "Confirm Customer Payment",
        message:
          `Customers: ${selectedPaymentCustomers.length}\n` +
          `Original total: $${money(selectedCustomersOriginalTotal)}\n` +
          `Delivery charge: $${money(selectedCustomersDeliveryCharge)}\n` +
          `Net added payment: $${money(selectedCustomersNetTotal)}`,
        onYes: async () => {
          const payloadItems = selectedPaymentCustomers.map((x) => ({
            customer_id: Number(x.customer_id),
            customer_name: x.customer_name || "",
            amount: Number(x.amount || 0),
            delivery_charge: Number(x.delivery_charge || 0),
          }));
          const res = await addCustomerPayment({
            month_id: selectedMonth,
            customer_items: payloadItems,
            note: "Customer payment",
          });
          if (res?.ok === false || res?.success === false) {
            if (isAuthErrorPayload(res)) return handleAuthFail();
            throw new Error(res?.error || "Failed to add customer payment");
          }
          setPayments((prev) => [
            ...prev,
            {
              id: res.id,
              payment_amount: res.payment_amount ?? selectedCustomersNetTotal,
              payment_type: "customers",
              original_amount: res.original_amount ?? selectedCustomersOriginalTotal,
              delivery_charge: res.delivery_charge ?? selectedCustomersDeliveryCharge,
              customer_count: res.customer_count ?? selectedPaymentCustomers.length,
              customer_ids_json: res.customer_ids_json || null,
              note: res.note || "Customer payment",
            },
          ]);
          setSelectedPaymentCustomers([]);
          setPaymentCustomerSearch("");
        },
      });
    } catch (err) {
      openError(err?.message || "Failed to add payment.");
    }
  };

  const handleAddCustom = async () => {
    if (!newCustom || !selectedMonth) return;
    try {
      const fee = Number(newCustom);
      if (!Number.isFinite(fee) || fee < 0) throw new Error("Custom fee must be a valid number >= 0");
      const weight = newCustomWeight ? Number(newCustomWeight) : null;
      if (weight !== null && (!Number.isFinite(weight) || weight < 0)) {
        throw new Error("Weight must be a valid number >= 0.");
      }

      const res = await addCustom(selectedMonth, fee, {
        note: null,
        description: newCustomDescription,
        tracking_no: newCustomTracking.trim() || null,
        weight_kg: weight,
      });
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to add customs");
      }
      const refreshed = await getCustoms(selectedMonth);
      const norm = normalizeArrayResponse(refreshed);
      setCustoms(norm.data || []);
      setNewCustom("");
      setNewCustomWeight("");
      setNewCustomTracking("");
      setNewCustomDescription("benzene");
      const notifications = Array.isArray(res?.notifications) ? res.notifications.filter(Boolean) : [];
      if (notifications.length) {
        openError(notifications.join("\n"), "Customs Notice");
      }
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

  const handleUpdateOrder = async (id, name, value, amountToCollect = 0) => {
    try {
      const collect = Number(amountToCollect || 0);
      if (!Number.isFinite(collect) || collect < 0) throw new Error("Amount to collect must be >= 0");

      const res = await updateOrder(id, name, value, collect);
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to update order");
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, order_name: name, order_details: value, amount_to_collect: collect } : o))
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

  const handleUpdateCustom = async (id, value, note = null, tracking = undefined, weight = undefined) => {
    try {
      const customId = Number(id || 0);
      if (customId <= 0) return;
      const res = await updateCustom(customId, value, note, tracking, weight);
      if (res?.ok === false || res?.success === false) {
        if (isAuthErrorPayload(res)) return handleAuthFail();
        throw new Error(res?.error || "Failed to update customs");
      }
      setCustoms((prev) =>
        prev.map((c) => (c.id === customId ? {
          ...c,
          customs_fee: value,
          note,
          ...(tracking !== undefined ? { tracking_no: tracking } : {}),
          ...(weight !== undefined ? { weight_kg: weight } : {}),
        } : c))
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

  const totalBudget = useMemo(
    () => budgets.reduce((sum, b) => sum + Number(b.value || 0), 0),
    [budgets]
  );

  const totals = useMemo(() => {
    const totalOrders = orders.reduce((sum, o) => sum + Number(o.order_details || 0), 0);
    const totalCollect = orders.reduce((sum, o) => sum + Number(o.amount_to_collect || 0), 0);
    const totalActualWeightKg = customs.reduce((sum, c) => sum + Number(c.weight_kg || 0), 0);
    const customsWithWeight = customs.reduce((sum, c) => sum + (Number(c.weight_kg || 0) > 0 ? 1 : 0), 0);
    const totalEstimatedWeight = orders.reduce(
      (sum, o) => sum + Number(o.shein_total_weight_plus_2kg_sum || 0),
      0
    );
    const totalEstimatedShipping = totalEstimatedWeight * Number(kgPrice || 0);
    const totalEstimatedProfit = orders.reduce(
      (sum, o) =>
        sum +
        (
          Number(o.amount_to_collect || 0) -
          Number(o.order_details || 0) -
          (Number(o.shein_total_weight_plus_2kg_sum || 0) * Number(kgPrice || 0))
        ),
      0
    );
    const totalCustoms = serverSummary
      ? Number(serverSummary.customs_total || 0)
      : customs.reduce((sum, c) => sum + Number(c.customs_fee || 0), 0);
    const totalPayments = serverSummary
      ? Number(serverSummary.payments_total || 0)
      : payments.reduce((sum, p) => sum + Number(p.payment_amount || 0), 0);
    const totalLosses = serverSummary
      ? Number(serverSummary.loss_total || 0)
      : 0;
    const totalEstimatedProfitAfterLosses = totalEstimatedProfit - totalLosses;
    const realizedNetProfit = totalPayments - totalOrders - totalCustoms - totalLosses;
    const projectedProfit = totalCollect - totalOrders - totalCustoms - totalLosses;
    const profitMargin = totalCollect > 0 ? ((totalEstimatedProfitAfterLosses / totalCollect) * 100).toFixed(1) : "0.0";
    const collectionRate = totalCollect > 0 ? Math.min(100, Math.round((totalPayments / totalCollect) * 100)) : 0;
    return {
      totalOrders,
      totalCollect,
      totalEstimatedWeight,
      totalEstimatedShipping,
      totalActualWeightKg,
      customsWithWeight,
      totalEstimatedProfit,
      totalEstimatedProfitAfterLosses,
      realizedNetProfit,
      projectedProfit,
      profitMargin,
      collectionRate,
      totalCustoms,
      totalPayments,
      totalLosses,
    };
  }, [orders, customs, payments, kgPrice, serverSummary]);

  const netOutflow = totals.totalOrders + totals.totalCustoms - totals.totalPayments;
  const remainingBudget = totalBudget > 0 ? (totalBudget - netOutflow) : -netOutflow;
  const actualCash = totalBudget + totals.totalPayments - totals.totalOrders - totals.totalCustoms;

  return (
    <div className={`dashPage dashTopSpacer${readOnly ? " dashReadOnly" : ""}`}>
      {readOnly && <div className="dashReadOnlyNotice">Dashboard access is read-only. Contact an administrator for operational changes.</div>}
      <div className="dashHeader">
        <div className="dashHeaderLeft">
          <div className="dashTitleRow">
            <h1 className="dashTitle">Dashboard</h1>
            <span className="dashStatusPill">
              <span className="dashStatusDot" /> Live Ops
            </span>
          </div>
          <div className="dashSub">Logistics, customs balance, orders, and financial profit analytics.</div>
        </div>

        <div className="dashHeaderRight">
          <label className="dashLabel">Active Month Cycle</label>

          <CustomDropdown
            className="dashSelect"
            onChange={(e) => setSelectedMonth(String(e.target.value))}
            value={selectedMonth || ""}
            disabled={!Array.isArray(months) || months.length === 0}
            placeholder="-- Choose Month --"
            options={(Array.isArray(months) ? months : []).map((m) => ({
              value: String(m.id),
              label: `${m.name} (#${m.id})`,
            }))}
          />

          <div className="dashAddMonth">
            <input
              className="dashInput"
              value={newMonthName}
              onChange={(e) => setNewMonthName(e.target.value)}
              placeholder="New Month name..."
            />
            <button className="dashBtn" onClick={handleAddMonth}>
              + Add Month
            </button>
          </div>
        </div>
      </div>

      {/* Tier 1: Hero Financial KPIs */}
      <div className="dashSectionHeaderRow">
        <div className="dashSectionTitle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          Executive Financial Health
        </div>
      </div>

      <div className="dashHeroKpis">
        <StatCard
          hero
          title="Realized Net Profit"
          value={`${totals.realizedNetProfit >= 0 ? "+" : ""}$${money(totals.realizedNetProfit)}`}
          variant={totals.realizedNetProfit >= 0 ? "profit" : "loss"}
          subtitle="Net cash profit (Payments - Cost - Customs - Losses)"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          }
        />
        <StatCard
          hero
          title="Estimated Net Profit"
          value={`$${money(totals.totalEstimatedProfitAfterLosses)}`}
          variant="profit"
          subtitle="Net return after freight & deductions"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
        />
        <StatCard
          hero
          title="Confirmed Losses"
          value={`$${money(totals.totalLosses)}`}
          variant="loss"
          subtitle="Customer & cargo losses → View in Losses"
          onClick={() => nav("/losses")}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />
        <StatCard
          hero
          title="Actual Available Cash"
          value={`$${money(actualCash)}`}
          variant="cash"
          subtitle="Realized funds in hand"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <circle cx="12" cy="12" r="2" />
              <path d="M6 12h.01M18 12h.01" />
            </svg>
          }
        />
      </div>

      {/* Dedicated Profit & Loss Performance Matrix */}
      <div className="dashPnLCard">
        <div className="dashPnLCardHead">
          <div className="dashPnLCardHeadLeft">
            <div className="dashPnLBadge">P&L STATEMENT</div>
            <h3 className="dashPnLCardTitle">Profit & Loss Financial Performance</h3>
            <p className="dashPnLCardSub">Full reconciliation of collected payments, goods purchases, customs logistics, and customer losses.</p>
          </div>
          <div className="dashPnLCardHeadRight">
            <button type="button" className="dashBtnSoft" onClick={() => nav("/losses")} title="Open Losses Workspace">
              📉 Losses Workspace (${money(totals.totalLosses)}) →
            </button>
            <button type="button" className="dashBtnSoft" onClick={() => nav("/reports")} title="Open Comprehensive Reports">
              📊 Full Reports →
            </button>
          </div>
        </div>

        <div className="dashPnLGrid">
          {/* Revenue Stream */}
          <div className="dashPnLCol">
            <div className="dashPnLColHeader">
              <span className="dashPnLPill dashPnLPillGreen">Revenue & Collections</span>
              <div className="dashPnLMetricTitle">Total Orders To Collect</div>
              <div className="dashPnLMetricNumber">${money(totals.totalCollect)}</div>
            </div>
            <div className="dashPnLDetails">
              <div className="dashPnLItem">
                <span>Payments Actually Collected</span>
                <b className="dashTextGood">+${money(totals.totalPayments)}</b>
              </div>
              <div className="dashPnLItem">
                <span>Outstanding Uncollected</span>
                <b className="dashTextMuted">${money(Math.max(0, totals.totalCollect - totals.totalPayments))}</b>
              </div>
              <div className="dashPnLItem">
                <span>Collection Progress</span>
                <b>{totals.collectionRate}%</b>
              </div>
            </div>
          </div>

          {/* Outflow & Losses Stream */}
          <div className="dashPnLCol">
            <div className="dashPnLColHeader">
              <span className="dashPnLPill dashPnLPillRed">Deductions & Losses</span>
              <div className="dashPnLMetricTitle">Total Costs & Losses</div>
              <div className="dashPnLMetricNumber">-${money(totals.totalOrders + totals.totalCustoms + totals.totalLosses)}</div>
            </div>
            <div className="dashPnLDetails">
              <div className="dashPnLItem">
                <span>Orders Goods Cost</span>
                <b className="dashTextDanger">-${money(totals.totalOrders)}</b>
              </div>
              <div className="dashPnLItem">
                <span>Customs & Freight Fee</span>
                <b className="dashTextDanger">-${money(totals.totalCustoms)}</b>
              </div>
              <div className="dashPnLItem" onClick={() => nav("/losses")} style={{ cursor: "pointer" }} title="Open Losses Workspace">
                <span style={{ textDecoration: "underline", color: "#dc2626" }}>Confirmed Losses ↗</span>
                <b className="dashTextDanger">-${money(totals.totalLosses)}</b>
              </div>
              <div className="dashPnLItem">
                <span>Est. Freight Shipping</span>
                <span className="dashTextMuted">${money(totals.totalEstimatedShipping)} ({Number(totals.totalEstimatedWeight || 0).toFixed(2)}kg)</span>
              </div>
            </div>
          </div>

          {/* Net Profit Bottom Line */}
          <div className="dashPnLCol dashPnLColHighlight">
            <div className="dashPnLColHeader">
              <span className="dashPnLPill dashPnLPillBlue">Net Bottom Line</span>
              <div className="dashPnLMetricTitle">Realized Net Profit (Collected)</div>
              <div className={`dashPnLMetricNumber ${totals.realizedNetProfit >= 0 ? "dashTextGood" : "dashTextDanger"}`}>
                {totals.realizedNetProfit >= 0 ? "+" : ""}${money(totals.realizedNetProfit)}
              </div>
            </div>
            <div className="dashPnLDetails">
              <div className="dashPnLItem">
                <span>Profit Calculation Formula</span>
                <small style={{ fontSize: "11px", color: "#64748b" }}>Payments - Orders - Customs - Losses</small>
              </div>
              <div className="dashPnLItem">
                <span>Estimated Final Net Profit</span>
                <b className={totals.totalEstimatedProfitAfterLosses >= 0 ? "dashTextGood" : "dashTextDanger"}>
                  ${money(totals.totalEstimatedProfitAfterLosses)}
                </b>
              </div>
              <div className="dashPnLItem">
                <span>Gross Profit (Before Losses)</span>
                <b>${money(totals.totalEstimatedProfit)}</b>
              </div>
              <div className="dashPnLItem">
                <span>Estimated Net Margin</span>
                <b>{totals.profitMargin}%</b>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tier 2: Secondary Operational & Balance Metrics */}
      <div className="dashSectionHeaderRow">
        <div className="dashSectionTitle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          Operational Pipeline & Liquidity Matrix
        </div>
      </div>

      <div className="dashSecondaryStats">
        <StatCard
          title="Orders Goods Cost"
          value={`$${money(totals.totalOrders)}`}
          variant="orders"
          subtitle={`${orders.length} order${orders.length !== 1 ? "s" : ""}`}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          }
        />
        <StatCard
          title="Orders To Collect"
          value={`$${money(totals.totalCollect)}`}
          variant="collect"
          subtitle={`Expected revenue across ${orders.length} order(s)`}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
        />
        <StatCard
          title="Est. vs Actual Weight"
          value={`${Number(totals.totalEstimatedWeight || 0).toFixed(2)} / ${Number(totals.totalActualWeightKg || 0).toFixed(2)} kg`}
          variant="weight"
          subtitle={`Shipping rate: $${money(kgPrice)}/kg ($${money(totals.totalEstimatedShipping)})`}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          }
        />
        <StatCard
          title="Customs & Freight"
          value={`$${money(totals.totalCustoms)}`}
          variant="customs"
          subtitle={`${customs.length} recorded entries`}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          }
        />
        <StatCard
          title="Payments Collected"
          value={`$${money(serverSummary?.payments_total ?? totals.totalPayments)}`}
          variant="payments"
          subtitle={`${serverSummary?.payment_count ?? payments.length} payment records`}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          }
        />
        <StatCard
          title="Remaining Budget"
          value={`$${money(remainingBudget)}`}
          variant={remainingBudget >= 0 ? "profit" : "remaining"}
          subtitle={totalBudget > 0 ? `From $${money(totalBudget)} total budget` : "Net cash position (no budget set)"}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
        />
      </div>

      <div className="dashSecondaryStats">
        <div onClick={() => nav("/delivery")} style={{ cursor: "pointer" }} title="Open Delivery Workspace">
          <StatCard
            title="Ready for Delivery"
            value={serverSummary?.ready_customer_count ?? serverSummary?.received_customer_count ?? "-"}
            variant="collect"
            subtitle={`$${money(serverSummary?.uncollected_customer_total)} unlocked → Open Delivery`}
          />
        </div>
        <div onClick={() => nav("/delivery")} style={{ cursor: "pointer" }} title="Open Delivery Workspace">
          <StatCard
            title="Assigned to Courier"
            value={serverSummary?.assigned_customer_count ?? "-"}
            variant="orders"
            subtitle={`$${money(serverSummary?.assigned_customer_total)} in delivery →`}
          />
        </div>
        <div onClick={() => nav("/cargo")} style={{ cursor: "pointer" }} title="Open Cargo Receipts">
          <StatCard
            title="Cargo Shipments"
            value={`${serverSummary?.carts_with_receipts ?? 0} / ${serverSummary?.total_carts_count ?? 0}`}
            variant="weight"
            subtitle="Carts with received tracking → Open Cargo"
          />
        </div>
        <StatCard
          title="Payment Reconciliation"
          value={`$${money(serverSummary?.reconciliation?.payment_collection_difference)}`}
          variant="payments"
          subtitle="Payments total minus customer collections"
        />
      </div>

      {/* Tier 3: Workspaces & Registry */}
      <div className="dashSectionHeaderRow">
        <div className="dashSectionTitle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          Operations & Treasury Workspaces
        </div>
      </div>

      <div className="dashWorkspace">
        {/* Column 1: Orders & Customs Operations */}
        <div className="dashWorkspaceCol">
          {/* Orders */}
          <SectionCard
            title="Orders"
            subtitle="Order name, amount, and amount to collect"
            badge={`${orders.length} orders`}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            }
          >
            <div className="dashOrdersTop">
              <div>
                <div className="dashFormRow dashOrderFormRow">
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
                  <input
                    className="dashInput"
                    type="number"
                    value={newOrderCollect}
                    onChange={(e) => setNewOrderCollect(e.target.value)}
                    placeholder="Amount To Collect"
                  />
                  <button className="dashBtn" onClick={handleAddOrder}>
                    Add
                  </button>
                </div>
              </div>
            </div>

            <List>
              {orders.map((o) => (
                <AccordionItem
                  key={o.id}
                  header={
                    <div className="dashAccHeaderContent">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div className="dashAccTitle">{o.order_name || "Order"}</div>
                        <button
                          type="button"
                          className="dashBtnSoft"
                          style={{ padding: "4px 10px", fontSize: "12px", gap: "4px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            nav("/orders");
                          }}
                          title="Navigate immediately to Orders workspace"
                        >
                          <span>Open in Orders</span>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                        </button>
                      </div>
                      <div className="dashAccMetaRow">
                        <span className="dashAccPill">Cost: ${money(o.order_details)}</span>
                        <span className="dashAccPill">Collect: ${money(o.amount_to_collect)}</span>
                        <span className="dashAccPill">
                          Est. Weight: {Number(o.shein_total_weight_plus_2kg_sum || 0).toFixed(3)} kg
                        </span>
                        <span className="dashAccPill">
                          Carts: {Number(o.carts_count || 0)}
                        </span>
                        <span className="dashAccPill">
                          Customers: {Number(o.cart_customers_count || o.customer_count || 0)}
                        </span>
                      </div>
                    </div>
                  }
                >
                  <div className="dashAccFormGrid dashOrderGrid">
                    <div className="dashOrderInputsLine">
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
                        onBlur={(e) => handleUpdateOrder(o.id, e.target.value, o.order_details, o.amount_to_collect)}
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
                        onBlur={(e) => handleUpdateOrder(o.id, o.order_name, e.target.value, o.amount_to_collect)}
                      />
                      <input
                        className="dashInput"
                        type="number"
                        value={o.amount_to_collect ?? ""}
                        onChange={(e) =>
                          setOrders((prev) =>
                            prev.map((ord) =>
                              ord.id === o.id ? { ...ord, amount_to_collect: e.target.value } : ord
                            )
                          )
                        }
                        onBlur={(e) => handleUpdateOrder(o.id, o.order_name, o.order_details, e.target.value)}
                      />
                    </div>
                    <div className="dashOrderMetricsLine">
                      <div className="dashInlineMetric">
                        Est. Weight: {Number(o.shein_total_weight_plus_2kg_sum || 0).toFixed(3)} kg
                      </div>
                      <div className="dashInlineMetric">
                        Shipping: $
                        {money(
                          Number(o.shein_total_weight_plus_2kg_sum || 0) * Number(kgPrice || 0)
                        )}
                      </div>
                      <div
                        className="dashInlineMetric"
                        style={{
                          color:
                            Number(o.amount_to_collect || 0) -
                              Number(o.order_details || 0) -
                              (Number(o.shein_total_weight_plus_2kg_sum || 0) * Number(kgPrice || 0)) >=
                            0
                              ? "#059669"
                              : "#dc2626",
                          fontWeight: 700,
                        }}
                      >
                        Est. Profit: $
                        {money(
                          Number(o.amount_to_collect || 0) -
                            Number(o.order_details || 0) -
                            (Number(o.shein_total_weight_plus_2kg_sum || 0) * Number(kgPrice || 0))
                        )}
                      </div>
                    </div>
                    <div className="dashOrderActionsLine" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="dashBtn"
                        onClick={() => nav("/orders")}
                        title="Navigate immediately to Orders workspace"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        <span>Open Orders Workspace</span>
                      </button>

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
                    </div>
                  </div>
                </AccordionItem>
              ))}
            </List>
          </SectionCard>

          {/* Customs */}
          <SectionCard
            title="Customs"
            subtitle="Track customs fees"
            badge={`${customs.length} entries`}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            }
          >
            <div className="dashMiniStats" style={{ marginBottom: 10 }}>
              <div className="dashMiniStat">
                <div className="dashMiniTitle">Actual Weight Sum</div>
                <div className="dashMiniValue">{Number(totals.totalActualWeightKg || 0).toFixed(3)} kg</div>
              </div>
              <div className="dashMiniStat">
                <div className="dashMiniTitle">Entries With Weight</div>
                <div className="dashMiniValue">
                  {totals.customsWithWeight} / {customs.length}
                </div>
              </div>
            </div>

            <div className="dashFormRow" style={{ flexWrap: "wrap", gap: "8px" }}>
              <input
                className="dashInput"
                type="number"
                step="0.01"
                min="0"
                style={{ minWidth: "110px", flex: 1 }}
                value={newCustom}
                onChange={(e) => setNewCustom(e.target.value)}
                placeholder="Custom Fee ($)"
              />
              <input
                className="dashInput"
                type="number"
                step="0.001"
                min="0"
                style={{ minWidth: "100px", flex: 1 }}
                value={newCustomWeight}
                onChange={(e) => setNewCustomWeight(e.target.value)}
                placeholder="Weight (kg)"
              />
              <input
                className="dashInput"
                style={{ minWidth: "130px", flex: 1.2 }}
                value={newCustomTracking}
                onChange={(e) => setNewCustomTracking(e.target.value)}
                placeholder="Tracking # (optional)"
              />
              <CustomDropdown
                className="dashInput"
                style={{ minWidth: "100px", flex: 1 }}
                value={newCustomDescription}
                onChange={(e) => setNewCustomDescription(e.target.value)}
                options={[
                  { value: "benzene", label: "benzene" },
                  { value: "bags", label: "bags" },
                  { value: "freight", label: "freight" },
                  { value: "customs", label: "customs" },
                  { value: "other", label: "other" },
                ]}
              />
              <button className="dashBtn" onClick={handleAddCustom}>
                + Add
              </button>
            </div>
            <List>
              {customs.map((c) => (
                <AccordionItem
                  key={c.id}
                  header={
                    <div className="dashAccHeaderContent">
                      <div className="dashAccTitle">
                        Custom Fee: ${money(c.customs_fee)}
                        {Number(c.weight_kg || 0) > 0 ? ` | ${Number(c.weight_kg).toFixed(3)} kg` : ""}
                      </div>
                      <div className="dashAccMetaRow">
                        <span className="dashAccPill">Desc: {c.description || "benzene"}</span>
                        {c.tracking_no && <span className="dashAccPill">Track: {c.tracking_no}</span>}
                        {c.note && <span className="dashAccPill">{c.note}</span>}
                        <span className="dashAccPill">
                          {[
                            c.cart_ref || null,
                            c.order_ref || null,
                          ]
                            .filter(Boolean)
                            .join(" | ") || "-"}
                        </span>
                      </div>
                    </div>
                  }
                >
                  <div className="dashAccFormGrid dashCustomGrid" style={{ gridTemplateColumns: "1fr 1fr 1.5fr auto", gap: "8px" }}>
                    <input
                      className="dashInput"
                      type="number"
                      step="0.01"
                      value={c.customs_fee}
                      onChange={(e) =>
                        setCustoms((prev) =>
                          prev.map((cu) =>
                            cu.id === c.id ? { ...cu, customs_fee: e.target.value } : cu
                          )
                        )
                      }
                      onBlur={(e) => handleUpdateCustom(c.id, e.target.value, c.note || null, c.tracking_no || undefined, c.weight_kg || undefined)}
                      placeholder="Fee ($)"
                    />
                    <input
                      className="dashInput"
                      type="number"
                      step="0.001"
                      value={c.weight_kg ?? ""}
                      onChange={(e) =>
                        setCustoms((prev) =>
                          prev.map((cu) =>
                            cu.id === c.id ? { ...cu, weight_kg: e.target.value } : cu
                          )
                        )
                      }
                      onBlur={(e) => handleUpdateCustom(c.id, c.customs_fee, c.note || null, c.tracking_no || undefined, e.target.value)}
                      placeholder="Weight (kg)"
                    />
                    <input
                      className="dashInput"
                      value={c.note || ""}
                      onChange={(e) =>
                        setCustoms((prev) =>
                          prev.map((cu) =>
                            cu.id === c.id ? { ...cu, note: e.target.value } : cu
                          )
                        )
                      }
                      onBlur={(e) => handleUpdateCustom(c.id, c.customs_fee, e.target.value, c.tracking_no || undefined, c.weight_kg || undefined)}
                      placeholder="Reference / note"
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
                  </div>
                </AccordionItem>
              ))}
            </List>
          </SectionCard>
        </div>

        {/* Column 2: Budgets, Payments & Universal Rates */}
        <div className="dashWorkspaceCol">
          {/* Budgets */}
          <SectionCard
            title="Budgets"
            subtitle="Track starting budget and monthly entries"
            badge={`${budgets.length} entries`}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
            }
          >
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
                <AccordionItem
                  key={b.id}
                  header={
                    <div className="dashAccHeaderContent">
                      <div className="dashAccTitle">{b.description || "Budget Item"}</div>
                      <div className="dashAccMetaRow">
                        <span className="dashAccPill">Value: ${money(b.value)}</span>
                      </div>
                    </div>
                  }
                >
                  <div className="dashAccFormGrid dashBudgetGrid">
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
                  </div>
                </AccordionItem>
              ))}
            </List>
          </SectionCard>

          {/* Payments */}
          <SectionCard
            title="Payments"
            subtitle="Track payments made"
            badge={`${payments.length} payments`}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            }
          >
            <div className="dashModeRow">
              <button
                type="button"
                className={paymentMode === "manual" ? "dashModeBtn dashModeBtnActive" : "dashModeBtn"}
                onClick={() => setPaymentMode("manual")}
              >
                Manual Entry
              </button>
              <button
                type="button"
                className={paymentMode === "customers" ? "dashModeBtn dashModeBtnActive" : "dashModeBtn"}
                onClick={() => setPaymentMode("customers")}
              >
                By Customers
              </button>
            </div>

            {paymentMode === "manual" ? (
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
            ) : (
              <div className="dashCustomerPayWrap">
                <div className="dashCustomerSearchRow">
                  <input
                    className="dashInput"
                    value={paymentCustomerSearch}
                    onChange={(e) => setPaymentCustomerSearch(e.target.value)}
                    placeholder="Search customer, cart, order, delivery number"
                  />
                </div>

                <div className="dashCustomerDropdown">
                  <div className="dashCustomerDropdownHead">
                    <div>Select</div>
                    <div>Customer</div>
                    <div>Amount</div>
                    <div>Cart</div>
                    <div>Order</div>
                  </div>
                  {paymentCustomerOptions.map((c) => {
                    const cid = Number(c.customer_id);
                    const checked = selectedPaymentCustomers.some((x) => Number(x.customer_id) === cid);
                    return (
                      <label key={cid} className="dashCustomerOption">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePaymentCustomer(c)}
                        />
                        <span className="dashCustomerCol">{c.customer_name || "(empty)"}</span>
                        <span className="dashCustomerCol">${money(c.usd_to_collect)}</span>
                        <span className="dashCustomerCol">{c.cart_order_number || "-"}</span>
                        <span className="dashCustomerCol">{c.order_name || "-"}</span>
                      </label>
                    );
                  })}
                </div>

                {selectedPaymentCustomers.length > 0 ? (
                  <div className="dashSelectedCustomers">
                    {selectedPaymentCustomers.map((c) => (
                      <div key={c.customer_id} className="dashSelectedCustomerRow">
                        <div className="dashSelectedCustomerName">
                          {c.customer_name || "(empty)"} | Cart: {c.cart_order_number || "-"} | Order: {c.order_name || "-"}
                        </div>
                        <input
                          className="dashInput"
                          type="number"
                          min="0"
                          step="0.01"
                          value={c.amount}
                          onChange={(e) => setSelectedPaymentCustomerAmount(c.customer_id, e.target.value)}
                        />
                        <input
                          className="dashInput"
                          type="number"
                          min="0"
                          step="0.01"
                          value={c.delivery_charge ?? 0}
                          onChange={(e) => setSelectedPaymentCustomerDeliveryCharge(c.customer_id, e.target.value)}
                          placeholder="Delivery"
                        />
                        <button
                          className="dashBtnDanger"
                          onClick={() =>
                            setSelectedPaymentCustomers((prev) =>
                              prev.filter((x) => Number(x.customer_id) !== Number(c.customer_id))
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="dashCustomerTotals">
                  <div className="dashMiniStat">
                    <div className="dashMiniTitle">Original Total</div>
                    <div className="dashMiniValue">${money(selectedCustomersOriginalTotal)}</div>
                  </div>
                  <div className="dashMiniStat">
                    <div className="dashMiniTitle">Delivery Charge Total</div>
                    <div className="dashMiniValue">${money(selectedCustomersDeliveryCharge)}</div>
                  </div>
                  <div className="dashMiniStat">
                    <div className="dashMiniTitle">Net Payment</div>
                    <div className="dashMiniValue">${money(selectedCustomersNetTotal)}</div>
                  </div>
                </div>

                <button className="dashBtn" onClick={handleAddPayment}>
                  Confirm Add Customer Payment
                </button>
              </div>
            )}

            <List>
              {payments.map((p) => (
                <AccordionItem
                  key={p.id}
                  header={
                    <div className="dashAccHeaderContent">
                      <div className="dashAccTitle">Payment ${money(p.payment_amount)}</div>
                      <div className="dashAccMetaRow">
                        <span className="dashAccPill">Type: {p.payment_type || "manual"}</span>
                        {String(p.payment_type || "manual") === "customers" ? (
                          <>
                            <span className="dashAccPill">Original: ${money(p.original_amount)}</span>
                            <span className="dashAccPill">Delivery: ${money(p.delivery_charge)}</span>
                            <span className="dashAccPill">Customers: {Number(p.customer_count || 0)}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  }
                >
                  <div className="dashAccFormGrid dashPaymentGrid">
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
                      disabled={String(p.payment_type || "manual") !== "manual"}
                    />
                    <div className="dashPaymentActions">
                      {String(p.payment_type || "manual") === "customers" ? (
                        <button className="dashBtnSoft" onClick={() => togglePaymentDetails(p.id)}>
                          {openPaymentDetails[p.id] ? "Hide Customers" : "Show Customers"}
                        </button>
                      ) : null}
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
                    </div>
                  </div>

                  {openPaymentDetails[p.id] ? (
                    <div className="dashPaymentDetails">
                      {paymentItemsLoading[p.id] ? (
                        <div className="dashRefText">Loading customers...</div>
                      ) : (paymentItemsByPaymentId[p.id] || []).length === 0 ? (
                        <div className="dashRefText">No customers linked to this payment.</div>
                      ) : (
                        <div className="dashTableWrap">
                          <table className="dashTable">
                            <thead>
                              <tr>
                                <th>Customer</th>
                                <th>Amount</th>
                                <th>Delivery</th>
                                <th>Net</th>
                                <th>Cart</th>
                                <th>Order</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(paymentItemsByPaymentId[p.id] || []).map((it) => (
                                <tr key={it.id}>
                                  <td>{it.customer_name_snapshot || "(empty)"}</td>
                                  <td>${money(it.amount)}</td>
                                  <td>${money(it.delivery_charge)}</td>
                                  <td>${money(it.net_amount)}</td>
                                  <td>{it.cart_order_number || "-"}</td>
                                  <td>{it.order_name || "-"}</td>
                                  <td>{it.status || "-"} / {it.delivery_status || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : null}
                </AccordionItem>
              ))}
            </List>
          </SectionCard>

          {/* KG Price */}
          <SectionCard
            title="KG Price"
            subtitle="Universal shipping cost per 1kg used in profit calculation"
            badge="Rate"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            }
          >
            <div className="dashKgRow">
              <input
                className="dashInput"
                type="number"
                min="0"
                step="0.01"
                value={kgPrice}
                onChange={(e) => setKgPrice(e.target.value)}
                placeholder="Price of 1kg"
                onBlur={handleSaveKgPrice}
              />
              <button className="dashBtn" onClick={handleSaveKgPrice}>
                Save KG Price
              </button>
            </div>
            <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--muted, #64748b)" }}>
              Estimated Shipping Cost: {Number(totals.totalEstimatedWeight || 0).toFixed(2)} kg × ${money(kgPrice)} = <strong style={{ color: "var(--text, #0f172a)" }}>${money(totals.totalEstimatedShipping)}</strong>
            </div>
          </SectionCard>
        </div>
      </div>

      <CustomModal {...modal} />
      <CustomModal {...confirm} />
    </div>
  );
}

/* ---------- small UI components ---------- */

function StatCard({ title, value, variant = "neutral", subtitle, icon, hero = false, onClick, style }) {
  return (
    <div
      className={`dashStat dashStat--${variant} ${hero ? "dashStat--hero" : ""}`}
      onClick={onClick}
      style={{ ...(onClick ? { cursor: "pointer" } : {}), ...style }}
    >
      <div className="dashStatHead">
        <span className="dashStatTitle">{title}</span>
        {icon && <span className="dashStatIconWrap">{icon}</span>}
      </div>
      <div className="dashStatValue">{value}</div>
      {subtitle && <div className="dashStatSubText">{subtitle}</div>}
    </div>
  );
}

function SectionCard({ title, subtitle, badge, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`dashCard ${open ? "dashCardOpen" : ""}`}>
      <button type="button" className="dashCardHead dashCardHeadBtn" onClick={() => setOpen((v) => !v)}>
        <div className="dashCardHeadInfo">
          <div className="dashCardTitleRow">
            {icon && <span className="dashCardHeadIcon">{icon}</span>}
            <div className="dashCardTitle">{title}</div>
            {badge && <span className="dashCardBadge">{badge}</span>}
          </div>
          {subtitle ? <div className="dashCardSub">{subtitle}</div> : null}
        </div>
        <span className={`dashAccChevron ${open ? "dashAccChevronOpen" : ""}`} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      <div className={open ? "dashSectionBody dashSectionBodyOpen" : "dashSectionBody"}>
        <div className="dashCardBody">{children}</div>
      </div>
    </div>
  );
}

function List({ children }) {
  return <div className="dashList">{children}</div>;
}

function AccordionItem({ header, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`dashAccItem ${open ? "dashAccItemOpen" : ""}`}>
      <button type="button" className="dashAccBtn" onClick={() => setOpen((v) => !v)}>
        <div className="dashAccHeader">{header}</div>
        <span className={`dashAccChevron ${open ? "dashAccChevronOpen" : ""}`} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      <div className={open ? "dashAccBody dashAccBodyOpen" : "dashAccBody"}>
        <div className="dashAccInner">{children}</div>
      </div>
    </div>
  );
}
