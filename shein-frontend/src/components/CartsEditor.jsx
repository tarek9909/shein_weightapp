import { useEffect, useMemo, useState } from "react";
import { getCarts, addCart, updateCart, deleteCart } from "../api/cartsApi";
import { refreshCartShein } from "../api/sheinTrackerApi";
import CustomersEditor from "./CustomersEditor";
import { CustomModal } from "../components/CustomModal";
import CustomDropdown from "./CustomDropdown";
import "../cartsEditor.css";

const CartsEditor = ({
  order,
  onClose,
  onUpdated,
  sheinUsers = [],
  chromeProfiles = [],
  defaultSheinEmail = "",
}) => {
  const [carts, setCarts] = useState([]);
  const [selectedCart, setSelectedCart] = useState(null);
  const [refreshingCartId, setRefreshingCartId] = useState(null);
  const [selectedProfileByCart, setSelectedProfileByCart] = useState({});

  const [modal, setModal] = useState({ isOpen: false });
  const canEdit = true;

  useEffect(() => {
    loadCarts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCarts = async () => {
    try {
      const data = await getCarts(order.id);
      setCarts(data || []);
      if (onUpdated) onUpdated();
    } catch (err) {
      openInfo({
        title: "Load Error",
        message: err?.message || "Failed to load carts.",
      });
    }
  };

  const sheinUserEmails = useMemo(
    () => Array.from(new Set((sheinUsers || []).map((u) => (u?.email || "").trim()).filter(Boolean))),
    [sheinUsers]
  );

  const profileByEmail = useMemo(() => {
    const map = new Map();
    for (const user of sheinUsers || []) {
      const email = String(user?.email || "").trim().toLowerCase();
      const profileKey = String(user?.profile_key || "").trim();
      if (email && profileKey) map.set(email, profileKey);
    }
    return map;
  }, [sheinUsers]);

  const profileLabel = (profile) => {
    const name = profile?.name || profile?.profile_key || "Unnamed profile";
    const accountName = profile?.account_name ? ` — ${profile.account_name}` : "";
    const email = profile?.email ? ` (${profile.email})` : "";
    return `${name}${accountName}${email}`;
  };

  const getCartProfileKey = (cart) => {
    const selected = selectedProfileByCart[cart.id];
    if (selected) return selected;
    return profileByEmail.get(String(cart.shein_email || "").trim().toLowerCase()) || "";
  };

  const jointMetaByTracking = useMemo(() => {
    const out = {};
    for (const c of carts || []) {
      const tracking = String(c?.shein_tracking_no || "").trim();
      if (!tracking) continue;
      if (!out[tracking]) out[tracking] = { orders: new Set(), carts: new Set() };
      const orderNo = String(c?.shein_order_no || "").trim();
      const cartNo = String(c?.cart_order_number || "").trim();
      if (orderNo) out[tracking].orders.add(orderNo);
      if (cartNo) out[tracking].carts.add(cartNo);
    }
    return out;
  }, [carts]);

  const closeModal = () => setModal({ isOpen: false });

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

  const openPrompt = ({ title, placeholder, defaultValue = "", type = "text", onSubmit }) => {
    setModal({
      isOpen: true,
      title,
      inputProps: { placeholder, defaultValue, type },
      showCancel: true,
      confirmText: "Save",
      cancelText: "Cancel",
      onConfirm: async (value) => {
        const v = String(value ?? "").trim();
        if (!v) {
          setModal((m) => ({
            ...m,
            message: "This field is required.",
          }));
          return;
        }
        closeModal();
        await onSubmit(v);
      },
      onCancel: closeModal,
      onClose: closeModal,
    });
  };

  const handleAddCart = async () => {
    openPrompt({
      title: "Add Cart",
      placeholder: "Cart order number",
      defaultValue: "",
      onSubmit: async (cartOrderNumber) => {
        try {
          await addCart(order.id, cartOrderNumber, 0);
          await loadCarts();
        } catch (err) {
          openInfo({
            title: "Add Cart Error",
            message: err?.message || "Failed to add cart.",
          });
        }
      },
    });
  };

  const handleEditCart = async (cart) => {
    openPrompt({
      title: "Edit Cart",
      placeholder: "Cart order number",
      defaultValue: cart.cart_order_number ?? "",
      onSubmit: async (newNumber) => {
        try {
          await updateCart(cart.id, newNumber, cart.cart_price ?? 0);
          await loadCarts();
        } catch (err) {
          openInfo({
            title: "Update Cart Error",
            message: err?.message || "Failed to update cart.",
          });
        }
      },
    });
  };

  const handleDeleteCart = async (cart) => {
    openConfirm({
      title: "Delete Cart",
      message: `Delete cart "${cart.cart_order_number}"? This will also delete its customers.`,
      onYes: async () => {
        try {
          await deleteCart(cart.id);
          await loadCarts();
        } catch (err) {
          openInfo({
            title: "Delete Cart Error",
            message: err?.message || "Failed to delete cart.",
          });
        }
      },
    });
  };

  const handleAssignShein = async (cart, selectedEmail) => {
    const effectiveEmail = (selectedEmail || defaultSheinEmail || "").trim();
    if (!effectiveEmail) {
      openInfo({
        title: "Missing SHEIN Account",
        message: "Please select a SHEIN account email from the dropdown first.",
      });
      return;
    }

    openPrompt({
      title: "Assign SHEIN Order Number",
      placeholder: "Order number (GSH...)",
      defaultValue: cart.shein_order_no || "",
      onSubmit: async (sheinOrderNo) => {
        const normalizedOrderNo = sheinOrderNo.trim();
        if (normalizedOrderNo.length < 3) {
          openInfo({
            title: "Invalid Order Number",
            message: "Please enter a valid SHEIN order number.",
          });
          return;
        }
        try {
          await updateCart(cart.id, cart.cart_order_number, cart.cart_price, {
            shein_email: effectiveEmail,
            shein_order_no: normalizedOrderNo,
          });
          await loadCarts();
        } catch (err) {
          openInfo({
            title: "Assign Error",
            message: err?.message || "Failed to assign SHEIN data to cart.",
          });
        }
      },
    });
  };

  const handleRefreshSheinForCart = async (cart) => {
    if (!cart.shein_email || !cart.shein_order_no) {
      openInfo({
        title: "Missing SHEIN Data",
        message: "Assign SHEIN email and order number first.",
      });
      return;
    }

    setRefreshingCartId(cart.id);
    try {
      const profileKey = getCartProfileKey(cart);
      if (!profileKey) {
        openInfo({
          title: "Missing Chrome Profile",
          message: "Select a Chrome profile for this cart before refreshing SHEIN.",
        });
        return;
      }

      await refreshCartShein(cart.id, profileKey);
      await loadCarts();
    } catch (err) {
      openInfo({
        title: "Refresh Error",
        message: err?.message || "Failed to refresh SHEIN data for this cart.",
      });
    } finally {
      setRefreshingCartId(null);
    }
  };

  const handleOpenCustomers = (cart) => {
    setSelectedCart(cart);
  };

  const fmtKg = (v) => (v === null || v === undefined || v === "" ? "-" : Number(v).toFixed(3));

  return (
    <div className="ceOverlay" role="dialog" aria-modal="true">
      <div className="ceModal">
        <div className="ceHead">
          <div>
            <div className="ceTitle">
              Carts for Order #{order.id} <span className="ceMuted">- {order.order_name || "-"}</span>
            </div>
          </div>

          <button className="ceClose" onClick={onClose} aria-label="Close">
            X
          </button>
        </div>

        <div className="ceActionsTop">
          <button className="ceBtn" onClick={handleAddCart}>
            Add Cart
          </button>
        </div>

        <div className="ceGrid">
          {carts.length === 0 ? (
            <div className="ceEmpty">
              <div className="ceEmptyTitle">No carts</div>
              <div className="ceEmptySub">Add a cart to start assigning customers.</div>
            </div>
          ) : (
            carts.map((cart) => {
              let splitTracks = [];
              try {
                splitTracks = cart?.shein_split_tracking_numbers_json
                  ? JSON.parse(cart.shein_split_tracking_numbers_json)
                  : [];
              } catch (e) {
                splitTracks = [];
              }
              const splitCount = Number(cart?.shein_split_count || 0);
              const isSplit = Number(cart?.shein_is_split_shipment || 0) === 1 || splitCount > 1;

              return (
                <div key={cart.id} className="ceCard">
                  <div className="ceCardTop">
                    <div className="ceCardTitle">
                      Cart <span className="ceMuted">#{cart.cart_order_number}</span>
                    </div>
                    <div className={`ceBadgeSoft ${Number(cart.shein_delivered || 0) === 1 ? "ceBadgeOk" : "ceBadgeWarn"}`}>
                      {Number(cart.shein_delivered || 0) === 1 ? "Delivered" : "In Progress"}
                    </div>
                  </div>

                  <div className="ceInfoGrid">
                    <div className="ceInfoRow">
                      <span className="ceInfoKey">SHEIN</span>
                      <span className="ceInfoVal">{cart.shein_email || "-"}</span>
                    </div>
                    <div className="ceInfoRow">
                      <span className="ceInfoKey">Order</span>
                      <span className="ceInfoVal">{cart.shein_order_no || "-"}</span>
                    </div>
                    <div className="ceInfoRow">
                      <span className="ceInfoKey">Tracking</span>
                      <span className="ceInfoVal">
                        {cart.shein_carrier || "-"} | {cart.shein_tracking_no || "-"}
                      </span>
                    </div>
                    <div className="ceInfoRow">
                      <span className="ceInfoKey">Weight</span>
                      <span className="ceInfoVal">{fmtKg(cart.shein_total_weight_kg)} kg</span>
                    </div>
                    <div className="ceInfoRow">
                      <span className="ceInfoKey">Weight +2kg</span>
                      <span className="ceInfoVal">{fmtKg(cart.shein_total_weight_plus_2kg)} kg</span>
                    </div>
                  </div>
                  <div className="ceAssignWrap">
                    <CustomDropdown
                      className="cmInput"
                      value={cart.shein_email || ""}
                      placeholder="Select SHEIN account"
                      searchable={true}
                      options={sheinUserEmails.map((email) => ({
                        value: email,
                        label: email,
                      }))}
                      onChange={async (e) => {
                        const nextEmail = e.target.value;
                        try {
                          await updateCart(cart.id, cart.cart_order_number, cart.cart_price, {
                            shein_email: nextEmail || null,
                            shein_order_no: cart.shein_order_no || null,
                          });
                          setSelectedProfileByCart((current) => ({
                            ...current,
                            [cart.id]: profileByEmail.get(nextEmail.trim().toLowerCase()) || "",
                          }));
                          await loadCarts();
                        } catch (err) {
                          openInfo({
                            title: "Assign Error",
                            message: err?.message || "Failed to update SHEIN account for this cart.",
                          });
                        }
                      }}
                    />
                    <CustomDropdown
                      className="cmInput"
                      value={getCartProfileKey(cart)}
                      placeholder="Select Chrome profile"
                      options={chromeProfiles.map((profile) => ({
                        value: profile.profile_key,
                        label: profileLabel(profile),
                      }))}
                      onChange={(e) => {
                        const profileKey = e.target.value;
                        setSelectedProfileByCart((current) => ({
                          ...current,
                          [cart.id]: profileKey,
                        }));
                      }}
                    />
                  </div>
                  {Number(cart.is_joint_shipment || 0) === 1 ? (
                    <div className="ceSub ceJointTag">
                      {(() => {
                        const tracking = String(cart?.shein_tracking_no || "").trim();
                        const meta = tracking ? jointMetaByTracking[tracking] : null;
                        const joinedOrders = meta ? Array.from(meta.orders) : [];
                        const joinedCarts = meta ? Array.from(meta.carts) : [];
                        const jointCombinedKg = cart?.joint_combined_weight_kg;
                        const jointCombinedPlus2 = cart?.joint_combined_weight_plus_2kg;
                        return (
                          <>
                            Joint shipment | Orders: {joinedOrders.length ? joinedOrders.join(", ") : "-"} | Carts:{" "}
                            {joinedCarts.length ? joinedCarts.join(", ") : "-"} | Joined carts:{" "}
                            {Number(cart.joint_shipment_count || joinedCarts.length || 0)}
                            {" | "}Combined Weight: {jointCombinedKg ?? "-"} kg
                            {" | "}Combined +2kg: {jointCombinedPlus2 ?? "-"} kg
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                  {isSplit ? (
                    <div className="ceSub ceSplitTag">
                      Split shipment ({splitCount || 2} packages)
                      {Array.isArray(splitTracks) && splitTracks.length > 1 ? ` | Tracks: ${splitTracks.join(", ")}` : ""}
                    </div>
                  ) : null}

                  <div className="ceCardButtons">
                    <button className="ceBtn" onClick={() => handleOpenCustomers(cart)}>
                      Customers
                    </button>

                    <button className="ceBtnSoft" onClick={() => handleEditCart(cart)}>
                      Edit
                    </button>

                    <button className="ceBtnSoft" onClick={() => handleAssignShein(cart, cart.shein_email || defaultSheinEmail)}>
                      Assign SHEIN
                    </button>

                    <button className="ceBtn" onClick={() => handleRefreshSheinForCart(cart)} disabled={refreshingCartId === cart.id}>
                      {refreshingCartId === cart.id ? "Refreshing..." : "Refresh SHEIN"}
                    </button>

                    <button className="ceBtnDanger" onClick={() => handleDeleteCart(cart)}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="ceFooter">
          <button className="ceBtnSoft" onClick={onClose}>
            Close
          </button>
        </div>

        {selectedCart && <CustomersEditor cart={selectedCart} onClose={() => setSelectedCart(null)} canEdit={canEdit} />}

        <CustomModal {...modal} />
      </div>
    </div>
  );
};

export default CartsEditor;
