import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMonths } from "../api/monthApi";
import { getDeliveredNotInCustoms } from "../api/customsApi";
import { CustomModal } from "../components/CustomModal";
import { clearAuthSession } from "../utils/auth";
import CustomDropdown from "../components/CustomDropdown";
import "../dashboard.css";

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

export default function AwaitingCargoPage() {
  const nav = useNavigate();
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [packages, setPackages] = useState([]);
  const [modal, setModal] = useState({ isOpen: false });

  const closeModal = () => setModal({ isOpen: false });
  const openError = (message, title = "Error") =>
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

  const handleAuthFail = () => {
    clearAuthSession();
    nav(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true });
  };

  const loadData = async (monthId) => {
    if (!monthId) return;
    const res = await getDeliveredNotInCustoms(monthId);
    if (res?.ok === false || res?.success === false) {
      if (isAuthErrorPayload(res)) return handleAuthFail();
      throw new Error(res?.error || "Failed to load awaiting cargo packages");
    }
    setPackages(Array.isArray(res?.packages) ? res.packages : []);
  };

  useEffect(() => {
    (async () => {
      try {
        const mRes = await getMonths();
        const list = Array.isArray(mRes) ? mRes : [];
        setMonths(list);
        if (list.length) setSelectedMonth(String(list[0].id));
      } catch {
        openError("Failed to load months.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedMonth) return;
    (async () => {
      try {
        await loadData(selectedMonth);
      } catch (err) {
        openError(err?.message || "Failed to load awaiting cargo.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  return (
    <div className="dashPage">
      <header className="dashHeader">
        <div>
          <h1 className="dashTitle">Awaiting Cargo</h1>
          <p className="dashSub">Delivered from SHEIN but not yet added to customs (not received from cargo yet).</p>
        </div>
        <div className="dashHeaderRight">
          <CustomDropdown
            className="dashSelect"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            options={months.map((m) => ({ value: String(m.id), label: m.name }))}
            placeholder="Select Month"
          />
          <div className="dashCargoTopActions">
            <button className="dashBtn" onClick={() => loadData(selectedMonth)}>
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="dashStats">
        <div className="dashStat">
          <div className="dashStatTitle">Awaiting Packages</div>
          <div className="dashStatValue">{packages.length}</div>
        </div>
      </div>

      <div className="dashCard">
        <div className="dashCardHead">
          <div>
            <div className="dashCardTitle">Delivered, Not Added To Customs</div>
            <div className="dashCardSub">These are still waiting to be received from cargo.</div>
          </div>
        </div>
        <div className="dashCardBody">
          {packages.length === 0 ? (
            <div className="dashRefText">No delivered packages pending customs for this month.</div>
          ) : (
            <div className="dashTableWrap">
              <table className="dashTable">
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Type</th>
                    <th>Tracking</th>
                    <th>Missing In Customs</th>
                    <th>Already Added</th>
                    <th>Refs</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((p) => (
                    <tr key={p.group_key}>
                      <td>{p.display_label || p.group_key}</td>
                      <td>{p.group_type || "-"}</td>
                      <td>{Array.isArray(p.tracking_numbers) ? p.tracking_numbers.join(", ") : "-"}</td>
                      <td>{Array.isArray(p.missing_from_customs_tracking_numbers) ? p.missing_from_customs_tracking_numbers.join(", ") : "-"}</td>
                      <td>{Array.isArray(p.added_to_customs_tracking_numbers) && p.added_to_customs_tracking_numbers.length ? p.added_to_customs_tracking_numbers.join(", ") : "-"}</td>
                      <td>{Array.isArray(p.order_cart_refs) ? p.order_cart_refs.join(" ; ") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <CustomModal {...modal} />
    </div>
  );
}

