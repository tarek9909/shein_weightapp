import { useEffect, useMemo, useState } from "react";
import { getMonths } from "../api/monthApi";
import {
  addDeliveryChargePreset,
  assignDeliveries,
  collectDeliveries,
  deleteDeliveryChargePreset,
  getDeliveryChargePresets,
  getDeliveryCustomers,
  revertDeliveries,
  updateDeliveryChargePreset,
} from "../api/deliveryApi";
import "../operations.css";

const money = (value) => Number(value || 0).toFixed(2);

export default function DeliveryWorkspace() {
  const [months, setMonths] = useState([]);
  const [monthId, setMonthId] = useState("");
  const [status, setStatus] = useState("ready");
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [presets, setPresets] = useState([]);
  const [selected, setSelected] = useState([]);
  const [method, setMethod] = useState("courier");
  const [presetId, setPresetId] = useState("");
  const [startingNumber, setStartingNumber] = useState("");
  const [newPresetLabel, setNewPresetLabel] = useState("");
  const [newPresetAmount, setNewPresetAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCustomers = async () => {
    if (!monthId) return;
    setLoading(true);
    setError("");
    try {
      const response = await getDeliveryCustomers(monthId, query, status);
      setCustomers(Array.isArray(response?.customers) ? response.customers : []);
      setSelected([]);
    } catch (err) {
      setError(err.message || "Failed to load delivery customers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([getMonths(), getDeliveryChargePresets()])
      .then(([monthResponse, presetResponse]) => {
        const monthList = Array.isArray(monthResponse) ? monthResponse : [];
        setMonths(monthList);
        if (monthList.length) setMonthId(String(monthList[0].id));
        setPresets(Array.isArray(presetResponse?.presets) ? presetResponse.presets : []);
      })
      .catch((err) => setError(err.message || "Failed to load delivery setup."));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadCustomers(), 180);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthId, query, status]);

  const activePresets = useMemo(() => presets.filter((preset) => preset.active), [presets]);
  const selectedRows = useMemo(
    () => customers.filter((customer) => selected.includes(Number(customer.customer_id))),
    [customers, selected]
  );
  const selectedAssignable = selectedRows.filter(
    (customer) => customer.is_received && !customer.is_collected && customer.delivery_assignment_status !== "collected"
  );
  const selectedCollectable = selectedRows.filter(
    (customer) => customer.delivery_assignment_status === "assigned" && !customer.is_collected
  );

  const toggleSelected = (customerId) => {
    setSelected((current) =>
      current.includes(customerId) ? current.filter((id) => id !== customerId) : [...current, customerId]
    );
  };

  const assignSelected = async () => {
    if (!selectedAssignable.length || !presetId) return;
    if (method === "courier" && (!/^\d+$/.test(startingNumber) || Number(startingNumber) <= 0)) {
      setError("Courier assignment requires a positive starting delivery number.");
      return;
    }
    const start = Number(startingNumber || 0);
    const assignments = selectedAssignable.map((customer, index) => ({
      customer_id: Number(customer.customer_id),
      delivery_method: method,
      delivery_number: method === "courier" ? String(start + index) : null,
      preset_id: Number(presetId),
    }));
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await assignDeliveries(monthId, assignments);
      setNotice(`${assignments.length} delivery assignment(s) saved.`);
      await loadCustomers();
    } catch (err) {
      setError(err.message || "Failed to save delivery assignment.");
    } finally {
      setSaving(false);
    }
  };

  const collectSelected = async () => {
    if (!selectedCollectable.length) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await collectDeliveries(monthId, selectedCollectable.map((row) => Number(row.customer_id)));
      setNotice(response?.idempotent ? "Collection was already completed; no duplicate payment was created." : `Collection payment #${response?.payment_id} created.`);
      await loadCustomers();
    } catch (err) {
      setError(err.message || "Failed to collect selected customers.");
    } finally {
      setSaving(false);
    }
  };

  const revertSelected = async () => {
    const rows = selectedRows.filter((row) => row.delivery_assignment_status === "assigned" && !row.is_collected);
    if (!rows.length || !window.confirm(`Revert ${rows.length} assignment(s)?`)) return;
    setSaving(true);
    try {
      await revertDeliveries(monthId, rows.map((row) => Number(row.customer_id)));
      setNotice(`${rows.length} assignment(s) reverted.`);
      await loadCustomers();
    } catch (err) {
      setError(err.message || "Failed to revert assignment.");
    } finally {
      setSaving(false);
    }
  };

  const addPreset = async (event) => {
    event.preventDefault();
    const amount = Number(newPresetAmount);
    if (!newPresetLabel.trim() || !Number.isFinite(amount)) return;
    try {
      await addDeliveryChargePreset({ label: newPresetLabel.trim(), adjustment_amount: amount, sort_order: presets.length * 10 + 10 });
      const response = await getDeliveryChargePresets();
      setPresets(response?.presets || []);
      setNewPresetLabel("");
      setNewPresetAmount("");
    } catch (err) {
      setError(err.message || "Failed to add preset.");
    }
  };

  const togglePreset = async (preset) => {
    try {
      await updateDeliveryChargePreset({ ...preset, active: !preset.active });
      setPresets((current) => current.map((item) => item.id === preset.id ? { ...item, active: !preset.active } : item));
    } catch (err) {
      setError(err.message || "Failed to update preset.");
    }
  };

  const removePreset = async (preset) => {
    if (!window.confirm(`Disable preset ${preset.label}?`)) return;
    try {
      await deleteDeliveryChargePreset(preset.id);
      setPresets((current) => current.map((item) => item.id === preset.id ? { ...item, active: false } : item));
    } catch (err) {
      setError(err.message || "Failed to disable preset.");
    }
  };

  const editPreset = async (preset) => {
    const label = window.prompt("Preset label", preset.label);
    if (label === null || !label.trim()) return;
    const amountValue = window.prompt("Signed adjustment", String(preset.adjustment_amount));
    if (amountValue === null) return;
    const amount = Number(amountValue);
    if (!Number.isFinite(amount)) { setError("Preset adjustment must be a valid number."); return; }
    try {
      await updateDeliveryChargePreset({ ...preset, label: label.trim(), adjustment_amount: amount });
      const response = await getDeliveryChargePresets();
      setPresets(response?.presets || []);
    } catch (err) {
      setError(err.message || "Failed to edit preset.");
    }
  };

  const movePreset = async (preset, direction) => {
    const ordered = [...presets].sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);
    const index = ordered.findIndex((item) => item.id === preset.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    const target = ordered[nextIndex];
    try {
      await updateDeliveryChargePreset({ ...preset, sort_order: target.sort_order });
      await updateDeliveryChargePreset({ ...target, sort_order: preset.sort_order });
      const response = await getDeliveryChargePresets();
      setPresets(response?.presets || []);
    } catch (err) {
      setError(err.message || "Failed to reorder presets.");
    }
  };

  return (
    <main className="opsPage">
      <div className="opsHeader">
        <div>
          <p className="opsEyebrow">Operations / Delivery</p>
          <h1>Delivery workspace</h1>
          <p className="opsMuted">Existing order customers become available only after their complete shipment is received.</p>
        </div>
        <div className="opsControlGroup">
          <label>Month<select value={monthId} onChange={(event) => setMonthId(event.target.value)}>{months.map((month) => <option key={month.id} value={month.id}>{month.name} (#{month.id})</option>)}</select></label>
          <label>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, order, cart, tracking" /></label>
        </div>
      </div>

      {error && <div className="opsAlert opsAlertError">{error}</div>}
      {notice && <div className="opsAlert opsAlertSuccess">{notice}</div>}

      <section className="opsCard">
        <div className="opsToolbar">
          <div className="opsTabs">{[["ready", "Ready"], ["assigned", "Assigned"], ["collected", "Collected"], ["awaiting_receipt", "Awaiting receipt"], ["all", "All"]].map(([value, label]) => <button key={value} className={status === value ? "opsTab opsTabActive" : "opsTab"} onClick={() => setStatus(value)}>{label}</button>)}</div>
          <div className="opsToolbarActions"><button onClick={loadCustomers}>Refresh</button><button disabled={!selectedCollectable.length || saving} onClick={collectSelected}>Collect selected</button><button disabled={!selectedRows.some((row) => row.delivery_assignment_status === "assigned" && !row.is_collected) || saving} onClick={revertSelected}>Revert selected</button></div>
        </div>

        <div className="opsAssignmentPanel">
          <div><strong>{selectedAssignable.length}</strong><span>received selected for assignment</span></div>
          <label>Method<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="courier">Courier</option><option value="self">Self-delivery</option></select></label>
          <label>Charge adjustment<select value={presetId} onChange={(event) => setPresetId(event.target.value)}><option value="">Choose preset</option>{activePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label} ({Number(preset.adjustment_amount) >= 0 ? "+" : ""}{money(preset.adjustment_amount)})</option>)}</select></label>
          {method === "courier" && <label>Starting delivery #<input value={startingNumber} onChange={(event) => setStartingNumber(event.target.value)} placeholder="e.g. 1001" inputMode="numeric" /></label>}
          <button disabled={!selectedAssignable.length || !presetId || saving} onClick={assignSelected}>Assign selected</button>
        </div>

        {loading ? <div className="opsEmpty">Loading customers…</div> : !customers.length ? <div className="opsEmpty">No customers match this queue.</div> : <div className="opsTableWrap"><table className="opsTable"><thead><tr><th><input type="checkbox" checked={customers.length > 0 && selected.length === customers.length} onChange={(event) => setSelected(event.target.checked ? customers.map((row) => Number(row.customer_id)) : [])} /></th><th>Customer</th><th>Order / cart</th><th>Receipt</th><th>Delivery</th><th>Amount</th><th>Actions</th></tr></thead><tbody>{customers.map((customer) => { const id = Number(customer.customer_id); const collected = customer.is_collected; return <tr key={id}><td><input type="checkbox" checked={selected.includes(id)} onChange={() => toggleSelected(id)} /></td><td><strong>{customer.customer_name || "(empty name)"}</strong><small>Customer #{id}</small></td><td>{customer.order_name || `Order #${customer.order_id}`}<small>Cart {customer.cart_order_number || `#${customer.cart_id}`} · SHEIN {customer.shein_order_no || "-"}</small></td><td><span className={customer.is_received ? "opsPill opsPillGood" : "opsPill"}>{customer.is_received ? "Received" : "Awaiting cargo"}</span></td><td>{customer.delivery_assignment_status}<small>{customer.delivery_method || "-"}{customer.delivery_number ? ` · #${customer.delivery_number}` : ""}</small></td><td><strong>${money(customer.final_amount)}</strong><small>Base ${money(customer.base_amount)} · Adj {Number(customer.delivery_adjustment) >= 0 ? "+" : ""}{money(customer.delivery_adjustment)}</small></td><td>{collected ? <span className="opsPill opsPillGood">Collected</span> : customer.delivery_assignment_status === "assigned" ? <span className="opsPill">Ready to collect</span> : <span className="opsMuted">Select to assign</span>}</td></tr>; })}</tbody></table></div>}
      </section>

      <section className="opsCard">
        <div className="opsSectionTitle"><div><h2>Delivery charge presets</h2><p className="opsMuted">Signed adjustments are stored separately from the final collection amount.</p></div></div>
        <form className="opsInlineForm" onSubmit={addPreset}><input value={newPresetLabel} onChange={(event) => setNewPresetLabel(event.target.value)} placeholder="Label e.g. +15" /><input value={newPresetAmount} onChange={(event) => setNewPresetAmount(event.target.value)} type="number" step="0.01" placeholder="Adjustment" /><button>Add preset</button></form>
        <div className="opsPresetList">{presets.map((preset, index) => <div className="opsPreset" key={preset.id}><span className={preset.active ? "opsPill opsPillGood" : "opsPill"}>{preset.active ? "Active" : "Disabled"}</span><strong>{preset.label}</strong><span>{Number(preset.adjustment_amount) >= 0 ? "+" : ""}{money(preset.adjustment_amount)}</span><button onClick={() => togglePreset(preset)}>{preset.active ? "Disable" : "Enable"}</button><button onClick={() => editPreset(preset)}>Edit</button><button disabled={index === 0} onClick={() => movePreset(preset, -1)}>↑</button><button disabled={index === presets.length - 1} onClick={() => movePreset(preset, 1)}>↓</button><button onClick={() => removePreset(preset)}>Remove</button></div>)}</div>
      </section>
    </main>
  );
}
