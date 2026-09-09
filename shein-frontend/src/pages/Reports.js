import { useEffect, useMemo, useState } from "react";
import { getReports } from "../api/reportsApi";
import "../reports.css";

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    setLoading(true);
    getReports()
      .then((data) => {
        setReports(data?.reports || []);
        setError("");
      })
      .catch((err) => setError(err?.message || "Could not load reports."))
      .finally(() => setLoading(false));
  }, []);

  const filteredReports = useMemo(() => {
    if (!searchTerm.trim()) return reports;
    const term = searchTerm.toLowerCase().trim();
    return reports.filter(
      (r) =>
        r.name?.toLowerCase().includes(term) ||
        String(r.id).includes(term)
    );
  }, [reports, searchTerm]);

  const totals = useMemo(() => {
    const totalOrdersToCollect = reports.reduce(
      (sum, r) => sum + Number(r.orders_to_collect || 0),
      0
    );
    const totalPayments = reports.reduce(
      (sum, r) => sum + Number(r.payments_total || 0),
      0
    );
    const totalCustoms = reports.reduce(
      (sum, r) => sum + Number(r.customs_total || 0),
      0
    );
    const totalLosses = reports.reduce(
      (sum, r) => sum + Number(r.losses_total || 0),
      0
    );
    const totalOrdersCount = reports.reduce(
      (sum, r) => sum + Number(r.order_count || 0),
      0
    );
    const netBalance = totalPayments - totalCustoms - totalLosses;
    const collectionPercentage =
      totalOrdersToCollect > 0
        ? Math.min(100, Math.round((totalPayments / totalOrdersToCollect) * 100))
        : 0;

    return {
      totalOrdersToCollect,
      totalPayments,
      totalCustoms,
      totalLosses,
      totalOrdersCount,
      netBalance,
      collectionPercentage,
    };
  }, [reports]);

  const handleExportCSV = () => {
    if (!reports.length) return;
    const headers = [
      "Month ID",
      "Month Name",
      "Orders Count",
      "Orders Amount ($)",
      "Collected Amount ($)",
      "Customs ($)",
      "Losses ($)",
      "Net Balance ($)",
    ];
    const rows = filteredReports.map((r) => {
      const net = r.payments_total - r.customs_total - r.losses_total;
      return [
        r.id,
        `"${r.name.replace(/"/g, '""')}"`,
        r.order_count || 0,
        r.orders_to_collect.toFixed(2),
        r.payments_total.toFixed(2),
        r.customs_total.toFixed(2),
        r.losses_total.toFixed(2),
        net.toFixed(2),
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SHEIN_Financial_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="rptPage">
      {/* Header */}
      <div className="rptHeader">
        <div className="rptHeaderLeft">
          <div className="rptTitleRow">
            <h1 className="rptTitle">Financial & Operational Reports</h1>
            <span className="rptBadge">{reports.length} Month Cycles</span>
          </div>
          <div className="rptSub">
            Monthly financial ledgers, revenue collections, customs fees, and net balances.
          </div>
        </div>

        <div className="rptHeaderRight">
          <input
            type="text"
            className="rptSearchInput"
            placeholder="Search month name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button
            type="button"
            className="rptBtnExport"
            onClick={handleExportCSV}
            disabled={!reports.length}
            title="Export data as CSV"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            className="rptBtnExport"
            onClick={handlePrint}
            title="Print report page"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rptErrorAlert" role="alert">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Hero KPI Cards */}
      <div className="rptKpiGrid">
        <div className="rptKpiCard rptKpiCard--primary">
          <div className="rptKpiHead">
            <span className="rptKpiLabel">Total Orders Volume</span>
            <div className="rptKpiIcon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>
          </div>
          <div className="rptKpiValue">${money(totals.totalOrdersToCollect)}</div>
          <div className="rptKpiSub">
            Across {totals.totalOrdersCount} total order{totals.totalOrdersCount !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="rptKpiCard rptKpiCard--success">
          <div className="rptKpiHead">
            <span className="rptKpiLabel">Total Collected</span>
            <div className="rptKpiIcon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
          </div>
          <div className="rptKpiValue">${money(totals.totalPayments)}</div>
          <div className="rptKpiSub">{totals.collectionPercentage}% of target collected</div>
        </div>

        <div className="rptKpiCard rptKpiCard--warning">
          <div className="rptKpiHead">
            <span className="rptKpiLabel">Total Customs & Losses</span>
            <div className="rptKpiIcon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
          </div>
          <div className="rptKpiValue">${money(totals.totalCustoms + totals.totalLosses)}</div>
          <div className="rptKpiSub">
            Customs: ${money(totals.totalCustoms)} | Losses: ${money(totals.totalLosses)}
          </div>
        </div>

        <div className="rptKpiCard rptKpiCard--primary">
          <div className="rptKpiHead">
            <span className="rptKpiLabel">Net Balance Margin</span>
            <div className="rptKpiIcon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </div>
          </div>
          <div
            className={`rptKpiValue ${
              totals.netBalance >= 0 ? "rptAmount--netPositive" : "rptAmount--netNegative"
            }`}
          >
            ${money(totals.netBalance)}
          </div>
          <div className="rptKpiSub">Collected minus customs and losses</div>
        </div>
      </div>

      {/* Main Table Section */}
      <div className="rptSection">
        <div className="rptSectionHead">
          <div className="rptSectionTitle">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            <span>Monthly Ledger Breakdown</span>
          </div>
          <span className="rptCountPill">
            Showing {filteredReports.length} of {reports.length} months
          </span>
        </div>

        <div className="rptTableWrap">
          {loading ? (
            <div className="rptEmpty">
              <div className="rptEmptyTitle">Loading Reports...</div>
              <div className="rptEmptySub">Fetching monthly ledgers and summaries.</div>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="rptEmpty">
              <div className="rptEmptyIcon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <div className="rptEmptyTitle">No Reports Found</div>
              <div className="rptEmptySub">
                {searchTerm ? "No monthly report matches your search." : "No monthly data recorded yet."}
              </div>
            </div>
          ) : (
            <table className="rptTable">
              <thead>
                <tr>
                  <th>Month Cycle</th>
                  <th>Orders Count</th>
                  <th>Orders Target ($)</th>
                  <th>Collected Revenue ($)</th>
                  <th>Collection Rate</th>
                  <th>Customs Fees ($)</th>
                  <th>Losses ($)</th>
                  <th>Net Balance ($)</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((r) => {
                  const net = r.payments_total - r.customs_total - r.losses_total;
                  const rate =
                    r.orders_to_collect > 0
                      ? Math.min(100, Math.round((r.payments_total / r.orders_to_collect) * 100))
                      : 0;

                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="rptMonthCell">
                          <span className="rptMonthBadge">#{r.id}</span>
                          <span>{r.name}</span>
                        </div>
                      </td>
                      <td>{r.order_count || 0} orders</td>
                      <td className="rptAmount rptAmount--collect">
                        ${money(r.orders_to_collect)}
                      </td>
                      <td className="rptAmount rptAmount--payments">
                        ${money(r.payments_total)}
                      </td>
                      <td>
                        <div className="rptProgressWrap">
                          <div className="rptProgressBar">
                            <div
                              className={`rptProgressFill ${
                                rate >= 80
                                  ? "rptProgressFill--high"
                                  : rate >= 40
                                  ? "rptProgressFill--med"
                                  : "rptProgressFill--low"
                              }`}
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="rptPercentText">{rate}%</span>
                        </div>
                      </td>
                      <td className="rptAmount rptAmount--customs">
                        ${money(r.customs_total)}
                      </td>
                      <td className="rptAmount rptAmount--losses">
                        ${money(r.losses_total)}
                      </td>
                      <td
                        className={`rptAmount ${
                          net >= 0 ? "rptAmount--netPositive" : "rptAmount--netNegative"
                        }`}
                      >
                        ${money(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
