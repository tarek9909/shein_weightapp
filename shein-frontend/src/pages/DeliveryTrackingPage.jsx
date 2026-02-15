import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCustomersWithDelivery,
  markCustomerCollected,
  revertCustomerToPending,
} from "../api/deliveryTrackingApi";
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

  // modal state
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
      const data = await getCustomersWithDelivery(search);
      setCustomers(data || []);
    } catch (err) {
      console.error(err);
      if (isAuthError(err)) return handleAuthFail();
      openInfo({ title: "Error", message: "Failed to load customers." });
    } finally {
      setLoading(false);
    }
  };

  // Load customers on search change
  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const totalToCollect = useMemo(
    () => customers.reduce((sum, c) => sum + Number(c.usd_to_collect || 0), 0),
    [customers]
  );

  const handleCollected = async (customer) => {
    if (customer.status === "collected") return;

    openConfirm({
      title: "Mark Collected",
      message: `Mark "${customer.customer_name}" as collected?`,
      onYes: async () => {
        try {
          await markCustomerCollected(customer.customer_id);
          await fetchCustomers();
        } catch (err) {
          console.error(err);
          if (isAuthError(err)) return handleAuthFail();
          openInfo({
            title: "Error",
            message: "Failed to mark customer as collected.",
          });
        }
      },
    });
  };

  const handleRevertPending = async (customer) => {
    if (customer.status !== "withdelivery") return;

    openConfirm({
      title: "Revert to Pending",
      message: `Revert "${customer.customer_name}" back to pending?`,
      onYes: async () => {
        try {
          await revertCustomerToPending(customer.customer_id);
          await fetchCustomers();
        } catch (err) {
          console.error(err);
          if (isAuthError(err)) return handleAuthFail();
          openInfo({
            title: "Error",
            message: "Failed to revert customer to pending.",
          });
        }
      },
    });
  };

  return (
    <div className="dtPage pageTopSpacer">
      <div className="dtHeader">
        <div>
          <h1 className="dtTitle">Delivery Tracking</h1>
          <div className="dtSub">
            Search by delivery number and update customer delivery status.
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
          <div className="dtStatTitle">Total to Collect</div>
          <div className="dtStatValue">${money(totalToCollect)}</div>
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
            <div className="dtEmptySub">
              Try searching by a delivery number (or clear the search to see all).
            </div>
          </div>
        ) : (
          customers.map((c) => (
            <div key={c.customer_id} className="dtCard">
              <div className="dtCardTop">
                <div className="dtName">
                  {c.customer_name?.trim() ? c.customer_name : "(empty name)"}
                </div>
                <div className="dtBadgeSoft">${money(c.usd_to_collect)}</div>
              </div>

              <div className="dtMeta">
                <div>
                  <span className="dtMuted">Delivery #:</span>{" "}
                  <b>{c.delivery_number ?? "-"}</b>
                </div>
                <div>
                  <span className="dtMuted">Status:</span>{" "}
                  <span
                    className={`dtStatus dtStatus-${String(
                      c.status || ""
                    ).toLowerCase()}`}
                  >
                    {c.status || "-"}
                  </span>
                </div>
                <div>
                  <span className="dtMuted">Cart:</span>{" "}
                  <b>#{c.cart_order_number ?? "-"}</b>
                </div>
                <div>
                  <span className="dtMuted">Order:</span>{" "}
                  <b>{c.order_name ?? "-"}</b>
                </div>
              </div>

              <div className="dtActions">
                <button
                  className={
                    c.status === "collected" ? "dtBtn dtBtnDisabled" : "dtBtn"
                  }
                  onClick={() => handleCollected(c)}
                  disabled={c.status === "collected"}
                >
                  Mark Collected
                </button>

                <button
                  className={
                    c.status !== "withdelivery"
                      ? "dtBtnSoft dtBtnDisabled"
                      : "dtBtnSoft"
                  }
                  onClick={() => handleRevertPending(c)}
                  disabled={c.status !== "withdelivery"}
                >
                  Revert to Pending
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

export default DeliveryTrackingPage;
