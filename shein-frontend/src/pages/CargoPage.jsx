import { useCallback, useEffect, useState } from "react";
import { getMonths } from "../api/monthApi";
import { getReceivableCarts, getShipmentDetail, receiveShipment } from "../api/cargoApi";
import "../operations.css";

export default function CargoPage() {
  const [months, setMonths] = useState([]);
  const [monthId, setMonthId] = useState("");
  const [query, setQuery] = useState("");
  const [carts, setCarts] = useState([]);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [receiveModal, setReceiveModal] = useState({
    isOpen: false,
    cart: null,
    tracking_no: "",
    isAlreadyReceived: false,
    addCustoms: true,
    customsFee: "",
    weightKg: "",
    kgPrice: 0,
    calculatedFee: "0.00",
    description: "freight",
  });

  const load = useCallback(async () => {
    if (!monthId) return;
    try {
      const response = await getReceivableCarts(monthId, query);
      setCarts(Array.isArray(response?.carts) ? response.carts : []);
    } catch (err) {
      setError(err.message || "Failed to load cargo shipments.");
    }
  }, [monthId, query]);

  useEffect(() => {
    getMonths()
      .then((response) => {
        const list = Array.isArray(response) ? response : [];
        setMonths(list);
        if (list.length) setMonthId(String(list[0].id));
      })
      .catch((err) => setError(err.message || "Failed to load months."));
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 160);
    return () => clearTimeout(timer);
  }, [load]);

  const openReceiveModal = (cart, part) => {
    const kgPrice = Number(cart.kg_price || 0);
    const rawWeight = part.customs?.weight_kg != null
      ? String(part.customs.weight_kg)
      : (cart.weight_kg != null ? String(cart.weight_kg) : "");

    const calculatedFee = Number(rawWeight || 0) > 0 && kgPrice > 0
      ? (Number(rawWeight) * kgPrice).toFixed(2)
      : "0.00";

    const existingFee = part.customs?.customs_fee != null ? String(part.customs.customs_fee) : "";
    const initialFee = existingFee || (calculatedFee !== "0.00" ? calculatedFee : "");

    setReceiveModal({
      isOpen: true,
      cart,
      tracking_no: part.tracking_no,
      isAlreadyReceived: Boolean(part.received),
      addCustoms: true,
      customsFee: initialFee,
      weightKg: rawWeight,
      kgPrice,
      calculatedFee,
      description: "freight",
    });
  };

  const closeReceiveModal = () => {
    setReceiveModal((prev) => ({ ...prev, isOpen: false, cart: null }));
  };

  const handleWeightChange = (newWeight) => {
    const w = newWeight;
    const newCalc = Number(w || 0) > 0 && receiveModal.kgPrice > 0
      ? (Number(w) * receiveModal.kgPrice).toFixed(2)
      : "0.00";

    setReceiveModal((prev) => {
      const wasAuto = prev.customsFee === prev.calculatedFee || prev.customsFee === "" || prev.customsFee === "0.00";
      return {
        ...prev,
        weightKg: w,
        calculatedFee: newCalc,
        customsFee: wasAuto ? (newCalc !== "0.00" ? newCalc : "") : prev.customsFee,
      };
    });
  };

  const handleConfirmReceive = async (withCustoms = true) => {
    if (!receiveModal.cart || !receiveModal.tracking_no) return;
    const key = `${receiveModal.cart.cart_id}:${receiveModal.tracking_no}`;
    setBusy(key);
    setError("");
    setNotice("");

    let feeToSend = null;
    if (withCustoms) {
      if (receiveModal.customsFee !== "") {
        feeToSend = Number(receiveModal.customsFee);
      } else if (Number(receiveModal.calculatedFee) > 0) {
        feeToSend = Number(receiveModal.calculatedFee);
      } else {
        feeToSend = 0;
      }
    }

    try {
      const response = await receiveShipment({
        cart_id: receiveModal.cart.cart_id,
        tracking_no: receiveModal.tracking_no,
        add_customs: withCustoms,
        customs_fee: feeToSend,
        weight_kg: receiveModal.weightKg !== "" ? Number(receiveModal.weightKg) : null,
        description: receiveModal.description || "freight",
      });

      let msg = response?.idempotent
        ? `${receiveModal.tracking_no} receipt updated.`
        : `${receiveModal.tracking_no} received: ${response.received_count}/${response.expected_count}.`;
      if (response?.customs_added) {
        msg += ` Customs fee of $${feeToSend != null ? feeToSend : 0} saved.`;
      }
      setNotice(msg);
      closeReceiveModal();
      await load();
      if (detail?.cart_id === receiveModal.cart.cart_id) {
        const next = await getShipmentDetail(receiveModal.cart.cart_id);
        setDetail(next?.shipment || null);
      }
    } catch (err) {
      setError(err.message || "Failed to receive tracking number.");
    } finally {
      setBusy("");
    }
  };

  const showDetail = async (cart) => {
    try {
      const response = await getShipmentDetail(cart.cart_id);
      setDetail(response?.shipment || null);
    } catch (err) {
      setError(err.message || "Failed to load shipment detail.");
    }
  };

  return (
    <main className="opsPage">
      <div className="opsHeader">
        <div>
          <p className="opsEyebrow">Operations / Cargo</p>
          <h1>Cargo receipt</h1>
          <p className="opsMuted">Search persisted order carts, receive tracking packages, and record customs fees directly.</p>
        </div>
        <div className="opsControlGroup">
          <label>
            Month
            <select value={monthId} onChange={(event) => setMonthId(event.target.value)}>
              {months.map((month) => (
                <option key={month.id} value={month.id}>
                  {month.name} (#{month.id})
                </option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="SHEIN order, cart, tracking"
            />
          </label>
        </div>
      </div>

      {error && <div className="opsAlert opsAlertError">{error}</div>}
      {notice && <div className="opsAlert opsAlertSuccess">{notice}</div>}

      <section className="opsCard">
        <div className="opsToolbar">
          <div>
            <h2>Existing shipment carts</h2>
            <p className="opsMuted">{carts.length} matching cart(s)</p>
          </div>
          <button onClick={load}>Refresh</button>
        </div>

        {!carts.length ? (
          <div className="opsEmpty">No persisted tracking data matches this search.</div>
        ) : (
          <div className="opsTableWrap">
            <table className="opsTable">
              <thead>
                <tr>
                  <th>SHEIN order</th>
                  <th>Internal order / cart</th>
                  <th>Weight & Est. Customs</th>
                  <th>Tracking parts</th>
                  <th>Receipt</th>
                  <th>Delivered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {carts.map((cart) => (
                  <tr key={cart.cart_id}>
                    <td>
                      <strong>{cart.shein_order_no || "-"}</strong>
                      <small>{cart.carrier || "Carrier unknown"}</small>
                    </td>
                    <td>
                      {cart.order_name || `Order #${cart.order_id}`}
                      <small>Cart {cart.cart_order_number || `#${cart.cart_id}`}</small>
                    </td>
                    <td>
                      <strong>
                        {cart.weight_kg != null ? `${Number(cart.weight_kg).toFixed(3)} kg` : "-"}
                      </strong>
                      <small>
                        Rate: {cart.kg_price ? `$${Number(cart.kg_price).toFixed(2)}/kg` : "Not set"}
                      </small>
                      {cart.calculated_customs_fee > 0 && (
                        <small style={{ color: "#4f46e5", fontWeight: "700" }}>
                          Est: ${Number(cart.calculated_customs_fee).toFixed(2)}
                        </small>
                      )}
                    </td>
                    <td>
                      <div className="opsParts">
                        {cart.parts.map((part) => (
                          <div key={part.tracking_no} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <span className={part.received ? "opsPill opsPillGood" : "opsPill"}>
                              {part.tracking_no}
                            </span>
                            {part.customs && (
                              <span
                                className="opsCustomsBadge"
                                onClick={() => openReceiveModal(cart, part)}
                                title="Click to view or edit customs fee"
                              >
                                ✓ ${Number(part.customs.customs_fee).toFixed(2)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <strong>
                        {cart.received_count}/{cart.expected_count}
                      </strong>
                      <small>{cart.receipt_status}</small>
                    </td>
                    <td>{cart.delivered ? "Yes" : "No"}</td>
                    <td>
                      <button onClick={() => showDetail(cart)}>Details</button>
                      {cart.parts.map((part) => {
                        const isBusy = busy === `${cart.cart_id}:${part.tracking_no}`;
                        if (!part.received) {
                          return (
                            <button
                              key={part.tracking_no}
                              className="opsBtnReceive"
                              disabled={isBusy}
                              onClick={() => openReceiveModal(cart, part)}
                            >
                              Receive {part.tracking_no}
                            </button>
                          );
                        }
                        if (!part.customs) {
                          return (
                            <button
                              key={part.tracking_no}
                              className="opsBtnAddCustoms"
                              disabled={isBusy}
                              onClick={() => openReceiveModal(cart, part)}
                              title="Package received. Click to record customs fee."
                            >
                              + Customs {cart.calculated_customs_fee > 0 ? `($${cart.calculated_customs_fee})` : ""}
                            </button>
                          );
                        }
                        return null;
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail && (
        <section className="opsCard">
          <div className="opsToolbar">
            <div>
              <h2>Shipment detail</h2>
              <p className="opsMuted">Group {detail.shipment_group_key}</p>
            </div>
            <button onClick={() => setDetail(null)}>Close</button>
          </div>
          <div className="opsDetailGrid">
            <div>
              <strong>Receipt</strong>
              <span>
                {detail.received_count}/{detail.expected_count} · {detail.receipt_status}
              </span>
            </div>
            <div>
              <strong>Related carts</strong>
              <span>
                {detail.related_carts
                  ?.map((cart) => `${cart.order_name || cart.order_id} / cart ${cart.cart_order_number}`)
                  .join(", ") || "-"}
              </span>
            </div>
            <div>
              <strong>Customers unlocked</strong>
              <span>{detail.customers?.length || 0}</span>
            </div>
          </div>
          {detail.customers?.length ? (
            <div className="opsTableWrap">
              <table className="opsTable">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Order / cart</th>
                    <th>Delivery state</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.customer_name}</td>
                      <td>
                        {customer.order_name} / cart {customer.cart_order_number}
                      </td>
                      <td>{customer.received_at ? "Received" : "Awaiting complete shipment"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      )}

      {/* Receive Shipment & Customs Modal */}
      {receiveModal.isOpen && receiveModal.cart && (
        <div
          className="opsModalOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeReceiveModal();
          }}
        >
          <div className="opsCustomerAssignModal" style={{ width: "min(520px, 100%)" }}>
            <div className="opsCustomerAssignModalHead">
              <div>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "#0f172a" }}>
                  {receiveModal.isAlreadyReceived ? "📦 Customs Fee Details" : "📦 Receive Shipment & Customs"}
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
                  Tracking #{receiveModal.tracking_no}
                </p>
              </div>
              <button className="opsCloseBtn" onClick={closeReceiveModal} title="Close">
                ✕
              </button>
            </div>

            <div className="opsCustomerAssignModalBody">
              {/* Package Details Box */}
              <div
                style={{
                  background: "#f8fafc",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  display: "grid",
                  gap: "6px",
                  fontSize: "13px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong style={{ color: "#475569" }}>Tracking Number:</strong>
                  <span style={{ fontFamily: "monospace", fontWeight: "700", color: "#312e81" }}>
                    {receiveModal.tracking_no}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong style={{ color: "#475569" }}>Order / Cart:</strong>
                  <span>
                    {receiveModal.cart.order_name || `Order #${receiveModal.cart.order_id}`} · Cart{" "}
                    {receiveModal.cart.cart_order_number || `#${receiveModal.cart.cart_id}`}
                  </span>
                </div>
                {receiveModal.cart.shein_order_no && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong style={{ color: "#475569" }}>SHEIN Order:</strong>
                    <span>{receiveModal.cart.shein_order_no}</span>
                  </div>
                )}
              </div>

              {/* Rate Calculation Banner */}
              <div className="opsCargoCalcBanner">
                <div className="opsCargoCalcFormula">
                  <span>🧮 Rate Calculation:</span>
                  <span>
                    {Number(receiveModal.weightKg || 0).toFixed(3)} kg × $
                    {Number(receiveModal.kgPrice || 0).toFixed(2)}/kg = ${receiveModal.calculatedFee}
                  </span>
                </div>
                <div className="opsCargoCalcDesc">
                  Calculation of price × weight in kg is used as the default placeholder and can be edited below.
                </div>
              </div>

              {/* Checkbox option if receiving fresh package */}
              {!receiveModal.isAlreadyReceived && (
                <label className="opsCheckboxLabel">
                  <input
                    type="checkbox"
                    checked={receiveModal.addCustoms}
                    onChange={(e) =>
                      setReceiveModal((prev) => ({ ...prev, addCustoms: e.target.checked }))
                    }
                  />
                  <span>Record customs fee for this shipment</span>
                </label>
              )}

              {/* Customs Input Fields */}
              {(receiveModal.addCustoms || receiveModal.isAlreadyReceived) && (
                <>
                  <div className="opsFieldGroup">
                    <label>Customs Fee ($) — Editable (Calculation Placeholder)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="opsModalInput"
                      placeholder={
                        receiveModal.calculatedFee && Number(receiveModal.calculatedFee) > 0
                          ? receiveModal.calculatedFee
                          : "0.00"
                      }
                      value={receiveModal.customsFee}
                      onChange={(e) =>
                        setReceiveModal((prev) => ({ ...prev, customsFee: e.target.value }))
                      }
                    />
                    <span className="opsFieldHelp">
                      Placeholder shows calculated: <strong>${receiveModal.calculatedFee}</strong>. You can edit this amount freely.
                    </span>
                  </div>

                  <div className="opsFieldGroup">
                    <label>Package Weight (kg)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      className="opsModalInput"
                      placeholder={receiveModal.weightKg ? String(receiveModal.weightKg) : "0.000"}
                      value={receiveModal.weightKg}
                      onChange={(e) => handleWeightChange(e.target.value)}
                    />
                    <span className="opsFieldHelp">
                      Adjusting weight updates the rate calculation placeholder.
                    </span>
                  </div>

                  <div className="opsFieldGroup">
                    <label>Description / Category</label>
                    <select
                      className="opsModalInput"
                      value={receiveModal.description}
                      onChange={(e) =>
                        setReceiveModal((prev) => ({ ...prev, description: e.target.value }))
                      }
                    >
                      <option value="freight">freight</option>
                      <option value="customs">customs</option>
                      <option value="benzene">benzene</option>
                      <option value="bags">bags</option>
                      <option value="other">other</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="opsCustomerAssignModalFooter">
              <button
                type="button"
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#f1f5f9",
                  color: "#475569",
                  padding: "9px 16px",
                  borderRadius: "9px",
                  fontWeight: "750",
                  cursor: "pointer",
                }}
                onClick={closeReceiveModal}
              >
                Cancel
              </button>

              {!receiveModal.isAlreadyReceived ? (
                <>
                  <button
                    type="button"
                    style={{
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      color: "#334155",
                      padding: "9px 14px",
                      borderRadius: "9px",
                      fontWeight: "750",
                      cursor: "pointer",
                    }}
                    disabled={busy === `${receiveModal.cart.cart_id}:${receiveModal.tracking_no}`}
                    onClick={() => handleConfirmReceive(false)}
                  >
                    Receive Only (No Customs)
                  </button>
                  <button
                    type="button"
                    className="opsBtnReceive"
                    style={{ margin: 0, padding: "9px 16px" }}
                    disabled={busy === `${receiveModal.cart.cart_id}:${receiveModal.tracking_no}`}
                    onClick={() => handleConfirmReceive(receiveModal.addCustoms)}
                  >
                    {receiveModal.addCustoms
                      ? `Receive & Add Customs (${
                          receiveModal.customsFee !== ""
                            ? `$${Number(receiveModal.customsFee || 0).toFixed(2)}`
                            : `$${receiveModal.calculatedFee}`
                        })`
                      : "Receive Package"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="opsBtnReceive"
                  style={{ margin: 0, padding: "9px 16px" }}
                  disabled={busy === `${receiveModal.cart.cart_id}:${receiveModal.tracking_no}`}
                  onClick={() => handleConfirmReceive(true)}
                >
                  Save Customs Fee
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
