import { useEffect, useState } from "react";
import { getReports } from "../api/reportsApi";

const money = (value) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getReports().then((data) => setReports(data?.reports || [])).catch((err) => setError(err?.message || "Could not load reports."));
  }, []);

  return (
    <main className="reportPage">
      <h1>Reports</h1>
      <p>Monthly financial and operations summaries.</p>
      {error && <p role="alert">{error}</p>}
      {!error && reports.length === 0 ? <p>No monthly data yet.</p> : (
        <table><thead><tr><th>Month</th><th>Orders</th><th>Collected</th><th>Customs</th><th>Losses</th></tr></thead>
          <tbody>{reports.map((report) => <tr key={report.id}><td>{report.name}</td><td>${money(report.orders_to_collect)}</td><td>${money(report.payments_total)}</td><td>${money(report.customs_total)}</td><td>${money(report.losses_total)}</td></tr>)}</tbody>
        </table>
      )}
    </main>
  );
}
