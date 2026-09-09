import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCustomersWithDelivery,
  markCustomerCollected,
  revertCustomerToPending,
} from "../api/deliveryTrackingApi";
import {
  getDeliveryLosses,
  updateDeliveryLoss,
  deleteDeliveryLoss,
  confirmDeliveryLosses,
} from "../api/deliveryApi";
import { CustomModal } from "../components/CustomModal";
import "../deliveryTracking.css";

const money = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

const DeliveryTrackingPage = () => {
  const nav = useNavigate();

  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState({});
  const [pendingLosses, setPendingLosses] = useState([]);
  const [lossMonths, setLossMonths] = useState([]);

  const [modal, setModal] = useState({ isOpen: false });
  const closeModal = () => setModal({ isOpen: false });

  const ensureAuth = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      nav("/login");
      return false;
    }
    return true;
  };

  const handleAuthFail = () => {
    localStorage.removeItem("token");
    nav("/login");
  };

  const openInfo = ({ title, message }) => {
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

  const openConfirm = ({ title, message, onYes }) => {
    setModal({
      isOpen: true,
      title,
      message,
      showCancel: true,
      confirmText: "Confirm",
      cancelText: "Cancel",
      onConfirm: async () => {
        closeModal();
        await onYes();
      },
      onCancel: closeModal,
      onClose: closeModal,
    });
  };

  const patchEdit = (customerId, patch) => {
    setEdits((prev) => ({
      ...prev,
      [customerId]: { ...(prev[customerId] || {}), ...patch },
    }));
  };

  const getEditedValues = (c) => {
    const e = edits[c.customer_id] || {};
    const net = Number(e.usd_to_collect ?? c.usd_to_collect ?? 0);
    const deliveryCharge = Number(e.delivery_charge_usd ?? c.delivery_charge_usd ?? 0);
    return {
      net: Number.isFinite(net) && net >= 0 ? net : 0,
      deliveryCharge: Number.isFinite(deliveryCharge) && deliveryCharge >= 0 ? deliveryCharge : 0,
    };
  };

  const buildCustomerLosses = (c) => {
    const { net, deliveryCharge } = getEditedValues(c);
    const dbNet = Number(c.usd_to_collect || 0);
    const dbCharge = Number(c.delivery_charge_usd || 0);
    const netDiff = Number((net - dbNet).toFixed(2));
    const chargeDiff = Number((deliveryCharge - dbCharge).toFixed(2));
    const ref = `${c.customer_name || "-"} | order ${c.order_name || c.order_id || "-"} / cart ${
      c.cart_order_number || c.cart_id || "-"
    }`;
    const base = {
      customer_id: Number(c.customer_id || 0) || null,
      customer_name: String(c.customer_name || ""),
      order_id: Number(c.order_id || 0) || null,
      order_name: String(c.order_name || ""),
      cart_id: Number(c.cart_id || 0) || null,
      cart_order_number: String(c.cart_order_number || ""),
      ref,
    };
    const out = [];
    if (Math.abs(netDiff) > 0.009) {
      out.push({
        ...base,
        type: "out of stock item",
        amount: Math.abs(netDiff),
        signed_diff: netDiff,
        description: `Collection amount difference (${netDiff > 0 ? "+" : ""}${netDiff.toFixed(2)})`,
        source_key: `collection|amount|${c.customer_id}|${c.order_id || 0}|${c.cart_id || 0}`,
      });
    }
    if (Math.abs(chargeDiff) > 0.009) {
      out.push({
        ...base,
        type: "delivery charge",
        amount: Math.abs(chargeDiff),
        signed_diff: chargeDiff,
        description: `Collection delivery charge difference (${chargeDiff > 0 ? "+" : ""}${chargeDiff.toFixed(2)})`,
        source_key: `collection|delivery|${c.customer_id}|${c.order_id || 0}|${c.cart_id || 0}`,
      });
    }
    return out;
  };

  const refreshPendingLosses = async (monthsArg) => {
    const monthsToLoad = (monthsArg && monthsArg.length ? monthsArg : lossMonths)
      .map((x) => Number(x))
      .filter((x) => x > 0);
    if (!monthsToLoad.length) {
      setPendingLosses([]);
      return;
    }
    const uniqueMonths = Array.from(new Set(monthsToLoad));
    const results = await Promise.all(
      uniqueMonths.map(async (m) => {
        const res = await getDeliveryLosses(m, "pending");
        return Array.isArray(res?.rows)
          ? res.rows.map((r) => ({ ...r, month_id: Number(r.month_id || m) }))
          : [];
      })
    );
    setPendingLosses(results.flat());
  };

  const fetchCustomers = async () => {
    if (!ensureAuth()) return;
    setLoading(true);
    try {
      const data = await getCustomersWithDelivery(search);
      const arr = Array.isArray(data) ? data : [];
      setCustomers(arr);
      setEdits((prev) => {
        const next = { ...prev };
        arr.forEach((c) => {
          if (!next[c.customer_id]) {
            next[c.customer_id] = {
              usd_to_collect: Number(c.usd_to_collect || 0),
              delivery_charge_usd: Number(c.delivery_charge_usd || 0),
            };
          }
        });
        return next;
      });
      const months = Array.from(
        new Set(arr.map((c) => Number(c.month_id || 0)).filter((x) => x > 0))
      );
      setLossMonths((prev) => Array.from(new Set([...(prev || []), ...months])));
    } catch (err) {
      console.error(err);
      if (isAuthError(err)) return handleAuthFail();
      openInfo({ title: "Error", message: "Failed to load customers." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!lossMonths.length) return;
    (async () => {
      try {
        await refreshPendingLosses(lossMonths);
      } catch (err) {
        console.error(err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lossMonths.join(",")]);

  const totalToCollect = useMemo(
    () =>
      customers.reduce((sum, c) => {
        const { net } = getEditedValues(c);
        return sum + net;
      }, 0),
    [customers, edits]
  );

  const totalPendingLosses = useMemo(
    () => pendingLosses.reduce((s, x) => s + Number(x.amount || 0), 0),
    [pendingLosses]
  );

  const handleCollected = async (customer) => {
    if (customer.status === "collected") return;
    const { net, deliveryCharge } = getEditedValues(customer);
    const losses = buildCustomerLosses(customer);
    const diffMsg = losses.length
      ? `\nDetected losses: ${losses.map((l) => `${l.type} $${money(l.amount)}`).join(", ")}. They will be saved as pending losses.`
      : "";

    openConfirm({
      title: "Mark Collected",
      message: `Mark \"${customer.customer_name}\" as collected with net $${money(net)} and delivery charge $${money(
        deliveryCharge
      )}?${diffMsg}`,
      onYes: async () => {
        try {
          await markCustomerCollected({
            id: customer.customer_id,
            usd_to_collect: net,
            delivery_charge_usd: deliveryCharge,
          });
          let refreshMonths = [...lossMonths];
          const monthId = Number(customer.month_id || 0);
          if (monthId > 0) {
            refreshMonths = Array.from(new Set([...(refreshMonths || []), monthId]));
            setLossMonths(refreshMonths);
          }
          await fetchCustomers();
          await refreshPendingLosses(refreshMonths);
        } catch (err) {
          console.error(err);
          if (isAuthError(err)) return handleAuthFail();
          openInfo({ title: "Error", message: "Failed to mark customer as collected." });
        }
      },
    });
  };

  const handleRevertPending = async (customer) => {
    if (customer.status !== "withdelivery") return;
    openConfirm({
      title: "Revert to Pending",
      message: `Revert \"${customer.customer_name}\" back to pending?`,
      onYes: async () => {
        try {
          await revertCustomerToPending(customer.customer_id);
          await fetchCustomers();
        } catch (err) {
          console.error(err);
          if (isAuthError(err)) return handleAuthFail();
          openInfo({ title: "Error", message: "Failed to revert customer to pending." });
        }
      },
    });
  };

  const handleSaveLossEdit = async (loss) => {
    try {
      await updateDeliveryLoss(loss.id, {
        amount: Number(loss.amount || 0),
        description: String(loss.description || ""),
        loss_type: String(loss.loss_type || loss.type || ""),
      });
      await refreshPendingLosses();
    } catch (err) {
      console.error(err);
      if (isAuthError(err)) return handleAuthFail();
      openInfo({ title: "Error", message: "Failed to update loss." });
    }
  };

  const handleDeleteLoss = async (lossId) => {
    try {
      await deleteDeliveryLoss(lossId);
      await refreshPendingLosses();
    } catch (err) {
      console.error(err);
      if (isAuthError(err)) return handleAuthFail();
      openInfo({ title: "Error", message: "Failed to delete loss." });
    }
  };

  const handleConfirmPendingLosses = async (ids = []) => {
    try {
      const rows = ids.length
        ? pendingLosses.filter((x) => ids.includes(Number(x.id)))
        : pendingLosses;
      const byMonth = rows.reduce((acc, r) => {
        const m = Number(r.month_id || 0);
        if (m <= 0) return acc;
        (acc[m] ||= []).push(Number(r.id));
        return acc;
      }, {});
      for (const [m, lossIds] of Object.entries(byMonth)) {
        await confirmDeliveryLosses(Number(m), lossIds);
      }
      await refreshPendingLosses();
    } catch (err) {
      console.error(err);
      if (isAuthError(err)) return handleAuthFail();
      openInfo({ title: "Error", message: "Failed to confirm losses." });
    }
  };

  return (
    <div className="dtPage pageTopSpacer">
      <div className="dtHeader">
        <div>
          <h1 className="dtTitle">Delivery Tracking</h1>
          <div className="dtSub">
            Search by delivery number, edit collected values, compare differences, and save losses.
          </div>
        </div>

        <div className="dtSearchWrap">
          <div className="dtLabel">Search</div>
          <input
            className="dtInput"
            type="text"
            placeholder="Search by delivery number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="dtStats">
        <div className="dtStatCard">
          <div className="dtStatTitle">Customers</div>
          <div className="dtStatValue">{customers.length}</div>
        </div>
        <div className="dtStatCard">
          <div className="dtStatTitle">Total to Collect (Editable)</div>
          <div className="dtStatValue">${money(totalToCollect)}</div>
        </div>
        <div className="dtStatCard">
          <div className="dtStatTitle">Pending Losses</div>
          <div className="dtStatValue">${money(totalPendingLosses)}</div>
        </div>
      </div>

      <div className="dtGrid">
        {loading ? (
          <div className="dtEmpty">
            <div className="dtEmptyTitle">Loading...</div>
            <div className="dtEmptySub">Fetching customers.</div>
          </div>
        ) : customers.length === 0 ? (
          <div className="dtEmpty">
            <div className="dtEmptyTitle">No results</div>
            <div className="dtEmptySub">Try searching by a delivery number (or clear the search to see all).</div>
          </div>
        ) : (
          customers.map((c) => {
            const { net, deliveryCharge } = getEditedValues(c);
            const dbNet = Number(c.usd_to_collect || 0);
            const dbCharge = Number(c.delivery_charge_usd || 0);
            const netDiff = Number((net - dbNet).toFixed(2));
            const chargeDiff = Number((deliveryCharge - dbCharge).toFixed(2));
            const hasLoss = Math.abs(netDiff) > 0.009 || Math.abs(chargeDiff) > 0.009;
            return (
              <div key={c.customer_id} className="dtCard">
                <div className="dtCardTop">
                  <div className="dtName">{c.customer_name?.trim() ? c.customer_name : "(empty name)"}</div>
                  <div className="dtBadgeSoft">DB Net ${money(c.usd_to_collect)}</div>
                </div>

                <div className="dtMeta">
                  <div><span className="dtMuted">Delivery #:</span> <b>{c.delivery_number ?? "-"}</b></div>
                  <div><span className="dtMuted">Status:</span> <span className={`dtStatus dtStatus-${String(c.status || "").toLowerCase()}`}>{c.status || "-"}</span></div>
                  <div><span className="dtMuted">Cart:</span> <b>#{c.cart_order_number ?? "-"}</b></div>
                  <div><span className="dtMuted">Order:</span> <b>{c.order_name ?? "-"}</b></div>
                </div>

                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  <label className="dtLabel" style={{ margin: 0 }}>Collected Net Amount</label>
                  <input
                    className="dtInput"
                    type="number"
                    step="0.01"
                    value={String(net)}
                    onChange={(e) => patchEdit(c.customer_id, { usd_to_collect: e.target.value })}
                  />
                  <label className="dtLabel" style={{ margin: 0 }}>Delivery Charge</label>
                  <input
                    className="dtInput"
                    type="number"
                    step="0.01"
                    value={String(deliveryCharge)}
                    onChange={(e) => patchEdit(c.customer_id, { delivery_charge_usd: e.target.value })}
                  />
                  <div className="dtMeta" style={{ marginTop: 0 }}>
                    <div><span className="dtMuted">DB Delivery Charge:</span> <b>${money(dbCharge)}</b></div>
                    <div><span className="dtMuted">Net Diff:</span> <b style={{ color: Math.abs(netDiff) > 0.009 ? '#b42318' : 'inherit' }}>{netDiff > 0 ? '+' : ''}{money(netDiff)}</b></div>
                    <div><span className="dtMuted">Charge Diff:</span> <b style={{ color: Math.abs(chargeDiff) > 0.009 ? '#b42318' : 'inherit' }}>{chargeDiff > 0 ? '+' : ''}{money(chargeDiff)}</b></div>
                    <div><span className="dtMuted">Loss Check:</span> <b>{hasLoss ? 'Difference detected' : 'OK'}</b></div>
                  </div>
                </div>

                <div className="dtActions">
                  <button
                    className={c.status === "collected" ? "dtBtn dtBtnDisabled" : "dtBtn"}
                    onClick={() => handleCollected(c)}
                    disabled={c.status === "collected"}
                  >
                    Mark Collected
                  </button>
                  <button
                    className={c.status !== "withdelivery" ? "dtBtnSoft dtBtnDisabled" : "dtBtnSoft"}
                    onClick={() => handleRevertPending(c)}
                    disabled={c.status !== "withdelivery"}
                  >
                    Revert to Pending
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="dtHeader" style={{ marginBottom: 10 }}>
          <div>
            <h2 className="dtTitle" style={{ fontSize: 20, margin: 0 }}>Pending Losses</h2>
            <div className="dtSub">Losses created from Delivery Collection differences before confirming to Losses page.</div>
          </div>
          <div className="dtHeaderActions" style={{ display: 'flex', gap: 8 }}>
            <button className="dtBtnSoft" onClick={() => refreshPendingLosses()}>Refresh Losses</button>
            <button
              className={pendingLosses.length ? 'dtBtn' : 'dtBtn dtBtnDisabled'}
              onClick={() => handleConfirmPendingLosses()}
              disabled={!pendingLosses.length}
            >
              Confirm Pending Losses
            </button>
          </div>
        </div>

        {pendingLosses.length === 0 ? (
          <div className="dtEmpty">
            <div className="dtEmptyTitle">No pending losses</div>
            <div className="dtEmptySub">Differences saved during collection will appear here.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={th}>Type</th>
                  <th style={th}>Amount</th>
                  <th style={th}>Description</th>
                  <th style={th}>Customer / Order / Cart</th>
                  <th style={th}>Month</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingLosses.map((l) => (
                  <tr key={l.id}>
                    <td style={td}>{l.loss_type || l.type}</td>
                    <td style={td}>
                      <input className="dtInput" type="number" step="0.01" value={String(Number(l.amount || 0))}
                        onChange={(e) => setPendingLosses((prev) => prev.map((x) => x.id === l.id ? { ...x, amount: e.target.value } : x))}
                        style={{ minWidth: 110 }} />
                    </td>
                    <td style={td}>
                      <input className="dtInput" type="text" value={l.description || ''}
                        onChange={(e) => setPendingLosses((prev) => prev.map((x) => x.id === l.id ? { ...x, description: e.target.value } : x))}
                        style={{ minWidth: 280 }} />
                    </td>
                    <td style={td}>{l.ref_label || `${l.customer_name_snapshot || '-'} | order ${l.order_name_snapshot || l.order_id || '-'} / cart ${l.cart_order_number_snapshot || l.cart_id || '-'}`}</td>
                    <td style={td}>{l.month_id || '-'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="dtBtnSoft" onClick={() => handleSaveLossEdit(l)}>Save</button>
                        <button className="dtBtnSoft" onClick={() => handleConfirmPendingLosses([Number(l.id)])}>Confirm</button>
                        <button className="dtBtnSoft" onClick={() => handleDeleteLoss(l.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CustomModal {...modal} />
    </div>
  );
};

const th = {
  textAlign: 'left',
  fontSize: 12,
  color: '#667085',
  padding: '8px 10px',
  borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
};

const td = {
  padding: '10px',
  borderBottom: '1px solid #f0f2f5',
  verticalAlign: 'top',
};

export default DeliveryTrackingPage;
