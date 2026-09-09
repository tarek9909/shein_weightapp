import { useEffect, useMemo, useState } from "react";
import {
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerDirectory,
  createDirectoryCustomer,
} from "../api/customersApi";
import { CustomModal } from "../components/CustomModal";
import CustomDropdown from "./CustomDropdown";
import RecordCustomerLossModal from "./RecordCustomerLossModal";
import "../customersEditor.css";

const money = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const CustomersEditor = ({ cart, onClose, canEdit }) => {
  const [customers, setCustomers] = useState([]);
  const [directoryCustomers, setDirectoryCustomers] = useState([]);

  // modal controller for general alerts / delete confirmation
  const [modal, setModal] = useState({ isOpen: false });
  const [lossCustomer, setLossCustomer] = useState(null);

  // single unified form modal state for adding/editing customers
  const [formModal, setFormModal] = useState({
    isOpen: false,
    editingCustomer: null,
    selectedDirectoryId: "",
    name: "",
    saveToDirectory: true,
    grossAmount: "",
    deliveryCharge: "0",
    error: "",
    isSubmitting: false,
  });

  useEffect(() => {
    loadCustomers();
    loadDirectory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.id]);

  const loadDirectory = async () => {
    try {
      const res = await getCustomerDirectory();
      setDirectoryCustomers(Array.isArray(res?.customers) ? res.customers : []);
    } catch {
      // non-blocking
    }
  };

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

  const guardEdit = () => {
    if (canEdit) return true;
    openInfo({
      title: "Not Allowed",
      message:
        "Cannot add/edit/delete customers because total cart prices do not match the order value.",
    });
    return false;
  };

  const handleOpenAddForm = () => {
    if (!guardEdit()) return;
    setFormModal({
      isOpen: true,
      editingCustomer: null,
      selectedDirectoryId: "",
      name: "",
      saveToDirectory: true,
      grossAmount: "",
      deliveryCharge: "0",
      error: "",
      isSubmitting: false,
    });
  };

  const handleOpenEditForm = (c) => {
    if (!guardEdit()) return;
    const currentNet = Number(c.usd_to_collect || 0);
    const currentDelivery = Number(c.delivery_charge_usd || 0);
    const currentGross = currentNet + currentDelivery;
    const matchedDir = directoryCustomers.find(
      (d) => d.customer_name.toLowerCase() === String(c.customer_name || "").trim().toLowerCase()
    );

    setFormModal({
      isOpen: true,
      editingCustomer: c,
      selectedDirectoryId: matchedDir ? String(matchedDir.id) : "",
      name: c.customer_name ?? "",
      saveToDirectory: false,
      grossAmount: String(currentGross),
      deliveryCharge: String(currentDelivery),
      error: "",
      isSubmitting: false,
    });
  };

  const handleCloseForm = () => {
    setFormModal({
      isOpen: false,
      editingCustomer: null,
      selectedDirectoryId: "",
      name: "",
      saveToDirectory: true,
      grossAmount: "",
      deliveryCharge: "0",
      error: "",
      isSubmitting: false,
    });
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const name = formModal.name.trim();
    if (!name) {
      setFormModal((prev) => ({ ...prev, error: "Customer name is required." }));
      return;
    }

    const gross = Number(formModal.grossAmount);
    if (!Number.isFinite(gross) || gross < 0) {
      setFormModal((prev) => ({ ...prev, error: "Gross amount must be a valid number >= 0." }));
      return;
    }

    const delivery = Number(formModal.deliveryCharge || 0);
    if (!Number.isFinite(delivery) || delivery < 0) {
      setFormModal((prev) => ({ ...prev, error: "Delivery charge must be a valid number >= 0." }));
      return;
    }

    const netAmount = Math.max(0, gross - delivery);

    setFormModal((prev) => ({ ...prev, isSubmitting: true, error: "" }));

    try {
      // If user checked save to directory and name doesn't exist in directory, save it
      const alreadyInDir = directoryCustomers.some(
        (dc) => dc.customer_name.toLowerCase() === name.toLowerCase()
      );
      if (formModal.saveToDirectory && !alreadyInDir) {
        try {
          await createDirectoryCustomer({ customer_name: name });
          loadDirectory();
        } catch {
          // ignore directory duplicate or non-fatal errors
        }
      }

      if (formModal.editingCustomer) {
        await updateCustomer(formModal.editingCustomer.id, name, netAmount, delivery);
      } else {
        await addCustomer(cart.id, name, netAmount, delivery);
      }
      await loadCustomers();
      handleCloseForm();
    } catch (err) {
      setFormModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: err?.message || "Failed to save customer.",
      }));
    }
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

  const computedGross = Number(formModal.grossAmount || 0);
  const computedDelivery = Number(formModal.deliveryCharge || 0);
  const computedNet = Math.max(0, computedGross - computedDelivery);

  const selectedCustomerObj = useMemo(() => {
    if (formModal.selectedDirectoryId) {
      return directoryCustomers.find(
        (dc) => String(dc.id) === String(formModal.selectedDirectoryId)
      );
    }
    const clean = formModal.name.trim().toLowerCase();
    if (!clean) return null;
    return directoryCustomers.find(
      (dc) => dc.customer_name.toLowerCase() === clean
    );
  }, [directoryCustomers, formModal.selectedDirectoryId, formModal.name]);

  const isExistingDirectoryName = Boolean(selectedCustomerObj);

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
            onClick={handleOpenAddForm}
            disabled={!canEdit}
          >
            Add Customer
          </button>

          <a
            href="/customers"
            target="_blank"
            rel="noopener noreferrer"
            className="cuBtnSoft"
            style={{ marginLeft: "auto", textDecoration: "none" }}
            title="Open Customers Directory in a new tab"
          >
            👥 Customer Directory ↗
          </a>
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
                        onClick={() => handleOpenEditForm(c)}
                        disabled={!canEdit}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="cuBtnDanger"
                        style={{
                          background: "rgba(239, 68, 68, 0.12)",
                          borderColor: "rgba(239, 68, 68, 0.35)",
                          color: "#f87171",
                          padding: "5px 10px",
                          fontSize: "12px",
                        }}
                        onClick={() =>
                          setLossCustomer({
                            customer_id: c.id,
                            customer_name: c.customer_name,
                            usd_to_collect: c.usd_to_collect,
                            order_id: cart?.order_id,
                          })
                        }
                        title="Record immediate loss on customer"
                      >
                        📉 Loss
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

        {/* Unified Customer Form Modal (Single form for adding / editing) */}
        {formModal.isOpen && (
          <div className="cuFormOverlay" role="dialog" aria-modal="true">
            <div className="cuFormModal">
              <div className="cuFormHead">
                <div className="cuFormTitle">
                  {formModal.editingCustomer ? "Edit Customer" : "Add New Customer"}
                </div>
                <button type="button" className="cuClose" onClick={handleCloseForm} aria-label="Close">
                  ✕
                </button>
              </div>

              <form onSubmit={handleFormSubmit}>
                <div className="cuFormBody">
                  {formModal.error && (
                    <div className="cuFormError">
                      {formModal.error}
                    </div>
                  )}

                  <div className="cuField">
                    <label className="cuLabel" htmlFor="cuDirectorySelect">
                      Select Customer from Directory
                    </label>
                    <CustomDropdown
                      id="cuDirectorySelect"
                      placeholder="-- Choose from Saved Customers (or type below) --"
                      value={formModal.selectedDirectoryId}
                      options={[
                        { value: "", label: "✍️ Custom / Type New Name Below" },
                        ...directoryCustomers.map((dc) => ({
                          value: String(dc.id),
                          label: `${dc.customer_name}${dc.phone ? ` • 📞 ${dc.phone}` : ""}`,
                        })),
                      ]}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          setFormModal((prev) => ({
                            ...prev,
                            selectedDirectoryId: "",
                          }));
                        } else {
                          const match = directoryCustomers.find(
                            (dc) => String(dc.id) === String(val)
                          );
                          if (match) {
                            setFormModal((prev) => ({
                              ...prev,
                              selectedDirectoryId: val,
                              name: match.customer_name,
                              error: "",
                            }));
                          }
                        }
                      }}
                    />
                  </div>

                  <div className="cuField">
                    <label className="cuLabel" htmlFor="cuNameInput">
                      Customer Name <span className="cuReq">*</span>
                    </label>
                    <input
                      id="cuNameInput"
                      type="text"
                      className="cuInput"
                      placeholder="e.g. Sara Ahmed"
                      value={formModal.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        const match = directoryCustomers.find(
                          (dc) => dc.customer_name.toLowerCase() === val.trim().toLowerCase()
                        );
                        setFormModal((prev) => ({
                          ...prev,
                          name: val,
                          selectedDirectoryId: match ? String(match.id) : "",
                          error: "",
                        }));
                      }}
                      autoFocus
                      required
                    />
                  </div>

                  {selectedCustomerObj && (
                    <div className="cuDirBadge">
                      <span className="cuDirBadgeDot" />
                      <span>Saved customer: <strong>{selectedCustomerObj.customer_name}</strong></span>
                      {selectedCustomerObj.phone && <span> • 📞 {selectedCustomerObj.phone}</span>}
                      {selectedCustomerObj.notes && <span> • 📝 {selectedCustomerObj.notes}</span>}
                    </div>
                  )}

                  {!isExistingDirectoryName && formModal.name.trim() && (
                    <label className="cuSaveDirCheckbox">
                      <input
                        type="checkbox"
                        checked={formModal.saveToDirectory}
                        onChange={(e) =>
                          setFormModal((prev) => ({ ...prev, saveToDirectory: e.target.checked }))
                        }
                      />
                      <span>Save "{formModal.name.trim()}" to Customer Directory for future orders</span>
                    </label>
                  )}

                  <div className="cuFormRow">
                    <div className="cuField">
                      <label className="cuLabel" htmlFor="cuGrossInput">
                        Gross Amount ($)
                      </label>
                      <input
                        id="cuGrossInput"
                        type="number"
                        min="0"
                        step="any"
                        className="cuInput"
                        placeholder="Amount before delivery"
                        value={formModal.grossAmount}
                        onChange={(e) =>
                          setFormModal((prev) => ({ ...prev, grossAmount: e.target.value, error: "" }))
                        }
                        required
                      />
                    </div>

                    <div className="cuField">
                      <label className="cuLabel" htmlFor="cuDeliveryInput">
                        Delivery Charge ($)
                      </label>
                      <input
                        id="cuDeliveryInput"
                        type="number"
                        min="0"
                        step="any"
                        className="cuInput"
                        placeholder="0"
                        value={formModal.deliveryCharge}
                        onChange={(e) =>
                          setFormModal((prev) => ({ ...prev, deliveryCharge: e.target.value, error: "" }))
                        }
                      />
                    </div>
                  </div>

                  <div className="cuCalcSummary">
                    <div className="cuCalcRow">
                      <span>Gross Amount:</span>
                      <b>${money(computedGross)}</b>
                    </div>
                    <div className="cuCalcRow">
                      <span>Delivery Charge:</span>
                      <b>-${money(computedDelivery)}</b>
                    </div>
                    <div className="cuCalcRow cuCalcNet">
                      <span>Net to Collect (Saved):</span>
                      <b>${money(computedNet)}</b>
                    </div>
                  </div>
                </div>

                <div className="cuFormFooter">
                  <button
                    type="button"
                    className="cuBtnSoft"
                    onClick={handleCloseForm}
                    disabled={formModal.isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="cuBtn"
                    disabled={formModal.isSubmitting}
                  >
                    {formModal.isSubmitting
                      ? "Saving..."
                      : formModal.editingCustomer
                      ? "Save Changes"
                      : "Add Customer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {lossCustomer && (
          <RecordCustomerLossModal
            customer={lossCustomer}
            onClose={() => setLossCustomer(null)}
            onSuccess={() => {
              setLossCustomer(null);
              loadCustomers();
            }}
          />
        )}

        {/* Alert & Confirm Modals */}
        <CustomModal {...modal} />
      </div>
    </div>
  );
};

export default CustomersEditor;

