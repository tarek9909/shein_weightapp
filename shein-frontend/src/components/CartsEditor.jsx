import { useEffect, useMemo, useState } from "react";
import { getCarts, addCart, updateCart, deleteCart } from "../api/cartsApi";
import CustomersEditor from "./CustomersEditor";
import { CustomModal } from "../components/CustomModal";
import "../cartsEditor.css";

const money = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const CartsEditor = ({ order, onClose, onUpdated }) => {
  const [carts, setCarts] = useState([]);
  const [selectedCart, setSelectedCart] = useState(null);

  // modal controller
  const [modal, setModal] = useState({ isOpen: false });

  useEffect(() => {
    loadCarts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCarts = async () => {
    const data = await getCarts(order.id);
    setCarts(data || []);
    if (onUpdated) onUpdated();
  };

  const totalCartPrice = useMemo(
    () => carts.reduce((sum, c) => sum + Number(c.cart_price || 0), 0),
    [carts]
  );

  const orderTotal = Number(order.order_details || 0);

  // keep same rule but safer for decimals
  const canEdit = Math.abs(totalCartPrice - orderTotal) < 0.0001;

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

  // one-input prompt modal
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
          // stay open but show error message inside same modal (simple approach)
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
    // step 1: number
    openPrompt({
      title: "Add Cart",
      placeholder: "Cart order number",
      defaultValue: "",
      onSubmit: async (cartOrderNumber) => {
        // step 2: price
        openPrompt({
          title: "Add Cart",
          placeholder: "Cart price",
          defaultValue: "",
          type: "number",
          onSubmit: async (cartPrice) => {
            await addCart(order.id, cartOrderNumber, cartPrice);
            await loadCarts();
          },
        });
      },
    });
  };

  const handleEditCart = async (cart) => {
    openPrompt({
      title: "Edit Cart",
      placeholder: "Cart order number",
      defaultValue: cart.cart_order_number ?? "",
      onSubmit: async (newNumber) => {
        openPrompt({
          title: "Edit Cart",
          placeholder: "Cart price",
          defaultValue: cart.cart_price ?? "",
          type: "number",
          onSubmit: async (newPrice) => {
            await updateCart(cart.id, newNumber, newPrice);
            await loadCarts();
          },
        });
      },
    });
  };

  const handleDeleteCart = async (cart) => {
    openConfirm({
      title: "Delete Cart",
      message: `Delete cart "${cart.cart_order_number}"? This will also delete its customers.`,
      onYes: async () => {
        await deleteCart(cart.id);
        await loadCarts();
      },
    });
  };

  const handleOpenCustomers = (cart) => {
    if (!canEdit) {
      openInfo({
        title: "Not Allowed",
        message:
          `Customers are disabled until totals match.\n\nOrder: $${money(orderTotal)}\nCarts total: $${money(totalCartPrice)}`,
      });
      return;
    }
    setSelectedCart(cart);
  };

  return (
    <div className="ceOverlay" role="dialog" aria-modal="true">
      <div className="ceModal">
        <div className="ceHead">
          <div>
            <div className="ceTitle">
              Carts for Order #{order.id}{" "}
              <span className="ceMuted">— {order.order_name || "-"}</span>
            </div>
            <div className="ceSub">
              Order value: <b>${money(orderTotal)}</b> • Cart total:{" "}
              <b>${money(totalCartPrice)}</b>
            </div>
          </div>

          <button className="ceClose" onClick={onClose} aria-label="Close">
            ✕
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
            carts.map((cart) => (
              <div key={cart.id} className="ceCard">
                <div className="ceCardTop">
                  <div className="ceCardTitle">
                    Cart <span className="ceMuted">#{cart.cart_order_number}</span>
                  </div>
                  <div className="ceBadgeSoft">${money(cart.cart_price)}</div>
                </div>

                <div className="ceCardButtons">
                  <button
                    className={canEdit ? "ceBtn" : "ceBtn ceBtnDisabled"}
                    onClick={() => handleOpenCustomers(cart)}
                    disabled={!canEdit}
                    title={!canEdit ? "Totals must match to open customers" : "Open customers"}
                  >
                    Customers
                  </button>

                  <button className="ceBtnSoft" onClick={() => handleEditCart(cart)}>
                    Edit
                  </button>

                  <button className="ceBtnDanger" onClick={() => handleDeleteCart(cart)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="ceFooter">
          <button className="ceBtnSoft" onClick={onClose}>
            Close
          </button>
        </div>

        {selectedCart && (
          <CustomersEditor
            cart={selectedCart}
            onClose={() => setSelectedCart(null)}
            canEdit={canEdit}
          />
        )}

        {/* ✅ all alerts / prompts / confirms are modals now */}
        <CustomModal {...modal} />
      </div>
    </div>
  );
};

export default CartsEditor;
