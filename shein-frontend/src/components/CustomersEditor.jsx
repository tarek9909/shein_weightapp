import { useEffect, useMemo, useState } from "react";
import {
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
} from "../api/customersApi";
import { CustomModal } from "../components/CustomModal";
import "../customersEditor.css";

const money = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const CustomersEditor = ({ cart, onClose, canEdit }) => {
  const [customers, setCustomers] = useState([]);

  // modal controller
  const [modal, setModal] = useState({ isOpen: false });

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.id]);

  const loadCustomers = async () => {
    const data = await getCustomers(cart.id);
    setCustomers(data || []);
  };

  const totalToCollect = useMemo(
    () => customers.reduce((s, c) => s + Number(c.usd_to_collect || 0), 0),
    [customers]
  );

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
          setModal((m) => ({ ...m, message: "This field is required." }));
          return;
        }
        closeModal();
        await onSubmit(v);
      },
      onCancel: closeModal,
      onClose: closeModal,
    });
  };

  const guardEdit = () => {
    if (canEdit) return true;
    openInfo({
      title: "Not Allowed",
      message:
        "Cannot add/edit/delete customers because total cart prices do not match the order value.",
    });
    return false;
  };

  const handleAddCustomer = async () => {
    if (!guardEdit()) return;

    openPrompt({
      title: "Add Customer",
      placeholder: "Customer name",
      defaultValue: "",
      onSubmit: async (name) => {
        openPrompt({
          title: "Add Customer (Gross Amount)",
          placeholder: "Amount to collect before delivery charge",
          defaultValue: "",
          type: "number",
          onSubmit: async (grossAmountInput) => {
            const grossAmount = Number(grossAmountInput);
            if (!Number.isFinite(grossAmount) || grossAmount < 0) {
              openInfo({
                title: "Invalid Amount",
                message: "Amount to collect must be a valid number >= 0.",
              });
              return;
            }
            openPrompt({
              title: "Add Customer (Delivery Charge)",
              placeholder: "Delivery charge in USD",
              defaultValue: "0",
              type: "number",
              onSubmit: async (deliveryChargeInput) => {
                const deliveryCharge = Number(deliveryChargeInput);
                if (!Number.isFinite(deliveryCharge) || deliveryCharge < 0) {
                  openInfo({
                    title: "Invalid Delivery Charge",
                    message: "Delivery charge must be a valid number >= 0.",
                  });
                  return;
                }
                const netAmount = Math.max(0, grossAmount - deliveryCharge);
                openConfirm({
                  title: "Confirm Customer Amounts",
                  message:
                    `Gross amount: $${money(grossAmount)}\n` +
                    `Delivery charge: $${money(deliveryCharge)}\n` +
                    `Net to collect (saved): $${money(netAmount)}`,
                  onYes: async () => {
                    try {
                      await addCustomer(cart.id, name, netAmount, deliveryCharge);
                      await loadCustomers();
                    } catch (err) {
                      openInfo({
                        title: "Add Customer Error",
                        message: err?.message || "Failed to add customer.",
                      });
                    }
                  },
                });
              },
            });
          },
        });
      },
    });
  };

  const handleEditCustomer = async (c) => {
    if (!guardEdit()) return;

    openPrompt({
      title: "Edit Customer",
      placeholder: "Customer name",
      defaultValue: c.customer_name ?? "",
      onSubmit: async (name) => {
        const currentNet = Number(c.usd_to_collect || 0);
        const currentDelivery = Number(c.delivery_charge_usd || 0);
        const currentGross = currentNet + currentDelivery;
        openPrompt({
          title: "Edit Customer (Gross Amount)",
          placeholder: "Amount to collect before delivery charge",
          defaultValue: String(currentGross),
          type: "number",
          onSubmit: async (grossAmountInput) => {
            const grossAmount = Number(grossAmountInput);
            if (!Number.isFinite(grossAmount) || grossAmount < 0) {
              openInfo({
                title: "Invalid Amount",
                message: "Amount to collect must be a valid number >= 0.",
              });
              return;
            }
            openPrompt({
              title: "Edit Customer (Delivery Charge)",
              placeholder: "Delivery charge in USD",
              defaultValue: String(currentDelivery),
              type: "number",
              onSubmit: async (deliveryChargeInput) => {
                const deliveryCharge = Number(deliveryChargeInput);
                if (!Number.isFinite(deliveryCharge) || deliveryCharge < 0) {
                  openInfo({
                    title: "Invalid Delivery Charge",
                    message: "Delivery charge must be a valid number >= 0.",
                  });
                  return;
                }
                const netAmount = Math.max(0, grossAmount - deliveryCharge);
                openConfirm({
                  title: "Confirm Customer Amounts",
                  message:
                    `Gross amount: $${money(grossAmount)}\n` +
                    `Delivery charge: $${money(deliveryCharge)}\n` +
                    `Net to collect (saved): $${money(netAmount)}`,
                  onYes: async () => {
                    try {
                      await updateCustomer(c.id, name, netAmount, deliveryCharge);
                      await loadCustomers();
                    } catch (err) {
                      openInfo({
                        title: "Update Customer Error",
                        message: err?.message || "Failed to update customer.",
                      });
                    }
                  },
                });
              },
            });
          },
        });
      },
    });
  };

  const handleDeleteCustomer = async (c) => {
    if (!guardEdit()) return;

    openConfirm({
      title: "Delete Customer",
      message: `Delete "${c.customer_name || "(empty name)"}"?`,
      onYes: async () => {
        await deleteCustomer(c.id);
        await loadCustomers();
      },
    });
  };

  return (
    <div className="cuOverlay" role="dialog" aria-modal="true">
      <div className="cuModal">
        <div className="cuHead">
          <div>
            <div className="cuTitle">
              Customers in Cart{" "}
              <span className="cuMuted">#{cart.cart_order_number}</span>
            </div>
            <div className="cuSub">
              Total to collect: <b>${money(totalToCollect)}</b> • Customers:{" "}
              <b>{customers.length}</b>
            </div>
          </div>

          <button className="cuClose" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="cuActions">
          <button
            className={canEdit ? "cuBtn" : "cuBtn cuBtnDisabled"}
            onClick={handleAddCustomer}
            disabled={!canEdit}
          >
            Add Customer
          </button>


        </div>

        <div className="cuBody">
          {customers.length === 0 ? (
            <div className="cuEmpty">
              <div className="cuEmptyTitle">No customers</div>
              <div className="cuEmptySub">Add a customer to start tracking collection.</div>
            </div>
          ) : (
            <div className="cuGrid">
              {customers.map((c) => (
                <div key={c.id} className="cuCard">
                  <div className="cuCardTop">
                    <div className="cuCardTitle">
                      {c.customer_name?.trim() ? c.customer_name : "(empty name)"}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <div className="cuBadgeSoft">
                        Gross: ${money(Number(c.usd_to_collect || 0) + Number(c.delivery_charge_usd || 0))}
                      </div>
                      <div className="cuBadgeSoft">
                        Delivery: ${money(c.delivery_charge_usd || 0)}
                      </div>
                      <div className="cuBadgeSoft">Net: ${money(c.usd_to_collect)}</div>
                    </div>
                  </div>

                  <div className="cuButtons">
                    <button
                      className={canEdit ? "cuBtnSoft" : "cuBtnSoft cuBtnDisabled"}
                      onClick={() => handleEditCustomer(c)}
                      disabled={!canEdit}
                    >
                      Edit
                    </button>

                    <button
                      className={canEdit ? "cuBtnDanger" : "cuBtnDanger cuBtnDisabled"}
                      onClick={() => handleDeleteCustomer(c)}
                      disabled={!canEdit}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cuFooter">
          <button className="cuBtnSoft" onClick={onClose}>
            Close
          </button>
        </div>

        {/* ✅ all alerts / prompts / confirms are modals now */}
        <CustomModal {...modal} />
      </div>
    </div>
  );
};

export default CustomersEditor;
