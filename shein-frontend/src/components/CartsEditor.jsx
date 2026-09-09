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

  const [cartFormModal, setCartFormModal] = useState({
    isOpen: false,
    editingCart: null,
    cart_order_number: "",
    shein_order_no: "",
    profile_key: "",
    shein_tracking_no: "",
    shein_carrier: "",
    shein_total_weight_kg: "",
    shein_delivered: false,
    error: "",
    isSubmitting: false,
  });

  const handleOpenAddCart = () => {
    setCartFormModal({
      isOpen: true,
      editingCart: null,
      cart_order_number: "",
      shein_order_no: "",
      profile_key: chromeProfiles[0]?.profile_key || "",
      shein_tracking_no: "",
      shein_carrier: "",
      shein_total_weight_kg: "",
      shein_delivered: false,
      error: "",
      isSubmitting: false,
    });
  };

  const handleOpenEditCart = (cart) => {
    setCartFormModal({
      isOpen: true,
      editingCart: cart,
      cart_order_number: cart.cart_order_number || "",
      shein_order_no: cart.shein_order_no || "",
      profile_key: getCartProfileKey(cart),
      shein_tracking_no: cart.shein_tracking_no || "",
      shein_carrier: cart.shein_carrier || "",
      shein_total_weight_kg:
        cart.shein_total_weight_kg != null ? String(cart.shein_total_weight_kg) : "",
      shein_delivered: Number(cart.shein_delivered || 0) === 1,
      error: "",
      isSubmitting: false,
    });
  };

  const handleCloseCartForm = () => {
    setCartFormModal({
      isOpen: false,
      editingCart: null,
      cart_order_number: "",
      shein_order_no: "",
      profile_key: "",
      shein_tracking_no: "",
      shein_carrier: "",
      shein_total_weight_kg: "",
      shein_delivered: false,
      error: "",
      isSubmitting: false,
    });
  };

  const handleCartFormSubmit = async (e) => {
    e.preventDefault();
    const cartNumber = cartFormModal.cart_order_number.trim();
    if (!cartNumber) {
      setCartFormModal((prev) => ({ ...prev, error: "Cart order number is required." }));
      return;
    }

    setCartFormModal((prev) => ({ ...prev, isSubmitting: true, error: "" }));

    const weightKg =
      cartFormModal.shein_total_weight_kg.trim() !== ""
        ? Number(cartFormModal.shein_total_weight_kg)
        : null;

    if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 0)) {
      setCartFormModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: "Total weight must be a valid number >= 0.",
      }));
      return;
    }

    const payloadExtra = {
      shein_order_no: cartFormModal.shein_order_no.trim() || null,
      shein_carrier: cartFormModal.shein_carrier.trim() || null,
      shein_tracking_no: cartFormModal.shein_tracking_no.trim() || null,
      shein_total_weight_kg: weightKg,
      shein_delivered: cartFormModal.shein_delivered ? 1 : 0,
    };

    try {
      if (cartFormModal.editingCart) {
        const cartId = cartFormModal.editingCart.id;
        await updateCart(
          cartId,
          cartNumber,
          cartFormModal.editingCart.cart_price ?? 0,
          payloadExtra
        );
        if (cartFormModal.profile_key) {
          setSelectedProfileByCart((current) => ({
            ...current,
            [cartId]: cartFormModal.profile_key,
          }));
        }
      } else {
        const res = await addCart(order.id, cartNumber, 0);
        const newId = res?.id;
        if (newId) {
          await updateCart(newId, cartNumber, 0, payloadExtra);
          if (cartFormModal.profile_key) {
            setSelectedProfileByCart((current) => ({
              ...current,
              [newId]: cartFormModal.profile_key,
            }));
          }
        }
      }
      await loadCarts();
      handleCloseCartForm();
    } catch (err) {
      setCartFormModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: err?.message || "Failed to save cart.",
      }));
    }
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

  const handleRefreshSheinForCart = async (cart) => {
    if (!cart.shein_order_no) {
      openInfo({
        title: "Missing SHEIN Order Number",
        message: "Assign SHEIN order number first.",
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
          <button className="ceBtn" onClick={handleOpenAddCart}>
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

                    <button className="ceBtnSoft" onClick={() => handleOpenEditCart(cart)}>
                      Edit Cart
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

        {/* Unified Cart Form Modal (Single form displaying and editing all cart details) */}
        {cartFormModal.isOpen && (
          <div className="ceFormOverlay" role="dialog" aria-modal="true">
            <div className="ceFormModal">
              <div className="ceFormHead">
                <div className="ceFormTitle">
                  {cartFormModal.editingCart
                    ? `Edit Cart #${cartFormModal.editingCart.cart_order_number}`
                    : "Add New Cart"}
                </div>
                <button type="button" className="ceClose" onClick={handleCloseCartForm} aria-label="Close">
                  ✕
                </button>
              </div>

              <form onSubmit={handleCartFormSubmit}>
                <div className="ceFormBody">
                  {cartFormModal.error && (
                    <div className="ceFormError">{cartFormModal.error}</div>
                  )}

                  <div className="ceFormRow">
                    <div className="ceField">
                      <label className="ceLabel" htmlFor="ceCartNumInput">
                        Cart Order Number <span className="ceReq">*</span>
                      </label>
                      <input
                        id="ceCartNumInput"
                        type="text"
                        className="ceInput"
                        placeholder="e.g. 101"
                        value={cartFormModal.cart_order_number}
                        onChange={(e) =>
                          setCartFormModal((prev) => ({
                            ...prev,
                            cart_order_number: e.target.value,
                            error: "",
                          }))
                        }
                        autoFocus
                        required
                      />
                    </div>

                    <div className="ceField">
                      <label className="ceLabel" htmlFor="ceSheinOrderInput">
                        SHEIN Order Number
                      </label>
                      <input
                        id="ceSheinOrderInput"
                        type="text"
                        className="ceInput"
                        placeholder="e.g. GSH12345678"
                        value={cartFormModal.shein_order_no}
                        onChange={(e) =>
                          setCartFormModal((prev) => ({
                            ...prev,
                            shein_order_no: e.target.value,
                            error: "",
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="ceField">
                    <label className="ceLabel">Chrome Profile</label>
                    <CustomDropdown
                      className="ceInput"
                      value={cartFormModal.profile_key}
                      placeholder="Select Chrome profile"
                      options={chromeProfiles.map((profile) => ({
                        value: profile.profile_key,
                        label: profileLabel(profile),
                      }))}
                      onChange={(e) =>
                        setCartFormModal((prev) => ({
                          ...prev,
                          profile_key: e.target.value,
                          error: "",
                        }))
                      }
                    />
                  </div>

                  <div className="ceFormRow">
                    <div className="ceField">
                      <label className="ceLabel" htmlFor="ceTrackingInput">
                        Tracking Number
                      </label>
                      <input
                        id="ceTrackingInput"
                        type="text"
                        className="ceInput"
                        placeholder="e.g. 6021126419893"
                        value={cartFormModal.shein_tracking_no}
                        onChange={(e) =>
                          setCartFormModal((prev) => ({
                            ...prev,
                            shein_tracking_no: e.target.value,
                            error: "",
                          }))
                        }
                      />
                    </div>

                    <div className="ceField">
                      <label className="ceLabel" htmlFor="ceCarrierInput">
                        Carrier
                      </label>
                      <input
                        id="ceCarrierInput"
                        type="text"
                        className="ceInput"
                        placeholder="e.g. Naqel / Aramex"
                        value={cartFormModal.shein_carrier}
                        onChange={(e) =>
                          setCartFormModal((prev) => ({
                            ...prev,
                            shein_carrier: e.target.value,
                            error: "",
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="ceFormRow">
                    <div className="ceField">
                      <label className="ceLabel" htmlFor="ceWeightInput">
                        Total Weight (kg)
                      </label>
                      <input
                        id="ceWeightInput"
                        type="number"
                        min="0"
                        step="any"
                        className="ceInput"
                        placeholder="e.g. 1.25"
                        value={cartFormModal.shein_total_weight_kg}
                        onChange={(e) =>
                          setCartFormModal((prev) => ({
                            ...prev,
                            shein_total_weight_kg: e.target.value,
                            error: "",
                          }))
                        }
                      />
                    </div>

                    <div className="ceField" style={{ justifyContent: "flex-end" }}>
                      <label className="ceCheckboxLabel">
                        <input
                          type="checkbox"
                          checked={cartFormModal.shein_delivered}
                          onChange={(e) =>
                            setCartFormModal((prev) => ({
                              ...prev,
                              shein_delivered: e.target.checked,
                            }))
                          }
                        />
                        <span>Mark as Delivered</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="ceFormFooter">
                  <button
                    type="button"
                    className="ceBtnSoft"
                    onClick={handleCloseCartForm}
                    disabled={cartFormModal.isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="ceBtn"
                    disabled={cartFormModal.isSubmitting}
                  >
                    {cartFormModal.isSubmitting
                      ? "Saving..."
                      : cartFormModal.editingCart
                      ? "Save Cart Changes"
                      : "Add Cart"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <CustomModal {...modal} />
      </div>
    </div>
  );
};

export default CartsEditor;

