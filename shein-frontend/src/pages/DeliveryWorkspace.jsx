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
import RecordCustomerLossModal from "../components/RecordCustomerLossModal";

const money = (value) => Number(value || 0).toFixed(2);

export default function DeliveryWorkspace() {
  const [months, setMonths] = useState([]);
  const [monthId, setMonthId] = useState("");
  const [status, setStatus] = useState("ready");
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [presets, setPresets] = useState([]);
  const [selected, setSelected] = useState([]);
  
  // Workspace Mode: "self" (Self-Delivery & Counter Collection) vs "courier" (Courier Dispatch)
  const [workspaceMode, setWorkspaceMode] = useState("self");

  // Courier Assignment Form State
  const [courierPresetId, setCourierPresetId] = useState("");
  const [startingNumber, setStartingNumber] = useState("");

  // Self Delivery Form State (Preset is optional, defaults to $0)
  const [selfPresetId, setSelfPresetId] = useState("");

  // Preset Management
  const [newPresetLabel, setNewPresetLabel] = useState("");
  const [newPresetAmount, setNewPresetAmount] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Loss Modal State (supports single customer or array of bulk customers)
  const [lossModalState, setLossModalState] = useState(null);

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

  const selectedAssignable = useMemo(
    () => selectedRows.filter(
      (customer) => customer.is_received && !customer.is_collected && customer.delivery_assignment_status !== "collected"
    ),
    [selectedRows]
  );

  const selectedCollectable = useMemo(
    () => selectedRows.filter(
      (customer) => customer.delivery_assignment_status === "assigned" && !customer.is_collected
    ),
    [selectedRows]
  );

  const selectedSelfCollectable = useMemo(
    () => selectedRows.filter(
      (customer) => customer.is_received && !customer.is_collected
    ),
    [selectedRows]
  );

  const selectedTotalAmount = useMemo(
    () => selectedRows.reduce((sum, c) => sum + Number(c.final_amount || c.base_amount || 0), 0),
    [selectedRows]
  );

  const toggleSelected = (customerId) => {
    setSelected((current) =>
      current.includes(customerId) ? current.filter((id) => id !== customerId) : [...current, customerId]
    );
  };

  // Quick Selection Helpers
  const selectAllReadyNotAdded = () => {
    const readyNotAddedIds = customers
      .filter((c) => c.is_received && !c.is_collected && c.delivery_assignment_status === "unassigned")
      .map((c) => Number(c.customer_id));
    setSelected(readyNotAddedIds);
  };

  const selectAllAssigned = () => {
    const assignedIds = customers
      .filter((c) => c.delivery_assignment_status === "assigned" && !c.is_collected)
      .map((c) => Number(c.customer_id));
    setSelected(assignedIds);
  };

  const selectAllUncollected = () => {
    const uncollectedIds = customers
      .filter((c) => !c.is_collected)
      .map((c) => Number(c.customer_id));
    setSelected(uncollectedIds);
  };

  const clearSelection = () => setSelected([]);

  // Self Delivery: Bulk Direct Collect (Assign as Self & Collect in 1 Click)
  const bulkSelfCollect = async () => {
    if (!selectedSelfCollectable.length) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const ids = selectedSelfCollectable.map((c) => Number(c.customer_id));
      const response = await collectDeliveries(monthId, ids, "Self-delivery counter collection", true);
      setNotice(
        response?.idempotent
          ? "Selected collections were already recorded."
          : `⚡ Bulk self-delivery collection completed for ${ids.length} customer(s)! Payment #${response?.payment_id} recorded.`
      );
      await loadCustomers();
    } catch (err) {
      setError(err.message || "Failed to process bulk self-delivery collection.");
    } finally {
      setSaving(false);
    }
  };

  // Self Delivery: Bulk Assign as Self (No delivery fee or optional adjustment)
  const bulkAssignSelf = async () => {
    if (!selectedAssignable.length) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const assignments = selectedAssignable.map((customer) => ({
        customer_id: Number(customer.customer_id),
        delivery_method: "self",
        delivery_number: null,
        preset_id: selfPresetId ? Number(selfPresetId) : 0,
      }));
      await assignDeliveries(monthId, assignments);
      setNotice(`🏃 ${assignments.length} customer(s) marked for Self-Delivery / Collection.`);
      await loadCustomers();
    } catch (err) {
      setError(err.message || "Failed to assign self-delivery.");
    } finally {
      setSaving(false);
    }
  };

  // Courier Assignment: Bulk Assign with starting number & preset
  const assignCourierSelected = async () => {
    if (!selectedAssignable.length || !courierPresetId) return;
    if (!/^\d+$/.test(startingNumber) || Number(startingNumber) <= 0) {
      setError("Courier assignment requires a positive starting delivery number (e.g. 1001).");
      return;
    }
    const start = Number(startingNumber || 0);
    const assignments = selectedAssignable.map((customer, index) => ({
      customer_id: Number(customer.customer_id),
      delivery_method: "courier",
      delivery_number: String(start + index),
      preset_id: Number(courierPresetId),
    }));
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await assignDeliveries(monthId, assignments);
      setNotice(`🚚 ${assignments.length} courier delivery assignment(s) saved (#${start} - #${start + assignments.length - 1}).`);
      await loadCustomers();
    } catch (err) {
      setError(err.message || "Failed to save courier assignment.");
    } finally {
      setSaving(false);
    }
  };

  // Collect Assigned Customers
  const collectSelected = async () => {
    if (!selectedCollectable.length) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await collectDeliveries(monthId, selectedCollectable.map((row) => Number(row.customer_id)));
      setNotice(
        response?.idempotent
          ? "Collection was already completed; no duplicate payment was created."
          : `Collection payment #${response?.payment_id} created for ${selectedCollectable.length} customer(s).`
      );
      await loadCustomers();
    } catch (err) {
      setError(err.message || "Failed to collect selected customers.");
    } finally {
      setSaving(false);
    }
  };

  // Revert Assignment
  const revertSelected = async () => {
    const rows = selectedRows.filter((row) => row.delivery_assignment_status === "assigned" && !row.is_collected);
    if (!rows.length || !window.confirm(`Revert ${rows.length} assignment(s) back to unassigned?`)) return;
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

  // Single Quick Self-Collect
  const singleSelfCollect = async (customer) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await collectDeliveries(monthId, [Number(customer.customer_id)], "Self-delivery collection", true);
      setNotice(`⚡ Collection completed for ${customer.customer_name || "customer"}! Payment #${response?.payment_id}.`);
      await loadCustomers();
    } catch (err) {
      setError(err.message || "Failed to collect customer.");
    } finally {
      setSaving(false);
    }
  };

  // Single Quick Regular Collect
  const singleCollect = async (customer) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await collectDeliveries(monthId, [Number(customer.customer_id)]);
      setNotice(`💰 Collected payment #${response?.payment_id} for ${customer.customer_name || "customer"}.`);
      await loadCustomers();
    } catch (err) {
      setError(err.message || "Failed to collect customer.");
    } finally {
      setSaving(false);
    }
  };

  // Open Bulk Loss Modal
  const openBulkLossModal = () => {
    if (!selectedRows.length) return;
    setLossModalState({
      customers: selectedRows.map((c) => ({
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        order_id: c.order_id,
        order_name: c.order_name,
        month_id: monthId,
        usd_to_collect: c.final_amount || c.base_amount,
        is_received: c.is_received,
        delivery_assignment_status: c.delivery_assignment_status,
      })),
    });
  };

  // Open Single Loss Modal
  const openSingleLossModal = (customer) => {
    setLossModalState({
      customer: {
        customer_id: customer.customer_id,
        customer_name: customer.customer_name,
        order_id: customer.order_id,
        order_name: customer.order_name,
        month_id: monthId,
        usd_to_collect: customer.final_amount || customer.base_amount,
        is_received: customer.is_received,
        delivery_assignment_status: customer.delivery_assignment_status,
        loss_type: customer.delivery_assignment_status === "unassigned" ? "package not added / missing" : undefined,
      },
    });
  };

  // Preset Handlers
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
      {/* Header */}
      <div className="opsHeader">
        <div>
          <p className="opsEyebrow">Operations / Delivery & Collection</p>
          <h1>Delivery & Collection Workspace</h1>
          <p className="opsMuted">
            Manage courier dispatches, bulk self-delivery collections, and record immediate customer losses.
          </p>
        </div>
        <div className="opsControlGroup">
          <label>
            Month
            <select value={monthId} onChange={(event) => setMonthId(event.target.value)}>
              {months.map((month) => (
                <option key={month.id} value={month.id}>{month.name} (#{month.id})</option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, order, cart, tracking" />
          </label>
        </div>
      </div>

      {error && <div className="opsAlert opsAlertError">⚠️ {error}</div>}
      {notice && <div className="opsAlert opsAlertSuccess">✅ {notice}</div>}

      {/* Mode Switcher */}
      <div className="opsModeSwitch">
        <button
          type="button"
          className={workspaceMode === "self" ? "active" : ""}
          onClick={() => setWorkspaceMode("self")}
        >
          🏃 Self-Delivery & Bulk Collection
        </button>
        <button
          type="button"
          className={workspaceMode === "courier" ? "active" : ""}
          onClick={() => setWorkspaceMode("courier")}
        >
          🚚 Courier Dispatch
        </button>
      </div>

      {/* Section 1: Self Delivery & Bulk Collection Hub */}
      {workspaceMode === "self" && (
        <section className="opsSelfDeliveryCard">
          <div className="opsSelfDeliveryCardHeader">
            <div className="opsSelfDeliveryTitle">
              <span style={{ fontSize: "1.75rem" }}>🏃</span>
              <div>
                <h3>Self-Delivery & Bulk Collection Section</h3>
                <p>Select multiple customers to collect payments in bulk, assign self-pickup ($0 fee), or log immediate losses for unadded/missing cargo.</p>
              </div>
            </div>
            <div className="opsBulkActions">
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#334155", fontWeight: 700 }}>
                Optional Fee/Discount:
                <select
                  value={selfPresetId}
                  onChange={(e) => setSelfPresetId(e.target.value)}
                  style={{ minHeight: "34px", padding: "4px 8px", fontSize: "12px", borderRadius: "8px" }}
                >
                  <option value="">No extra charge ($0.00)</option>
                  {activePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label} ({Number(preset.adjustment_amount) >= 0 ? "+" : ""}{money(preset.adjustment_amount)})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Quick Selection Bar */}
          <div className="opsBulkQuickBar">
            <div className="opsBulkChips">
              <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: 800, color: "#64748b", marginRight: "4px" }}>
                Select:
              </span>
              <button type="button" className="opsChip" onClick={selectAllReadyNotAdded}>
                ⚡ All Ready / Not Added ({customers.filter((c) => c.is_received && !c.is_collected && c.delivery_assignment_status === "unassigned").length})
              </button>
              <button type="button" className="opsChip" onClick={selectAllAssigned}>
                📋 All Assigned ({customers.filter((c) => c.delivery_assignment_status === "assigned" && !c.is_collected).length})
              </button>
              <button type="button" className="opsChip" onClick={selectAllUncollected}>
                All Uncollected ({customers.filter((c) => !c.is_collected).length})
              </button>
              {selected.length > 0 && (
                <button type="button" className="opsChip" onClick={clearSelection} style={{ color: "#ef4444" }}>
                  Clear ({selected.length})
                </button>
              )}
            </div>

            <div className="opsBulkMetrics">
              <span>Selected: <strong className="highlight">{selected.length}</strong></span>
              <span>Total Value: <strong className="highlight">${money(selectedTotalAmount)}</strong></span>
            </div>
          </div>

          {/* Bulk Action Trigger Buttons */}
          <div className="opsBulkActions" style={{ marginTop: "10px" }}>
            <button
              type="button"
              className="opsBtnSuccess"
              disabled={!selectedSelfCollectable.length || saving}
              onClick={bulkSelfCollect}
              title="Collect target payments directly into payments and complete self-delivery in 1 click"
            >
              ⚡ Bulk Self-Deliver & Collect Now ({selectedSelfCollectable.length})
            </button>

            <button
              type="button"
              className="opsBtnPrimary"
              disabled={!selectedAssignable.length || saving}
              onClick={bulkAssignSelf}
              title="Mark selected customers for self-delivery counter pickup without collecting yet"
            >
              📦 Bulk Mark as Self-Delivery ({selectedAssignable.length})
            </button>

            <button
              type="button"
              className="opsBtnDanger"
              disabled={!selectedRows.length || saving}
              onClick={openBulkLossModal}
              title="Record immediate customer losses for selected packages that were not added, missing, or damaged"
            >
              📉 Record Loss on Selected ({selectedRows.length})
            </button>

            <button
              type="button"
              className="opsBtnOutline"
              disabled={!selectedCollectable.length || saving}
              onClick={collectSelected}
            >
              💰 Collect Assigned ({selectedCollectable.length})
            </button>

            <button
              type="button"
              className="opsBtnOutline"
              disabled={!selectedRows.some((row) => row.delivery_assignment_status === "assigned" && !row.is_collected) || saving}
              onClick={revertSelected}
            >
              ↩️ Revert Selected
            </button>
          </div>
        </section>
      )}

      {/* Section 2: Courier Dispatch Section */}
      {workspaceMode === "courier" && (
        <div className="opsAssignmentPanel" style={{ background: "#f8faff", border: "1.5px solid #c7d2fe", borderRadius: "14px", padding: "16px" }}>
          <div>
            <strong>{selectedAssignable.length}</strong>
            <span>ready received packages selected for courier delivery</span>
          </div>
          <label>
            Delivery Preset *
            <select value={courierPresetId} onChange={(event) => setCourierPresetId(event.target.value)}>
              <option value="">Choose preset</option>
              {activePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} ({Number(preset.adjustment_amount) >= 0 ? "+" : ""}{money(preset.adjustment_amount)})
                </option>
              ))}
            </select>
          </label>
          <label>
            Starting delivery # *
            <input
              value={startingNumber}
              onChange={(event) => setStartingNumber(event.target.value)}
              placeholder="e.g. 1001"
              inputMode="numeric"
            />
          </label>
          <button
            type="button"
            className="opsBtnPrimary"
            disabled={!selectedAssignable.length || !courierPresetId || saving}
            onClick={assignCourierSelected}
          >
            🚚 Bulk Assign Courier ({selectedAssignable.length})
          </button>
        </div>
      )}

      {/* Customer Table Queue Card */}
      <section className="opsCard">
        <div className="opsToolbar">
          <div className="opsTabs">
            {[
              ["ready", "Ready (Not Added)"],
              ["assigned", "Assigned"],
              ["collected", "Collected"],
              ["awaiting_receipt", "Awaiting Cargo"],
              ["all", "All Customers"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={status === value ? "opsTab opsTabActive" : "opsTab"}
                onClick={() => setStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="opsToolbarActions">
            <button type="button" onClick={loadCustomers}>🔄 Refresh</button>
            <button
              type="button"
              className="opsBtnSuccess"
              disabled={!selectedSelfCollectable.length || saving}
              onClick={bulkSelfCollect}
            >
              ⚡ Self-Collect Selected ({selectedSelfCollectable.length})
            </button>
            <button
              type="button"
              className="opsBtnDanger"
              disabled={!selectedRows.length || saving}
              onClick={openBulkLossModal}
            >
              📉 Record Loss ({selectedRows.length})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="opsEmpty">Loading customers…</div>
        ) : !customers.length ? (
          <div className="opsEmpty">No customers match this filter queue.</div>
        ) : (
          <div className="opsTableWrap">
            <table className="opsTable">
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>
                    <input
                      type="checkbox"
                      checked={customers.length > 0 && selected.length === customers.length}
                      onChange={(event) =>
                        setSelected(event.target.checked ? customers.map((row) => Number(row.customer_id)) : [])
                      }
                    />
                  </th>
                  <th>Customer</th>
                  <th>Order / Cart</th>
                  <th>Cargo Status</th>
                  <th>Delivery Status</th>
                  <th>Amount to Collect</th>
                  <th style={{ minWidth: "220px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const id = Number(customer.customer_id);
                  const collected = customer.is_collected;
                  const isUnassigned = customer.delivery_assignment_status === "unassigned";
                  const isSelf = customer.delivery_method === "self";
                  const isCourier = customer.delivery_method === "courier";

                  return (
                    <tr key={id} style={{ background: selected.includes(id) ? "#f0fdf4" : undefined }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(id)}
                          onChange={() => toggleSelected(id)}
                        />
                      </td>

                      <td>
                        <strong>{customer.customer_name || "(empty name)"}</strong>
                        <small>Customer #{id}</small>
                      </td>

                      <td>
                        {customer.order_name || `Order #${customer.order_id}`}
                        <small>Cart {customer.cart_order_number || `#${customer.cart_id}`} · SHEIN {customer.shein_order_no || "-"}</small>
                      </td>

                      <td>
                        <span className={customer.is_received ? "opsPill opsPillGood" : "opsPill"}>
                          {customer.is_received ? "✅ Received" : "⏳ Awaiting cargo"}
                        </span>
                      </td>

                      <td>
                        {isUnassigned ? (
                          <span className="opsPill opsPillWarning">⚠️ Not Added</span>
                        ) : isSelf ? (
                          <span className="opsPill opsPillSelf">🏃 Self-Delivery</span>
                        ) : isCourier ? (
                          <span className="opsPill opsPillCourier">🚚 Courier #{customer.delivery_number || "-"}</span>
                        ) : (
                          <span className="opsPill">{customer.delivery_assignment_status}</span>
                        )}
                        {customer.delivery_adjustment ? (
                          <small>Adj: {Number(customer.delivery_adjustment) >= 0 ? "+" : ""}${money(customer.delivery_adjustment)}</small>
                        ) : null}
                      </td>

                      <td>
                        <strong style={{ fontSize: "14px", color: "#0f172a" }}>
                          ${money(customer.final_amount)}
                        </strong>
                        <small>Base: ${money(customer.base_amount)}</small>
                      </td>

                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          {collected ? (
                            <span className="opsPill opsPillGood">✅ Paid & Collected</span>
                          ) : (
                            <>
                              {/* Quick 1-Click Self Collect or Regular Collect */}
                              {customer.is_received && (
                                <button
                                  type="button"
                                  className="opsBtnSuccess"
                                  style={{ padding: "4px 8px", fontSize: "11px", borderRadius: "6px" }}
                                  onClick={() => singleSelfCollect(customer)}
                                  title="Collect payment now via self-delivery"
                                >
                                  ⚡ Self-Collect
                                </button>
                              )}

                              {customer.delivery_assignment_status === "assigned" && (
                                <button
                                  type="button"
                                  className="opsBtnPrimary"
                                  style={{ padding: "4px 8px", fontSize: "11px", borderRadius: "6px" }}
                                  onClick={() => singleCollect(customer)}
                                  title="Collect assigned delivery"
                                >
                                  💰 Collect
                                </button>
                              )}

                              {/* Immediate Loss Recording Button */}
                              <button
                                type="button"
                                style={{
                                  padding: "4px 8px",
                                  background: isUnassigned ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 68, 68, 0.12)",
                                  border: isUnassigned ? "1px solid rgba(239, 68, 68, 0.6)" : "1px solid rgba(239, 68, 68, 0.3)",
                                  color: "#ef4444",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: 750,
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                }}
                                onClick={() => openSingleLossModal(customer)}
                                title={isUnassigned ? "Record immediate loss: package not added / missing" : "Record immediate customer loss"}
                              >
                                {isUnassigned ? "📉 Loss (Not Added)" : "📉 Loss"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Preset Management */}
      <section className="opsCard">
        <div className="opsSectionTitle">
          <div>
            <h2>Delivery charge presets</h2>
            <p className="opsMuted">Preset delivery adjustments applicable for couriers or custom self-delivery fees.</p>
          </div>
        </div>
        <form className="opsInlineForm" onSubmit={addPreset}>
          <input
            value={newPresetLabel}
            onChange={(event) => setNewPresetLabel(event.target.value)}
            placeholder="Label e.g. Courier Beirut (+15)"
          />
          <input
            value={newPresetAmount}
            onChange={(event) => setNewPresetAmount(event.target.value)}
            type="number"
            step="0.01"
            placeholder="Adjustment ($)"
          />
          <button type="submit">Add preset</button>
        </form>

        <div className="opsPresetList">
          {presets.map((preset, index) => (
            <div className="opsPreset" key={preset.id}>
              <span className={preset.active ? "opsPill opsPillGood" : "opsPill"}>
                {preset.active ? "Active" : "Disabled"}
              </span>
              <strong>{preset.label}</strong>
              <span>{Number(preset.adjustment_amount) >= 0 ? "+" : ""}${money(preset.adjustment_amount)}</span>
              <button type="button" onClick={() => togglePreset(preset)}>{preset.active ? "Disable" : "Enable"}</button>
              <button type="button" onClick={() => editPreset(preset)}>Edit</button>
              <button type="button" disabled={index === 0} onClick={() => movePreset(preset, -1)}>↑</button>
              <button type="button" disabled={index === presets.length - 1} onClick={() => movePreset(preset, 1)}>↓</button>
              <button type="button" onClick={() => removePreset(preset)}>Remove</button>
            </div>
          ))}
        </div>
      </section>

      {/* Record Customer Loss Modal (Handles both single customer and bulk customers) */}
      {lossModalState && (
        <RecordCustomerLossModal
          customer={lossModalState.customer}
          customers={lossModalState.customers}
          onClose={() => setLossModalState(null)}
          onSuccess={() => {
            setLossModalState(null);
            loadCustomers();
          }}
        />
      )}
    </main>
  );
}
