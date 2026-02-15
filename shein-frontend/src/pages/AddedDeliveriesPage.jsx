import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getCustomersWithAddedDelivery,
  confirmCustomerDelivery,
  revertCustomerDelivery,
  markCustomerPaid,
} from "../api/deliveryTrackingApi";

import { CustomModal } from "../components/CustomModal";
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

  const fetchCustomers = async () => {
    if (!ensureAuth()) return;

    setLoading(true);
    try {
      const data = await getCustomersWithAddedDelivery();
      const arr = data || [];

      setCustomers(
        arr.filter((c) => String(c.delivery_status).toLowerCase() === "added")
      );

      setConfirmedCustomers(
        arr.filter((c) => String(c.status).toLowerCase() === "confirmed")
      );
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
    () => customers.reduce((sum, c) => sum + Number(c.usd_to_collect || 0), 0),
    [customers]
  );

  const totalAmountConfirmed = useMemo(
    () =>
      confirmedCustomers.reduce(
        (sum, c) => sum + Number(c.usd_to_collect || 0),
        0
      ),
    [confirmedCustomers]
  );

  const handleConfirm = async (customer) => {
    openConfirm({
      title: "Confirm Delivery",
      message: `Confirm delivery for "${customer.customer_name}" (Delivery #${customer.delivery_number})?`,
      onYes: async () => {
        try {
          await confirmCustomerDelivery(customer.customer_id);

          setCustomers((prev) =>
            prev.filter((c) => c.customer_id !== customer.customer_id)
          );

          setConfirmedCustomers((prev) => [
            ...prev,
            {
              ...customer,
              status: "confirmed",
            },
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

          setCustomers((prev) =>
            prev.filter((c) => c.customer_id !== customer.customer_id)
          );
          setConfirmedCustomers((prev) =>
            prev.filter((c) => c.customer_id !== customer.customer_id)
          );
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
      openInfo({
        title: "Info",
        message: "No confirmed deliveries to mark as paid.",
      });
      return;
    }

    openConfirm({
      title: "Confirm Payment",
      message: `Total amount $${money(
        totalAmountConfirmed
      )} will be added to payment. Proceed?`,
      onYes: async () => {
        try {
          const ids = confirmedCustomers.map((c) => c.customer_id);
          await markCustomerPaid(ids);

          setConfirmedCustomers([]);

          openInfo({
            title: "Success",
            message: `Total $${money(totalAmountConfirmed)} marked as paid.`,
          });
        } catch (err) {
          console.error(err);
          if (isAuthError(err)) return handleAuthFail();
          openInfo({
            title: "Error",
            message: "Failed to mark payments. Check server logs.",
          });
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
            Confirm added deliveries, revert them, and mark confirmed deliveries
            as paid.
          </div>
        </div>

        <div className="adHeaderActions">
          <button
            className={
              confirmedCustomers.length === 0
                ? "adBtn adBtnDisabled"
                : "adBtn"
            }
            onClick={handleMarkPaid}
            disabled={confirmedCustomers.length === 0}
          >
            Mark All Confirmed as Paid
          </button>
        </div>
      </div>

      {/* Summary row */}
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

      {/* Added section */}
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
          customers.map((c) => (
            <div key={c.customer_id} className="adCard">
              <div className="adCardTop">
                <div className="adName">
                  {c.customer_name?.trim() ? c.customer_name : "(empty name)"}
                </div>
                <div className="adBadgeSoft">${money(c.usd_to_collect)}</div>
              </div>

              <div className="adMeta">
                <div>
                  <span className="adMuted">Delivery #:</span>{" "}
                  <b>{c.delivery_number ?? "-"}</b>
                </div>
                <div>
                  <span className="adMuted">Delivery Status:</span>{" "}
                  <span className="adPill adPill-added">
                    {c.delivery_status || "-"}
                  </span>
                </div>
                <div>
                  <span className="adMuted">Cart:</span>{" "}
                  <b>#{c.cart_order_number ?? "-"}</b>
                </div>
                <div>
                  <span className="adMuted">Order:</span>{" "}
                  <b>{c.order_name ?? "-"}</b>
                </div>
              </div>

              <div className="adActions">
                <button className="adBtn" onClick={() => handleConfirm(c)}>
                  Confirm
                </button>
                <button className="adBtnSoft" onClick={() => handleRevert(c)}>
                  Revert to WithDelivery
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Confirmed section */}
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
                <div className="adName">
                  {c.customer_name?.trim() ? c.customer_name : "(empty name)"}
                </div>
                <div className="adBadgeSoft">${money(c.usd_to_collect)}</div>
              </div>

              <div className="adMeta">
                <div>
                  <span className="adMuted">Delivery #:</span>{" "}
                  <b>{c.delivery_number ?? "-"}</b>
                </div>
                <div>
                  <span className="adMuted">Status:</span>{" "}
                  <span className="adPill adPill-confirmed">
                    {c.status || "-"}
                  </span>
                </div>
                <div>
                  <span className="adMuted">Cart:</span>{" "}
                  <b>#{c.cart_order_number ?? "-"}</b>
                </div>
                <div>
                  <span className="adMuted">Order:</span>{" "}
                  <b>{c.order_name ?? "-"}</b>
                </div>
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
