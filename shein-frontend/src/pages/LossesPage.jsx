import { useEffect, useState } from "react";
import { getMonths } from "../api/monthApi";
import {
  addCustomerDebt,
  closeCustomerDebt,
  getCustomerDebts,
  getCustomersForDeliveryByMonth,
  getDeliveryLosses,
  updateCustomerDebt,
} from "../api/deliveryApi";
import CustomDropdown from "../components/CustomDropdown";
import "../delivery.css";

const LossesPage = () => {
  const [months, setMonths] = useState([]);
  const [monthId, setMonthId] = useState("");
  const [rows, setRows] = useState([]);
  const [debts, setDebts] = useState([]);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [newDebtCustomerId, setNewDebtCustomerId] = useState("");
  const [newDebtAmount, setNewDebtAmount] = useState("");
  const [newDebtNote, setNewDebtNote] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await getMonths();
        const arr = Array.isArray(data) ? data : [];
        setMonths(arr);
        if (arr.length) setMonthId((v) => v || String(arr[0].id));
      } catch {
        setMonths([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!monthId) {
      setRows([]);
      setDebts([]);
      setCustomerOptions([]);
      return;
    }
    (async () => {
      try {
        const res = await getDeliveryLosses(monthId, "confirmed");
        setRows(Array.isArray(res?.rows) ? res.rows : []);
      } catch {
        setRows([]);
      }
    })();
    (async () => {
      try {
        const res = await getCustomerDebts(monthId);
        setDebts(Array.isArray(res?.rows) ? res.rows : []);
      } catch {
        setDebts([]);
      }
    })();
    (async () => {
      try {
        const res = await getCustomersForDeliveryByMonth(monthId);
        const arr = Array.isArray(res) ? res : [];
        setCustomerOptions(arr);
      } catch {
        setCustomerOptions([]);
      }
    })();
  }, [monthId]);

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const debtOutstanding = debts.reduce((s, d) => s + Number(d.outstanding_amount || 0), 0);

  const refreshDebts = async () => {
    if (!monthId) return;
    try {
      const res = await getCustomerDebts(monthId);
      setDebts(Array.isArray(res?.rows) ? res.rows : []);
    } catch {
      setDebts([]);
    }
  };

  const handleAddDebt = async () => {
    if (!monthId || !newDebtCustomerId || !newDebtAmount) return;
    const amount = Number(newDebtAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const res = await addCustomerDebt({
      month_id: Number(monthId),
      customer_id: Number(newDebtCustomerId),
      amount,
      note: newDebtNote || "",
    });
    if (res?.ok === false) throw new Error(res?.error || "Failed to add debt");
    setNewDebtAmount("");
    setNewDebtNote("");
    await refreshDebts();
  };

  const handleEditDebtAmount = async (debt) => {
    const next = window.prompt("Edit outstanding debt amount", String(debt.outstanding_amount ?? ""));
    if (next === null) return;
    const amount = Number(next);
    if (!Number.isFinite(amount) || amount < 0) {
      window.alert("Invalid amount");
      return;
    }
    const res = await updateCustomerDebt(debt.id, { outstanding_amount: amount });
    if (res?.ok === false) throw new Error(res?.error || "Failed to update debt");
    await refreshDebts();
  };

  const handleClosePart = async (debt, closeAll = false) => {
    const defaultAmount = closeAll ? Number(debt.outstanding_amount || 0) : "";
    const input = window.prompt(
      closeAll ? "Close full debt amount" : "Enter amount to close from this debt",
      String(defaultAmount)
    );
    if (input === null) return;
    const paid = Number(input);
    if (!Number.isFinite(paid) || paid <= 0) {
      window.alert("Invalid paid amount");
      return;
    }
    const note = window.prompt("Optional note for payment", "") ?? "";
    const res = await closeCustomerDebt(debt.id, paid, note);
    if (res?.ok === false) throw new Error(res?.error || "Failed to close debt");
    await refreshDebts();
    window.alert(
      `Debt payment added to Payments.\nPaid: $${paid.toFixed(2)}\nRemaining: $${Number(
        res?.remaining_amount || 0
      ).toFixed(2)}`
    );
  };

  return (
    <div className="delPage pageTopSpacer">
      <div className="delHeader">
        <div className="delHeaderLeft">
          <h1 className="delTitle">Losses</h1>
          <div className="delSub">Confirmed losses moved from Delivery Addition.</div>
        </div>
        <div className="delFilters">
          <div className="delField">
            <label className="delLabel">Month</label>
            <CustomDropdown
              className="delSelect"
              value={monthId}
              onChange={(e) => setMonthId(e.target.value)}
              placeholder="Select Month"
              options={months.map((m) => ({
                value: String(m.id),
                label: `${m.name} (#${m.id})`,
              }))}
            />
          </div>
        </div>
      </div>

      <div className="delList">
        <div className="delRow" style={{ display: "block", overflowX: "auto" }}>
          <div className="delRowTitle" style={{ marginBottom: 8 }}>
            Confirmed Losses ({rows.length}) - Total: ${Number(total || 0).toFixed(2)}
          </div>
          <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Type", "Amount", "Customer / Order / Cart", "Description", "Confirmed At"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid rgba(0,0,0,0.12)", fontSize: 12 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 8, fontSize: 12, color: "#64748b" }}>
                    No confirmed losses for this month.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: 6, fontSize: 12 }}>{r.loss_type || "-"}</td>
                    <td style={{ padding: 6, fontSize: 12, fontWeight: 700 }}>${Number(r.amount || 0).toFixed(2)}</td>
                    <td style={{ padding: 6, fontSize: 12 }}>{r.ref_label || "-"}</td>
                    <td style={{ padding: 6, fontSize: 12 }}>{r.description || "-"}</td>
                    <td style={{ padding: 6, fontSize: 12 }}>{r.confirmed_at || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="delList" style={{ marginTop: 16 }}>
        <div className="delRow" style={{ display: "block", overflowX: "auto" }}>
          <div className="delRowTitle" style={{ marginBottom: 8 }}>
            Debts ({debts.length}) - Outstanding: ${Number(debtOutstanding || 0).toFixed(2)}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 2fr auto",
              gap: 8,
              alignItems: "end",
              marginBottom: 12,
            }}
          >
            <div>
              <label className="delLabel">Customer</label>
              <CustomDropdown
                className="delSelect"
                value={newDebtCustomerId}
                onChange={(e) => setNewDebtCustomerId(e.target.value)}
                placeholder="Select customer"
                searchable={true}
                options={customerOptions.map((c) => ({
                  value: String(c.id),
                  label: `${c.customer_name} | order ${c.order_name || c.order_id} / cart ${c.cart_order_number || c.cart_id}`,
                }))}
              />
            </div>
            <div>
              <label className="delLabel">Debt Amount</label>
              <input
                className="delInput"
                type="number"
                step="0.01"
                min="0"
                value={newDebtAmount}
                onChange={(e) => setNewDebtAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="delLabel">Note (optional)</label>
              <input
                className="delInput"
                value={newDebtNote}
                onChange={(e) => setNewDebtNote(e.target.value)}
                placeholder="Manual debt note"
              />
            </div>
            <button
              className="delBtn"
              onClick={() => {
                handleAddDebt().catch((e) => window.alert(e?.message || "Failed to add debt"));
              }}
            >
              Add Debt
            </button>
          </div>

          <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Customer / Order / Cart", "Original", "Outstanding", "Status", "Note", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid rgba(0,0,0,0.12)", fontSize: 12 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {debts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 8, fontSize: 12, color: "#64748b" }}>
                    No debts for this month.
                  </td>
                </tr>
              ) : (
                debts.map((d) => {
                  const ref = [
                    d.customer_name_snapshot || "-",
                    (d.order_name_snapshot || d.order_id) ? `order ${d.order_name_snapshot || d.order_id}` : null,
                    (d.cart_order_number_snapshot || d.cart_id)
                      ? `cart ${d.cart_order_number_snapshot || d.cart_id}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" | ");
                  const isClosed = String(d.status || "").toLowerCase() === "closed";
                  return (
                    <tr key={d.id}>
                      <td style={{ padding: 6, fontSize: 12 }}>{ref}</td>
                      <td style={{ padding: 6, fontSize: 12 }}>${Number(d.original_amount || 0).toFixed(2)}</td>
                      <td style={{ padding: 6, fontSize: 12, fontWeight: 700 }}>
                        ${Number(d.outstanding_amount || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: 6, fontSize: 12 }}>{d.status || "-"}</td>
                      <td style={{ padding: 6, fontSize: 12 }}>{d.note || "-"}</td>
                      <td style={{ padding: 6, fontSize: 12, whiteSpace: "nowrap" }}>
                        <button
                          className="delBtn"
                          style={{ marginRight: 6 }}
                          onClick={() =>
                            handleEditDebtAmount(d).catch((e) => window.alert(e?.message || "Failed"))
                          }
                        >
                          Edit
                        </button>
                        {!isClosed && (
                          <>
                            <button
                              className="delBtn"
                              style={{ marginRight: 6 }}
                              onClick={() =>
                                handleClosePart(d, false).catch((e) => window.alert(e?.message || "Failed"))
                              }
                            >
                              Close Part
                            </button>
                            <button
                              className="delBtn"
                              onClick={() =>
                                handleClosePart(d, true).catch((e) => window.alert(e?.message || "Failed"))
                              }
                            >
                              Close All
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LossesPage;
