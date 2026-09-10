import { useEffect, useRef, useState } from "react";
import { getMonths } from "../api/monthApi";
import { addLoss, getLossOrderCustomers, listLosses, reverseLoss, searchLossOrders, updateLoss } from "../api/lossesApi";
import "../operations.css";

const money = (value) => Number(value || 0).toFixed(2);

export default function LossesWorkspace() {
  const [months, setMonths] = useState([]);
  const [monthId, setMonthId] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [orders, setOrders] = useState([]);
  const [order, setOrder] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [lossType, setLossType] = useState("out of stock item");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("active");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingMonths, setLoadingMonths] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mutatingId, setMutatingId] = useState(null);
  const customerRequest = useRef(0);

  useEffect(() => {
    let active = true;
    getMonths()
      .then((response) => {
        if (!active) return;
        const list = Array.isArray(response) ? response : [];
        setMonths(list);
        if (list.length) setMonthId(String(list[0].id));
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load months.");
      })
      .finally(() => {
        if (active) setLoadingMonths(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!monthId) {
      setOrders([]);
      setLoadingOrders(false);
      return undefined;
    }
    let active = true;
    setLoadingOrders(true);
    setOrders([]);
    const timer = setTimeout(async () => {
      try {
        const response = await searchLossOrders(monthId, orderQuery);
        if (active) setOrders(Array.isArray(response?.orders) ? response.orders : []);
      } catch (err) {
        if (active) {
          setOrders([]);
          setError(err.message || "Failed to search orders.");
        }
      } finally {
        if (active) setLoadingOrders(false);
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [monthId, orderQuery]);

  useEffect(() => {
    if (!monthId) {
      setRows([]);
      setLoadingRows(false);
      return undefined;
    }
    let active = true;
    setLoadingRows(true);
    setRows([]);
    const loadRows = async () => {
      try {
        const response = await listLosses(monthId, query, status);
        if (active) setRows(Array.isArray(response?.losses) ? response.losses : []);
      } catch (err) {
        if (active) {
          setRows([]);
          setError(err.message || "Failed to load losses.");
        }
      } finally {
        if (active) setLoadingRows(false);
      }
    };
    loadRows();
    return () => { active = false; };
  }, [monthId, query, status]);

  const chooseOrder = async (nextOrder) => {
    const requestId = customerRequest.current + 1;
    customerRequest.current = requestId;
    setOrder(nextOrder);
    setCustomerId("");
    setCustomers([]);
    setLoadingCustomers(true);
    setError("");
    try {
      const response = await getLossOrderCustomers(nextOrder.order_id);
      if (requestId === customerRequest.current) {
        setCustomers(Array.isArray(response?.customers) ? response.customers : []);
      }
    } catch (err) {
      if (requestId === customerRequest.current) {
        setCustomers([]);
        setError(err.message || "Failed to load order customers.");
      }
    } finally {
      if (requestId === customerRequest.current) setLoadingCustomers(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    const numericAmount = Number(amount);
    if (!order || !customerId || !lossType.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Select an order and customer, then enter a positive loss amount.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await addLoss({ month_id: Number(monthId), order_id: Number(order.order_id), customer_id: Number(customerId), loss_type: lossType, amount: numericAmount, description });
      setAmount("");
      setDescription("");
      setNotice("Loss saved against the selected order and customer.");
      const response = await listLosses(monthId, query, status);
      setRows(Array.isArray(response?.losses) ? response.losses : []);
    } catch (err) {
      setError(err.message || "Failed to save loss.");
    } finally {
      setSaving(false);
    }
  };

  const edit = async (row) => {
    if (mutatingId === row.id) return;
    setMutatingId(row.id);
    const nextAmount = window.prompt("Loss amount", String(row.amount));
    if (nextAmount === null) { setMutatingId(null); return; }
    const nextDescription = window.prompt("Description", row.description || "");
    if (nextDescription === null) { setMutatingId(null); return; }
    try {
      await updateLoss({ id: row.id, loss_type: row.loss_type, amount: Number(nextAmount), description: nextDescription });
      const response = await listLosses(monthId, query, status);
      setRows(Array.isArray(response?.losses) ? response.losses : []);
    } catch (err) {
      setError(err.message || "Failed to edit loss.");
    } finally {
      setMutatingId(null);
    }
  };

  const reverse = async (row) => {
    if (mutatingId === row.id) return;
    setMutatingId(row.id);
    const reason = window.prompt("Reason for reversal", "");
    if (reason === null) { setMutatingId(null); return; }
    try {
      await reverseLoss({ id: row.id, reason });
      const response = await listLosses(monthId, query, status);
      setRows(Array.isArray(response?.losses) ? response.losses : []);
      setNotice("Loss reversed and retained in history.");
    } catch (err) {
      setError(err.message || "Failed to reverse loss.");
    } finally {
      setMutatingId(null);
    }
  };

  const listLoading = loadingMonths || loadingRows;
  const orderListLoading = loadingMonths || loadingOrders;

  return (
    <main className="opsPage">
      <div className="opsHeader">
        <div>
          <p className="opsEyebrow">Operations / Losses</p>
          <h1>Order-first losses</h1>
          <p className="opsMuted">Search an existing order, choose one of its customers, and record the loss with an auditable relationship.</p>
        </div>
        <label>
          Month
          <select disabled={loadingMonths} value={monthId} onChange={(event) => { setMonthId(event.target.value); setOrder(null); setCustomers([]); }}>
            {months.map((month) => <option key={month.id} value={month.id}>{month.name} (#{month.id})</option>)}
          </select>
        </label>
      </div>

      {error && <div className="opsAlert opsAlertError">{error}</div>}
      {notice && <div className="opsAlert opsAlertSuccess">{notice}</div>}

      <section className="opsCard">
        <div className="opsSectionTitle"><div><h2>Find an order</h2><p className="opsMuted">Only orders from the selected month and authenticated account are searchable.</p></div></div>
        <input className="opsWideInput" value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder="Order name, order number, or details" />
        {orderListLoading ? <div className="opsEmpty">Searching orders...</div> : !orders.length ? <div className="opsEmpty">No orders match this search.</div> : (
          <div className="opsChoiceList">
            {orders.map((nextOrder) => <button type="button" className={order?.order_id === nextOrder.order_id ? "opsChoice opsChoiceActive" : "opsChoice"} key={nextOrder.order_id} onClick={() => chooseOrder(nextOrder)}><strong>{nextOrder.order_name || `Order #${nextOrder.order_id}`}</strong><span>#{nextOrder.order_id}</span></button>)}
          </div>
        )}
        {order && <div className="opsSelectedContext">
          <strong>Selected: {order.order_name || `Order #${order.order_id}`}</strong>
          <select value={customerId} disabled={loadingCustomers} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">{loadingCustomers ? "Loading customers..." : customers.length ? "Choose affected customer" : "No customers found"}</option>
            {customers.map((customer) => <option key={customer.customer_id} value={customer.customer_id}>{customer.customer_name || "(empty)"} · cart {customer.cart_order_number || customer.cart_id}</option>)}
          </select>
          <form className="opsInlineForm" onSubmit={save}>
            <select value={lossType} onChange={(event) => setLossType(event.target.value)}><option>out of stock item</option><option>delivery charge</option><option>damaged item</option><option>other</option></select>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" />
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" />
            <button disabled={saving || loadingCustomers}>{saving ? "Saving..." : "Save loss"}</button>
          </form>
        </div>}
      </section>

      <section className="opsCard">
        <div className="opsToolbar">
          <div><h2>Loss history</h2><p className="opsMuted">{listLoading ? "Loading..." : `${rows.length} matching record(s)`}</p></div>
          <div className="opsToolbarActions"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search losses" /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Active</option><option value="reversed">Reversed</option><option value="all">All</option></select></div>
        </div>
        {listLoading ? <div className="opsEmpty">Loading losses...</div> : !rows.length ? <div className="opsEmpty">No losses match this filter.</div> : (
          <div className="opsTableWrap">
            <table className="opsTable">
              <thead><tr><th>Order</th><th>Customer</th><th>Type</th><th>Amount</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.id}><td>{row.order_name_snapshot || `#${row.order_id}`}<small>Cart {row.cart_order_number_snapshot || row.cart_id}</small></td><td>{row.customer_name_snapshot || `#${row.customer_id}`}</td><td>{row.loss_type}</td><td><strong>${money(row.amount)}</strong></td><td>{row.description || "-"}</td><td>{row.reversed_at ? `Reversed ${row.reversed_at}` : "Active"}</td><td>{!row.reversed_at && <><button disabled={mutatingId === row.id} onClick={() => edit(row)}>{mutatingId === row.id ? "Saving..." : "Edit"}</button><button disabled={mutatingId === row.id} onClick={() => reverse(row)}>{mutatingId === row.id ? "Saving..." : "Reverse"}</button></>}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
