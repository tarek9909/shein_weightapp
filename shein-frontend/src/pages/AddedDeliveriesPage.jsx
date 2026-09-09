import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getCustomersWithAddedDelivery,
  confirmCustomerDelivery,
  revertCustomerDelivery,
  markCustomerPaid,
} from "../api/deliveryTrackingApi";

import { CustomModal } from "../components/CustomModal";
import { isAuthenticated, clearAuthSession } from "../utils/auth";
import "../addedDeliveries.css";

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

const AddedDeliveriesPage = () => {
  const nav = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [confirmedCustomers, setConfirmedCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState({});

  const [modal, setModal] = useState({ isOpen: false });
  const closeModal = () => setModal({ isOpen: false });

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

  const fetchCustomers = async () => {
    if (!ensureAuth()) return;

    setLoading(true);
    try {
      const data = await getCustomersWithAddedDelivery();
      const arr = Array.isArray(data) ? data : [];
      const toConfirm = arr.filter((c) => String(c.delivery_status).toLowerCase() === "added");
      const confirmed = arr.filter((c) => String(c.status).toLowerCase() === "confirmed");

      setCustomers(toConfirm);
      setConfirmedCustomers(confirmed);
      setEdits((prev) => {
        const next = { ...prev };
        toConfirm.forEach((c) => {
          if (!next[c.customer_id]) {
            next[c.customer_id] = {
              usd_to_collect: Number(c.usd_to_collect || 0),
              delivery_charge_usd: Number(c.delivery_charge_usd || 0),
            };
          }
        });
        return next;
      });
    } catch (err) {
      console.error(err);
      if (isAuthError(err)) return handleAuthFail();
      openInfo({ title: "Error", message: "Failed to load deliveries." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalAmountAdded = useMemo(
    () => customers.reduce((sum, c) => sum + getEditedValues(c).net, 0),
    [customers, edits]
  );

  const totalAmountConfirmed = useMemo(
    () => confirmedCustomers.reduce((sum, c) => sum + Number(c.usd_to_collect || 0), 0),
    [confirmedCustomers]
  );

  const handleConfirm = async (customer) => {
    const { net, deliveryCharge } = getEditedValues(customer);
    openConfirm({
      title: "Confirm Delivery",
      message: `Confirm delivery for "${customer.customer_name}" (Delivery #${customer.delivery_number}) with net $${money(net)} and delivery charge $${money(deliveryCharge)}?`,
      onYes: async () => {
        try {
          await confirmCustomerDelivery({
            id: customer.customer_id,
            usd_to_collect: net,
            delivery_charge_usd: deliveryCharge,
          });

          setCustomers((prev) => prev.filter((c) => c.customer_id !== customer.customer_id));
          setConfirmedCustomers((prev) => [
            ...prev,
            { ...customer, status: "confirmed", usd_to_collect: net, delivery_charge_usd: deliveryCharge },
          ]);
        } catch (err) {
          console.error(err);
          if (isAuthError(err)) return handleAuthFail();
          openInfo({ title: "Error", message: "Failed to confirm delivery." });
        }
      },
    });
  };

  const handleRevert = async (customer) => {
    openConfirm({
      title: "Revert Delivery",
      message: `Revert "${customer.customer_name}" back to WithDelivery?`,
      onYes: async () => {
        try {
          await revertCustomerDelivery(customer.customer_id);
          setCustomers((prev) => prev.filter((c) => c.customer_id !== customer.customer_id));
          setConfirmedCustomers((prev) => prev.filter((c) => c.customer_id !== customer.customer_id));
        } catch (err) {
          console.error(err);
          if (isAuthError(err)) return handleAuthFail();
          openInfo({ title: "Error", message: "Failed to revert delivery." });
        }
      },
    });
  };

  const handleMarkPaid = () => {
    if (!ensureAuth()) return;

    if (confirmedCustomers.length === 0 || totalAmountConfirmed === 0) {
      openInfo({ title: "Info", message: "No confirmed deliveries to mark as paid." });
      return;
    }

    openConfirm({
      title: "Confirm Payment",
      message: `Total amount $${money(totalAmountConfirmed)} will be added to payment. Proceed?`,
      onYes: async () => {
        try {
          const ids = confirmedCustomers.map((c) => c.customer_id);
          await markCustomerPaid(ids);
          setConfirmedCustomers([]);
          openInfo({ title: "Success", message: `Total $${money(totalAmountConfirmed)} marked as paid.` });
        } catch (err) {
          console.error(err);
          if (isAuthError(err)) return handleAuthFail();
          openInfo({ title: "Error", message: "Failed to mark payments. Check server logs." });
        }
      },
    });
  };

  return (
    <div className="adPage pageTopSpacer">
      <div className="adHeader">
        <div>
          <h1 className="adTitle">Added Deliveries</h1>
          <div className="adSub">
            Confirm added deliveries and mark confirmed deliveries as paid.
          </div>
        </div>

        <div className="adHeaderActions">
          <button
            className={confirmedCustomers.length === 0 ? "adBtn adBtnDisabled" : "adBtn"}
            onClick={handleMarkPaid}
            disabled={confirmedCustomers.length === 0}
          >
            Mark All Confirmed as Paid
          </button>
        </div>
      </div>

      <div className="adStats">
        <div className="adStatCard">
          <div className="adStatTitle">To Confirm</div>
          <div className="adStatValue">${money(totalAmountAdded)}</div>
          <div className="adStatHint">{customers.length} customers</div>
        </div>

        <div className="adStatCard">
          <div className="adStatTitle">Confirmed</div>
          <div className="adStatValue">${money(totalAmountConfirmed)}</div>
          <div className="adStatHint">{confirmedCustomers.length} customers</div>
        </div>
      </div>

      <div className="adSectionHead">
        <div className="adSectionTitle">To Confirm</div>
        <div className="adSectionSub">Delivery Status = added</div>
      </div>

      <div className="adGrid">
        {loading ? (
          <div className="adEmpty">
            <div className="adEmptyTitle">Loading...</div>
            <div className="adEmptySub">Fetching deliveries.</div>
          </div>
        ) : customers.length === 0 ? (
          <div className="adEmpty">
            <div className="adEmptyTitle">No added deliveries</div>
            <div className="adEmptySub">Nothing to confirm right now.</div>
          </div>
        ) : (
          customers.map((c) => {
            const { net, deliveryCharge } = getEditedValues(c);
            const netDiff = Number((net - Number(c.usd_to_collect || 0)).toFixed(2));
            const chargeDiff = Number((deliveryCharge - Number(c.delivery_charge_usd || 0)).toFixed(2));
            return (
              <div key={c.customer_id} className="adCard">
                <div className="adCardTop">
                  <div className="adName">{c.customer_name?.trim() ? c.customer_name : "(empty name)"}</div>
                  <div className="adBadgeSoft">DB Net ${money(c.usd_to_collect)}</div>
                </div>

                <div className="adMeta">
                  <div><span className="adMuted">Delivery #:</span> <b>{c.delivery_number ?? "-"}</b></div>
                  <div><span className="adMuted">Delivery Status:</span> <span className="adPill adPill-added">{c.delivery_status || "-"}</span></div>
                  <div><span className="adMuted">Cart:</span> <b>#{c.cart_order_number ?? "-"}</b></div>
                  <div><span className="adMuted">Order:</span> <b>{c.order_name ?? "-"}</b></div>
                </div>

                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <label className="adMuted">Collected Net Amount</label>
                  <input className="dtInput" type="number" step="0.01" value={String(net)} onChange={(e) => patchEdit(c.customer_id, { usd_to_collect: e.target.value })} />
                  <label className="adMuted">Delivery Charge</label>
                  <input className="dtInput" type="number" step="0.01" value={String(deliveryCharge)} onChange={(e) => patchEdit(c.customer_id, { delivery_charge_usd: e.target.value })} />
                  <div className="adMeta" style={{ marginTop: 0 }}>
                    <div><span className="adMuted">DB Delivery Charge:</span> <b>${money(c.delivery_charge_usd || 0)}</b></div>
                    <div><span className="adMuted">Net Diff:</span> <b style={{ color: Math.abs(netDiff) > 0.009 ? '#b42318' : 'inherit' }}>{netDiff > 0 ? '+' : ''}{money(netDiff)}</b></div>
                    <div><span className="adMuted">Charge Diff:</span> <b style={{ color: Math.abs(chargeDiff) > 0.009 ? '#b42318' : 'inherit' }}>{chargeDiff > 0 ? '+' : ''}{money(chargeDiff)}</b></div>
                  </div>
                </div>

                <div className="adActions">
                  <button className="adBtn" onClick={() => handleConfirm(c)}>Confirm</button>
                  <button className="adBtnSoft" onClick={() => handleRevert(c)}>Revert to WithDelivery</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="adSectionHead" style={{ marginTop: 18 }}>
        <div className="adSectionTitle">Confirmed Deliveries</div>
        <div className="adSectionSub">Status = confirmed</div>
      </div>

      <div className="adGrid">
        {confirmedCustomers.length === 0 ? (
          <div className="adEmpty">
            <div className="adEmptyTitle">No confirmed deliveries</div>
            <div className="adEmptySub">Confirm deliveries to move them here.</div>
          </div>
        ) : (
          confirmedCustomers.map((c) => (
            <div key={c.customer_id} className="adCard">
              <div className="adCardTop">
                <div className="adName">{c.customer_name?.trim() ? c.customer_name : "(empty name)"}</div>
                <div className="adBadgeSoft">${money(c.usd_to_collect)}</div>
              </div>

              <div className="adMeta">
                <div><span className="adMuted">Delivery #:</span> <b>{c.delivery_number ?? "-"}</b></div>
                <div><span className="adMuted">Status:</span> <span className="adPill adPill-confirmed">{c.status || "-"}</span></div>
                <div><span className="adMuted">Cart:</span> <b>#{c.cart_order_number ?? "-"}</b></div>
                <div><span className="adMuted">Order:</span> <b>{c.order_name ?? "-"}</b></div>
              </div>

              <div className="adActions">
                <button className="adBtnSoft" onClick={() => handleRevert(c)}>
                  Revert to WithDelivery
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <CustomModal {...modal} />
    </div>
  );
};

export default AddedDeliveriesPage;
