import { useEffect, useMemo, useRef, useState } from "react";
import {
  bulkCreateDirectoryCustomers,
  createDirectoryCustomer,
  deleteDirectoryCustomer,
  getCustomerDirectory,
  updateDirectoryCustomer,
} from "../api/customersApi";
import { CustomModal } from "../components/CustomModal";
import "../customerDirectory.css";

const EMPTY_FORM = { customer_name: "", phone: "", notes: "" };

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function parseBulkLine(line) {
  const parts = line
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)|\t/)
    .map((part) => part.trim().replace(/^"|"$/g, ""));
  return {
    customer_name: parts[0] || "",
    phone: parts[1] || "",
    notes: parts.slice(2).join(", "),
  };
}

function getInitials(name) {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function cleanPhoneForWa(phone) {
  if (!phone) return "";
  const cleaned = phone.replace(/[^0-9]/g, "");
  return cleaned;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("single"); // "single" | "bulk"
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [bulkText, setBulkText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [notice, setNotice] = useState({ type: "", text: "" });
  const [modal, setModal] = useState({ isOpen: false });
  const loadRequest = useRef(0);

  const closeModal = () => setModal({ isOpen: false });

  const openConfirm = ({ title, message, onYes }) => {
    setModal({
      isOpen: true,
      title,
      message,
      showCancel: true,
      confirmText: "Confirm Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        closeModal();
        await onYes();
      },
      onCancel: closeModal,
      onClose: closeModal,
    });
  };

  const parsedBulkCount = useMemo(
    () => bulkText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length,
    [bulkText]
  );

  const loadCustomers = async (search = query) => {
    const requestId = loadRequest.current + 1;
    loadRequest.current = requestId;
    setLoading(true);
    try {
      const response = await getCustomerDirectory(search);
      if (requestId === loadRequest.current) {
        setCustomers(Array.isArray(response?.customers) ? response.customers : []);
      }
    } catch (error) {
      if (requestId === loadRequest.current) {
        setCustomers([]);
        setNotice({ type: "error", text: error?.message || "Could not load customers." });
      }
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadCustomers(query), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (notice.text) setNotice({ type: "", text: "" });
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cleanName = form.customer_name.trim();
    if (saving || !cleanName) {
      setNotice({ type: "error", text: "Customer name is required." });
      return;
    }
    setSaving(true);
    setNotice({ type: "", text: "" });
    try {
      if (editingId) {
        const response = await updateDirectoryCustomer(editingId, {
          customer_name: cleanName,
          phone: form.phone.trim(),
          notes: form.notes.trim(),
        });
        setCustomers((current) =>
          current.map((customer) =>
            customer.id === editingId ? response.customer : customer
          )
        );
        setNotice({ type: "success", text: `Customer "${cleanName}" updated successfully.` });
      } else {
        const response = await createDirectoryCustomer({
          customer_name: cleanName,
          phone: form.phone.trim(),
          notes: form.notes.trim(),
        });
        setCustomers((current) => [response.customer, ...current]);
        setNotice({ type: "success", text: `Customer "${cleanName}" added to directory.` });
      }
      resetForm();
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not save customer." });
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSubmit = async () => {
    const rows = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseBulkLine)
      .filter((customer) => customer.customer_name);
    if (!rows.length || bulkSaving) {
      setNotice({ type: "error", text: "Enter at least one customer name, one per line." });
      return;
    }
    setBulkSaving(true);
    setNotice({ type: "", text: "" });
    try {
      const response = await bulkCreateDirectoryCustomers(rows);
      setBulkText("");
      await loadCustomers(query);
      setNotice({
        type: "success",
        text: `${response.created_count || 0} customer${response.created_count === 1 ? "" : "s"} added. ${response.skipped_count || 0} duplicate or empty row${response.skipped_count === 1 ? "" : "s"} skipped.`,
      });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not add customers in bulk." });
    } finally {
      setBulkSaving(false);
    }
  };

  const startEdit = (customer) => {
    setEditingId(customer.id);
    setActiveTab("single");
    setForm({
      customer_name: customer.customer_name || "",
      phone: customer.phone || "",
      notes: customer.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = (customer) => {
    openConfirm({
      title: "Delete Customer",
      message: `Are you sure you want to delete customer "${customer.customer_name}"? This removes them from the reusable directory.`,
      onYes: async () => {
        try {
          await deleteDirectoryCustomer(customer.id);
          setCustomers((current) => current.filter((item) => item.id !== customer.id));
          if (editingId === customer.id) resetForm();
          setNotice({ type: "success", text: `Customer "${customer.customer_name}" deleted.` });
        } catch (error) {
          setNotice({ type: "error", text: error?.message || "Could not delete customer." });
        }
      },
    });
  };

  // KPIs
  const totalCount = customers.length;
  const withPhoneCount = useMemo(() => customers.filter((c) => Boolean(c.phone)).length, [customers]);
  const withNotesCount = useMemo(() => customers.filter((c) => Boolean(c.notes)).length, [customers]);

  return (
    <main className="customerDirectoryPage">
      {/* Header */}
      <header className="cdHeader">
        <div className="cdHeaderLeft">
          <div className="cdEyebrow">
            <span className="cdEyebrowDot" />
            CUSTOMER DIRECTORY & REUSABLE PROFILES
          </div>
          <h1 className="cdTitle">Customers Management</h1>
          <p className="cdSub">
            Save reusable customer contacts to quickly select them from dropdowns when adding carts and orders.
          </p>
        </div>

        <div className="cdHeaderRight">
          <button
            type="button"
            className="cdBtnSoft"
            onClick={() => loadCustomers(query)}
            disabled={loading}
            title="Refresh list"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="cdKpiGrid">
        <div className="cdKpiCard">
          <div className="cdKpiContent">
            <div className="cdKpiLabel">Total Customers</div>
            <div className="cdKpiValue">{totalCount}</div>
            <div className="cdKpiHint">{query ? "Matching search" : "In workspace directory"}</div>
          </div>
        </div>

        <div className="cdKpiCard">
          <div className="cdKpiContent">
            <div className="cdKpiLabel">With Phone Numbers</div>
            <div className="cdKpiValue">{withPhoneCount}</div>
            <div className="cdKpiHint">Direct WhatsApp & Call ready</div>
          </div>
        </div>

        <div className="cdKpiCard">
          <div className="cdKpiContent">
            <div className="cdKpiLabel">With Notes / Preferences</div>
            <div className="cdKpiValue">{withNotesCount}</div>
            <div className="cdKpiHint">Delivery instructions & address</div>
          </div>
        </div>
      </div>

      {/* Notice alert */}
      {notice.text && (
        <div className={`cdNotice is-${notice.type}`} role="status">
          <span>{notice.text}</span>
          <button
            type="button"
            className="cdNoticeClose"
            onClick={() => setNotice({ type: "", text: "" })}
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      {/* Creation / Edit Card with Mode Tabs */}
      <section className="cdCard cdEditorCard">
        <div className="cdEditorNav">
          <div className="cdEditorTabs">
            <button
              type="button"
              className={`cdEditorTab ${activeTab === "single" ? "active" : ""}`}
              onClick={() => setActiveTab("single")}
            >
              {editingId ? "Edit Customer" : "Add Single Customer"}
            </button>
            <button
              type="button"
              className={`cdEditorTab ${activeTab === "bulk" ? "active" : ""}`}
              onClick={() => {
                if (editingId) resetForm();
                setActiveTab("bulk");
              }}
            >
              Bulk Import Customers
            </button>
          </div>

          {editingId && (
            <div className="cdEditingBadge">
              Editing: <strong>{form.customer_name}</strong>
            </div>
          )}
        </div>

        {activeTab === "single" ? (
          <form onSubmit={handleSubmit} className="cdForm">
            <div className="cdFormGrid">
              <div className="cdField">
                <label htmlFor="customer-name" className="cdLabel">
                  Customer Name <span className="cdReq">*</span>
                </label>
                <input
                  id="customer-name"
                  name="customer_name"
                  value={form.customer_name}
                  onChange={updateField}
                  placeholder="e.g. Sara Ahmed"
                  autoComplete="name"
                  className="cdInput"
                  required
                />
              </div>

              <div className="cdField">
                <label htmlFor="customer-phone" className="cdLabel">
                  Phone Number (Optional)
                </label>
                <input
                  id="customer-phone"
                  name="phone"
                  value={form.phone}
                  onChange={updateField}
                  placeholder="e.g. +961 70 123 456"
                  autoComplete="tel"
                  className="cdInput"
                />
              </div>

              <div className="cdField cdFieldFull">
                <label htmlFor="customer-notes" className="cdLabel">
                  Notes / Delivery Address (Optional)
                </label>
                <textarea
                  id="customer-notes"
                  name="notes"
                  value={form.notes}
                  onChange={updateField}
                  placeholder="e.g. Beirut, Hamra Street - Prefers WhatsApp contact"
                  rows="2"
                  className="cdTextarea"
                />
              </div>
            </div>

            <div className="cdFormActions">
              {editingId && (
                <button type="button" className="cdBtnSoft" onClick={resetForm}>
                  Cancel
                </button>
              )}
              <button type="submit" className="cdBtn" disabled={saving || !form.customer_name.trim()}>
                {saving ? "Saving..." : editingId ? "Save Customer Changes" : "Add to Directory"}
              </button>
            </div>
          </form>
        ) : (
          <div className="cdBulkWrap">
            <div className="cdBulkHint">
              Enter one customer per line. Format: <code>Customer Name, Phone Number, Optional Notes</code>
              <br />
              <span className="cdMuted">
                Example: <code>Sara Ahmed, +96170123456, Hamra delivery</code>
              </span>
            </div>

            <textarea
              className="cdBulkTextarea"
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              placeholder={"Sara Ahmed\nOmar Haddad, +961 70 000 000\nMaya Saleh, +961 71 000 000, VIP Customer"}
              rows="8"
            />

            <div className="cdBulkActions">
              <span className="cdBulkCounter">
                Detected: <strong>{parsedBulkCount}</strong> customer{parsedBulkCount === 1 ? "" : "s"}
              </span>

              <button
                type="button"
                className="cdBtn"
                onClick={handleBulkSubmit}
                disabled={bulkSaving || !parsedBulkCount}
              >
                {bulkSaving ? "Importing..." : `Import ${parsedBulkCount || ""} Customers`}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Customers List Section */}
      <section className="cdCard cdListCard">
        <div className="cdListHeader">
          <div className="cdListHeaderLeft">
            <h2 className="cdListTitle">Saved Customers Directory</h2>
            <div className="cdListSub">
              Showing {customers.length} customer{customers.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="cdSearchWrap">
            <span className="cdSearchIcon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              className="cdSearchInput"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, phone, or notes..."
              aria-label="Search customers"
            />
            {query && (
              <button
                type="button"
                className="cdSearchClear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="cdLoadingState">
            <div className="cdSpinner" />
            <div>Loading customers directory...</div>
          </div>
        ) : customers.length === 0 ? (
          <div className="cdEmptyState">
            <div className="cdEmptyTitle">No customers found</div>
            <div className="cdEmptySub">
              {query
                ? `No customers match your search "${query}".`
                : "Add your first customer using the form above to start building your directory."}
            </div>
            {query && (
              <button type="button" className="cdBtnSoft" onClick={() => setQuery("")}>
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className="cdTableResponsive">
            <table className="cdTable">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone / WhatsApp</th>
                  <th>Notes / Address</th>
                  <th>Added On</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const waNumber = cleanPhoneForWa(customer.phone);
                  return (
                    <tr key={customer.id} className={editingId === customer.id ? "cdRowEditing" : ""}>
                      <td>
                        <div className="cdCustomerCell">
                          <span className="cdAvatar">{getInitials(customer.customer_name)}</span>
                          <div>
                            <div className="cdCustomerName">{customer.customer_name}</div>
                            <div className="cdCustomerId">ID #{customer.id}</div>
                          </div>
                        </div>
                      </td>

                      <td>
                        {customer.phone ? (
                          <div className="cdPhoneWrap">
                            <a href={`tel:${customer.phone}`} className="cdPhoneLink" title="Call">
                              {customer.phone}
                            </a>
                            {waNumber && (
                              <a
                                href={`https://wa.me/${waNumber}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="cdWaLink"
                                title="Open WhatsApp Chat"
                              >
                                WhatsApp
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="cdMuted">—</span>
                        )}
                      </td>

                      <td>
                        {customer.notes ? (
                          <span className="cdNotes">{customer.notes}</span>
                        ) : (
                          <span className="cdMuted">—</span>
                        )}
                      </td>

                      <td>
                        <span className="cdDate">{formatDate(customer.created_at)}</span>
                      </td>

                      <td>
                        <div className="cdActions">
                          <button
                            type="button"
                            className="cdActionBtn edit"
                            onClick={() => startEdit(customer)}
                            title="Edit customer details"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="cdActionBtn delete"
                            onClick={() => handleDelete(customer)}
                            title="Delete customer"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Confirmation modal */}
      <CustomModal {...modal} />
    </main>
  );
}
