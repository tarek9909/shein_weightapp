import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { getMonths } from "../api/monthApi";
import {
  getCustomersForDeliveryByMonth,
  updateCustomerDelivery,
  checkDeliveryNumberByMonth,
  // ✅ ADD this in your deliveryApi:
  // export const updateCustomerUsdToCollect = (id, usd_to_collect) =>
  //   apiFetch(`${BASE_URL}/updateCustomerUsdToCollect.php`, {
  //     method: "POST",
  //     body: JSON.stringify({ id, usd_to_collect }),
  //   });
  updateCustomerUsdToCollect,
} from "../api/deliveryApi";

import { CustomModal } from "../components/CustomModal";
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

  const openError = (message, title = "Error") => {
    setModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => setModal({ isOpen: false }),
      onCancel: () => setModal({ isOpen: false }),
      onClose: () => setModal({ isOpen: false }),
      confirmText: "OK",
      showCancel: false,
    });
  };

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

  const refreshCustomers = async () => {
    const data = await getCustomersForDeliveryByMonth(monthId);
    setCustomers(Array.isArray(data) ? data : []);
  };

  // Load months
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

  // When month changes → load customers
  useEffect(() => {
    if (!monthId) {
      setCustomers([]);
      setSearch("");
      return;
    }
    if (!ensureAuth()) return;

    (async () => {
      try {
        await refreshCustomers();
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

  // ✅ NEW FLOW:
  // 1) Ask for price (editable)
  // 2) Confirm price
  // 3) Ask for delivery number
  // 4) Assign delivery
  const startAssignFlow = (customer) => {
    if (customer.status !== "pending") {
      openError("This customer cannot be assigned because the status is not pending.");
      return;
    }

    // Step 1: Edit price
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
      onCancel: () => setModal({ isOpen: false }),
      onClose: () => setModal({ isOpen: false }),

      onConfirm: async (priceInput) => {
        const raw = String(priceInput ?? "").trim().replace(",", ".");
        const price = Number(raw);

        if (!Number.isFinite(price) || price < 0) {
          openError("Please enter a valid non-negative number for the price.", "Invalid Price");
          return;
        }

        // Step 2: Confirm price
        setModal({
          isOpen: true,
          title: "Confirm Price",
          message: `Confirm USD to collect: $${price.toFixed(2)} ?`,
          showCancel: true,
          confirmText: "Confirm",
          cancelText: "Back",
          onCancel: () => startAssignFlow(customer), // back to price input
          onClose: () => setModal({ isOpen: false }),

          onConfirm: async () => {
            try {
              // ✅ Save price to DB (you need this endpoint)
              const resPrice = await updateCustomerUsdToCollect(customer.id, price);

              if (resPrice?.success === false) {
                throw new Error(resPrice?.error || "Failed to update price");
              }

              // Step 3: Ask delivery number
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
                onCancel: () => setModal({ isOpen: false }),
                onClose: () => setModal({ isOpen: false }),

                onConfirm: async (deliveryNumber) => {
                  const dn = String(deliveryNumber || "").trim();
                  if (!dn) {
                    setModal({ isOpen: false });
                    return;
                  }

                  try {
                    const check = await checkDeliveryNumberByMonth(monthId, dn);
                    if (check?.exists) {
                      setModal({
                        isOpen: true,
                        title: "Delivery Number Exists",
                        message: `Delivery number "${dn}" already exists. Please choose another one.`,
                        onConfirm: () => setModal({ isOpen: false }),
                        onCancel: () => setModal({ isOpen: false }),
                        onClose: () => setModal({ isOpen: false }),
                        confirmText: "OK",
                        showCancel: false,
                      });
                      return;
                    }

                    const res = await updateCustomerDelivery(customer.id, dn, "pending");
                    if (res?.success === false) {
                      throw new Error(res?.error || "Failed to assign delivery");
                    }

                    await refreshCustomers();
                    setModal({ isOpen: false });
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
            Choose a month, search, edit price, confirm it, then assign a delivery number to pending
            customers.
          </div>
        </div>

        <div className="delFilters">
          <div className="delField">
            <label className="delLabel">Month</label>
            <select
              className="delSelect"
              value={monthId}
              onChange={(e) => setMonthId(e.target.value)}
            >
              <option value="">Select Month</option>
              {months.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (#{m.id})
                </option>
              ))}
            </select>
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
        {monthId && filteredCustomers.length === 0 ? (
          <div className="delEmpty">
            <div className="delEmptyTitle">No customers found</div>
            <div className="delEmptySub">
              {customers.length === 0
                ? "This month has no customers."
                : "No results match your search."}
            </div>
          </div>
        ) : null}

        {filteredCustomers.map((c) => (
          <div key={c.id} className="delRow">
            <div className="delRowMain">
              <div className="delRowTitle">
                {c.customer_name?.trim() ? c.customer_name : "(empty name)"}
              </div>

              <div className="delRowMeta" style={{ marginTop: 4, opacity: 0.8, fontSize: 13 }}>
                <div>
                  Order: <b>{c.order_name || "-"}</b> (#{c.order_id || "-"})
                </div>
                <div>
                  Cart: <b>{c.cart_order_number || "-"}</b> (#{c.cart_id || "-"})
                </div>
              </div>

              <div className="delBadges">
                <span className="delBadgeSoft">
                  USD: ${Number(c.usd_to_collect || 0).toFixed(2)}
                </span>

                <span className="delBadge">
                  Delivery: {c.delivery_number || "none"}
                </span>

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
    </div>
  );
};

export default DeliveryPage;
