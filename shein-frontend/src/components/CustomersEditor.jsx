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
          title: "Add Customer",
          placeholder: "USD to collect",
          defaultValue: "",
          type: "number",
          onSubmit: async (amount) => {
            await addCustomer(cart.id, name, amount);
            await loadCustomers();
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
        openPrompt({
          title: "Edit Customer",
          placeholder: "USD to collect",
          defaultValue: c.usd_to_collect ?? "",
          type: "number",
          onSubmit: async (amount) => {
            await updateCustomer(c.id, name, amount);
            await loadCustomers();
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
                    <div className="cuBadgeSoft">${money(c.usd_to_collect)}</div>
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
