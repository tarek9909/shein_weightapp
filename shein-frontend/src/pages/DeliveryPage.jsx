import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { getMonths } from "../api/monthApi";
import {
  getCustomersForDeliveryByMonth,
  updateCustomerDelivery,
  checkDeliveryNumberByMonth,
  updateCustomerUsdToCollect,
  previewDeliveryExcelImport,
  applyDeliveryExcelImport,
  getDeliveryLosses,
  addDeliveryLosses,
  updateDeliveryLoss,
  deleteDeliveryLoss,
  confirmDeliveryLosses,
} from "../api/deliveryApi";

import { CustomModal } from "../components/CustomModal";
import { isAuthenticated, clearAuthSession } from "../utils/auth";
import CustomDropdown from "../components/CustomDropdown";
import "../delivery.css";

function isAuthError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("invalid token") ||
    msg.includes("jwt") ||
    msg.includes("token")
  );
}

const DeliveryPage = () => {
  const nav = useNavigate();

  const [monthId, setMonthId] = useState("");
  const [months, setMonths] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState({ isOpen: false });

  const [excelPreviewRows, setExcelPreviewRows] = useState([]);
  const [excelSummary, setExcelSummary] = useState(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelApplying, setExcelApplying] = useState(false);
  const [excelFileName, setExcelFileName] = useState("");
  const [lossesModalOpen, setLossesModalOpen] = useState(false);
  const [pendingLosses, setPendingLosses] = useState([]);

  const closeModal = () => setModal({ isOpen: false });

  const openError = (message, title = "Error") => {
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
  };

  const ensureAuth = () => {
    if (!isAuthenticated()) {
      clearAuthSession();
      nav(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true });
      return false;
    }
    return true;
  };

  const handleAuthFail = () => {
    clearAuthSession();
    nav(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true });
  };

  const refreshCustomers = async () => {
    const data = await getCustomersForDeliveryByMonth(monthId);
    setCustomers(Array.isArray(data) ? data : []);
  };

  const refreshPendingLosses = async (mId = monthId) => {
    if (!mId) return;
    const res = await getDeliveryLosses(mId, "pending");
    setPendingLosses(Array.isArray(res?.rows) ? res.rows : []);
  };

  const resetExcelPreview = () => {
    setExcelPreviewRows([]);
    setExcelSummary(null);
    setExcelFileName("");
  };

  const recalcImportRow = (row) => {
    const next = { ...row };
    const total = Number(next.total_amount_usd || 0);
    const charge = Number(next.delivery_charge_usd || 0);
    if (next.net_amount_usd === undefined || next.net_amount_usd === null || next._recalc_net_from_parts) {
      next.net_amount_usd = Math.max(0, total - charge);
    } else {
      next.net_amount_usd = Number(next.net_amount_usd || 0);
    }

    const selectedId = Number(next.selected_customer_id || 0);
    const selectedMatch = Array.isArray(next.matches)
      ? next.matches.find((m) => Number(m.customer_id) === selectedId)
      : null;

    next.amount_mismatch = null;
    next.delivery_charge_mismatch = null;
    next.net_amount_diff = null;
    next.delivery_charge_diff = null;

    if (selectedMatch) {
      const dbUsd = Number(selectedMatch.usd_to_collect || 0);
      const netDiff = Number((Number(next.net_amount_usd || 0) - dbUsd).toFixed(2));
      next.net_amount_diff = netDiff;
      next.amount_mismatch = Math.abs(netDiff) > 0.009 ? 1 : 0;

      const dbDeliveryRaw = selectedMatch.delivery_charge_usd;
      if (dbDeliveryRaw !== null && dbDeliveryRaw !== undefined && dbDeliveryRaw !== "") {
        const dbDelivery = Number(dbDeliveryRaw || 0);
        const dcDiff = Number((Number(next.delivery_charge_usd || 0) - dbDelivery).toFixed(2));
        next.delivery_charge_diff = dcDiff;
        next.delivery_charge_mismatch = Math.abs(dcDiff) > 0.009 ? 1 : 0;
      }
    }
    delete next._recalc_net_from_parts;
    return next;
  };

  const collectImportLosses = (rows) => {
    const losses = [];
    (rows || []).forEach((r, idx) => {
      const selectedId = Number(r.selected_customer_id || 0);
      const selectedMatch = Array.isArray(r.matches)
        ? r.matches.find((m) => Number(m.customer_id) === selectedId)
        : null;
      if (!selectedMatch) return;

      const ref = `${selectedMatch.customer_name || r.customer_name_extracted || "-"} | order ${
        selectedMatch.order_name || selectedMatch.order_id || "-"
      } / cart ${selectedMatch.cart_order_number || selectedMatch.cart_id || "-"}`;
      const baseMeta = {
        customer_id: Number(selectedMatch.customer_id || 0) || null,
        customer_name: selectedMatch.customer_name || r.customer_name_extracted || "",
        order_id: Number(selectedMatch.order_id || 0) || null,
        order_name: selectedMatch.order_name || "",
        cart_id: Number(selectedMatch.cart_id || 0) || null,
        cart_order_number: selectedMatch.cart_order_number || "",
        source_key: `${selectedMatch.customer_id || "0"}|${selectedMatch.order_id || "0"}|${selectedMatch.cart_id || "0"}|${idx}`,
      };

      const netDiff = Number(r.net_amount_diff || 0);
      if (Math.abs(netDiff) > 0.009) {
        losses.push({
          row_index: idx,
          type: "out of stock item",
          amount: Math.abs(netDiff),
          signed_diff: netDiff,
          ref,
          ...baseMeta,
          description: `Out of stock item difference (net collect diff: ${netDiff > 0 ? "+" : ""}${netDiff.toFixed(
            2
          )})`,
        });
      }

      const dcDiff = Number(r.delivery_charge_diff || 0);
      if (Math.abs(dcDiff) > 0.009) {
        losses.push({
          row_index: idx,
          type: "delivery charge",
          amount: Math.abs(dcDiff),
          signed_diff: dcDiff,
          ref,
          ...baseMeta,
          description: `Delivery charge difference (${dcDiff > 0 ? "+" : ""}${dcDiff.toFixed(2)})`,
        });
      }
    });
    return losses;
  };

  const currentLosses = collectImportLosses(excelPreviewRows);
  const displayedLosses = [
    ...pendingLosses.map((x) => ({ ...x, source: "Pending Losses" })),
    ...currentLosses.map((x) => ({ ...x, source: "Current Preview" })),
  ];
  const totalLossAmount = displayedLosses.reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalDeliveryLossAmount = displayedLosses
    .filter((x) => x.type === "delivery charge")
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalOutOfStockLossAmount = displayedLosses
    .filter((x) => x.type === "out of stock item")
    .reduce((s, x) => s + Number(x.amount || 0), 0);

  useEffect(() => {
    if (!ensureAuth()) return;
    (async () => {
      try {
        const data = await getMonths();
        setMonths(Array.isArray(data) ? data : []);
      } catch (err) {
        if (isAuthError(err)) return handleAuthFail();
        openError("Failed to load months.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!monthId) {
      setCustomers([]);
      setSearch("");
      resetExcelPreview();
      setPendingLosses([]);
      return;
    }
    if (!ensureAuth()) return;
    (async () => {
      try {
        await refreshCustomers();
        await refreshPendingLosses(monthId);
      } catch (err) {
        if (isAuthError(err)) return handleAuthFail();
        openError("Failed to load customers for delivery.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthId]);

  const filteredCustomers = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      c.customer_name,
      c.delivery_number,
      c.status,
      c.order_name,
      c.order_id,
      c.cart_order_number,
      c.cart_id,
      c.usd_to_collect,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const manualAssignableMatches = customers
    .filter(
      (c) =>
        (!c.delivery_number || String(c.delivery_number).trim() === "") &&
        (!c.delivery_status ||
          String(c.delivery_status).trim() === "" ||
          String(c.delivery_status).toLowerCase() === "not added")
    )
    .map((c) => ({
      customer_id: Number(c.id),
      customer_name: String(c.customer_name || ""),
      usd_to_collect: Number(c.usd_to_collect || 0),
      order_id: Number(c.order_id || 0),
      order_name: String(c.order_name || ""),
      cart_id: Number(c.cart_id || 0),
      cart_order_number: String(c.cart_order_number || ""),
    }));

  const addManualExcelRow = () => {
    setExcelPreviewRows((prev) => [
      ...prev,
      {
        excel_row_num: 0,
        status: "confirmed",
        delivery_number: "",
        recipient_details: "",
        customer_name_extracted: "",
        total_amount_usd: 0,
        delivery_charge_usd: 0,
        net_amount_usd: 0,
        match_count: 0,
        matches: [],
        selected_customer_id: null,
        amount_mismatch: null,
        manual_entry: true,
      },
    ]);
    if (!excelSummary) {
      setExcelSummary({ total_rows: 1, single_matches: 0, duplicate_matches: 0, no_matches: 1 });
    }
  };

  const previewImportRow = (row) => {
    const selectedId = Number(row.selected_customer_id || 0);
    const selectedMatch = Array.isArray(row.matches)
      ? row.matches.find((m) => Number(m.customer_id) === selectedId)
      : null;
    const net = Number(row.net_amount_usd || 0);
    const dbUsd = Number(selectedMatch?.usd_to_collect || 0);
    const diff = selectedMatch ? net - dbUsd : null;
    setModal({
      isOpen: true,
      title: "Preview Import Row",
      message: [
        `Status: ${row.status || "-"}`,
        `Customer (Excel): ${row.customer_name_extracted || "-"}`,
        `Delivery #: ${row.delivery_number || "-"}`,
        `Total USD: ${Number(row.total_amount_usd || 0).toFixed(2)}`,
        `Delivery Charge: ${Number(row.delivery_charge_usd || 0).toFixed(2)}`,
        `Net USD (to compare): ${net.toFixed(2)}`,
        selectedMatch
          ? `Matched DB: ${selectedMatch.customer_name} | order ${selectedMatch.order_name} / cart ${selectedMatch.cart_order_number}`
          : "Matched DB: none selected",
        selectedMatch ? `DB USD: ${dbUsd.toFixed(2)}` : "",
        selectedMatch ? `Difference: ${diff.toFixed(2)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      onConfirm: closeModal,
      onCancel: closeModal,
      onClose: closeModal,
      confirmText: "OK",
      showCancel: false,
    });
  };

  const editImportRowNetPrice = (rowIndex) => {
    const row = excelPreviewRows[rowIndex];
    if (!row) return;
    setModal({
      isOpen: true,
      title: "Edit Net Price",
      message: "Edit the net USD amount used for price comparison and saving.",
      inputProps: {
        type: "number",
        placeholder: "Net USD",
        defaultValue: String(Number(row.net_amount_usd || 0)),
      },
      showCancel: true,
      confirmText: "Save",
      cancelText: "Cancel",
      onCancel: closeModal,
      onClose: closeModal,
      onConfirm: (v) => {
        const n = Number(String(v ?? "").trim());
        if (!Number.isFinite(n) || n < 0) {
          openError("Please enter a valid non-negative net price.", "Invalid Price");
          return;
        }
        patchExcelRow(rowIndex, { net_amount_usd: n });
        closeModal();
      },
    });
  };

  const patchExcelRow = (rowIndex, patch) => {
    setExcelPreviewRows((prev) =>
      prev.map((row, i) => {
        if (i !== rowIndex) return row;
        const next = { ...row, ...patch };
        if (Object.keys(patch || {}).length) {
          delete next.import_skip_reason;
        }
        if (!Object.prototype.hasOwnProperty.call(patch, "net_amount_usd")) next._recalc_net_from_parts = true;
        return recalcImportRow(next);
      })
    );
  };

  const handleExcelUpload = async (file) => {
    if (!file) return;
    if (!monthId) {
      openError("Please select a month before importing Excel.");
      return;
    }
    setExcelLoading(true);
    try {
      const res = await previewDeliveryExcelImport(monthId, file);
      if (!res?.ok) throw new Error(res?.error || "Failed to preview Excel import");
      setExcelPreviewRows((Array.isArray(res.rows) ? res.rows : []).map(recalcImportRow));
      setExcelSummary(res.summary || null);
      setExcelFileName(file.name || "Excel file");
    } catch (err) {
      if (isAuthError(err)) return handleAuthFail();
      openError(err?.message || "Failed to preview Excel import.", "Excel Import");
    } finally {
      setExcelLoading(false);
    }
  };

  const handleApplyExcelImport = async () => {
    if (!excelPreviewRows.length || !monthId) return;
    setExcelApplying(true);
    try {
      const lossesBeforeApply = collectImportLosses(excelPreviewRows);
      const rows = excelPreviewRows.map((r) => ({
        status: r.status,
        selected_customer_id: Number(r.selected_customer_id || 0),
        delivery_number: String(r.delivery_number || "").trim(),
        total_amount_usd: Number(r.total_amount_usd || 0),
        delivery_charge_usd: Number(r.delivery_charge_usd || 0),
        net_amount_usd: Number(r.net_amount_usd || 0),
        customer_name_extracted: r.customer_name_extracted || "",
      }));
      const res = await applyDeliveryExcelImport(monthId, rows);
      if (!res?.ok) throw new Error(res?.error || "Failed to apply Excel import");
      if (lossesBeforeApply.length) {
        await addDeliveryLosses(
          monthId,
          lossesBeforeApply.map((x) => ({
            type: x.type,
            amount: x.amount,
            signed_diff: x.signed_diff,
            description: x.description,
            ref: x.ref,
            source_key: `apply|${x.source_key || ""}|${x.type}|${x.row_index}`,
            customer_id: x.customer_id,
            customer_name: x.customer_name,
            order_id: x.order_id,
            order_name: x.order_name,
            cart_id: x.cart_id,
            cart_order_number: x.cart_order_number,
          }))
        ).catch(() => null);
      }
      await refreshCustomers();
      await refreshPendingLosses();
      const skippedByIndex = new Map(
        (Array.isArray(res.skipped) ? res.skipped : []).map((s) => [
          Number(s.row_index),
          String(s.reason || "skipped"),
        ])
      );
      setExcelPreviewRows((prev) =>
        prev
          .map((r, idx) => ({
            ...r,
            import_skip_reason: skippedByIndex.has(idx) ? skippedByIndex.get(idx) : undefined,
          }))
          .filter((r, idx) => {
            const wasSkipped = skippedByIndex.has(idx);
            if (wasSkipped) return true;
            const cid = Number(r.selected_customer_id || 0);
            // Keep rows that still need manual assignment (no selected customer).
            if (cid <= 0) return true;
            // Remove successfully applied rows.
            return false;
          })
      );
      openError(
        `Applied: ${Number(res.applied_count || 0)} | Skipped: ${Number(res.skipped_count || 0)}`,
        "Import Result"
      );
    } catch (err) {
      if (isAuthError(err)) return handleAuthFail();
      openError(err?.message || "Failed to apply Excel import.", "Excel Import");
    } finally {
      setExcelApplying(false);
    }
  };

  const openLossesModal = () => {
    if (!currentLosses.length && !pendingLosses.length) {
      openError("No losses detected in the current import preview.", "Losses");
      return;
    }
    setLossesModalOpen(true);
  };

  const handleAddToLosses = async () => {
    if (!currentLosses.length) return;
    try {
      const payloadRows = currentLosses.map((x) => ({
        type: x.type,
        amount: x.amount,
        signed_diff: x.signed_diff,
        description: x.description,
        ref: x.ref,
        source_key: x.source_key || `${x.type}|${x.ref}|${x.signed_diff}|${x.row_index}`,
        customer_id: x.customer_id || null,
        customer_name: x.customer_name || "",
        order_id: x.order_id || null,
        order_name: x.order_name || "",
        cart_id: x.cart_id || null,
        cart_order_number: x.cart_order_number || "",
      }));
      await addDeliveryLosses(monthId, payloadRows);
      await refreshPendingLosses();
      setLossesModalOpen(false);
    } catch (err) {
      if (isAuthError(err)) return handleAuthFail();
      openError(err?.message || "Failed to add pending losses.", "Losses");
    }
  };

  const handleEditPendingLoss = (loss) => {
    setModal({
      isOpen: true,
      title: "Edit Pending Loss",
      message: `Ref: ${loss.ref_label || loss.ref || "-"}`,
      inputProps: {
        type: "number",
        placeholder: "Amount",
        defaultValue: String(Number(loss.amount || 0)),
      },
      showCancel: true,
      confirmText: "Next",
      cancelText: "Cancel",
      onCancel: closeModal,
      onClose: closeModal,
      onConfirm: (amountValue) => {
        const amt = Number(amountValue);
        if (!Number.isFinite(amt) || amt < 0) {
          openError("Amount must be a valid non-negative number.", "Invalid Amount");
          return;
        }
        setModal({
          isOpen: true,
          title: "Edit Pending Loss Description",
          inputProps: {
            placeholder: "Description",
            defaultValue: String(loss.description || ""),
          },
          showCancel: true,
          confirmText: "Save",
          cancelText: "Cancel",
          onCancel: closeModal,
          onClose: closeModal,
          onConfirm: async (desc) => {
            try {
              await updateDeliveryLoss(loss.id, {
                loss_type: loss.loss_type || loss.type || "delivery charge",
                amount: amt,
                description: String(desc || "").trim(),
              });
              await refreshPendingLosses();
              closeModal();
            } catch (err) {
              if (isAuthError(err)) return handleAuthFail();
              openError(err?.message || "Failed to update pending loss.", "Losses");
            }
          },
        });
      },
    });
  };

  const handleDeletePendingLoss = async (lossId) => {
    try {
      await deleteDeliveryLoss(lossId);
      await refreshPendingLosses();
    } catch (err) {
      if (isAuthError(err)) return handleAuthFail();
      openError(err?.message || "Failed to delete pending loss.", "Losses");
    }
  };

  const handleConfirmPendingLosses = async (ids = []) => {
    if (!monthId) return;
    try {
      await confirmDeliveryLosses(monthId, ids);
      await refreshPendingLosses();
      openError("Pending losses moved to Losses section.", "Losses Confirmed");
    } catch (err) {
      if (isAuthError(err)) return handleAuthFail();
      openError(err?.message || "Failed to confirm losses.", "Losses");
    }
  };

  const startAssignFlow = (customer) => {
    if (customer.status !== "pending") {
      openError("This customer cannot be assigned because the status is not pending.");
      return;
    }

    setModal({
      isOpen: true,
      title: "Edit Price (USD to collect)",
      message: "Enter the USD amount to collect for this customer.",
      inputProps: {
        placeholder: "USD amount",
        defaultValue:
          customer.usd_to_collect !== undefined && customer.usd_to_collect !== null
            ? String(customer.usd_to_collect)
            : "",
      },
      showCancel: true,
      confirmText: "Next",
      cancelText: "Cancel",
      onCancel: closeModal,
      onClose: closeModal,
      onConfirm: async (priceInput) => {
        const raw = String(priceInput ?? "").trim().replace(",", ".");
        const price = Number(raw);
        if (!Number.isFinite(price) || price < 0) {
          openError("Please enter a valid non-negative number for the price.", "Invalid Price");
          return;
        }

        setModal({
          isOpen: true,
          title: "Confirm Price",
          message: `Confirm USD to collect: $${price.toFixed(2)} ?`,
          showCancel: true,
          confirmText: "Confirm",
          cancelText: "Back",
          onCancel: () => startAssignFlow(customer),
          onClose: closeModal,
          onConfirm: async () => {
            try {
              const resPrice = await updateCustomerUsdToCollect(customer.id, price);
              if (resPrice?.success === false) {
                throw new Error(resPrice?.error || "Failed to update price");
              }

              setModal({
                isOpen: true,
                title: "Assign Delivery Number",
                inputProps: {
                  placeholder: "Delivery order number",
                  defaultValue: customer.delivery_number || "",
                },
                showCancel: true,
                confirmText: "Assign",
                cancelText: "Cancel",
                onCancel: closeModal,
                onClose: closeModal,
                onConfirm: async (deliveryNumber) => {
                  const dn = String(deliveryNumber || "").trim();
                  if (!dn) {
                    setModal({ isOpen: false });
                    return;
                  }
                  try {
                    const check = await checkDeliveryNumberByMonth(monthId, dn);
                    if (check?.exists) {
                      openError(
                        `Delivery number "${dn}" already exists. Please choose another one.`,
                        "Delivery Number Exists"
                      );
                      return;
                    }
                    const res = await updateCustomerDelivery(customer.id, dn, "pending");
                    if (res?.success === false) {
                      throw new Error(res?.error || "Failed to assign delivery");
                    }
                    await refreshCustomers();
                    closeModal();
                  } catch (err) {
                    if (isAuthError(err)) return handleAuthFail();
                    openError(err?.message || "Failed to assign delivery number.", "Delivery Error");
                  }
                },
              });
            } catch (err) {
              if (isAuthError(err)) return handleAuthFail();
              openError(err?.message || "Failed to update price.", "Price Error");
            }
          },
        });
      },
    });
  };

  return (
    <div className="delPage pageTopSpacer">
      <div className="delHeader">
        <div className="delHeaderLeft">
          <h1 className="delTitle">Assign Delivery</h1>
          <div className="delSub">
            Choose a month, search, edit price, confirm it, then assign a delivery number to pending customers.
          </div>
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

          <div className="delField">
            <label className="delLabel">Search</label>
            <input
              className="delSelect"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / delivery / order / cart..."
              disabled={!monthId}
            />
          </div>
        </div>
      </div>

      <div className="delList">
        <div className="delRow" style={{ marginBottom: 12 }}>
          <div className="delRowMain">
            <div className="delRowTitle">Excel Import</div>
            <div className="delRowMeta" style={{ marginTop: 4, opacity: 0.85, fontSize: 13 }}>
              <div>Allowed statuses from Excel: pending, confirmed</div>
              <div>Matching value = Total Amount USD - Delivery Charge</div>
              {excelFileName ? <div>File: <b>{excelFileName}</b></div> : null}
            </div>
            {excelSummary ? (
              <div className="delBadges">
                <span className="delBadgeSoft">Rows: {excelSummary.total_rows || 0}</span>
                <span className="delBadgeSoft">Single: {excelSummary.single_matches || 0}</span>
                <span className="delBadgeSoft">Duplicates: {excelSummary.duplicate_matches || 0}</span>
                <span className="delBadgeSoft">No match: {excelSummary.no_matches || 0}</span>
              </div>
            ) : null}
          </div>
          <div className="delRowActions" style={{ gap: 8 }}>
            <label
              className={monthId ? "delBtn" : "delBtn delBtnDisabled"}
              style={{ cursor: monthId ? "pointer" : "not-allowed" }}
            >
              {excelLoading ? "Loading..." : "Upload Excel"}
              <input
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                disabled={!monthId || excelLoading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  handleExcelUpload(file);
                }}
              />
            </label>
            <button
              className={excelPreviewRows.length ? "delBtn" : "delBtn delBtnDisabled"}
              disabled={!excelPreviewRows.length || excelApplying}
              onClick={handleApplyExcelImport}
            >
              {excelApplying ? "Applying..." : "Apply Import"}
            </button>
              <button
                className={excelPreviewRows.length ? "delBtn" : "delBtn delBtnDisabled"}
                disabled={!excelPreviewRows.length}
                onClick={openLossesModal}
                type="button"
              >
                View Losses ({currentLosses.length}{pendingLosses.length ? ` + ${pendingLosses.length}` : ""})
              </button>
            <button
              className={monthId ? "delBtn" : "delBtn delBtnDisabled"}
              disabled={!monthId}
              onClick={addManualExcelRow}
              type="button"
            >
              Add Manual Row
            </button>
          </div>
        </div>

        {excelPreviewRows.length > 0 ? (
          <div className="delRow" style={{ display: "block", overflowX: "auto", marginBottom: 16 }}>
            <div className="delRowTitle" style={{ marginBottom: 10 }}>Import Preview (editable)</div>
            <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Status", "Name", "Delivery #", "Total USD", "Delivery Charge", "Net USD", "Match", "Check", "Actions"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "8px 6px",
                          borderBottom: "1px solid rgba(0,0,0,0.12)",
                          fontSize: 12,
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {excelPreviewRows.map((r, idx) => {
                  const selectedId = Number(r.selected_customer_id || 0);
                  const matchCount = Number(r.match_count || 0);
                  const baseMatches = Array.isArray(r.matches) ? r.matches : [];
                  const effectiveMatches = r.manual_entry && baseMatches.length === 0 ? manualAssignableMatches : baseMatches;
                  const selectedMatch = Array.isArray(effectiveMatches)
                    ? effectiveMatches.find((m) => Number(m.customer_id) === selectedId)
                    : null;
                  return (
                    <tr key={`${r.excel_row_num || idx}-${idx}`}>
                      <td style={{ padding: 6 }}>
                        <input
                          style={{ width: 110 }}
                          value={r.status || ""}
                          onChange={(e) => patchExcelRow(idx, { status: e.target.value })}
                        />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input
                          style={{ width: 180 }}
                          value={r.customer_name_extracted || ""}
                          onChange={(e) => patchExcelRow(idx, { customer_name_extracted: e.target.value })}
                        />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input
                          style={{ width: 120 }}
                          value={r.delivery_number || ""}
                          onChange={(e) => patchExcelRow(idx, { delivery_number: e.target.value })}
                        />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input
                          style={{ width: 110 }}
                          type="number"
                          step="0.01"
                          value={Number(r.total_amount_usd || 0)}
                          onChange={(e) =>
                            patchExcelRow(idx, { total_amount_usd: Number(e.target.value || 0) })
                          }
                        />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input
                          style={{ width: 120 }}
                          type="number"
                          step="0.01"
                          value={Number(r.delivery_charge_usd || 0)}
                          onChange={(e) =>
                            patchExcelRow(idx, { delivery_charge_usd: Number(e.target.value || 0) })
                          }
                        />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input
                          style={{ width: 110 }}
                          type="number"
                          step="0.01"
                          value={Number(r.net_amount_usd || 0)}
                          onChange={(e) => patchExcelRow(idx, { net_amount_usd: Number(e.target.value || 0) })}
                        />
                      </td>
                      <td style={{ padding: 6, fontSize: 12 }}>
                        {effectiveMatches.length > 1 || r.manual_entry || matchCount > 1 || matchCount === 0 ? (
                          <CustomDropdown
                            style={{ maxWidth: 280 }}
                            value={selectedId || ""}
                            placeholder="Choose customer..."
                            searchable={true}
                            onChange={(e) =>
                              patchExcelRow(idx, {
                                selected_customer_id: e.target.value ? Number(e.target.value) : null,
                                matches: effectiveMatches,
                                match_count: effectiveMatches.length,
                              })
                            }
                            options={effectiveMatches.map((m) => ({
                              value: String(m.customer_id),
                              label: `${m.customer_name} | order ${m.order_name} / cart ${m.cart_order_number} | $${Number(
                                m.usd_to_collect || 0
                              ).toFixed(2)}`,
                            }))}
                          />
                        ) : selectedMatch ? (
                          <span>
                            {selectedMatch.customer_name} | order {selectedMatch.order_name} / cart{" "}
                            {selectedMatch.cart_order_number}
                          </span>
                        ) : (
                          <span>{matchCount === 0 ? "No match" : "Unselected"}</span>
                        )}
                      </td>
                      <td style={{ padding: 6, fontSize: 12 }}>
                        {Number(r.amount_mismatch || 0) ? (
                          <span style={{ color: "#c62828", fontWeight: 600 }}>Amount mismatch</span>
                        ) : (
                          <span style={{ color: "#2e7d32" }}>OK</span>
                        )}
                        {Number(r.delivery_charge_mismatch || 0) ? (
                          <div style={{ color: "#c62828", marginTop: 4, fontWeight: 600 }}>
                            Delivery charge mismatch
                          </div>
                        ) : null}
                        {r.import_skip_reason ? (
                          <div style={{ color: "#c62828", marginTop: 4 }}>
                            Skipped: {r.import_skip_reason}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ padding: 6 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            className="delBtn"
                            type="button"
                            style={{ padding: "6px 10px", fontSize: 12 }}
                            onClick={() => previewImportRow({ ...r, matches: effectiveMatches })}
                          >
                            Preview
                          </button>
                          {Number(r.amount_mismatch || 0) ? (
                            <button
                              className="delBtn"
                              type="button"
                              style={{ padding: "6px 10px", fontSize: 12 }}
                              onClick={() => editImportRowNetPrice(idx)}
                            >
                              Edit Price
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="delRow" style={{ display: "block", overflowX: "auto", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <div className="delRowTitle">Pending Losses</div>
            <button
              className={pendingLosses.length ? "delBtn" : "delBtn delBtnDisabled"}
              disabled={!pendingLosses.length}
              type="button"
              onClick={() => handleConfirmPendingLosses([])}
            >
              Confirm All To Losses
            </button>
          </div>
          <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Type", "Amount", "Ref", "Description", "Actions"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "8px 6px",
                      borderBottom: "1px solid rgba(0,0,0,0.12)",
                      fontSize: 12,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingLosses.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 8, fontSize: 12, color: "#64748b" }}>
                    No pending losses.
                  </td>
                </tr>
              ) : (
                pendingLosses.map((loss) => (
                  <tr key={loss.id}>
                    <td style={{ padding: 6, fontSize: 12 }}>{loss.loss_type}</td>
                    <td style={{ padding: 6, fontSize: 12, fontWeight: 700 }}>
                      ${Number(loss.amount || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: 6, fontSize: 12 }}>{loss.ref_label || "-"}</td>
                    <td style={{ padding: 6, fontSize: 12 }}>{loss.description || "-"}</td>
                    <td style={{ padding: 6 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="delBtn" type="button" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => handleEditPendingLoss(loss)}>
                          Edit
                        </button>
                        <button className="delBtn" type="button" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => handleConfirmPendingLosses([Number(loss.id)])}>
                          Confirm
                        </button>
                        <button className="delBtn" type="button" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => handleDeletePendingLoss(Number(loss.id))}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {monthId && filteredCustomers.length === 0 ? (
          <div className="delEmpty">
            <div className="delEmptyTitle">No customers found</div>
            <div className="delEmptySub">
              {customers.length === 0 ? "This month has no customers." : "No results match your search."}
            </div>
          </div>
        ) : null}

        {filteredCustomers.map((c) => (
          <div key={c.id} className="delRow">
            <div className="delRowMain">
              <div className="delRowTitle">{c.customer_name?.trim() ? c.customer_name : "(empty name)"}</div>

              <div className="delRowMeta" style={{ marginTop: 4, opacity: 0.8, fontSize: 13 }}>
                <div>
                  Order: <b>{c.order_name || "-"}</b> (#{c.order_id || "-"})
                </div>
                <div>
                  Cart: <b>{c.cart_order_number || "-"}</b> (#{c.cart_id || "-"})
                </div>
              </div>

              <div className="delBadges">
                <span className="delBadgeSoft">USD: ${Number(c.usd_to_collect || 0).toFixed(2)}</span>
                <span className="delBadgeSoft">
                  Delivery charge: ${Number(c.delivery_charge_usd || 0).toFixed(2)}
                </span>
                <span className="delBadge">Delivery: {c.delivery_number || "none"}</span>
                <span
                  className={
                    c.status === "pending"
                      ? "delBadgeOk"
                      : c.status === "withdelivery"
                      ? "delBadgeWarn"
                      : "delBadgeMuted"
                  }
                >
                  Status: {c.status || "-"}
                </span>
              </div>
            </div>

            <div className="delRowActions">
              <button
                className={c.status === "pending" ? "delBtn" : "delBtn delBtnDisabled"}
                onClick={() => startAssignFlow(c)}
                disabled={c.status !== "pending"}
              >
                Assign
              </button>
            </div>
          </div>
        ))}
      </div>

      <CustomModal {...modal} />

      {lossesModalOpen ? (
        <div
          className="cmOverlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLossesModalOpen(false);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setLossesModalOpen(false);
          }}
        >
          <div className="cmModal" style={{ width: "min(1100px, 100%)" }}>
            <div className="cmHead">
              <div className="cmTitle">Import Losses</div>
              <button className="cmX" onClick={() => setLossesModalOpen(false)} aria-label="Close">
                X
              </button>
            </div>

            <div className="cmBody">
              <div className="cmMsg">
                Total losses: ${totalLossAmount.toFixed(2)}{"\n"}
                Delivery charge losses: ${totalDeliveryLossAmount.toFixed(2)}{"\n"}
                Out of stock item losses: ${totalOutOfStockLossAmount.toFixed(2)}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 920, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Source", "Type", "Amount", "Customer / Order / Cart", "Description"].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "8px 6px",
                            borderBottom: "1px solid rgba(0,0,0,0.12)",
                            fontSize: 12,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedLosses.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 8, fontSize: 12, color: "#64748b" }}>
                          No losses to display.
                        </td>
                      </tr>
                    ) : (
                      displayedLosses.map((x, i) => (
                        <tr key={`${x.source || "x"}-${x.row_index ?? i}-${i}`}>
                          <td style={{ padding: 6, fontSize: 12 }}>{x.source || "-"}</td>
                          <td style={{ padding: 6, fontSize: 12 }}>{x.type || "-"}</td>
                          <td style={{ padding: 6, fontSize: 12, fontWeight: 700 }}>
                            ${Number(x.amount || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: 6, fontSize: 12 }}>{x.ref || "-"}</td>
                          <td style={{ padding: 6, fontSize: 12 }}>{x.description || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="cmFooter">
              <button className="cmBtnSoft" onClick={handleAddToLosses} disabled={!currentLosses.length}>
                Add To Losses
              </button>
              <button className="cmBtn" onClick={() => setLossesModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DeliveryPage;
