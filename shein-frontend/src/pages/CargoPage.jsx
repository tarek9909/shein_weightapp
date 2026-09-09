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

  const load = useCallback(async () => {
    if (!monthId) return;
    try {
      const response = await getReceivableCarts(monthId, query);
      setCarts(Array.isArray(response?.carts) ? response.carts : []);
    } catch (err) { setError(err.message || "Failed to load cargo shipments."); }
  }, [monthId, query]);
  useEffect(() => { getMonths().then((response) => { const list = Array.isArray(response) ? response : []; setMonths(list); if (list.length) setMonthId(String(list[0].id)); }).catch((err) => setError(err.message || "Failed to load months.")); }, []);
  useEffect(() => {
    const timer = setTimeout(load, 160);
    return () => clearTimeout(timer);
  }, [load]);

  const receive = async (cart, tracking) => {
    const key = `${cart.cart_id}:${tracking}`;
    setBusy(key); setError(""); setNotice("");
    try {
      const response = await receiveShipment({ cart_id: cart.cart_id, tracking_no: tracking });
      setNotice(response?.idempotent ? `${tracking} was already received.` : `${tracking} received: ${response.received_count}/${response.expected_count}.`);
      await load();
      if (detail?.cart_id === cart.cart_id) { const next = await getShipmentDetail(cart.cart_id); setDetail(next?.shipment || null); }
    } catch (err) { setError(err.message || "Failed to receive tracking number."); }
    finally { setBusy(""); }
  };

  const showDetail = async (cart) => { try { const response = await getShipmentDetail(cart.cart_id); setDetail(response?.shipment || null); } catch (err) { setError(err.message || "Failed to load shipment detail."); } };

  return <main className="opsPage"><div className="opsHeader"><div><p className="opsEyebrow">Operations / Cargo</p><h1>Cargo receipt</h1><p className="opsMuted">Search persisted order carts and receive every tracking number in a shipment group.</p></div><div className="opsControlGroup"><label>Month<select value={monthId} onChange={(event) => setMonthId(event.target.value)}>{months.map((month) => <option key={month.id} value={month.id}>{month.name} (#{month.id})</option>)}</select></label><label>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SHEIN order, cart, tracking" /></label></div></div>{error && <div className="opsAlert opsAlertError">{error}</div>}{notice && <div className="opsAlert opsAlertSuccess">{notice}</div>}<section className="opsCard"><div className="opsToolbar"><div><h2>Existing shipment carts</h2><p className="opsMuted">{carts.length} matching cart(s)</p></div><button onClick={load}>Refresh</button></div>{!carts.length ? <div className="opsEmpty">No persisted tracking data matches this search.</div> : <div className="opsTableWrap"><table className="opsTable"><thead><tr><th>SHEIN order</th><th>Internal order / cart</th><th>Tracking parts</th><th>Receipt</th><th>Delivered</th><th>Actions</th></tr></thead><tbody>{carts.map((cart) => <tr key={cart.cart_id}><td><strong>{cart.shein_order_no || "-"}</strong><small>{cart.carrier || "Carrier unknown"}</small></td><td>{cart.order_name || `Order #${cart.order_id}`}<small>Cart {cart.cart_order_number || `#${cart.cart_id}`}</small></td><td><div className="opsParts">{cart.parts.map((part) => <span className={part.received ? "opsPill opsPillGood" : "opsPill"} key={part.tracking_no}>{part.tracking_no}</span>)}</div></td><td><strong>{cart.received_count}/{cart.expected_count}</strong><small>{cart.receipt_status}</small></td><td>{cart.delivered ? "Yes" : "No"}</td><td><button onClick={() => showDetail(cart)}>Details</button>{cart.parts.map((part) => <button key={part.tracking_no} disabled={part.received || busy === `${cart.cart_id}:${part.tracking_no}`} onClick={() => receive(cart, part.tracking_no)}>{part.received ? "Received" : `Receive ${part.tracking_no}`}</button>)}</td></tr>)}</tbody></table></div>}</section>{detail && <section className="opsCard"><div className="opsToolbar"><div><h2>Shipment detail</h2><p className="opsMuted">Group {detail.shipment_group_key}</p></div><button onClick={() => setDetail(null)}>Close</button></div><div className="opsDetailGrid"><div><strong>Receipt</strong><span>{detail.received_count}/{detail.expected_count} · {detail.receipt_status}</span></div><div><strong>Related carts</strong><span>{detail.related_carts?.map((cart) => `${cart.order_name || cart.order_id} / cart ${cart.cart_order_number}`).join(", ") || "-"}</span></div><div><strong>Customers unlocked</strong><span>{detail.customers?.length || 0}</span></div></div>{detail.customers?.length ? <div className="opsTableWrap"><table className="opsTable"><thead><tr><th>Customer</th><th>Order / cart</th><th>Delivery state</th></tr></thead><tbody>{detail.customers.map((customer) => <tr key={customer.id}><td>{customer.customer_name}</td><td>{customer.order_name} / cart {customer.cart_order_number}</td><td>{customer.received_at ? "Received" : "Awaiting complete shipment"}</td></tr>)}</tbody></table></div> : null}</section>}</main>;
}
