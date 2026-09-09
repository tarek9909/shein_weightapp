import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMonths } from "../api/monthApi";
import {
  getCargoPackages,
  setCargoPackageStatus,
  confirmCargoPayroll,
  getCargoPayrollPreview,
  getPendingCargoPayrolls,
  acceptPendingCargoPayroll,
} from "../api/customsApi";
import { CustomModal } from "../components/CustomModal";
import { clearAuthSession } from "../utils/auth";
import CustomDropdown from "../components/CustomDropdown";
import "../dashboard.css";

const money = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

export default function CargoSortingPage() {
  const nav = useNavigate();
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [notSortedPackages, setNotSortedPackages] = useState([]);
  const [sortedPackages, setSortedPackages] = useState([]);
  const [pendingPayrolls, setPendingPayrolls] = useState([]);
  const [selectedPendingId, setSelectedPendingId] = useState(null);
  const [modal, setModal] = useState({ isOpen: false });
  const [confirm, setConfirm] = useState({ isOpen: false });

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

  const openConfirm = ({ title, message, onYes }) =>
    setConfirm({
      isOpen: true,
      title,
      message,
      showCancel: true,
      confirmText: "Confirm",
      cancelText: "Cancel",
      onConfirm: async () => {
        setConfirm({ isOpen: false });
        await onYes();
      },
      onCancel: () => setConfirm({ isOpen: false }),
      onClose: () => setConfirm({ isOpen: false }),
    });

  const handleAuthFail = () => {
    clearAuthSession();
    nav(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true });
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

  const loadCargo = async (monthId) => {
    if (!monthId) return;
    const res = await getCargoPackages(monthId);
    if (res?.ok === false || res?.success === false) {
      if (isAuthErrorPayload(res)) return handleAuthFail();
      throw new Error(res?.error || "Failed to load cargo packages");
    }
    const all = Array.isArray(res?.all)
      ? res.all
      : [...(Array.isArray(res?.pending) ? res.pending : []), ...(Array.isArray(res?.confirmed) ? res.confirmed : [])];
    const notSorted = all.filter((pkg) => String(pkg?.status || "") !== "sorted");
    const sorted = all.filter((pkg) => String(pkg?.status || "") === "sorted");
    setNotSortedPackages(notSorted);
    setSortedPackages(sorted);
  };

  const loadPendingPayrolls = async (monthId) => {
    if (!monthId) return;
    const res = await getPendingCargoPayrolls(monthId);
    if (res?.ok === false || res?.success === false) {
      if (isAuthErrorPayload(res)) return handleAuthFail();
      throw new Error(res?.error || "Failed to load pending payrolls");
    }
    const list = Array.isArray(res?.pending_payrolls) ? res.pending_payrolls : [];
    setPendingPayrolls(list);
    setSelectedPendingId((prev) => {
      if (prev && list.some((x) => Number(x.id) === Number(prev))) return prev;
      return list.length ? Number(list[0].id) : null;
    });
  };

  const loadAll = async (monthId) => {
    await loadCargo(monthId);
    await loadPendingPayrolls(monthId);
  };

  useEffect(() => {
    if (!selectedMonth) return;
    (async () => {
      try {
        await loadAll(selectedMonth);
      } catch (err) {
        openError(err?.message || "Failed to load cargo data.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const selectedPending = useMemo(
    () => pendingPayrolls.find((x) => Number(x.id) === Number(selectedPendingId)) || null,
    [pendingPayrolls, selectedPendingId]
  );

  const onSetStatus = (pkg, status) => {
    openConfirm({
      title: status === "sorted" ? "Mark as Sorted" : "Mark as Not Sorted",
      message:
        `${pkg.display_label || pkg.group_key}\n` +
        `Status: ${status === "sorted" ? "Sorted" : "Not Sorted"}\n` +
        "Do you want to confirm?",
      onYes: async () => {
        try {
          const res = await setCargoPackageStatus({
            month_id: Number(selectedMonth),
            group_key: pkg.group_key,
            group_type: pkg.group_type,
            display_label: pkg.display_label,
            tracking_numbers: Array.isArray(pkg.tracking_numbers) ? pkg.tracking_numbers : [],
            status,
          });
          if (res?.ok === false || res?.success === false) {
            if (isAuthErrorPayload(res)) return handleAuthFail();
            throw new Error(res?.error || "Failed to save package status");
          }
          await loadAll(selectedMonth);
        } catch (err) {
          openError(err?.message || "Failed to update package status.");
        }
      },
    });
  };

  const onConfirmPayroll = () => {
    setModal({
      isOpen: true,
      title: "Payroll Per-Unit Amount",
      message: "Enter payroll amount per sorted package.",
      inputProps: { type: "number", placeholder: "Per package amount", defaultValue: "0" },
      confirmText: "Preview",
      showCancel: true,
      onCancel: closeModal,
      onClose: closeModal,
      onConfirm: async (val) => {
        try {
          closeModal();
          const perUnit = Number(val || 0);
          if (!Number.isFinite(perUnit) || perUnit < 0) {
            openError("Per-unit amount must be a number >= 0.");
            return;
          }
          const previewRes = await getCargoPayrollPreview({
            month_id: Number(selectedMonth),
            per_unit_amount: perUnit,
          });
          if (previewRes?.ok === false || previewRes?.success === false) {
            if (isAuthErrorPayload(previewRes)) return handleAuthFail();
            throw new Error(previewRes?.error || "Failed to build payroll preview");
          }
          const preview = previewRes?.preview || {};
          const pkgLines = Array.isArray(preview.packages)
            ? preview.packages.slice(0, 20).map((p) => {
                const w = Number(p?.weight_kg || 0).toFixed(3);
                const amt = money(p?.amount || 0);
                return `- ${p?.display_label || p?.group_key} | ${w}kg | $${amt}`;
              })
            : [];
          const detailsMessage =
            `Sorted packages: ${Number(preview.sorted_count || 0)}\n` +
            `Orders count: ${Number(preview.orders_count || 0)}\n` +
            `Per-unit amount: $${money(preview.per_unit_amount || 0)}\n` +
            `Total payroll: $${money(preview.total_payroll || 0)}\n\n` +
            `Packages:\n${pkgLines.join("\n") || "-"}`;

          openConfirm({
            title: "Move To Pending Payment",
            message: detailsMessage,
            onYes: async () => {
              try {
                const res = await confirmCargoPayroll({
                  month_id: Number(selectedMonth),
                  per_unit_amount: perUnit,
                  note: "Pending payroll from cargo sorting",
                });
                if (res?.ok === false || res?.success === false) {
                  if (isAuthErrorPayload(res)) return handleAuthFail();
                  throw new Error(res?.error || "Failed to create pending payroll");
                }
                await loadAll(selectedMonth);
                openError(`Pending payroll created: $${money(res?.summary?.total_payroll || 0)}`, "Pending Payment");
              } catch (err) {
                openError(err?.message || "Failed to create pending payroll.");
              }
            },
          });
        } catch (err) {
          openError(err?.message || "Failed to process payroll.");
        }
      },
    });
  };

  const showPendingDetails = (row) => {
    const pkgLines = (row?.packages || []).map((p) => {
      const w = Number(p?.weight_kg || 0).toFixed(3);
      return `- ${p?.display_label || p?.group_key} | ${w}kg | $${money(p?.amount || 0)}`;
    });
    const orderLines = (row?.summary?.orders || []).map((o) => `- ${o.order_name}: $${money(o.amount || 0)}`);
    openError(
      `Pending ID: ${row?.id}\n` +
      `Sorted packages: ${Number(row?.sorted_count || 0)}\n` +
      `Per-unit amount: $${money(row?.per_unit_amount || 0)}\n` +
      `Total payroll: $${money(row?.total_payroll || 0)}\n\n` +
      `Packages:\n${pkgLines.join("\n") || "-"}\n\n` +
      `Per Order:\n${orderLines.join("\n") || "-"}`,
      "Pending Payment Details"
    );
  };

  const onAcceptPending = () => {
    if (!selectedPending) {
      openError("Select one pending payment first.");
      return;
    }
    openConfirm({
      title: "Accept Pending Payment",
      message:
        `Pending ID: ${selectedPending.id}\n` +
        `Sorted packages: ${Number(selectedPending.sorted_count || 0)}\n` +
        `Total payroll: $${money(selectedPending.total_payroll || 0)}\n\n` +
        "This will add one payment row to customs.",
      onYes: async () => {
        try {
          const res = await acceptPendingCargoPayroll({ pending_id: Number(selectedPending.id) });
          if (res?.ok === false || res?.success === false) {
            if (isAuthErrorPayload(res)) return handleAuthFail();
            throw new Error(res?.error || "Failed to accept pending payment");
          }
          await loadAll(selectedMonth);
          openError("Pending payment accepted and added to customs.", "Accepted");
        } catch (err) {
          openError(err?.message || "Failed to accept pending payment.");
        }
      },
    });
  };

  return (
    <div className="dashPage">
      <header className="dashHeader">
        <div>
          <h1 className="dashTitle">Cargo Sorting</h1>
          <p className="dashSub">Manage sorted/not sorted status for received packages.</p>
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
            <button
              className="dashBtn"
              onClick={async () => {
                try {
                  await loadAll(selectedMonth);
                } catch (err) {
                  openError(err?.message || "Failed to refresh cargo sorting.");
                }
              }}
            >
              Refresh
            </button>
            <button className="dashBtnSoft" onClick={onConfirmPayroll}>
              Move Sorted To Pending Payment
            </button>
          </div>
        </div>
      </header>

      <div className="dashStats">
        <div className="dashStat">
          <div className="dashStatTitle">Not Sorted</div>
          <div className="dashStatValue">{notSortedPackages.length}</div>
        </div>
        <div className="dashStat">
          <div className="dashStatTitle">Sorted</div>
          <div className="dashStatValue">{sortedPackages.length}</div>
        </div>
        <div className="dashStat">
          <div className="dashStatTitle">Pending Payment</div>
          <div className="dashStatValue">{pendingPayrolls.length}</div>
        </div>
      </div>

      <div className="dashCard">
        <div className="dashCardHead">
          <div>
            <div className="dashCardTitle">Not Sorted Packages</div>
            <div className="dashCardSub">Upper list always contains not sorted packages.</div>
          </div>
        </div>
        <div className="dashCardBody">
          {notSortedPackages.length === 0 ? (
            <div className="dashRefText">No not-sorted packages.</div>
          ) : (
            <div className="dashTableWrap">
              <table className="dashTable">
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Type</th>
                    <th>Split Status</th>
                    <th>Tracking</th>
                    <th>Refs</th>
                    <th>Weight (kg)</th>
                    <th>Customs Fee</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {notSortedPackages.map((pkg) => (
                    <tr key={pkg.group_key}>
                      <td>{pkg.display_label || pkg.group_key}</td>
                      <td>{pkg.group_type || "-"}</td>
                      <td>
                        {pkg.group_type === "split"
                          ? (Number(pkg.split_completed || 0) === 1
                            ? "Completed"
                            : `Pending (${Number(pkg.split_received_count || 0)}/${Number(pkg.split_total_count || 0)})`)
                          : "-"}
                      </td>
                      <td>{Array.isArray(pkg.tracking_numbers) ? pkg.tracking_numbers.join(", ") : "-"}</td>
                      <td>{Array.isArray(pkg.order_cart_refs) ? pkg.order_cart_refs.join(" ; ") : "-"}</td>
                      <td>{Number(pkg.total_weight_kg || 0).toFixed(3)}</td>
                      <td>${money(pkg.total_customs_fee)}</td>
                      <td>
                        <div className="dashCargoActionBtns">
                          <button className="dashBtn" onClick={() => onSetStatus(pkg, "sorted")}>
                            Mark Sorted
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="dashCard">
        <div className="dashCardHead">
          <div>
            <div className="dashCardTitle">Sorted Packages</div>
            <div className="dashCardSub">Once moved to pending payment, they disappear from this table.</div>
          </div>
        </div>
        <div className="dashCardBody">
          {sortedPackages.length === 0 ? (
            <div className="dashRefText">No sorted packages.</div>
          ) : (
            <div className="dashTableWrap">
              <table className="dashTable">
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Status</th>
                    <th>Split Status</th>
                    <th>Tracking</th>
                    <th>Refs</th>
                    <th>Weight (kg)</th>
                    <th>Customs Fee</th>
                    <th>Confirmed At</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPackages.map((pkg) => (
                    <tr key={pkg.group_key}>
                      <td>{pkg.display_label || pkg.group_key}</td>
                      <td>{pkg.status === "sorted" ? "Sorted" : "Not Sorted"}</td>
                      <td>
                        {pkg.group_type === "split"
                          ? (Number(pkg.split_completed || 0) === 1
                            ? "Completed"
                            : `Pending (${Number(pkg.split_received_count || 0)}/${Number(pkg.split_total_count || 0)})`)
                          : "-"}
                      </td>
                      <td>{Array.isArray(pkg.tracking_numbers) ? pkg.tracking_numbers.join(", ") : "-"}</td>
                      <td>{Array.isArray(pkg.order_cart_refs) ? pkg.order_cart_refs.join(" ; ") : "-"}</td>
                      <td>{Number(pkg.total_weight_kg || 0).toFixed(3)}</td>
                      <td>${money(pkg.total_customs_fee)}</td>
                      <td>{pkg.confirmed_at || "-"}</td>
                      <td>
                        <div className="dashCargoActionBtns">
                          <button className="dashBtnSoft" onClick={() => onSetStatus(pkg, "not_sorted")}>
                            Revert to Not Sorted
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="dashCard">
        <div className="dashCardHead">
          <div>
            <div className="dashCardTitle">Pending Payment</div>
            <div className="dashCardSub">Accept button is outside table. Nothing is added to customs until accepted.</div>
          </div>
        </div>
        <div className="dashCardBody">
          {pendingPayrolls.length === 0 ? (
            <div className="dashRefText">No pending payments.</div>
          ) : (
            <>
              <div className="dashTableWrap">
                <table className="dashTable">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Pending ID</th>
                      <th>Created</th>
                      <th>Packages</th>
                      <th>Per Unit</th>
                      <th>Total Payroll</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPayrolls.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <input
                            type="radio"
                            checked={Number(selectedPendingId) === Number(row.id)}
                            onChange={() => setSelectedPendingId(Number(row.id))}
                          />
                        </td>
                        <td>{row.id}</td>
                        <td>{row.created_at || "-"}</td>
                        <td>{Number(row.sorted_count || 0)}</td>
                        <td>${money(row.per_unit_amount || 0)}</td>
                        <td>${money(row.total_payroll || 0)}</td>
                        <td>
                          <button className="dashBtnSoft" onClick={() => showPendingDetails(row)}>
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dashCargoTopActions" style={{ marginTop: 12 }}>
                <button className="dashBtn" onClick={onAcceptPending}>
                  Accept Selected Pending Payment
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <CustomModal {...modal} />
      <CustomModal {...confirm} />
    </div>
  );
}

