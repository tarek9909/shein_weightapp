import { useEffect, useState } from "react";
import { getMonths } from "../api/monthApi";
import { getActivity } from "../api/historyApi";
import "../operations.css";

const pretty = (value) => value == null ? "-" : JSON.stringify(value, null, 2);

export default function ActivityHistoryPage() {
  const [months, setMonths] = useState([]);
  const [monthId, setMonthId] = useState("");
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { getMonths().then((response) => { const list = Array.isArray(response) ? response : []; setMonths(list); if (list.length) setMonthId(String(list[0].id)); }).catch((err) => setError(err.message || "Failed to load months.")); }, []);
  useEffect(() => { if (!monthId) return; const timer = setTimeout(() => getActivity(monthId, { q: query, entity_type: entityType, action }).then((response) => setEvents(response?.events || [])).catch((err) => setError(err.message || "Failed to load activity.")), 180); return () => clearTimeout(timer); }, [monthId, query, entityType, action]);
  return <main className="opsPage"><div className="opsHeader"><div><p className="opsEyebrow">Audit / History</p><h1>Activity history</h1><p className="opsMuted">Append-only events explain receipt completion, assignments, collections, payments, losses, and reversals.</p></div><label>Month<select value={monthId} onChange={(event) => setMonthId(event.target.value)}>{months.map((month) => <option key={month.id} value={month.id}>{month.name} (#{month.id})</option>)}</select></label></div>{error && <div className="opsAlert opsAlertError">{error}</div>}<section className="opsCard"><div className="opsToolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search event, entity, or snapshot" /><select value={entityType} onChange={(event) => setEntityType(event.target.value)}><option value="">All entities</option><option value="shipment">Shipment</option><option value="customer">Customer</option><option value="payment">Payment</option><option value="loss">Loss</option></select><input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Action e.g. customer_collected" /></div>{!events.length ? <div className="opsEmpty">No activity matches this filter.</div> : <div className="opsEventList">{events.map((event) => <details className="opsEvent" key={event.id}><summary><span className="opsPill opsPillGood">{event.action}</span><strong>{event.entity_type} #{event.entity_id || "-"}</strong><span>{event.created_at}</span><small>Actor #{event.created_by}</small></summary><div className="opsEventBody"><div><strong>Before</strong><pre>{pretty(event.before_json)}</pre></div><div><strong>After</strong><pre>{pretty(event.after_json)}</pre></div><div><strong>Metadata</strong><pre>{pretty(event.metadata_json)}</pre></div></div></details>)}</div>}</section></main>;
}
